// 断语模块测试：node tests/run-verdict-tests.js
// 覆盖：观梅盘端到端取词、体用五关系矩阵、静卦/多动未取体用提示、缺数据容错
import fs from 'node:fs';
import { cast, assembleVerdict, guaBriefOf, tiyongVerdictOf } from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

const hexVerdicts = readJson('../data/interpretations/hexagram-verdicts.json').hexagrams;
const tiyongVerdicts = readJson('../data/interpretations/tiyong-verdicts.json');

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

// ---- 1) 观梅盘端到端（时间起卦 → 断语）----
const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
const rGm = assembleVerdict(guanmei, hexVerdicts, tiyongVerdicts);
check(guanmei.benGua.order === 49, '观梅本卦应为革(49)');
check(rGm.guaBrief === hexVerdicts.find((e) => e.order === 49).brief, '观梅 → 革卦导语命中词库');
check(guanmei.tiYong && guanmei.tiYong.relation === '用克体', '观梅体用=用克体');
check(rGm.tiYongText === tiyongVerdicts.relations['用克体'].text, '观梅 → 体用断语取用克体模板');
check(rGm.untakenText === null, '有体用时不出现“未取体用”提示');

// ---- 2) 体用五关系矩阵 ----
const relNames = ['比和', '体克用', '用克体', '体生用', '用生体'];
for (const name of relNames) {
  const pan = { benGua: { order: 1, name: '乾' }, dongYao: 1, tiYong: { relation: name } };
  const v = assembleVerdict(pan, hexVerdicts, tiyongVerdicts);
  check(v.tiYongText === tiyongVerdicts.relations[name].text, `关系 ${name} → 命中模板`);
  check(v.tiYongNote !== null && v.tiYongNote.length > 0, `关系 ${name} → 带补充说明`);
  check(v.untakenText === null, `关系 ${name} → 无未取提示`);
}

// ---- 3) 静卦 / 多动（未取体用提示）----
const staticPan = { benGua: { order: 2, name: '坤' }, movingYao: [] };
const multiPan = { benGua: { order: 63, name: '既济' }, movingYao: [2, 5] };
const rSt = assembleVerdict(staticPan, hexVerdicts, tiyongVerdicts);
check(rSt.untakenText === tiyongVerdicts.untaken.noDong.text, '静卦 → noDong 提示文案');
check(rSt.guaBrief === hexVerdicts.find((e) => e.order === 2).brief, '静卦仍给卦意导语（D3：照常展示）');
const rMu = assembleVerdict(multiPan, hexVerdicts, tiyongVerdicts);
check(rMu.untakenText === tiyongVerdicts.untaken.multiDong.text, '多动 → multiDong 提示文案');
check(rMu.guaBrief === hexVerdicts.find((e) => e.order === 63).brief, '多动仍给卦意导语（D3）');

// ---- 4) 缺数据容错 ----
check(guaBriefOf({ benGua: { order: 100 } }, hexVerdicts) === null, '词库缺该卦 → brief null 不崩');
check(assembleVerdict({ benGua: { order: 1 }, tiYong: { relation: '不存在的关系' } }, hexVerdicts, tiyongVerdicts).tiYongText === null, '词库缺关系 → 断语 null 不硬凑');
check(assembleVerdict(null, null, null).guaBrief === null && assembleVerdict(null, null, null).untakenText === null, '空输入全空 → 不崩');
check(tiyongVerdictOf({ benGua: { order: 1 }, tiYong: { relation: '比和' } }, { relations: { 比和: { text: 'x' } } }).taken === true, '最小词库对象亦可工作');

// ---- 5) 文案红线抽查（词库自身完整性交给数据校验，此处抽查关键卦位）----
check(hexVerdicts.length === 64, '导语词库 64 条');
const orders = hexVerdicts.map((e) => e.order);
check(Math.min(...orders) === 1 && Math.max(...orders) === 64 && new Set(orders).size === 64, '导语词库 order 1..64 无缺');
check(/必|一定|肯定|注定|大吉|大凶/.test(hexVerdicts.find((e) => e.order === 49).brief) === false, '革卦导语无绝对化措辞');

console.log(`断语测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('VERDICT TESTS PASSED');
