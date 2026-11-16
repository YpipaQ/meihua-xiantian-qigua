// 六爻铜钱起卦（摇卦）——纯函数，无 DOM
// 仪式：每爻掷三枚铜钱、共 6 爻，自下而上为初爻→上爻（与全项目爻序铁律一致：[0]=初爻）。
// 面约定：上层配置 yangFace（'字' 或 '背'），默认『字为阳』（见 data/coin-config.json）；
//         映射只按“阳面数 n”：3→老阳(动)、2→少阳(静)、1→少阴(静)、0→老阴(动)。
// ★ 主线口径（阶段三定稿）：铜钱链属“六爻摇卦”，与先天链(以数起卦)分列两条主线——
//   - 本链动爻语义：每爻可动，0..6 皆可（多动/全动/静卦均为常态）；之卦 = 全部动爻位翻转；
//   - 不带梅花派生：恒不取互卦、恒不取体用（梅花概念）；
//   - 解卦暂空置：解读装配层（readings 注册表）对 kind:'coin' 一律不产出，待未来六爻断法挂载。
// 共享的只有无语义原子（查表/翻转变位/爻题），见 lookup.js 与 pan-view.js。

import { trigramByLines, hexagramByPair, titleOfYao, flipManyAt } from './lookup.js';

export const COIN_SIDES = ['字', '背'];
export const DEFAULT_COIN_CONFIG = { yangFace: '字' };

// 判定某枚是否为阳面
export function isYang(coin, cfg = DEFAULT_COIN_CONFIG) {
  return coin === cfg.yangFace;
}

// 三枚面 → 爻（按阳面数映射）
export function lineFromCoins(coins, cfg = DEFAULT_COIN_CONFIG) {
  if (!Array.isArray(coins) || coins.length !== 3 || coins.some((c) => !COIN_SIDES.includes(c))) {
    throw new Error(`掷币需为 3 枚（字/背）：${JSON.stringify(coins)}`);
  }
  const n = coins.filter((c) => isYang(c, cfg)).length; // 阳面数 0..3
  const base =
    n === 3 ? { value: 1, moving: true, label: '老阳', mark: '○' }
      : n === 2 ? { value: 1, moving: false, label: '少阳', mark: '—' }
        : n === 1 ? { value: 0, moving: false, label: '少阴', mark: '- -' }
          : { value: 0, moving: true, label: '老阴', mark: '×' };
  return {
    ...base,
    coins: [...coins],
    yangCount: n,
    facesText: coins.join(''),
  };
}

// 掷三枚（注入随机源以便测试）
export function tossThree(rng = Math.random) {
  return Array.from({ length: 3 }, () => (rng() < 0.5 ? '背' : '字'));
}

export function lineOfToss(rng, cfg = DEFAULT_COIN_CONFIG) {
  return lineFromCoins(tossThree(rng), cfg);
}

// 六爻成卦（铜钱链编排）：throws 为自下而上 6 条 {value, moving, ...}
// 输出纯摇卦排盘：本卦 / 动爻位(movingYao) / 之卦（全部动爻翻转）/ 逐爻明细 / 掷出记录；
// 互卦与体用恒为 null（不带梅花派生）；steps 恒为 null（无演算）。
export function castCoinLines(data, throws, cfg = DEFAULT_COIN_CONFIG) {
  const { trigrams, hexagrams } = data;
  if (!Array.isArray(throws) || throws.length !== 6) throw new Error('需自下而上 6 条爻记录');
  const warnings = [];
  const entries = throws.map((t, i) => {
    const value = t.value === 1 ? 1 : 0;
    return { index: i, position: i + 1, value, moving: Boolean(t.moving), label: t.label, mark: t.mark, coins: t.coins };
  });
  const lines = entries.map((e) => e.value); // 自下而上 [0]=初爻
  const movingPos = entries.filter((e) => e.moving).map((e) => e.position); // 1..6
  if (movingPos.length === 0) warnings.push('静卦：无动爻（六爻皆少阳/少阴），无之卦');
  if (movingPos.length > 1) warnings.push(`多动爻（${movingPos.join('、')} 爻动）：之卦按全部动爻翻转`);

  const lowerT = trigramByLines(trigrams, lines.slice(0, 3));
  const upperT = trigramByLines(trigrams, lines.slice(3, 6));
  if (!lowerT || !upperT) throw new Error('六爻无法组成八卦');
  const ben = hexagramByPair(hexagrams, upperT.name, lowerT.name);
  if (!ben) throw new Error(`查不到本卦：${upperT.name}${lowerT.name}`);

  // 之卦：所有动爻位同时翻转（位 p → 下标 p-1，铁律；共享原子 flipManyAt）
  let zhi = null;
  let zhiLines = null;
  if (movingPos.length > 0) {
    const flipped = flipManyAt(lines, movingPos);
    const l2 = trigramByLines(trigrams, flipped.slice(0, 3));
    const u2 = trigramByLines(trigrams, flipped.slice(3, 6));
    zhiLines = flipped;
    zhi = l2 && u2 ? hexagramByPair(hexagrams, u2.name, l2.name) : null;
    if (!zhi) throw new Error('之卦查表失败');
  }

  const yao = entries.map((e) => ({
    index: e.index,
    position: e.position,
    gua: e.index < 3 ? '下卦' : '上卦',
    trigram: e.index < 3 ? lowerT.name : upperT.name,
    title: titleOfYao(e.index, e.value),
    value: e.value,
    isDong: e.moving,
    label: e.label,
    mark: e.mark,
  }));

  return {
    kind: 'coin',
    method: '六爻铜钱起卦（摇卦）',
    ruleId: null,
    coinConfig: { ...cfg },
    benGua: { order: ben.order, name: ben.name, symbol: ben.symbol, upper: ben.upper, lower: ben.lower },
    dongYao: movingPos.length === 1 ? movingPos[0] : null,
    movingYao: movingPos,
    zhiGua: zhi ? { order: zhi.order, name: zhi.name, symbol: zhi.symbol, upper: zhi.upper, lower: zhi.lower } : null,
    huGua: null, // 铜钱链恒不带梅花派生（互卦/体用）
    tiYong: null,
    yao,
    lines, // 自下而上
    zhiLines,
    records: entries.map((e, i) => ({
      index: i,
      position: e.position,
      title: yao[i].title,
      label: e.label,
      mark: e.mark,
      moving: e.moving,
      facesText: e.coins ? e.coins.join('') : null,
    })),
    steps: null,
    warnings,
  };
}

export default {
  COIN_SIDES,
  DEFAULT_COIN_CONFIG,
  isYang,
  lineFromCoins,
  tossThree,
  lineOfToss,
  castCoinLines,
};
