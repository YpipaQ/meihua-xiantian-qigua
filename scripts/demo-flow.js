// 模块流程运行演示：node scripts/demo-flow.js
// 目的：展示“数据层 → 规则求值 → 取模取卦 → 派生（之卦/互卦/体用）”各模块如何衔接。
// ⚠️ 爻序铁律：六爻数组自下而上 [0]=初爻…[5]=上爻；动爻位 p(1..6) → 下标 p-1。
//    本脚本仅在【打印】时自上而下渲染（displayOnly），不回写算法数组。

import fs from 'node:fs';
import {
  cast,
  evaluateRule,
  mod8,
  mod6,
  trigramByNumber,
  hexagramByPair,
  hexLinesByPair,
  pairFromHexLines,
  trigramByLines,
  dongYaoToIndex,
  flipAt,
  wuXingRelation,
} from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const tri = readJson('../data/trigrams.json').trigrams;
const hex = readJson('../data/hexagrams.json').hexagrams;
const rules = readJson('../data/rules.json').rules;
const casesFile = readJson('../data/cases.json').cases;
const data = { trigrams: tri, hexagrams: hex, rules };

const bar = (s = '─'.repeat(72)) => console.log(s);
const lineGlyph = (v) => (v === 1 ? '━━━' : '━ ━');
const hexName = (h) => (h ? `${h.name}${h.symbol}(${h.order})` : '—');

function ruleIdOf(id) {
  if (id.startsWith('time-')) return 'time';
  if (id.startsWith('one-number-')) return 'one-number';
  if (id.startsWith('two-numbers-') || id.startsWith('boundary-')) return 'two-numbers';
  if (id.startsWith('three-numbers-')) return 'three-numbers';
  if (id.startsWith('many-numbers-')) return 'many-numbers';
  throw new Error('ruleId?');
}

// 打印单个盘（显示用自上而下；算法数组仍是自下而上）
function renderPan(pan, title) {
  console.log(`\n── ${title} ──`);
  const rows = [];
  for (let i = 5; i >= 0; i -= 1) {
    const y = pan.yao[i];
    rows.push(`${lineGlyph(y.value)}  ${y.title.padEnd(3)}${y.isDong ? ' ◉动' : ''}   [${y.gua}·${y.trigram}] (index ${y.index})`);
  }
  console.log(rows.join('\n'));
  console.log(`本卦 ${hexName(pan.benGua)} ｜ 动爻 ${pan.dongYao ?? '无'} ｜ 之卦 ${hexName(pan.zhiGua)} ｜ 互卦 ${hexName(pan.huGua)}`);
  if (pan.tiYong) {
    const t = pan.tiYong;
    console.log(`体用：体=${t.ti.name}(${t.ti.wuXing}) 用=${t.yong.name}(${t.yong.wuXing}) → ${t.relation}（${t.grade}）`);
  }
  if (pan.warnings.length) console.log('提示：' + pan.warnings.join('；'));
}

// ============ 示例 A：时间起卦法 · 观梅占例（逐步拆开调用，还原 cast 内部流程） ============
console.log('\n========== 模块流程演示 A：时间起卦法 · 观梅占例 ==========');
const valsA = { yearBranch: 5, month: 12, day: 17, hourBranch: 9 };
const ruleA = rules.time;

console.log('\n[1] 输入（取数）   values =', JSON.stringify(valsA));
console.log('    规则 time：', ruleA.note);

console.log('\n[2] 中层 · evaluateRule → 槽位原始数（rules.json 的表达式求值）');
const slots = evaluateRule(ruleA, valsA, undefined);
console.log('    上卦数 = yearBranch+month+day =', `${5}+${12}+${17}`, '=', slots.upperRaw);
console.log('    下卦数 = +hourBranch            =', `${34}+${9}`, '=', slots.lowerRaw);
console.log('    动爻数（同下卦全和）             =', slots.moveRaw);

console.log('\n[3] 根 · mod.js（除八取卦 / 除六取爻，余0→8/6）');
const uN = mod8(slots.upperRaw); // 34 % 8 = 2
const lN = mod8(slots.lowerRaw); // 43 % 8 = 3
const d = mod6(slots.moveRaw); // 43 % 6 = 1
console.log(`    mod8(${slots.upperRaw})=${uN}  mod8(${slots.lowerRaw})=${lN}  mod6(${slots.moveRaw})=${d}`);

console.log('\n[4] lookup.js · 先天数 → 卦');
const uT = trigramByNumber(tri, uN); // id===2 → 兑
const lT = trigramByNumber(tri, lN); // id===3 → 离
console.log(`    上卦 ${uN} → ${uT.name}(${uT.symbol}·五行${uT.wuXing})   下卦 ${lN} → ${lT.name}(${lT.symbol}·五行${lT.wuXing})`);

console.log('\n[5] lookup.js · hexagramByPair → 本卦');
const benA = hexagramByPair(hex, uT.name, lT.name);
console.log(`    上${uT.name}下${lT.name} → ${hexName(benA)}`);

console.log('\n[6] 爻线（自下而上 [0]=初爻） → 变卦（铁律：动爻位 p → 下标 p-1，翻转该位）');
const linesA = hexLinesByPair(tri, benA.upper, benA.lower); // 兑上离下
const idx = dongYaoToIndex(d); // 1 → 0
console.log(`    hexLines = [${linesA.join(',')}]（索引0=初爻，索引5=上爻）`);
console.log(`    动爻位 ${d} → 翻转下标 ${idx}（${linesA[idx] === 1 ? '阳→阴' : '阴→阳'}）`);
const flippedA = flipAt(linesA, idx);
const pairA = pairFromHexLines(tri, flippedA);
const zhiA = hexagramByPair(hex, pairA.upper.name, pairA.lower.name);
console.log(`    翻转后 [${flippedA.join(',')}] → 上${pairA.upper.name}下${pairA.lower.name} → 之卦 ${hexName(zhiA)}`);

console.log('\n[7] 互卦（取本卦第2~5爻为互体：2,3,4→下互，3,4,5→上互）');
const huLA = trigramByLines(tri, linesA.slice(1, 4));
const huUA = trigramByLines(tri, linesA.slice(2, 5));
const huA = hexagramByPair(hex, huUA.name, huLA.name);
console.log(`    下互=${huLA.name} 上互=${huUA.name} → 互卦 ${hexName(huA)}`);

console.log('\n[8] 体用（含动爻之卦为用）→ 五行生克结论');
const tiA = uT; // 动爻在下卦 → 上卦为体
const yongA = lT;
const relA = wuXingRelation(tiA.wuXing, yongA.wuXing);
console.log(`    动爻在初爻(下卦) → 体=${tiA.name}(${tiA.wuXing}) 用=${yongA.name}(${yongA.wuXing}) → ${relA.name}（${relA.grade}）`);

console.log('\n[9] 与唯一成卦核 cast() 输出对照');
const panA = cast(data, { ruleId: 'time', values: valsA });
console.log(`    cast → ${hexName(panA.benGua)}之${hexName(panA.zhiGua)}，动爻${panA.dongYao}，体用=${panA.tiYong.relation}（一致=${panA.benGua.name === benA.name && panA.zhiGua.name === zhiA.name}）`);
renderPan(panA, '排盘渲染（显示自上而下）');

// ============ 示例 B：数字分组（多数起卦法 k=4）走同一条 split 通式 ============
bar();
console.log('\n========== 模块流程演示 B：多数起卦法（数字分组通式 k=4） ==========');
const valsB = { numbers: [3, 5, 8, 2] };
const ruleB = rules['many-numbers'];
console.log('\n[1] 输入 numbers =', JSON.stringify(valsB.numbers), '（规则：', ruleB.name, '）');
console.log('[2] evaluateRule（split 通式：splitPoint = ⌊k/2⌋）');
const splitPoint = Math.floor(valsB.numbers.length / 2);
const upRaw = valsB.numbers.slice(0, splitPoint).reduce((a, b) => a + b, 0);
const loRaw = valsB.numbers.slice(splitPoint).reduce((a, b) => a + b, 0);
const mvRaw = valsB.numbers.reduce((a, b) => a + b, 0);
console.log(`    k=${valsB.numbers.length} → 上取前${splitPoint}项和=${upRaw}  下取后${valsB.numbers.length - splitPoint}项和=${loRaw}  动=全和=${mvRaw}`);
console.log(`    mod8→上卦${mod8(upRaw)}(${trigramByNumber(tri, mod8(upRaw)).name}) 下卦${mod8(loRaw)}(${trigramByNumber(tri, mod8(loRaw)).name})  动爻${mod6(mvRaw)}`);
const panB = cast(data, { ruleId: 'many-numbers', values: valsB });
renderPan(panB, '多数起卦法结果');

// ============ 全用例回归快览 ============
bar();
console.log('\n========== 全部 8 用例跑通快览（同一 cast 入口） ==========');
for (const c of casesFile) {
  const pan = cast(data, { ruleId: ruleIdOf(c.id), values: c.values });
  const t = pan.tiYong ? pan.tiYong.relation : '静卦';
  console.log(`  ${c.method.padEnd(16)} → 本卦 ${pan.benGua.name}${pan.benGua.symbol} 之 ${pan.zhiGua ? pan.zhiGua.name + pan.zhiGua.symbol : '—'}  动爻${pan.dongYao}  ${t}`);
}
console.log('\n运行结束：模块流程演示完成。');
