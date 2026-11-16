// 阶段三新增：只读读盘视图 pan-view 与共享原子（flipManyAt/huLinesOf）测试
// 覆盖：movingPositions/dongYaoOf/isCoinPan/panView 对 先天盘·铜钱盘(单/多/静) 的归一读取；
//       flipManyAt(多动) 与 flipAt(单动) 一致性；huLinesOf 与盘上互卦切片一致。
// ★阶段四：movingPositions 是 xiangjie 动爻取位的唯一依据（不许再用 wei 字符串匹配）——补多动/静卦位序断言。
import fs from 'node:fs';
import {
  cast,
  castCoinLines,
  hexLinesByPair,
  flipAt,
  flipManyAt,
  huLinesOf,
  movingPositions,
  dongYaoOf,
  panView,
  isCoinPan,
} from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const data = {
  trigrams: readJson('../data/trigrams.json').trigrams,
  hexagrams: readJson('../data/hexagrams.json').hexagrams,
  rules: readJson('../data/rules.json').rules,
};

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// ---- 先天盘（时间法，单动 1）----
const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
check(isCoinPan(guanmei) === false && guanmei.kind === undefined, '先天盘非铜钱（无 kind）');
check(movingPositions(guanmei).join(',') === '1', '先天盘 movingPositions = [动爻位]');
check(dongYaoOf(guanmei) === 1, '先天盘 dongYaoOf = 1');
const vGm = panView(guanmei);
check(vGm.kind === 'number' && vGm.benGua.order === 49 && vGm.moving.join(',') === '1' && vGm.dongYao === 1, 'panView：先天盘归一读法正确');
check(vGm.lines.length === 6 && vGm.steps && vGm.records === null, 'panView：先天盘带 lines/steps、无 records');

// ---- 铜钱盘（单动 / 多动 / 静卦）----
const mk = (vals, movingIdx) => castCoinLines(data, vals.map((value, i) => ({ value, moving: movingIdx.includes(i + 1) })), { yangFace: '字' });
const coin1 = mk([1, 1, 1, 1, 1, 1], [1]); // 乾初动
const coinM = mk([1, 1, 1, 0, 0, 0], [2, 5]); // 泰二五动
const coin0 = mk([1, 0, 1, 0, 1, 1], []); // 静卦
check(isCoinPan(coin1) && isCoinPan(coinM) && isCoinPan(coin0), '三铜钱盘 isCoinPan=true');
check(movingPositions(coin1).join(',') === '1' && dongYaoOf(coin1) === 1, '铜钱单动：moving=[1]、dongYao=1');
check(movingPositions(coinM).join(',') === '2,5' && dongYaoOf(coinM) === null, '铜钱多动：moving=[2,5]、dongYao=null（不冒充单动）');
check(movingPositions(coin0).length === 0 && dongYaoOf(coin0) === null, '铜钱静卦：moving=[]、dongYao=null');
const vCoin = panView(coinM);
check(vCoin.kind === 'coin' && vCoin.moving.join(',') === '2,5' && vCoin.huGua === null && vCoin.tiYong === null, 'panView：铜钱盘归一读法正确（无梅花派生）');
check(vCoin.records && vCoin.records.length === 6 && vCoin.steps === null, 'panView：铜钱盘带 records、无 steps');

// ---- ★阶段四：动爻位读取铁律（xiangjie 据此按 pos 对齐 yaos，不用 wei 匹配）----
// 1..6 全动时位序升序齐全；乱序 movingYao 亦归一为升序（取位不受输入顺序影响）
const coinAll = mk([1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6]);
check(movingPositions(coinAll).join(',') === '1,2,3,4,5,6', '六爻全动 → 位序 1..6 升序');
const coinShuffled = { ...coin1, movingYao: [5, 2] };
check(movingPositions(coinShuffled).join(',') === '2,5', 'movingYao 乱序 → movingPositions 归一升序');
check(movingPositions({ benGua: { order: 1 }, dongYao: null }).length === 0, '无动爻字段 → 空位集（静卦）');
check(movingPositions({ benGua: { order: 1 }, dongYao: 3 }).join(',') === '3', '先天盘 dongYao=3 → [3]');

// ---- 共享原子：flipManyAt 与 flipAt 一致性 ----
const linesQ = hexLinesByPair(data.trigrams, '乾', '乾'); // [1,1,1,1,1,1]
const linesT = hexLinesByPair(data.trigrams, '坤', '乾'); // 泰 [1,1,1,0,0,0]
check(flipManyAt(linesT, [2, 5]).join(',') === '1,0,1,0,1,0', 'flipManyAt：泰动二五 → 二五翻转');
check(flipManyAt(linesQ, [1]).join(',') === flipAt(linesQ, 0).join(','), '单动场景 flipManyAt(p) ≡ flipAt(p-1)');
check(flipManyAt(linesT, []).join(',') === linesT.join(','), 'flipManyAt([]) 不翻转（静卦语义）');
check(flipManyAt(linesT, [7, 0]).join(',') === linesT.join(','), 'flipManyAt 越界位被忽略');

// ---- 共享原子：huLinesOf 切片 = 本卦 2/3/4 与 3/4/5 爻（自下而上）----
const { lower, upper } = huLinesOf(guanmei.lines);
check(lower.join(',') === guanmei.lines.slice(1, 4).join(','), 'huLinesOf.lower = 第2/3/4爻');
check(upper.join(',') === guanmei.lines.slice(2, 5).join(','), 'huLinesOf.upper = 第3/4/5爻');
check(guanmei.huGua != null, '先天盘互卦仍在（互卦仅先天链保留）');

console.log(`\n读盘视图与共享原子测试：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('PANVIEW TESTS PASSED');
