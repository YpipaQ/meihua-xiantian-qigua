// 数据目录与 deps 契约测试（接口唯一清单）：node tests/run-catalog-tests.js
import fs from 'node:fs';
import { DATA_MANIFEST, assembleData, depsFromData, refFileForOrder, refEntryForOrder, interpFileForOrder, interpEntryForOrder } from '../src/catalog.js';
import { loadNodeData, loadRefForOrders } from '../src/node-data.mjs';

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// ---- 0) 清单：键唯一、必含 12 项、含 refIndex/interpIndex/ganzhiDict/cases ----
const keys = DATA_MANIFEST.map((m) => m.key);
check(new Set(keys).size === DATA_MANIFEST.length && DATA_MANIFEST.length >= 12, 'manifest 键唯一且 ≥12 项');
for (const need of ['trigrams', 'hexagrams', 'rules', 'coinConfig', 'verdictHex', 'verdictTiYong', 'classic', 'proofread', 'najia', 'refIndex', 'interpIndex', 'ganzhiDict', 'cases']) {
  check(keys.includes(need), `manifest 含 ${need}`);
}
check(DATA_MANIFEST.find((m) => m.key === 'interpIndex').path === 'data/interpret/index.json', 'interpIndex 路径为 data/interpret/index.json');
check(DATA_MANIFEST.find((m) => m.key === 'interpIndex').optional === true, 'interpIndex 为 optional（缺库不阻塞起卦）');

// ---- 0b) v5 §4.1 补齐项：ganzhiDict / cases（均 optional、不进解读链）----
const mGanzhi = DATA_MANIFEST.find((m) => m.key === 'ganzhiDict');
const mCases = DATA_MANIFEST.find((m) => m.key === 'cases');
check(mGanzhi && mGanzhi.path === 'data/ganzhi-dict.json' && mGanzhi.optional === true, 'ganzhiDict：路径正确且 optional');
check(mCases && mCases.path === 'data/cases.json' && mCases.optional === true, 'cases：路径正确且 optional');
// pick 口径：ganzhiDict 取整包；cases 取 j.cases（裸数组）
check(mGanzhi.pick({ meta: {}, gan: [], zhi: [] }).meta !== undefined, 'ganzhiDict.pick 取整包（j => j）');
check(Array.isArray(mCases.pick({ meta: {}, cases: [{ id: 'x' }] })) && mCases.pick({ meta: {}, cases: [] }).length === 0, 'cases.pick 取 j.cases 数组');
// ★装配验证：经 assembleData 真的挂到 data 上（不是清单里写了却没生效）
{
  const req = { trigrams: [], hexagrams: [], rules: [], coinConfig: {}, verdictHex: [], verdictTiYong: {}, classic: {} };
  const dV5 = assembleData({ ...req, ganzhiDict: { meta: { schema: 'x' }, gan: ['甲'], zhi: ['子'] }, cases: { meta: {}, cases: [{ id: 'guanmei' }] } });
  check(dV5.ganzhiDict && Array.isArray(dV5.ganzhiDict.gan) && dV5.ganzhiDict.zhi.length === 1, '★装配：ganzhiDict 整包进 data');
  check(Array.isArray(dV5.cases) && dV5.cases.length === 1 && dV5.cases[0].id === 'guanmei', '★装配：cases 取到 j.cases 数组');
  // 二者不进解读链：depsFromData 不得新增键
  const dDeps = depsFromData(dV5);
  check(dDeps.ganzhiDict === undefined && dDeps.cases === undefined, '★红线：ganzhiDict/cases 不进 deps（不参与解读链）');
  // 缺文件（optional 未提供）→ null，不抛错、不阻塞起卦
  const dAbsent = assembleData({ ...req, ganzhiDict: null, cases: null });
  check(dAbsent.ganzhiDict === null && dAbsent.cases === null, 'ganzhiDict/cases 缺文件 → null（不阻塞起卦）');
}

// ---- 1) 缺必需数据 → 抛错；可选缺省 → proofread={checked:[]}/null ----
let threw = false;
try { assembleData({}); } catch { threw = true; }
check(threw, '缺必需项 → assembleData 抛错');
const dOpt = assembleData({ trigrams: [], hexagrams: [], rules: [], coinConfig: {}, verdictHex: [], verdictTiYong: {}, classic: {}, proofread: null, najia: null, refIndex: null, interpIndex: null });
check(Array.isArray(dOpt.proofread.checked) && dOpt.proofread.checked.length === 0, '可选 proofread 缺省 → {checked:[]}');
check(dOpt.najia === null && dOpt.refIndex === null && dOpt.interpIndex === null, '可选 najia/refIndex/interpIndex 缺省 → null');

// ---- 2) loadNodeData：与 web loadData 同构、内容完整 ----
const data = loadNodeData();
check(data.trigrams.length === 8 && data.hexagrams.length === 64, '八卦 8 / 六十四卦 64');
check(data.verdictHex.length === 64, '卦意导语 64');
check(data.classic && data.classic.hexagrams.length === 64, '经文 64');
check(data.coinConfig && data.coinConfig.yangFace === '字', 'coinConfig 默认字为阳');
check(Array.isArray(data.refIndex) && data.refIndex.length === 64, '参考索引 64');

// ---- 3) depsFromData：条件收敛 ----
const deps = depsFromData({ ...data, ctx: { dayStem: '甲' } });
check(deps.verdictHex && deps.classic && deps.trigrams && deps.najia, '全量 data → deps 含 verdict/classic/trigrams/najia');
check(deps.ctx && deps.ctx.dayStem === '甲', 'ctx 透传');
check(depsFromData({}).verdictHex === undefined && depsFromData({ classic: {}, proofread: null }).proofread.checked, '空 data → deps 空；classic 单给 → proofread 缺省');
// interpIndex：有则收敛，无则不给（xiangjie reader 缺 deps.interp 即跳过）
check(depsFromData({ interpIndex: [{ order: 1 }] }).interpIndex.length === 1, 'interpIndex 有 → 收敛进 deps');
check(depsFromData({}).interpIndex === undefined, 'interpIndex 无 → deps 不含该键');

// ---- 4) refIndex / refFileForOrder / loadRefForOrders ----
const e49 = refEntryForOrder(data.refIndex, 49);
check(e49 && e49.name === '革' && refFileForOrder(data.refIndex, 49) === 'data/ref-corpus/49-革卦.json', 'ref 索引 49 → 革/文件名');
check(refFileForOrder(data.refIndex, 100) === null, 'ref 未知序 → null');
const refMap = loadRefForOrders([49, 31]);
check(refMap[49] && refMap[49].name === '革' && refMap[49].yaos.some((y) => y.wei === '初九'), 'loadRefForOrders 载入 49 及其爻');
check(refMap[31] && refMap[31].name === '咸', 'loadRefForOrders 载入 31');
check(Object.keys(refMap).length === 2, '仅载入请求的卦（不整库）');

// ---- 5) interpIndex：pick 取 entries（契约 §3 文件为 {meta,entries}，§4 载入器吃数组）----
// ★回归锁：必须经 assembleData 走真实 {meta,entries} 形状 —— 若 pick 退回 (j)=>j，条目解析全 null、详解静默不渲染
{
  const req = { trigrams: [], hexagrams: [], rules: [], coinConfig: {}, verdictHex: [], verdictTiYong: {}, classic: {} };
  const fakeIndex = { meta: { schema: 'v3-split-1', count: 1, repairs: 5 }, entries: [{ order: 49, name: '革', file: '49-革.json' }] };
  const dFake = assembleData({ ...req, interpIndex: fakeIndex });
  check(Array.isArray(dFake.interpIndex) && dFake.interpIndex.length === 1, 'assembleData：interpIndex 取 entries 数组（非整包）');
  check(!dFake.interpIndex.meta, 'assembleData：interpIndex 不含 meta 包裹（形状对齐 refIndex）');
  const e = interpEntryForOrder(dFake.interpIndex, 49);
  check(e && e.name === '革', '★回归：{meta,entries} → interpEntryForOrder 命中（曾因 pick=(j)=>j 全 null）');
  check(interpFileForOrder(dFake.interpIndex, 49) === 'data/interpret/49-革.json', '★回归：{meta,entries} → interpFileForOrder 给出路径');
  check(depsFromData(dFake).interpIndex.length === 1, '★回归：depsFromData 直通 entries 数组');
}

if (Array.isArray(data.interpIndex) && data.interpIndex.length) {
  const rawIndex = JSON.parse(fs.readFileSync(new URL('../data/interpret/index.json', import.meta.url), 'utf8'));
  const i49 = interpEntryForOrder(data.interpIndex, 49);
  check(i49 && i49.name === '革' && i49.file === '49-革.json', 'interp 索引 49 → 革/49-革.json');
  check(interpFileForOrder(data.interpIndex, 49) === 'data/interpret/49-革.json', 'interpFileForOrder → data/interpret/…');
  check(data.interpIndex.length === 64, `interp 索引 64 卦（实得 ${data.interpIndex.length}）`);
  // v6：schema 升 v3-split-2（新增 xiangRepairs）；索引结构不变，载入器无需改
  check(rawIndex.meta && rawIndex.meta.schema === 'v3-split-2', 'interp 索引文件 meta.schema=v3-split-2（v6 起）');
  check(rawIndex.meta.repairs === 5, `interp 索引 meta.repairs=5 类缺陷（实得 ${rawIndex.meta.repairs}）`);
  check(rawIndex.meta.count === 64, 'interp 索引 meta.count=64');
  check(interpFileForOrder(data.interpIndex, 100) === null, 'interp 未知序 → null');
  check(deps.interpIndex && deps.interpIndex.length === 64, 'interpIndex 经 depsFromData 直通');
  // 真实文件路径确实存在（索引 → 文件闭环）
  const p49 = new URL('../data/interpret/49-革.json', import.meta.url);
  check(fs.existsSync(p49), '索引给出的 49-革.json 文件存在');
} else {
  console.log('（提示：data/interpret/ 未就位 → 跳过真数据 interp 索引断言，数据产出后自动生效）');
}

// ---- 6) ★回归锁（集成）：{meta,entries} index → assembleData → deps → loadInterpMap 真的取到条目 ----
// 背景：pick 若退回 (j)=>j，interpEntryForOrder 全 null、loadInterpMap 静默空转、详解段不渲染。
{
  const req = { trigrams: [], hexagrams: [], rules: [], coinConfig: {}, verdictHex: [], verdictTiYong: {}, classic: {} };
  const fakeIndex = { meta: { schema: 'v3-split-1', count: 1, repairs: 5 }, entries: [{ order: 49, name: '革', file: '49-革.json' }] };
  const dFake = assembleData({ ...req, interpIndex: fakeIndex });
  const entry = { schema: 'v3-split-1', order: 49, name: '革', gua: { classic: { text: 'x' } }, yaos: [], meta: { aiFilled: [] } };
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (rel) => {
    seen.push(rel);
    return rel === 'data/interpret/49-革.json'
      ? { ok: true, status: 200, json: async () => entry }
      : { ok: false, status: 404, json: async () => null };
  };
  try {
    const { loadInterpMap } = await import('../web/js/loaders.js');
    const map = await loadInterpMap(depsFromData(dFake).interpIndex, [49, 31, 49]);
    check(seen.includes('data/interpret/49-革.json'), '★集成：loadInterpMap 按索引取到 data/interpret/49-革.json');
    check(map[49] && map[49].name === '革', '★集成：loadInterpMap 返回 {order: entry}');
    check(map[31] === undefined, '缺文件（31）→ 静默略过，不报错');
    check(seen.filter((r) => r === 'data/interpret/49-革.json').length === 1, 'orders 去重：同卦只请求一次');
    check((await loadInterpMap(depsFromData(dFake).interpIndex, [49]))[49] !== undefined, '逐卦缓存：二次请求仍可用');
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log(`\n数据目录/deps 契约测试：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('CATALOG TESTS PASSED');
