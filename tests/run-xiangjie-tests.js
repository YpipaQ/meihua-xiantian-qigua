// 详解（参考汇编）reader 测试：node tests/run-xiangjie-tests.js
// 覆盖：
//   A. 合成盘/合成语料（不依赖 data/interpret/，恒跑）——Block 字段、缺 map 跳过、★动爻按 pos 对齐（非 wei 匹配）、
//      缺字段容错（plain=null）、铜钱盘放行、verdict 不装配、文本输出、默认链顺序与 baihua 退链；
//   B. 真数据（data/interpret/ 就位后跑）——49 革/31 咸 装配、relations、邵雍 grade、变卦 engine、
//      AI 补写标记、D3/D4 缺陷回归、索引口径。
// B 未就位时只跳过 B（退出码仍 0），不阻塞其余套件。
import fs from 'node:fs';
import {
  cast,
  castCoinLines,
  interpretPan,
  listReaders,
  readingsText,
  xiangjieReading,
  xiangjieText,
} from '../src/core/index.js';
import { depsFromData } from '../src/catalog.js';
import { loadNodeData } from '../src/node-data.mjs';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const exists = (rel) => fs.existsSync(new URL(rel, import.meta.url));

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// v11：语料来源站已从项目中移除，文案改为中性表述
const NOTE = '参考汇编（通行本系，来源不明），未经逐条核对通行本；AI 补写段已标注。';
const data = loadNodeData();
const baseDeps = depsFromData(data);

// ============ A. 合成语料（恒跑，不依赖 data/interpret/）============
// 造一份符合契约 §2/§4 的最小条目：本卦层含 relations/名家；动爻层含邵雍(grade)/变卦(engine)
function mkEntry(order, name, yaos) {
  return {
    schema: 'v3-split-1',
    order,
    name,
    source: 'synthetic',
    gua: {
      classic: { text: `${name}卦辞` },
      alt: null,
      xiang: `${name}象曰`,
      plain: { 译文: `${name}白话`, 象辞白话: `${name}象辞白话` },
      voices: { 断易天机: { text: '天机' }, 邵雍: { text: '雍' }, 传统解卦: { 大象: '大象文' }, 哲学含义: { text: '哲' } },
    },
    relations: { mutual: { order: 2, name: '互', raw: 'r' }, opposite: { order: 3, name: '错', raw: 'r' }, comprehensive: { order: 4, name: '综', raw: 'r' } },
    yaos: yaos || [1, 2, 3, 4, 5, 6].map((pos) => ({
      pos,
      wei: `位${pos}`,
      yin: false,
      classic: { text: `爻${pos}辞` },
      alt: null,
      xiang: `爻${pos}象`,
      plain: { 译文: `爻${pos}白话`, 象辞白话: `爻${pos}象白` },
      voices: {
        邵雍: { grade: '平', text: `爻${pos}雍` },
        傅佩荣: { 时运: `爻${pos}运`, 财运: `爻${pos}财` },
        变卦: { fromPos: `位${pos}`, order: 30 + pos, name: `变${pos}`, text: `爻${pos}变`, engine: { order: 30 + pos, name: `变${pos}` } },
        哲学含义: { text: `爻${pos}哲` },
      },
    })),
    meta: { splitAt: '2026-10-14', splitter: 'synthetic', repairs: [], aiFilled: ['位2:哲学含义', '卦辞:哲学含义'] },
  };
}
const synMap = { 10: mkEntry(10, '甲'), 11: mkEntry(11, '乙') };
const synPan = (moving, zhi) => ({ benGua: { order: 10, name: '甲' }, zhiGua: zhi || null, movingYao: moving, yao: [] });
const synPanOf = (order, name, moving) => ({ benGua: { order, name }, zhiGua: null, movingYao: moving, yao: [] });

// A1. Block 字段与结构
{
  const r = xiangjieReading(synPan([1, 3]), { 10: synMap[10], 11: synMap[11] });
  check(r && r.note === NOTE, 'note 为契约固定文案');
  check(r.ben.scope === 'ben' && r.ben.order === 10 && r.ben.name === '甲', 'ben 块 scope/order/name');
  check(r.ben.classic.text === '甲卦辞' && r.ben.xiang === '甲象曰', 'ben classic/xiang');
  check(r.ben.plain.译文 === '甲白话' && r.ben.plain.象辞白话 === '甲象辞白话', 'ben plain 两键');
  check(r.ben.voices['断易天机'].text === '天机' && r.ben.voices['传统解卦'].大象 === '大象文', 'ben voices 字符串包 {text}、对象原样保留');
  check(r.ben.relations && r.ben.relations.mutual.name === '互' && r.ben.relations.comprehensive.name === '综', 'ben relations 互/错/综');
  check(r.ben.aiFill === true, 'ben.aiFill 取 卦辞:哲学含义（合成数据为 true）');
  check(r.dong.length === 2 && r.dong[0].scope === 'dong' && r.dong[0].wei === '位1' && r.dong[1].wei === '位3', 'dong 块按 moving 取位');
  check(r.dong[0].relations === undefined, 'dong 无 relations');
  check(r.dong[0].aiFill === false, 'dong.aiFill 按「爻题:哲学含义」判定（位1 不在 aiFilled → false）');
  const r2 = xiangjieReading(synPan([2]), synMap);
  check(r2.dong[0].aiFill === true, 'dong.aiFill：位2 在 aiFilled → true');
  check(r.dong[0].voices['邵雍'].grade === '平' && r.dong[0].voices['变卦'].engine.order === 31, 'dong voices 邵雍 grade / 变卦 engine');
  check(r.zhi === null, '无之卦 → zhi=null');
}

// A2. ★动爻按 pos 对齐（不用 wei 字符串匹配）
{
  const scrambled = { ...synMap[10], yaos: synMap[10].yaos.map((y) => ({ ...y, wei: `X${y.pos}` })) };
  const r = xiangjieReading(synPan([2, 5]), { 10: scrambled });
  check(r.dong.map((d) => d.wei).join(',') === 'X2,X5', 'wei 被打乱仍按 pos 命中（锁定 pos 对齐铁律）');
  const missing = { ...synMap[10], yaos: synMap[10].yaos.filter((y) => y.pos !== 5) };
  const r2 = xiangjieReading(synPan([2, 5]), { 10: missing });
  check(r2.dong.length === 1 && r2.dong[0].wei === '位2', '语料缺该 pos → 跳过该位，其余照给（不抛错）');
  const dup = { ...synMap[10], yaos: [...synMap[10].yaos, { ...synMap[10].yaos[4] }] };
  const r3 = xiangjieReading(synPan([5]), { 10: dup });
  check(r3.dong.length === 1, 'pos 重复 → 只取一条（不重复计）');
}

// A3. 缺 map / 无条目 / 无盘 → null
{
  check(xiangjieReading(synPan([1]), null) === null, 'null interpMap → null');
  check(xiangjieReading(synPan([1]), {}) === null, '空 interpMap（本卦无条目）→ null');
  check(xiangjieReading(null, synMap) === null, 'null 盘 → null');
  check(xiangjieReading({}, synMap) === null, '无 benGua 的盘 → null');
  const r = xiangjieReading(synPan([1], { order: 99, name: '无' }), synMap);
  check(r && r.zhi === null && r.ben !== null, '之卦不在 map → zhi=null、本卦照给');
  const r2 = xiangjieReading(synPan([1], { order: 11, name: '乙' }), synMap);
  check(r2.zhi && r2.zhi.scope === 'zhi' && r2.zhi.order === 11, '之卦在 map → zhi 块');
  check(r2.zhi.relations === undefined && r2.zhi.wei === undefined, 'zhi 块不含 relations/wei');
}

// A4. 缺字段容错（契约 §5.1：D3/D4 污染字段移入 alt、正式字段置 null）
{
  const broken = mkEntry(12, '丙');
  broken.gua.plain = null;
  broken.gua.xiang = null;
  broken.yaos[0].plain = null;
  broken.yaos[0].classic = null;
  broken.yaos[0].alt = { text: '错植原文', note: '语料异文（待校对）' };
  broken.gua.voices = { 哲学含义: 'AI 串' };
  const r = xiangjieReading(synPanOf(12, '丙', [1]), { 12: broken });
  check(r.ben.plain === null && r.ben.xiang === '', 'plain=null / xiang=null → 如实透出（不编造）');
  check(r.dong[0].classic === null && r.dong[0].plain === null, 'dong classic/plain 缺失 → null');
  check(r.dong[0].alt && r.dong[0].alt.text === '错植原文', 'dong alt 留档');
  check(r.ben.voices['哲学含义'].text === 'AI 串', '字符串 voice 包成 {text}');
  const L = xiangjieText(r);
  check(L.some((l) => l.includes('（缺）')), 'classic 缺失 → 文本标（缺）而非抛错');
  check(L.some((l) => l.includes('语料异文')), 'alt → 文本出校对参考行');
  check(!L.some((l) => l.includes('undefined')), '文本无 undefined 泄漏');
}

// A5. 默认链：xiangjie 入链、baihua 退链（defaultOff）
{
  const ids = listReaders().map((r) => r.id);
  // v5 新增 liuyao（插在 najia 之后，契约 §3.4）——仅链序字面更新，本条锁的语义（xiangjie 在链、baihua 退链）不变
  check(ids.join(',') === 'verdict,classic,najia,liuyao,xiangjie,shiyi,baihua', `默认链序 verdict,classic,najia,liuyao,xiangjie,shiyi,baihua（实得 ${ids.join(',')}）`);
  // v8：xiangjie 退链（defaultOff）—— 简档不含它，繁档（detail:'full'）才有。
  const rBrief = interpretPan(synPan([1]), { ...baseDeps, interp: synMap });
  const rFull = interpretPan(synPan([1]), { ...baseDeps, interp: synMap }, { detail: 'full' });
  check(!rBrief.some((x) => x.id === 'xiangjie'), '★简档不含 xiangjie（v8 退链）');
  check(rFull.some((x) => x.id === 'xiangjie'), '繁档含 xiangjie');
  check(!rFull.some((x) => x.id === 'baihua'), 'baihua 不在任何默认档（defaultOff 且 brief/full 均不点名则跳过）');
  check(interpretPan(synPan([1]), {}, { only: ['xiangjie'] }).length === 0, '无 deps.interp → xiangjie 跳过');
  check(interpretPan(synPan([1]), { interp: synMap }, { only: ['xiangjie'] }).length === 1, 'only:xiangjie 装配');
  const baihuaOnly = interpretPan(synPan([1]), { ref: { 10: { order: 10, name: '甲', hexagram: { plain: { 译文: 'x' } } } } }, { only: ['baihua'] });
  check(baihuaOnly.length === 1, 'defaultOff 的 baihua 经 only 仍可装配');
}

// A6. 文本输出
{
  const r = xiangjieReading(synPan([2], { order: 11, name: '乙' }), synMap);
  const L = xiangjieText(r);
  check(L.some((l) => l.startsWith('详解｜本卦 甲')), '文本含本卦行');
  check(L.some((l) => l.startsWith('详解｜动爻 位2')), '文本含动爻行');
  check(L.some((l) => l.startsWith('详解｜之卦 乙')), '文本含之卦行');
  check(L.some((l) => l.includes('卦象关联')), '文本含卦象关联行');
  check(L.some((l) => l.includes('变卦（变2 第32卦）')), '变卦行带卦名/卦序');
  check(L.some((l) => l.includes('邵雍(平)')), '邵雍行带 grade');
  check(L.some((l) => l.includes('〔AI补〕')), 'AI 补写段带〔AI补〕标记');
  check(L[L.length - 1].includes(NOTE), '末行为来源提示');
  check(xiangjieText(null).length === 0, 'xiangjieText(null) → []');
  // 经注册表统一文本
  const res = interpretPan(synPan([2]), { ...baseDeps, interp: synMap }, { detail: 'full' });
  const lines = readingsText(res, synPan([2]));
  check(lines.some((l) => l.startsWith('详解｜本卦 甲')), 'readingsText 经 formatter 输出详解行（繁档）');
}

// A7. 铜钱盘放行（复用现有 reader）
{
  const coin = castCoinLines(data, [1, 1, 1, 1, 1, 1].map((v, i) => ({ value: v, moving: i === 0 })), { yangFace: '字' });
  const depsCoin = { ...baseDeps, interp: { 1: mkEntry(1, '乾'), 44: mkEntry(44, '姤') } };
  // v8：简/繁分档 —— 简档只 classic，繁档才含 najia/xiangjie。两档都不得出现 verdict。
  const res = interpretPan(coin, depsCoin);
  const ids = res.map((x) => x.id);
  const resFull = interpretPan(coin, depsCoin, { detail: 'full' });
  const idsFull = resFull.map((x) => x.id);
  check(res.length > 0, `铜钱盘解卦不再空置（实得 ${res.length} 个 reader）`);
  check(ids.includes('classic'), `铜钱盘简档放行 classic（实得 ${ids.join(',')}）`);
  check(idsFull.includes('classic') && idsFull.includes('najia') && idsFull.includes('xiangjie'), `铜钱盘繁档放行 classic/najia/xiangjie（实得 ${idsFull.join(',')}）`);
  check(!ids.includes('verdict') && !idsFull.includes('verdict'), 'verdict 对铜钱盘不装配（体用恒空；两档皆然）');
  check(interpretPan(coin, depsCoin, { only: ['verdict'] }).length === 0, 'even only:verdict → 铜钱盘不产出');
  const xj = resFull.find((x) => x.id === 'xiangjie');
  check(xj && xj.data.ben.order === 1 && xj.data.dong.length === 1 && xj.data.dong[0].wei === '位1', '铜钱盘 xiangjie：乾初爻动');
  check(xj && xj.data.zhi && xj.data.zhi.order === 44, '铜钱盘 xiangjie：之卦 44');
  check(res.every((x) => !x.error), '铜钱盘各 reader 无错误');
  const coin0 = castCoinLines(data, [1, 0, 1, 0, 1, 1].map((value) => ({ value, moving: false })), { yangFace: '字' });
  const r0 = xiangjieReading(coin0, { [coin0.benGua.order]: mkEntry(coin0.benGua.order, coin0.benGua.name) });
  check(r0 && r0.dong.length === 0 && r0.ben !== null, '铜钱静卦：ben 照给、dong 空');
  // 多动：位序升序、逐位对齐
  const coinM = castCoinLines(data, [1, 1, 1, 0, 0, 0].map((value, i) => ({ value, moving: i === 1 || i === 4 })), { yangFace: '字' });
  const rM = xiangjieReading(coinM, { [coinM.benGua.order]: mkEntry(coinM.benGua.order, '泰') });
  check(rM.dong.map((d) => d.wei).join(',') === '位2,位5', `铜钱多动按位取（实得 ${rM.dong.map((d) => d.wei).join(',')}）`);
}

// ============ B. 真数据（data/interpret/ 就位后跑）============
const hasInterp = exists('../data/interpret/index.json');
if (!hasInterp) {
  console.log('（提示：data/interpret/ 未就位 → 跳过真数据断言（B 组），数据产出后自动生效）');
} else {
  const indexFile = readJson('../data/interpret/index.json');
  const entries = Array.isArray(indexFile.entries) ? indexFile.entries : [];
  const interpFor = (orders) => {
    const map = {};
    for (const o of orders) {
      const it = entries.find((x) => x.order === o);
      if (it) map[o] = readJson(`../data/interpret/${it.file}`);
    }
    return map;
  };

  // B0. 索引
  check(entries.length === 64, `详解索引 64 卦（实得 ${entries.length}）`);
  // v6：schema 升 v3-split-2（新增 xiangRepairs）；reader 只读 gua/yaos 字段，schema 号变化不影响行为
  check(indexFile.meta && indexFile.meta.schema === 'v3-split-2', 'index.meta.schema=v3-split-2（v6 起）');
  check(indexFile.meta && indexFile.meta.repairs === 5, `index.meta.repairs=5 类缺陷（实得 ${indexFile.meta && indexFile.meta.repairs}）`);

  // B1. 观梅盘（49 革之 31 咸，初爻动）
  const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
  const mapGm = interpFor([49, 31]);
  const r = xiangjieReading(guanmei, mapGm);
  check(r && r.note === NOTE, 'note 固定文案');
  check(r.ben.order === 49 && r.ben.name === '革' && Boolean(r.ben.classic.text), 'ben 49 革 + 经文非空');
  check(r.ben.plain && r.ben.plain.译文, 'ben.plain.译文 非空');
  check(r.ben.relations && r.ben.relations.mutual.order === 44 && r.ben.relations.opposite.order === 4 && r.ben.relations.comprehensive.order === 50, 'ben.relations 互44/错4/综50');
  check(r.ben.voices['断易天机'] && typeof r.ben.voices['断易天机'].text === 'string', 'ben.voices 断易天机 字符串包 {text}');
  check(r.ben.voices['传统解卦'] && typeof r.ben.voices['传统解卦'] === 'object', 'ben.voices 传统解卦 对象保留');
  check(r.ben.aiFill === false, '49 革无 AI 补写 → ben.aiFill=false');
  check(r.dong.length === 1 && r.dong[0].wei === '初九', 'dong 初九（观梅初爻动）');
  check(r.dong[0].voices['邵雍'] && r.dong[0].voices['邵雍'].grade === '平', '邵雍 grade=平');
  check(r.dong[0].voices['变卦'] && r.dong[0].voices['变卦'].engine && r.dong[0].voices['变卦'].engine.order === 31, '变卦 engine.order=31');
  check(r.zhi && r.zhi.order === 31 && r.zhi.name === '咸', 'zhi 31 咸');
  check(interpretPan(guanmei, { ...baseDeps, interp: mapGm }, { only: ['xiangjie'] }).length === 1, '经注册表装配（真数据）');
  check(
    readingsText(interpretPan(guanmei, { ...baseDeps, interp: mapGm }, { detail: 'full' }), guanmei).some((l) => l.startsWith('详解｜本卦 革')),
    '统一文本含详解行（真数据，繁档）'
  );

  // B2. ★pos 对齐反证（真数据：打乱 wei 仍按 pos 命中）
  const src49 = mapGm[49];
  const scr = { ...src49, yaos: src49.yaos.map((y) => ({ ...y, wei: `X${y.pos}` })) };
  const pan35 = { ...guanmei, movingYao: [3, 5], dongYao: null };
  const rScr = xiangjieReading(pan35, { ...mapGm, 49: scr });
  check(rScr.dong.map((d) => d.wei).join(',') === 'X3,X5', '真数据：wei 打乱仍按 pos 命中（锁定铁律）');

  // B3. AI 补写标记（04 蒙 九二 / 63 既济 卦辞）
  const rMeng = xiangjieReading({ benGua: { order: 4, name: '蒙' }, zhiGua: null, movingYao: [2], yao: [] }, interpFor([4]));
  check(rMeng.dong.length === 1 && rMeng.dong[0].aiFill === true && rMeng.ben.aiFill === false, '蒙九二 AI 补写 → dong.aiFill=true');
  const rJi = xiangjieReading({ benGua: { order: 63, name: '既济' }, zhiGua: null, movingYao: [], yao: [] }, interpFor([63]));
  check(rJi.ben.aiFill === true, '既济卦辞 AI 补写 → ben.aiFill=true');

  // B4. 缺陷卦回归（D1–D4）
  const r19 = xiangjieReading({ benGua: { order: 19, name: '临' }, zhiGua: null, movingYao: [3], yao: [] }, interpFor([19]));
  check(r19.dong.length === 1 && r19.dong[0].wei === '六三', 'D1 临位3 → 六三');
  const r27 = xiangjieReading({ benGua: { order: 27, name: '颐' }, zhiGua: null, movingYao: [2], yao: [] }, interpFor([27]));
  check(r27.dong.length === 1 && r27.dong[0].wei === '六二', 'D2 颐位2 → 六二');
  const r36 = xiangjieReading({ benGua: { order: 36, name: '明夷' }, zhiGua: null, movingYao: [6], yao: [] }, interpFor([36]));
  check(r36.dong.length === 1 && r36.dong[0].wei === '上六', 'D3 明夷位6 → 上六');
  const r55 = xiangjieReading({ benGua: { order: 55, name: '丰' }, zhiGua: null, movingYao: [1], yao: [] }, interpFor([55]));
  check(r55.dong.length === 1 && r55.dong[0].classic && r55.dong[0].classic.text.includes('遇其配主'), 'D4 丰初九 classic 以经文重建');
  check(r55.dong[0].alt && r55.dong[0].alt.text, 'D4 错植原文进 alt 留档');
  check(xiangjieText(r55).some((l) => l.includes('语料异文')), 'D4 alt → 文本校对参考行');
}

console.log(`\n详解 reader 测试：${pass} 项通过，${fail} 项失败${hasInterp ? '' : '（B 组真数据断言待数据就位）'}`);
if (fail > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('XIANGJIE TESTS PASSED');
