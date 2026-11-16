// 唯一成卦核：槽位原始数 → 盘对象（本卦/动爻/之卦/互卦/体用/五行）
// ⚠️ 爻序铁律（勿改）：六爻数组自下而上 [0]=初爻 [5]=上爻；动爻位 p(1..6) → 下标 p-1；
//    变卦 = 翻转 hexLines[p-1]。任何显示层倒序不得回写算法数组。

import { mod8, mod6 } from './mod.js';
import {
  trigramByNumber,
  trigramByLines,
  hexagramByPair,
  hexLinesByPair,
  pairFromHexLines,
  dongYaoToIndex,
  titleOfYao,
  flipAt,
  huLinesOf,
} from './lookup.js';

// 五行生克表：x 克 KE[x]；x 生 SHENG[x]
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };

// 体用生克结论（站在"体"的角度）：体克用吉、用克体凶、体生用泄(费力)、用生体吉、比和吉
export function wuXingRelation(tiWuXing, yongWuXing) {
  if (!tiWuXing || !yongWuXing) return null;
  if (tiWuXing === yongWuXing) return { name: '比和', grade: '吉', note: '体用同气' };
  if (KE[yongWuXing] === tiWuXing) return { name: '用克体', grade: '凶', note: `${yongWuXing}克${tiWuXing}` };
  if (KE[tiWuXing] === yongWuXing) return { name: '体克用', grade: '吉', note: `${tiWuXing}克${yongWuXing}` };
  if (SHENG[tiWuXing] === yongWuXing) return { name: '体生用', grade: '平', note: `${tiWuXing}生${yongWuXing}，泄气费力` };
  return { name: '用生体', grade: '吉', note: `${yongWuXing}生${tiWuXing}` };
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// 极简表达式：仅支持 "字段名/数字" 用 '+' 求和
export function evaluateExpr(expr, values) {
  if (typeof expr !== 'string' || expr.trim() === '') throw new Error(`表达式为空: ${expr}`);
  return expr
    .split('+')
    .map((tok) => tok.trim())
    .reduce((acc, tok) => {
      if (Object.prototype.hasOwnProperty.call(values, tok)) {
        const v = values[tok];
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`输入字段非法: ${tok}=${v}`);
        return acc + v;
      }
      const n = Number(tok);
      if (Number.isNaN(n)) throw new Error(`表达式无法解析: ${expr}（未知字段 ${tok}）`);
      return acc + n;
    }, 0);
}

// 求当前时辰序数（子=1 … 亥=12；23:00 起算次日子时，本地时间）
export function currentHourBranch(date = new Date()) {
  const h = date.getHours();
  return (Math.floor((h + 1) / 2) % 12) + 1;
}

// 按规则把输入值算到三槽位原始数
export function evaluateRule(rule, valuesIn, hourBranch) {
  const values = { ...valuesIn };
  const warnings = [];
  let upperRaw = null;
  let lowerRaw = null;
  let moveRaw = null;

  if (rule.type === 'expr') {
    if (rule.autoHour) {
      if (values.hourBranch == null) {
        values.hourBranch = hourBranch ?? currentHourBranch();
        warnings.push('一数起卦：下卦/动爻已按当前时辰补足');
      }
    }
    upperRaw = rule.upper ? evaluateExpr(rule.upper, values) : null;
    lowerRaw = rule.lower ? evaluateExpr(rule.lower, values) : null;
    moveRaw = rule.move ? evaluateExpr(rule.move, values) : null;
  } else if (rule.type === 'split') {
    const nums = values.numbers;
    if (!Array.isArray(nums) || nums.length === 0 || nums.some((n) => !Number.isFinite(n))) {
      throw new Error('数字分组起卦：需要 numbers 数组');
    }
    if (rule.count != null && nums.length !== rule.count) {
      throw new Error(`${rule.name}：需要 ${rule.count} 个数，实际 ${nums.length}`);
    }
    if (rule.countMin != null && nums.length < rule.countMin) {
      throw new Error(`${rule.name}：至少需要 ${rule.countMin} 个数，实际 ${nums.length}`);
    }
    const splitPoint = Math.floor(nums.length / 2); // 奇数个时上卦取少一半（书·字数表口径）
    upperRaw = sum(nums.slice(0, splitPoint));
    lowerRaw = sum(nums.slice(splitPoint));
    moveRaw = sum(nums);
  } else {
    throw new Error(`未知规则类型: ${rule.type}`);
  }

  // 兜底：若该规则给不出动爻数，按默认补齐策略用时辰补（当前 5 条规则均自带动爻，此路备用）
  if (moveRaw == null && (rule.autoHour || rule.type === 'split')) {
    const h = values.hourBranch ?? hourBranch ?? currentHourBranch();
    moveRaw = upperRaw + lowerRaw + h;
    warnings.push('动爻已按补齐策略（上+下+时辰）生成');
  }

  if (upperRaw == null || lowerRaw == null) throw new Error('规则未产出上/下卦数');
  return { rule, upperRaw, lowerRaw, moveRaw, hourBranch: values.hourBranch, warnings };
}

/**
 * 起卦总入口。
 * @param {object} data        { trigrams, hexagrams, rules }
 * @param {object} request     { ruleId, values, hourBranch?, huSource? }
 *  - values：expr 规则给字段值（如 {yearBranch,month,day,hourBranch} / {n}）；
 *             split 规则给 {numbers:[...]}
 *  - huSource：'ben'（默认，本卦求互）| 'zhi'（之卦求互，配置开关）
 * @returns 盘对象（纯数据）
 */
export function cast(data, request) {
  const { trigrams, hexagrams, rules } = data;
  const { ruleId, values, hourBranch, huSource = 'ben' } = request;
  const rule = rules[ruleId];
  if (!rule) throw new Error(`规则不存在: ${ruleId}`);
  const warnings = [];

  const slots = evaluateRule(rule, values, hourBranch);
  warnings.push(...slots.warnings);

  const upperNum = mod8(slots.upperRaw);
  const lowerNum = mod8(slots.lowerRaw);
  const upperT = trigramByNumber(trigrams, upperNum);
  const lowerT = trigramByNumber(trigrams, lowerNum);
  if (!upperT || !lowerT) throw new Error('取卦失败');

  const ben = hexagramByPair(hexagrams, upperT.name, lowerT.name);
  if (!ben) throw new Error(`查不到本卦: ${upperT.name}${lowerT.name}`);

  // 全卦爻线，自下而上 [0]=初爻 … [5]=上爻
  const benLines = hexLinesByPair(trigrams, ben.upper, ben.lower);

  const dongYao = slots.moveRaw == null ? null : mod6(slots.moveRaw);

  // 之卦（变卦）：翻转动爻位
  let zhi = null;
  let zhiLines = null;
  if (dongYao != null) {
    const idx = dongYaoToIndex(dongYao); // 铁律：位 p → 下标 p-1
    zhiLines = flipAt(benLines, idx);
    const pair = pairFromHexLines(trigrams, zhiLines);
    zhi = hexagramByPair(hexagrams, pair.upper.name, pair.lower.name);
    if (!zhi) throw new Error(`查不到之卦: ${pair.upper.name}${pair.lower.name}`);
  } else {
    warnings.push('静卦：无动爻，无之卦');
  }

  // 互卦：默认取本卦第 2、3、4 爻为下卦（内互），第 3、4、5 爻为上卦（外互）——共享原子 huLinesOf
  const { lower: huLowerLines, upper: huUpperLines } = huLinesOf(benLines);
  const huLowerT = trigramByLines(trigrams, huLowerLines);
  const huUpperT = trigramByLines(trigrams, huUpperLines);
  const hu =
    huLowerT && huUpperT
      ? hexagramByPair(hexagrams, huUpperT.name, huLowerT.name)
      : null;

  // 体用：含动爻之卦为用，另一卦为体
  let tiYong = null;
  if (dongYao != null) {
    const dongInLower = dongYao <= 3;
    const tiT = dongInLower ? upperT : lowerT;
    const yongT = dongInLower ? lowerT : upperT;
    const rel = wuXingRelation(tiT.wuXing, yongT.wuXing);
    tiYong = {
      ti: { name: tiT.name, wuXing: tiT.wuXing },
      yong: { name: yongT.name, wuXing: yongT.wuXing },
      relation: rel.name,
      grade: rel.grade,
      note: rel.note,
    };
  }

  // 逐爻明细（自下而上）
  const yao = benLines.map((v, i) => ({
    index: i,
    position: i + 1,
    gua: i < 3 ? '下卦' : '上卦',
    trigram: i < 3 ? lowerT.name : upperT.name,
    title: titleOfYao(i, v),
    value: v, // 1=阳(━━━) 0=阴(━ ━)
    isDong: dongYao === i + 1,
  }));

  return {
    ruleId,
    method: rule.name || ruleId,
    benGua: { order: ben.order, name: ben.name, symbol: ben.symbol, upper: ben.upper, lower: ben.lower },
    dongYao,
    zhiGua: zhi
      ? { order: zhi.order, name: zhi.name, symbol: zhi.symbol, upper: zhi.upper, lower: zhi.lower }
      : null,
    huGua: hu ? { order: hu.order, name: hu.name, symbol: hu.symbol, upper: hu.upper, lower: hu.lower } : null,
    tiYong,
    yao,
    lines: benLines, // 自下而上（内部口径，展示层自行决定是否倒序渲染）
    zhiLines,
    steps: {
      upperRaw: slots.upperRaw,
      lowerRaw: slots.lowerRaw,
      moveRaw: slots.moveRaw,
      upperNum,
      lowerNum,
      moveMod: dongYao,
      hourBranch: slots.hourBranch,
    },
    warnings,
  };
}

// 数字起卦入口：按输入个数自动分派规则（对外只暴露"数字起卦"一个入口）
export function ruleIdForNumberCount(count) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`数字起卦：个数非法 ${count}`);
  if (count === 1) return 'one-number'; // 借时辰补足（一数起卦法）
  if (count === 2) return 'two-numbers';
  if (count === 3) return 'three-numbers';
  return 'many-numbers'; // ≥4 走多数起卦法（对半分组）
}

export function castNumbers(data, numbers, opts = {}) {
  if (!Array.isArray(numbers) || numbers.length === 0 || numbers.some((n) => !Number.isFinite(n))) {
    throw new Error('数字起卦：至少输入 1 个有限数字');
  }
  const k = numbers.length;
  const ruleId = ruleIdForNumberCount(k);
  const values = k === 1 ? { n: numbers[0] } : { numbers };
  return cast(data, { ruleId, values, hourBranch: opts.hourBranch });
}

export { mod8, mod6 };
export default {
  cast,
  castNumbers,
  ruleIdForNumberCount,
  evaluateRule,
  evaluateExpr,
  wuXingRelation,
  currentHourBranch,
  mod8,
  mod6,
};
