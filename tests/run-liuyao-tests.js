// 六爻断法 reader 测试：node tests/run-liuyao-tests.js
// 覆盖范围：
//   1) 仅铜钱盘产出（先天盘/数字盘 → null，注册表自动跳过）
//   2) 输出字段结构冻结（note/yongShen/shiYing/lines/changes/verdict）
//   3) 世应位置与 najiaReading 的 gong.shi/gong.ying 一致（不重复实现装卦）
//   4) 静卦（0 动）/ 单动 / 六爻全动 三形态不崩
//   5) 缺 deps.najia / deps.trigrams / ctx 容错 → grade:'略' 且 basis 有说明
//   6) 不作绝对吉凶：任何形态 grade 恒 '略'
//   7) liuyaoText 输出非空字符串数组；注册表/readingsText 装配
//   8) 回归锁：verdict 对铜钱盘仍不装配
// 注意：T2（旬空/月破）字段可能尚未落地 —— 本套件按契约「缺失即 false」断言，不依赖其真值。
import fs from 'node:fs';
import {
  cast,
  castCoinLines,
  najiaReading,
  liuyaoReading,
  liuyaoText,
  LIUYAO_NOTE,
  isCoinPan,
  movingPositions,
  interpretPan,
  readingsText,
  listReaders,
} from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const data = {
  trigrams: readJson('../data/trigrams.json').trigrams,
  hexagrams: readJson('../data/hexagrams.json').hexagrams,
  rules: readJson('../data/rules.json').rules,
};
const najiaData = readJson('../data/najia.json');
const ctx = { dayStem: '甲', monthBranch: '寅', dayBranch: '子' };
const deps = { trigrams: data.trigrams, najia: najiaData, ctx };

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// 造铜钱盘：values 自下而上 6 条，moving 为动爻位数组（1..6）
function coinPan(values, movingPositionsArr = []) {
  const mv = new Set(movingPositionsArr);
  return castCoinLines(
    data,
    values.map((value, i) => ({ value, moving: mv.has(i + 1) })),
    { yangFace: '字' }
  );
}

// ---- 0) 契约常量 ----
check(LIUYAO_NOTE === '六爻断法（参考口径）：以世应、六亲、动变生克为纲，不作绝对吉凶断言。', 'LIUYAO_NOTE 与契约 §3.2 逐字一致');

// ---- 1) 仅铜钱盘产出 ----
const coin = coinPan([1, 1, 1, 1, 1, 1], [1]);
check(isCoinPan(coin) && coin.benGua.order === 1, '造盘：乾（初爻动）为铜钱盘');
const rCoin = liuyaoReading(coin, deps);
check(rCoin !== null && typeof rCoin === 'object', '铜钱盘 → 有产出');

const xiantian = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
check(!isCoinPan(xiantian), '先天盘 kind 非 coin');
check(liuyaoReading(xiantian, deps) === null, '先天盘 → null（不产出）');
check(liuyaoReading({ kind: 'number', lines: [1, 0, 1, 0, 1, 1], movingYao: [] }, deps) === null, '数字盘（kind:number）→ null');
check(liuyaoReading(null, deps) === null && liuyaoReading(undefined, deps) === null, 'null/undefined 盘 → null 不崩');
// 先天盘 even 有 najia deps 也不产出（盘类型门控，不是数据门控）
check(interpretPan(xiantian, deps, { only: ['liuyao'] }).length === 0, '先天盘经注册表 only:liuyao → 不装配');

// ---- 2) 输出字段结构冻结（契约 §3.3）----
check(rCoin.note === LIUYAO_NOTE, 'note 字段 = LIUYAO_NOTE');
const keys = Object.keys(rCoin).sort().join(',');
check(keys === 'changes,lines,note,shiYing,verdict,yongShen', `顶层字段恰为契约 §3.3 六项（实得 ${keys}）`);
check(Object.keys(rCoin.yongShen).sort().join(',') === 'basis,pos,qin,wei', 'yongShen 字段 = {qin,pos,wei,basis}');
check(Object.keys(rCoin.shiYing).sort().join(',') === 'relation,shi,text,ying', 'shiYing 字段 = {shi,ying,relation,text}');
check(Object.keys(rCoin.verdict).sort().join(',') === 'basis,grade,text', 'verdict 字段 = {grade,text,basis}');
check(rCoin.lines.length === 6, 'lines 恒 6 条');
const lineKeys = Object.keys(rCoin.lines[0]).sort().join(',');
check(lineKeys === 'dong,kong,note,po,pos,qin,wei,yue,zhi', `lines[] 字段 = 契约九项（实得 ${lineKeys}）`);
check(rCoin.lines.every((x, i) => x.pos === i + 1), 'lines 自下而上 pos=1..6');
check(Array.isArray(rCoin.changes) && Array.isArray(rCoin.verdict.basis), 'changes/verdict.basis 为数组');

// ---- 3) 世应与 najiaReading 一致（不重复实现装卦）----
const nj = najiaReading(coin, data.trigrams, najiaData, ctx);
check(nj && nj.gong, 'najiaReading 对铜钱盘可得宫');
check(rCoin.shiYing.shi === nj.gong.shi && rCoin.shiYing.ying === nj.gong.ying,
  `世应位置与 najiaReading 一致（世${rCoin.shiYing.shi}/应${rCoin.shiYing.ying} vs ${nj.gong.shi}/${nj.gong.ying}）`);
check(rCoin.shiYing.shi === 6 && rCoin.shiYing.ying === 3, '乾卦本宫：世6应3');
check(rCoin.lines.filter((x) => x.note.includes('世')).length === 1 && rCoin.lines[5].note.includes('世'), '仅世爻标「世」');
check(rCoin.lines[2].note.includes('应'), '应爻标「应」');
// 六亲/纳支与 najia 逐爻一致（证明复用而非另装一套）
check(rCoin.lines.every((x, i) => x.qin === nj.lines[i].qin && x.zhi === nj.lines[i].zhi && x.yue === nj.lines[i].yue),
  '逐爻六亲/纳支/旺衰与 najiaReading 完全一致');
check(rCoin.yongShen.pos === nj.gong.shi && rCoin.yongShen.qin === nj.lines[nj.gong.shi - 1].qin,
  '默认用神 = 世爻（qin/pos 取自 najia 装卦）');
check(rCoin.yongShen.basis.includes('默认') && rCoin.yongShen.basis.includes('世爻'), 'yongShen.basis 写明默认口径');

// 换一卦复核世应（巽宫/三世 等）：仍与 najia 一致
for (const [vals, mv] of [[[0, 1, 0, 0, 1, 1], [2]], [[1, 0, 0, 0, 1, 0], []], [[0, 0, 0, 0, 0, 0], [3, 5]]]) {
  const p = coinPan(vals, mv);
  const r = liuyaoReading(p, deps);
  const n = najiaReading(p, data.trigrams, najiaData, ctx);
  check(r && n && r.shiYing.shi === n.gong.shi && r.shiYing.ying === n.gong.ying,
    `世应一致（${p.benGua.name}：世${r.shiYing.shi}/应${r.shiYing.ying}）`);
}

// ---- 4) 三种动爻形态不崩 ----
// 4a 静卦（0 动）
const still = coinPan([1, 0, 1, 0, 1, 1], []);
const rStill = liuyaoReading(still, deps);
check(movingPositions(still).length === 0 && rStill !== null, '静卦（0 动爻）→ 有产出不崩');
check(rStill.changes.length === 0, '静卦 → changes 为空');
check(rStill.verdict.basis.some((b) => b.includes('静卦')), '静卦 → basis 说明无动爻');

// 4b 单动
const single = coinPan([1, 1, 1, 1, 1, 1], [1]);
const rSingle = liuyaoReading(single, deps);
check(rSingle.changes.length === 1 && rSingle.changes[0].pos === 1, '单动 → changes 恰 1 条且位正确');
check(rSingle.changes[0].from === '子孙子水', '单动 from 为「六亲+纳支+五行」');
check(typeof rSingle.changes[0].to === 'string' && rSingle.changes[0].to.length > 0, '单动 to（变爻纳支）非空');

// 4c 六爻全动
const allMove = coinPan([1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6]);
const rAll = liuyaoReading(allMove, deps);
check(movingPositions(allMove).length === 6 && rAll !== null, '六爻全动 → 有产出不崩');
check(rAll.changes.length === 6 && rAll.changes.every((c, i) => c.pos === i + 1), '六爻全动 → changes 6 条，位 1..6');
check(rAll.changes.every((c) => c.to && c.to.length > 0), '六爻全动 → 每条变爻纳支都取到');
check(rAll.verdict.grade === '略', '六爻全动 → grade 仍为略（不作绝对吉凶）');

// 4d 全阴静卦（坤）/ 全阳全动（乾→坤）
const kun = coinPan([0, 0, 0, 0, 0, 0], []);
const rKun = liuyaoReading(kun, deps);
check(rKun && rKun.lines.map((x) => x.wei).join(',') === '初六,六二,六三,六四,六五,上六', '坤静卦 → 爻题全阴（初六…上六）');
check(rKun && rKun.verdict.grade === '略', '坤静卦 → grade 略');

// ---- 5) 不作绝对吉凶：任何形态 grade 恒 '略' ----
for (const [name, pan] of [['静卦', still], ['单动', single], ['六动', allMove], ['坤静', kun]]) {
  const r = liuyaoReading(pan, deps);
  check(r.verdict.grade === '略' && ['吉', '平', '凶'].includes(r.verdict.grade) === false, `${name} → grade 恒略（不猜）`);
}
check(rSingle.verdict.basis.length >= 3, 'verdict.basis 有实质依据（≥3 条）');
check(!/必|一定|定吉|定凶/.test(rSingle.verdict.text), 'verdict.text 不含绝对化断言措辞');

// ---- 6) 缺 deps / ctx 容错 ----
const rNoNajia = liuyaoReading(coin, { trigrams: data.trigrams });
check(rNoNajia !== null && rNoNajia.verdict.grade === '略', '缺 deps.najia → 不崩，grade 略');
check(rNoNajia.verdict.basis.some((b) => b.includes('najia')), '缺 deps.najia → basis 说明缺什么');
check(rNoNajia.lines.length === 0 && rNoNajia.changes.length === 0, '缺 deps.najia → lines/changes 为空数组（不编造）');
const rNoTri = liuyaoReading(coin, { najia: najiaData });
check(rNoTri !== null && rNoTri.verdict.grade === '略', '缺 deps.trigrams → 不崩，grade 略');
const rNoDeps = liuyaoReading(coin, {});
check(rNoDeps !== null && rNoDeps.verdict.grade === '略' && rNoDeps.verdict.basis.length > 0, '缺全部 deps → 不崩，grade 略且有 basis');
const rNoCtx = liuyaoReading(coin, { trigrams: data.trigrams, najia: najiaData });
check(rNoCtx !== null && rNoCtx.verdict.grade === '略', '缺 ctx → 不崩');
check(rNoCtx.lines.every((x) => x.yue === null), '缺 ctx → yue 全 null（月令略）');
check(rNoCtx.verdict.basis.some((b) => b.includes('月建')) && rNoCtx.verdict.basis.some((b) => b.includes('日干')),
  '缺 ctx → basis 写明月建/日干从缺');
// 旬空/月破（T2 增补于 najiaReading）：缺 ctx 时一律 false（不猜）；有 ctx 时与 najia 真值逐爻一致
check(rNoCtx.lines.every((x) => typeof x.kong === 'boolean' && typeof x.po === 'boolean'),
  'kong/po 恒为布尔（契约 §3.3 字段冻结）');
check(rNoCtx.lines.every((x) => x.kong === false && x.po === false), '缺 ctx（无日柱/月建）→ kong/po 全 false（不猜）');
check(rNoCtx.verdict.basis.some((b) => b.includes('旬空') || b.includes('月建')), '缺 ctx → basis 说明旬空/月建从缺');
// 有 ctx 的真值对拍（甲子日、寅月：旬空戌亥；寅月冲申 → 申爻月破）
check(rCoin.lines.every((x, i) => x.kong === (nj.lines[i].kong === true)), 'kong 逐爻与 najiaReading 一致（不重复实现）');
check(rCoin.lines.every((x, i) => x.po === (nj.lines[i].po === true)), 'po 逐爻与 najiaReading 一致（不重复实现）');
check(rCoin.lines[5].kong === true && rCoin.lines[5].zhi === '戌', '甲子旬：上爻戌土旬空');
check(rCoin.lines[4].po === true && rCoin.lines[4].zhi === '申', '寅月：五爻申金月破');
check(rCoin.lines[0].kong === false && rCoin.lines[0].po === false, '初爻子水不空不破');
check(rCoin.verdict.basis.some((b) => b.includes('旬空')), 'basis 含本旬旬空说明');
check(liuyaoText(rCoin).some((l) => l.includes('旬空')) && liuyaoText(rCoin).some((l) => l.includes('月破')),
  '文本如实标出旬空/月破');

// xunKong === null（缺日支）：不崩、不透出 undefined、basis 有说明
{
  const njNoDay = najiaReading(coin, data.trigrams, najiaData, { dayStem: '甲', monthBranch: '寅' });
  check(njNoDay.xunKong === null, '缺日支 → najiaReading.xunKong 为 null（前置条件）');
  const r = liuyaoReading(coin, { trigrams: data.trigrams, najia: najiaData, ctx: { dayStem: '甲', monthBranch: '寅' } });
  check(r !== null && r.verdict.grade === '略', 'xunKong=null → 不崩，grade 略');
  check(r.lines.every((x) => x.kong === false), 'xunKong=null → kong 全 false（无法判定即 false，不猜）');
  const t = liuyaoText(r);
  check(!t.some((l) => l.includes('undefined') || l.includes('null')), 'xunKong=null → 文本无 undefined/null 泄漏');
  check(r.verdict.basis.some((b) => b.includes('旬空') || b.includes('日支')), 'xunKong=null → basis 说明旬空从缺');
}
// 无 ctx：xunKong=null 且 po 全 false（月建缺 ⇒ 月破无从判）
{
  const njNone = najiaReading(coin, data.trigrams, najiaData, {});
  check(njNone.xunKong === null, '无 ctx → najiaReading.xunKong 为 null（前置条件）');
  const r = liuyaoReading(coin, { trigrams: data.trigrams, najia: najiaData });
  check(r.lines.every((x) => x.po === false), '无月建 → po 全 false（不猜）');
  check(!liuyaoText(r).some((l) => l.includes('undefined')), '无 ctx → 文本无 undefined 泄漏');
}
// 防重复实现锁（契约硬性）：liuyao.js 不得自带旬空/月破/纳甲逻辑 —— 源码级反证
{
  const src = fs.readFileSync(new URL('../src/core/liuyao.js', import.meta.url), 'utf8');
  check(/from '\.\/najia\.js'/.test(src), 'liuyao.js 从 najia.js 导入（复用装卦真身）');
  check(!/xunKongOf|甲子|甲戌|甲申|甲午|甲辰|甲寅/.test(src), 'liuyao.js 不含旬首/旬空表（不重复实现旬空）');
  check(!/const\s+(CHONG|KE|SHENG)\s*=/.test(src), 'liuyao.js 不含生克/六冲表（复用 cast.js#wuXingRelation）');
  check(!/nazhi|gongPatterns|SHI\s*=|YING\s*=/.test(src), 'liuyao.js 不含纳支/八宫/世应表（复用 najiaReading）');
  // 多组 ctx 交叉验证：kong/po 恒等于 najiaReading 真值（证明只读透传，未自行复算）
  for (const c of [
    { dayStem: '甲', monthBranch: '寅', dayBranch: '子' },
    { dayStem: '丙', monthBranch: '申', dayBranch: '午' },
    { dayStem: '庚', monthBranch: '卯', dayBranch: '戌' },
  ]) {
    const n = najiaReading(coin, data.trigrams, najiaData, c);
    const r = liuyaoReading(coin, { trigrams: data.trigrams, najia: najiaData, ctx: c });
    check(r.lines.every((x, i) => x.kong === (n.lines[i].kong === true) && x.po === (n.lines[i].po === true)),
      `ctx=${c.dayStem}${c.dayBranch}/${c.monthBranch}月 → kong/po 逐位等于 najiaReading（只读透传）`);
    check(r.lines.every((x) => typeof x.kong === 'boolean' && typeof x.po === 'boolean'), 'kong/po 恒为 boolean（防御 undefined）');
  }
}

// ---- 7) liuyaoText ----
const text = liuyaoText(rCoin);
check(Array.isArray(text) && text.length > 0, 'liuyaoText → 非空数组');
check(text.every((l) => typeof l === 'string'), 'liuyaoText → 全为字符串');
check(text.some((l) => l.startsWith('六爻｜用神：')), '文本含用神行');
check(text.some((l) => l.startsWith('六爻｜世应：')), '文本含世应行');
const lineRows = text.filter((l) => /^六爻｜(初|上|[九六])(九|六|二|三|四|五)/.test(l));
check(lineRows.length === 6, `文本含 6 行爻明细（实得 ${lineRows.length}）`);
check(text.some((l) => l.includes('动变')), '文本含动变行');
check(text.some((l) => l.includes('断语（略）')), '文本含断语行且标「略」');
check(text.some((l) => l.includes('依据：')), '文本含依据行');
check(text.some((l) => l.includes(LIUYAO_NOTE)), '文本含口径提示');
check(!text.some((l) => l.includes('undefined') || l.includes('null')), '文本无 undefined/null 泄漏');
check(liuyaoText(null).length === 0 && liuyaoText(undefined).length === 0, 'liuyaoText(null) → 空数组');
check(liuyaoText(rNoDeps).length > 0, '缺 deps 时 liuyaoText 仍产出（如实写略）');

// ---- 8) 注册表装配 ----
const ids = listReaders().map((r) => r.id);
check(ids.includes('liuyao'), '注册表含 liuyao');
// v6 新增 shiyi（置链末，契约 §3.1）——本条锁的语义是「liuyao 紧跟 najia」，仍成立
check(ids.join(',') === 'verdict,classic,najia,liuyao,xiangjie,shiyi,baihua', `liuyao 位于 najia 之后（实得 ${ids.join(',')}）`);
// v8：liuyao 退链（defaultOff）—— 简档不含，繁档才有。两档都不得有 error。
const resCoin = interpretPan(coin, deps);
const resCoinFull = interpretPan(coin, deps, { detail: 'full' });
check(!resCoin.some((r) => r.id === 'liuyao'), '★简档不含 liuyao（v8 退链）');
const liuyaoNode = resCoinFull.find((r) => r.id === 'liuyao');
check(liuyaoNode && !liuyaoNode.error, '繁档经注册表装配出 liuyao 且无错误');
check(liuyaoNode && liuyaoNode.data.verdict.grade === '略', '装配结果 grade 略');
const rdText = readingsText(resCoinFull, coin);
check(rdText.some((l) => l.startsWith('六爻｜')), 'readingsText 经 formatter 输出六爻行（繁档）');
check(resCoin.every((r) => !r.error) && resCoinFull.every((r) => !r.error), '铜钱盘各 reader 均无错误（两档）');

// ---- 9) 回归锁：verdict 对铜钱盘仍不装配（契约 §3.1，一行未改）----
check(!resCoin.some((r) => r.id === 'verdict'), '铜钱盘默认链不含 verdict');
check(interpretPan(coin, deps, { only: ['verdict'] }).length === 0, 'even only:verdict → 铜钱盘不产出（既有行为不变）');
// 先天盘 verdict 仍正常（证明没被误伤）
const vDeps = {
  ...deps,
  verdictHex: readJson('../data/interpretations/hexagram-verdicts.json').hexagrams,
  verdictTiYong: readJson('../data/interpretations/tiyong-verdicts.json'),
};
const resXian = interpretPan(xiantian, vDeps);
check(resXian.some((r) => r.id === 'verdict'), '先天盘 verdict 仍装配（未被 v5 误伤）');
check(!resXian.some((r) => r.id === 'liuyao'), '先天盘默认链不含 liuyao');

console.log(`六爻断法测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('LIUYAO TESTS PASSED');
