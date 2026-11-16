// 回归 + 穷举测试：node tests/run-tests.js
// 覆盖：8 个 data/cases.json 用例（含观梅占例/牡丹占例）、取模边界、64卦×6动爻 穷举一致性
import fs from 'node:fs';
import { cast, castNumbers, ruleIdForNumberCount, mod8, mod6, dongYaoToIndex, hexLinesByPair, flipAt, pairFromHexLines, trigramByLines } from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

const tri = readJson('../data/trigrams.json').trigrams;
const hex = readJson('../data/hexagrams.json').hexagrams;
const rulesFile = readJson('../data/rules.json');
const rules = rulesFile.rules;
const casesFile = readJson('../data/cases.json');
const data = { trigrams: tri, hexagrams: hex, rules };

let pass = 0;
let fail = 0;
const failures = [];

function check(cond, msg) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(msg);
  }
}

// ---- 单元：取模边界与爻序映射（铁律）----
check(mod8(34) === 2 && mod8(8) === 8 && mod8(3) === 3 && mod8(16) === 8, 'mod8：余0→8、不足8按本数');
check(mod6(43) === 1 && mod6(18) === 6 && mod6(5) === 5 && mod6(12) === 6, 'mod6：余0→6(上爻)、不足6按本数');
check(dongYaoToIndex(1) === 0 && dongYaoToIndex(6) === 5, '爻位铁律：初爻(1)→下标0，上爻(6)→下标5');

function ruleIdOf(caseId) {
  if (caseId.startsWith('time-')) return 'time';
  if (caseId.startsWith('one-number-')) return 'one-number';
  if (caseId.startsWith('two-numbers-')) return 'two-numbers';
  if (caseId.startsWith('three-numbers-')) return 'three-numbers';
  if (caseId.startsWith('many-numbers-')) return 'many-numbers';
  if (caseId.startsWith('boundary-')) return 'two-numbers';
  throw new Error(`无法推断规则: ${caseId}`);
}

// ---- 用例回归 ----
for (const c of casesFile.cases) {
  const ruleId = ruleIdOf(c.id);
  let pan;
  let threw = null;
  try {
    pan = cast(data, { ruleId, values: c.values });
  } catch (e) {
    threw = e;
  }
  if (threw) {
    check(false, `${c.id}：cast 抛出 ${threw.message}`);
    continue;
  }
  const e = c.expect;
  const p = pan.steps;
  const name = `${c.method} → ${pan.benGua.name}${pan.benGua.symbol}之${pan.zhiGua ? pan.zhiGua.name + pan.zhiGua.symbol : '（无动爻）'}`;
  check(p.upperRaw === e.upperRaw, `${c.id}：上卦原始数 ${p.upperRaw} ≠ ${e.upperRaw}`);
  check(p.lowerRaw === e.lowerRaw, `${c.id}：下卦原始数 ${p.lowerRaw} ≠ ${e.lowerRaw}`);
  check(p.moveRaw === e.moveRaw, `${c.id}：动爻原始数 ${p.moveRaw} ≠ ${e.moveRaw}`);
  check(p.upperNum === e.upperNum, `${c.id}：上卦数 ${p.upperNum} ≠ ${e.upperNum}`);
  check(p.lowerNum === e.lowerNum, `${c.id}：下卦数 ${p.lowerNum} ≠ ${e.lowerNum}`);
  check(pan.dongYao === e.dongYao, `${c.id}：动爻 ${pan.dongYao} ≠ ${e.dongYao}`);
  check(pan.benGua.order === e.benOrder, `${c.id}：本卦序 ${pan.benGua.order} ≠ ${e.benOrder}（${pan.benGua.name}）`);
  check(pan.zhiGua && pan.zhiGua.order === e.zhiOrder, `${c.id}：之卦序 ${pan.zhiGua ? pan.zhiGua.order : null} ≠ ${e.zhiOrder}（${pan.zhiGua ? pan.zhiGua.name : '无'}）`);
  check(pan.huGua != null && pan.huGua.order >= 1, `${c.id}：互卦缺失`);
  if (pan.tiYong) {
    check(pan.tiYong.ti.name === e.ti && pan.tiYong.yong.name === e.yong, `${c.id}：体用 ${pan.tiYong.ti.name}/${pan.tiYong.yong.name} ≠ 期望 ${e.ti}/${e.yong}`);
    check(pan.tiYong.relation === e.relation, `${c.id}：体用关系 ${pan.tiYong.relation} ≠ ${e.relation}`);
  } else {
    check(false, `${c.id}：应有体用（有动爻）`);
  }
  // 爻线与卦构成一致性（自下而上约定）
  const lo = tri.find((t) => t.name === pan.benGua.lower);
  const up = tri.find((t) => t.name === pan.benGua.upper);
  check(
    pan.lines.length === 6 && pan.lines.slice(0, 3).join('') === lo.lines.join('') && pan.lines.slice(3, 6).join('') === up.lines.join(''),
    `${c.id}：本卦爻线拼接与上下卦不一致`
  );
  check(pan.yao[pan.dongYao - 1].isDong === true && pan.yao.filter((y) => y.isDong).length === 1, `${c.id}：动爻标注只应命中一位`);
  console.log(`  ✅ ${name}（动爻${pan.dongYao} · ${pan.tiYong ? pan.tiYong.relation : '无'}）`);
}

// ---- 入口分派：数字起卦按个数自动选规则（对外仅两类入口：时间 / 数字）----
check(
  ruleIdForNumberCount(1) === 'one-number' &&
    ruleIdForNumberCount(2) === 'two-numbers' &&
    ruleIdForNumberCount(3) === 'three-numbers' &&
    ruleIdForNumberCount(4) === 'many-numbers' &&
    ruleIdForNumberCount(9) === 'many-numbers',
  '入口分派：1→一数、2→二数、3→三数、≥4→多数'
);
{
  const r1 = castNumbers(data, [23], { hourBranch: 9 });
  check(r1.benGua.order === 23 && r1.dongYao === 2, '数字起卦 [23] → 山地剥䷖ 动二爻（=一数起卦法）');
  const r2 = castNumbers(data, [12, 33]);
  check(r2.benGua.order === 34 && r2.dongYao === 3, '数字起卦 [12,33] → 雷天大壮䷡ 动三爻（=二数起卦法）');
  const r3 = castNumbers(data, [7, 3, 10]);
  check(r3.benGua.order === 18 && r3.dongYao === 2, '数字起卦 [7,3,10] → 山风蛊䷑ 动二爻（=三数起卦法）');
  const r4 = castNumbers(data, [3, 5, 8, 2]);
  check(r4.benGua.order === 19 && r4.dongYao === 6, '数字起卦 [3,5,8,2] → 地泽临䷒ 动上爻（=多数起卦法）');
}

// ---- 穷举：64 卦 × 6 动爻 变卦一致性 ----
let exhaustOk = true;
const triNameOf = (lines3) => {
  const t = trigramByLines(tri, lines3);
  return t ? t.name : null;
};
for (const h of hex) {
  const base = hexLinesByPair(tri, h.upper, h.lower);
  for (let p = 1; p <= 6; p += 1) {
    const flipped = flipAt(base, dongYaoToIndex(p));
    const diffCount = base.filter((v, i) => v !== flipped[i]).length;
    if (diffCount !== 1) {
      exhaustOk = false;
      failures.push(`穷举：${h.name}(${h.symbol}) 动${p} 翻转位数=${diffCount}`);
      continue;
    }
    const pair = pairFromHexLines(tri, flipped);
    const name = triNameOf(pair.upper.lines);
    const zhiName = triNameOf(pair.lower.lines);
    if (!name || !zhiName) {
      exhaustOk = false;
      failures.push(`穷举：${h.name}(${h.symbol}) 动${p} 反解卦名失败`);
      continue;
    }
    const zhi = hex.find((x) => x.upper === name && x.lower === zhiName);
    if (!zhi || zhi.order === h.order) {
      exhaustOk = false;
      failures.push(`穷举：${h.name}(${h.symbol}) 动${p} → ${name}${zhiName} 查表异常`);
    }
  }
}
if (exhaustOk) {
  pass += 1;
  console.log('  ✅ 穷举一致性：64卦×6动爻（384 例）之卦全部可查、仅翻转动爻位');
} else {
  fail += 1;
}

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  console.log('失败明细：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('ALL TESTS PASSED');
