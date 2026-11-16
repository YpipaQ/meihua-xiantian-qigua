// 经文读取模块测试：node tests/run-classic-tests.js
// 覆盖：经文数据完整性自检、观梅/一数动爻定位、静卦/多动、用九/用六、校对判定、缺数据容错
import fs from 'node:fs';
import {
  cast,
  castNumbers,
  classicEntry,
  isProofread,
  proofreadLevel,
  PROOFREAD_LEVELS,
  dongRefs,
  classicReading,
  titleOfYao,
} from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

const classic = readJson('../data/zhouyi-classic.json'); // {meta, hexagrams}
const hexes = classic.hexagrams;
const proofreadEmpty = readJson('../data/zhouyi-proofread.json');

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

// ---- 0) 经文数据完整性自检 ----
check(hexes.length === 64, '经文 64 卦');
check(hexes.every((e, i) => e.order === i + 1 && e.guaci && Array.isArray(e.yaoCi) && e.yaoCi.length >= 6), '卦序 1..64、guaci 非空、yaoCi ≥6');
const seq = ['初', '二', '三', '四', '五', '上'];
for (const e of hexes) {
  const yang = (e.order === 1) || (e.upper === e.lower && e.upper === '乾');
  // 简化校验：乾坤 7 条（含用九/用六），其余 6 条，且首条 ref 含“初”
  const expected = e.order === 1 || e.order === 2 ? 7 : 6;
  check(e.yaoCi.length === expected, `经文章节数量：order ${e.order} = ${expected}`);
  check(e.yaoCi[0].ref.includes('初'), `爻题从初爻起：order ${e.order}`);
  if (e.order === 1) check(e.yaoCi.some((y) => y.ref === '用九'), '乾附用九');
  if (e.order === 2) check(e.yaoCi.some((y) => y.ref === '用六'), '坤附用六');
}
check(classic.meta.proofread === false, 'meta.proofread 现状为 false（AI 初稿未校对）');

// ---- 1) 观梅盘端到端 ----
const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
const rGm = classicReading(guanmei, classic, proofreadEmpty);
check(rGm.benGua.order === 49 && rGm.benGua.name === '革', '观梅 → 本卦革(49)');
check(rGm.benGua.guaci === hexes.find((e) => e.order === 49).guaci, '观梅 → 革卦辞命中数据');
check(rGm.benGua.dong.length === 1 && rGm.benGua.dong[0].ref === '初九', '观梅 → 动爻定位初九');
check(rGm.zhiGua && rGm.zhiGua.order === 31 && !!rGm.zhiGua.guaci, '观梅 → 之卦咸(31)卦辞给出');

// ---- 2) 一数盘（借时辰）----
const one = castNumbers(data, [23], { hourBranch: 9 });
const rOne = classicReading(one, classic, proofreadEmpty);
check(rOne.benGua.order === 23 && rOne.benGua.dong[0].ref === '六二', '一数盘 → 剥(23) 六二动');

// ---- 3) 静卦 / 多动 ----
const staticPan = { benGua: { order: 2, name: '坤' }, movingYao: [] };
const rSt = classicReading(staticPan, classic, proofreadEmpty);
check(rSt.benGua.static_ === true && rSt.benGua.dong.length === 0 && rSt.benGua.guaci === hexes.find((e) => e.order === 2).guaci, '静卦 → 仅卦辞、无动爻辞');

// 泰(11)：下乾三阳、上坤三阴 → 爻题 [初九,九二,九三,六四,六五,上六]；二五动 → 九二/六五
const taiTitles = [1, 1, 1, 0, 0, 0].map((v, i) => titleOfYao(i, v));
const multiPan = { benGua: { order: 11, name: '泰' }, movingYao: [2, 5], yao: taiTitles.map((title) => ({ title })) };
const rMu = classicReading(multiPan, classic, proofreadEmpty);
check(rMu.benGua.dong.length === 2 && rMu.benGua.dong[0].ref === '九二' && rMu.benGua.dong[1].ref === '六五', '泰卦二五动 → 九二/六五 爻辞（自下而上）');

// ---- 4) 用九/用六（乾坤六爻全动，铜钱盘语义）----
const qianAll = { benGua: { order: 1, name: '乾' }, movingYao: [1, 2, 3, 4, 5, 6] };
const kunAll = { benGua: { order: 2, name: '坤' }, movingYao: [1, 2, 3, 4, 5, 6] };
check(dongRefs(qianAll).join() === '用九', '乾六爻全动 → 用九');
check(dongRefs(kunAll).join() === '用六', '坤六爻全动 → 用六');
const rQian = classicReading(qianAll, classic, proofreadEmpty);
check(rQian.benGua.dong.length === 1 && rQian.benGua.dong[0].ref === '用九' && rQian.benGua.dong[0].text === '见群龙无首，吉。', '乾用九爻辞正确取文');

// ---- 5) 校对判定 ----
check(isProofread(49, classic.meta, proofreadEmpty) === false, '空 checked → 49 未校对');
// ★改动：isProofread 语义扩为 `level !== 'none'`，crosschecked 也算"已校对"。
//   真数据里 50 鼎 已进 crosschecked，若沿用旧 map 该断言会因语义变更而失败 —— 故显式清空
//   crosschecked 以**保持本条原意**（"checked 不含 50 ⇒ 未校对"），而非放宽断言。
const withChecked = { ...proofreadEmpty, checked: [49, 3], crosschecked: [] };
check(isProofread(49, classic.meta, withChecked) === true, 'checked 含 49 → 已校对');
check(isProofread(50, classic.meta, withChecked) === false, 'checked 不含 50 → 未校对');
check(isProofread(1, { proofread: true }, proofreadEmpty) === true, 'meta.proofread=true → 全部已校对');
check(rGm.metaUnchecked === true && rGm.benGua.proofread === false, '观梅（未核对）→ meta 提示条 + 卦级角标');

// ---- 6) 缺数据容错 ----
check(classicEntry(100, hexes) === null && classicEntry(null, hexes) === null, '缺卦 → null');
check(classicReading({ benGua: { order: 100 }, dongYao: 1 }, classic, proofreadEmpty).benGua === null, '经文无该卦 → benGua null 不崩');

// ---- 7) 三级校对----
check(
  Array.isArray(PROOFREAD_LEVELS) && PROOFREAD_LEVELS.join() === 'checked,crosschecked,none',
  'PROOFREAD_LEVELS = checked/crosschecked/none（顺序即优先级）'
);

// 判定矩阵：人工 > 交叉校验 > 未校对；机器结论绝不冒充人工结论
const lvMap = { checked: [7], crosschecked: [8, 9] };
check(proofreadLevel(7, null, lvMap) === 'checked', '三级：order ∈ checked → checked');
check(proofreadLevel(8, null, lvMap) === 'crosschecked', '三级：order ∈ crosschecked → crosschecked');
check(proofreadLevel(9, null, lvMap) === 'crosschecked', '三级：crosschecked 第二位同样命中');
check(proofreadLevel(10, null, lvMap) === 'none', '三级：未列 → none');
check(proofreadLevel(8, { proofread: true }, lvMap) === 'checked', '三级：meta.proofread=true → 全部 checked（压过 crosschecked）');
check(proofreadLevel(7, { proofread: false }, lvMap) === 'checked', '三级：逐卦 checked 优先于 meta.proofread=false');
check(proofreadLevel(null, null, lvMap) === 'none' && proofreadLevel(0, null, lvMap) === 'none', '三级：空 order → none 不崩');
check(proofreadLevel(8, null, null) === 'none' && proofreadLevel(8, null, {}) === 'none', '三级：缺 proofreadMap → none 不崩');
check(
  proofreadLevel(8, null, { checked: null, crosschecked: null }) === 'none',
  '三级：map 字段非数组 → none 不崩（不猜）'
);

// 旧布尔 API 与新 API 必须一致（= level !== 'none'），否则既有调用点语义漂移
check(
  isProofread(7, null, lvMap) === true && isProofread(8, null, lvMap) === true && isProofread(10, null, lvMap) === false,
  'isProofread ≡ proofreadLevel !== none（旧签名语义保留）'
);

// classicReading 的块同时给出 proofLevel 与 proofread，且二者自洽
const rLv = classicReading({ benGua: { order: 8 }, movingYao: [] }, classic, lvMap);
check(rLv.benGua.proofLevel === 'crosschecked', 'classicReading：块含 proofLevel=crosschecked');
check(rLv.benGua.proofread === true, 'classicReading：块保留 proofread 布尔（crosschecked ⇒ true）');
check(
  rLv.benGua.proofLevel === 'crosschecked' && rLv.benGua.proofread === true,
  'classicReading：proofLevel 与 proofread 自洽（不冒充 checked）'
);
const rChecked = classicReading({ benGua: { order: 7 }, movingYao: [] }, classic, lvMap);
check(rChecked.benGua.proofLevel === 'checked' && rChecked.benGua.proofread === true, 'classicReading：checked 卦 → proofLevel=checked');
const rNone = classicReading({ benGua: { order: 10 }, movingYao: [] }, classic, lvMap);
check(rNone.benGua.proofLevel === 'none' && rNone.benGua.proofread === false, 'classicReading：none 卦 → proofLevel=none / proofread=false');
// metaUnchecked 语义不变：只看 meta.proofread，不受三级影响
check(rLv.metaUnchecked === true && rChecked.metaUnchecked === true, 'classicReading：metaUnchecked 只由 meta.proofread 决定（语义不变）');

// ---- 8) v5：真数据文件契约（data/zhouyi-proofread.json）----
check(proofreadEmpty.meta && proofreadEmpty.meta.schema === 'v5-proofread-1', '真数据：schema = v5-proofread-1');
check(Array.isArray(proofreadEmpty.checked) && proofreadEmpty.checked.length === 0, '真数据：checked 仍为 []（未经人工，生成器不得写入）');
check(
  Array.isArray(proofreadEmpty.crosschecked) &&
    proofreadEmpty.crosschecked.length > 0 &&
    new Set(proofreadEmpty.crosschecked).size === proofreadEmpty.crosschecked.length,
  '真数据：crosschecked 为非空且无重复的卦序数组'
);
// ★ 契约 §5.3（2026-10-22 修订）把原「crosschecked ≥60」改为**可验证的实质不变量**：
//     crosschecked ∩ disputed = ∅（互斥）且 |crosschecked ∪ disputed涉及卦| = 64（穷尽）
//     ⇒ crosschecked = 64 − |disputed 涉及卦数|
//   原阈值 ≥60 在冻结判据下数学上不可达（14 卦各含真异文，而含异议卦一律不进 crosschecked）
//   ⇒ 64−14=50。故此处断言**不变量**、不写死数字；当前实测值 50 仅作注释参考，
//   避免数据变化时"交付即过期"，也避免有人为了让数字达标而放宽判据（造假凑数）。
check(
  Array.isArray(proofreadEmpty.crosschecked) &&
    proofreadEmpty.crosschecked.length + new Set(proofreadEmpty.disputed.map((d) => d.order)).size === 64,
  `真数据：crosschecked + 含异议卦数 = 64（互斥且穷尽；当前 ${proofreadEmpty.crosschecked.length} + ${
    new Set(proofreadEmpty.disputed.map((d) => d.order)).size
  }）`
);
check(
  Array.isArray(proofreadEmpty.disputed) && proofreadEmpty.disputed.length > 0,
  `真数据：disputed 留档可见（实测 ${proofreadEmpty.disputed.length} 条）`
);
check(
  proofreadEmpty.crosschecked.every((o) => Number.isInteger(o) && o >= 1 && o <= 64),
  '真数据：crosschecked 均为 1..64 卦序'
);
// 交叉校验与分歧必须互斥：某卦有 disputed 就不许同时进 crosschecked（契约 §1.2 第 5 条）
const disputedOrders = new Set(proofreadEmpty.disputed.map((d) => d.order));
check(
  proofreadEmpty.crosschecked.every((o) => !disputedOrders.has(o)),
  '真数据：crosschecked ∩ disputed = ∅（一条不差才进 crosschecked）'
);
// 人工结论不得与机器结论混淆：disputed 里每条的 chosen 必须与现行本逐字相同（不自动改经文）
check(
  proofreadEmpty.disputed.every((d) => {
    const e = hexes.find((h) => h.order === d.order);
    if (!e) return false;
    const text = d.ref === '卦辞' ? e.guaci : (e.yaoCi.find((y) => y.ref === d.ref) || {}).text;
    return typeof text === 'string' && text.includes(d.chosen);
  }),
  '真数据：disputed 的 chosen 与现行本经文逐字一致（不自动改经文）'
);
check(
  proofreadEmpty.disputed.every((d) => d.sources && d.sources.A === d.chosen && Array.isArray(d.dissent) && d.dissent.length >= 2),
  '真数据：disputed 每条含 A 原文 + ≥2 异议源（可追溯）'
);
// 多数票口径（契约 §1.2 第 4 条修订）：异议源里至少 1 个是独立源 C/D/E
check(
  proofreadEmpty.disputed.every((d) => d.dissent.some((id) => ['C', 'D', 'E'].includes(id))),
  '真数据：每条 disputed 至少含 1 个独立源（C/D/E，B 不计独立性）'
);
check(
  proofreadEmpty.meta && proofreadEmpty.meta.updatedAt === '2026-10-22' && !/\d{2}:\d{2}/.test(JSON.stringify(proofreadEmpty.meta)),
  '真数据：updatedAt 只含日期不含时间（幂等）'
);
check(
  proofreadEmpty.meta && proofreadEmpty.meta.selfCheck && proofreadEmpty.meta.selfCheck.pass === true,
  '真数据：三重自洽校验全部通过（卦符/爻题阴阳/用九用六/空文本/重复）'
);
check(
  Array.isArray(proofreadEmpty.sources) && proofreadEmpty.sources.length === 5 &&
    ['A', 'B', 'C', 'D', 'E'].every((id) => proofreadEmpty.sources.some((s) => s.id === id)),
  '真数据：sources 登记 5 源（A/B/C/D/E 可追溯）'
);
check(
  (() => {
    const lv = new Set(proofreadEmpty.crosschecked.map((o) => proofreadLevel(o, classic.meta, proofreadEmpty)));
    return lv.size === 1 && lv.has('crosschecked');
  })(),
  '真数据：crosschecked 全部判定为 crosschecked（非 checked）'
);

// ---- 9) v5：生成器契约（幂等 / 不写 checked）----
const { buildProofread } = await import('../tools/proofread-classic.mjs');
const gen1 = buildProofread({ existing: { checked: [11, 22] } });
check(
  JSON.stringify(gen1.out.checked) === '[11,22]',
  '生成器：checked 原样保留（人工结论不被机器覆盖）'
);
const gen2 = buildProofread({ existing: null });
check(Array.isArray(gen2.out.checked) && gen2.out.checked.length === 0, '生成器：无既有文件 → checked=[]（不推断）');
check(
  JSON.stringify(buildProofread({ existing: { checked: [11, 22] } }).out) === JSON.stringify(gen1.out),
  '生成器：同输入两次构建逐字节一致（纯函数幂等）'
);
check(
  gen1.out.meta.schema === 'v5-proofread-1' && gen1.out.meta.updatedAt === '2026-10-22',
  '生成器：输出 schema/updatedAt 固定（不含运行时间）'
);
check(
  gen1.out.disputed.every((d) => d.dissent.length >= 2 && d.dissent.some((id) => ['C', 'D', 'E'].includes(id))),
  '生成器：disputed 判据 = 异议源≥2 且含独立源（契约 §1.2 第 4 条）'
);
// 反例锁：29 坎卦辞只有 C 一个异议源（B 与 A 一致）⇒ 不得进 disputed
check(
  !gen1.out.disputed.some((d) => d.order === 29 && d.ref === '卦辞'),
  '生成器反例：29 坎卦辞仅 C 单源异议 → 不记 disputed（不放过单源噪声）'
);
// 正例锁：49 革卦辞 B/C 双源异议（独立源仅 C）⇒ 必须进 disputed
check(
  gen1.out.disputed.some((d) => d.order === 49 && d.ref === '卦辞'),
  '生成器正例：49 革卦辞 B/C 异议 → 记 disputed（卦辞也能判出）'
);
// 爻题剥离必须用枚举：字符类会吞正文首字（历史事故）
// 反例：若用字符类 /[初六九二三四五上用]+/ 剥「六三。三人行」，会得到「人行」。
check(
  (() => {
    const d = gen1.out.disputed.find((x) => x.order === 3 && x.ref === '初九');
    // 「磐桓…」若被字符类剥爻题不会变形，故再取 47 困 六三「蒺藜」类首字校验
    const d2 = gen1.out.disputed.find((x) => x.order === 47 && x.ref === '六三');
    return d && d.chosen.startsWith('磐桓') && d2 && d2.chosen.startsWith('困于');
  })(),
  '生成器：爻题剥离不吞正文首字（枚举正则，非字符类）'
);

// ★ 回归锁：源 B 必须按**位次**对齐，不能按 wei 匹配
// 19 临 位3 的 wei 误标为「九三」（源数据 known-issue），但正文实为「六三。甘临…」。
// 若按 wei 匹配，B 在「六三」上取不到票 ⇒ 该条异议源只剩 C 一个 ⇒ 漏判 disputed。
// 本断言锁住「19 临 六三 必须在 disputed 且异议源含 B」——将来谁把对齐改成 wei 匹配，这条立刻红。
check(
  (() => {
    const d = gen1.out.disputed.find((x) => x.order === 19 && x.ref === '六三');
    return !!d && d.dissent.includes('B') && d.dissent.includes('C');
  })(),
  '生成器：源 B 按位次对齐（19 临 六三 wei 误标仍能取到 B 票，锁死 D1 回归）'
);
// 配套锁：19 临 六三 的 B 源展示值应含「即忧之」（语料原文），且不得带前导冒号/爻题
check(
  (() => {
    const d = gen1.out.disputed.find((x) => x.order === 19 && x.ref === '六三');
    if (!d || !d.sources.B) return false;
    return d.sources.B.includes('即忧之') && !/^[：:。.、]/.test(d.sources.B) && !d.sources.B.startsWith('六三');
  })(),
  '生成器：disputed 展示值保留语料原文且无残留分隔符/爻题（人可读）'
);
// 全量锁：任何 sources 值都不得以分隔符开头（D 源行格式「九二：正文」曾残留全角冒号）
check(
  gen1.out.disputed.every((d) => Object.values(d.sources).every((v) => typeof v === 'string' && !/^[：:。.、，,]/.test(v))),
  '生成器：所有 disputed 源文本均无前导分隔符（显示瑕疵已修）'
);
// 自洽校验键名自明：用九用六归属项必须存在且为 64/64
check(
  gen1.out.meta.selfCheck.yongJiuLiuOnlyQianKun === '64/64' &&
    gen1.out.meta.selfCheck.symbol === '64/64' &&
    gen1.out.meta.selfCheck.yaoYinYang === '384/384',
  '生成器：自洽校验三项计数正确（卦符/爻题阴阳/用九用六仅在乾坤）'
);

// ================= v5.1：异文留档可见 + 文本侧三级口径 =================
// 背景（实测发现的两处缺口，均违反契约 §5.3「disputed 全部留档可见」与 §1.4 同口径要求）：
//   ① disputed 只在数据层留档，classicReading 不透出、UI 与文本均完全不显示 —— 用户只看到红角标，
//      看不到「哪一条有分歧、各源怎么写的」；
//   ② classicText 只判 proofread 布尔（= level!=='none'）⇒ crosschecked 卦在文本里**毫无标记**，
//      与 UI 蓝色「交叉校验」角标不一致（53 渐 即为例）。
// 本节锁死：disputed 能透出、文本三分标记、且**绝不因留档而改动正文取字**。
{
  const { disputedOf } = await import('../src/core/index.js');
  // 3 屯 含 2 条 disputed（初九/六三）；53 渐 为 crosschecked 且无 disputed
  const yao6 = [{ title: '初九' }, { title: '六二' }, { title: '六三' }, { title: '六四' }, { title: '九五' }, { title: '上六' }];
  const panTun = { benGua: { order: 3, name: '屯' }, zhiGua: null, dongYao: 1, yao: yao6 };
  const panJian = { benGua: { order: 53, name: '渐' }, zhiGua: null, dongYao: 1, yao: yao6 };
  const rTun = classicReading(panTun, classic, proofreadEmpty);
  const rJian = classicReading(panJian, classic, proofreadEmpty);

  check(Array.isArray(disputedOf(3, proofreadEmpty)) && disputedOf(3, proofreadEmpty).length === 2, 'disputedOf(3 屯) → 2 条（初九/六三）');
  check(disputedOf(53, proofreadEmpty).length === 0, 'disputedOf(53 渐) → 0 条（该卦全条一致）');
  check(disputedOf(999, proofreadEmpty).length === 0, 'disputedOf(未知卦) → [] 不崩');
  check(disputedOf(3, null).length === 0, 'disputedOf(map 缺) → [] 不崩');

  check(rTun.benGua.disputed && Object.keys(rTun.benGua.disputed).length === 2, 'classicReading：屯 块透出 disputed（2 个 ref）');
  check(Array.isArray(rTun.benGua.disputed['初九']) && rTun.benGua.disputed['初九'].length === 1, 'disputed 按 ref 索引 → 初九 1 条');
  const d19 = rTun.benGua.disputed['初九'][0];
  check(d19.chosen && d19.sources && d19.sources.A && d19.dissent.includes('B'), 'disputed 条目含 chosen/sources/dissent（结构完整）');
  check(Object.keys(rJian.benGua.disputed).length === 0, 'classicReading：无分歧卦 disputed 为空对象（不伪造）');

  // ★ 留档不得影响取字：正文必须仍等于 zhouyi-classic 原文
  const tunEntry = classicEntry(3, classic.hexagrams);
  check(rTun.benGua.guaci === tunEntry.guaci, '★留档不改正文：卦辞仍取 zhouyi-classic');
  check(rTun.benGua.dong[0].text === tunEntry.yaoCi[0].text, '★留档不改正文：动爻爻辞仍取 zhouyi-classic');

  // 文本侧三级口径（readingsText 经注册表产出）
  const { interpretPan, readingsText } = await import('../src/core/index.js');
  const depsC = { classic, proofread: proofreadEmpty };
  // v8：异文留档**默认不出**（力求简洁：524 字里塞 4 条异文会淹没答案）。
  //   需显式 withDisputes:true 才展开 —— 所以这里对比两档：默认档应"只有一条注"，展开档才列全。
  const txtOf = (pan) =>
    readingsText(interpretPan(pan, { ...depsC, withDisputes: true }, { only: ['classic'] }), pan).join('\n');
  const txtBrief = (pan) => readingsText(interpretPan(pan, depsC, { only: ['classic'] }), pan).join('\n');

  const tJian = txtOf(panJian);
  check(tJian.includes('〔交叉校验〕'), '★文本侧：crosschecked 卦有〔交叉校验〕标记（原为无任何标记）');
  check(!tJian.includes('〔未校对〕'), '文本侧：crosschecked 卦不得标〔未校对〕');

  const tTun = txtOf(panTun);
  check(tTun.includes('〔未校对〕'), '文本侧：none 卦标〔未校对〕');
  check(tTun.includes('异文留档'), '★文本侧：disputed 异文留档可见（原完全不显示）');
  check(tTun.includes('异议源'), '文本侧：异文留档注明异议源');
  check(/异文留档｜本卦 屯 初九：A=/.test(tTun), '文本侧：异文留档含各源写法（A=…）');
  check(!txtOf(panJian).includes('异文留档'), '文本侧（展开档）：无分歧卦不出现异文留档段');
  // ★ v8 新口径：默认档不展开异文，只给一行条数注（既不淹没答案，也保留可复核线索）
  const tTunBrief = txtBrief(panTun);
  // ★注意：默认档的那行提示文案本身就含「异文留档」四字（是在指引去哪看），
  //   所以不能查关键词，要查**展开后的行首标记** `异文留档｜`。
  check(!tTunBrief.includes('异文留档｜'), '★默认档：不展开异文留档条目（v8 简档口径）');
  check(/本卦有 \d+ 条多源异文/.test(tTunBrief), '★默认档：给出一行「有 N 条多源异文」提示（保留可复核线索）');

  // ---- v5.2：来源图例（契约 §1.1「sources：来源登记（可追溯）」）----
  // 背景：UI 与文本都显示「A=… ／ B=… ／ C=…」，但从未透出 sources ⇒ 用户不知道字母指哪本书，
  //   留档的"可复核"目的落空（要复核第一步就是知道 A 是哪本）。数据一直在 deps.proofread.sources，只是没透出。
  check(Array.isArray(rTun.sources) && rTun.sources.length === 5, 'classicReading：透出 sources 登记（5 源）');
  check(
    rTun.sources.every((x) => x && x.id && x.kind),
    'classicReading：sources 每项含 id/kind（可用于图例）'
  );
  check(
    rTun.sources.find((x) => x.id === 'D').kind.includes('武英殿'),
    'sources：D 标明为武英殿刊本（最强源，需可识别）'
  );
  check(classicReading(panTun, classic, null).sources.length === 0, 'classicReading：proofread 缺 → sources 为空数组不崩');

  // 图例只列"本条实际用到"的源（不刷噪音）：屯 用 A/B/C/E，未用 D
  check(tTun.includes('来源图例'), '★文本侧：异文留档带来源图例');
  check(/来源图例：.*A=项目现行本/.test(tTun), '文本侧：图例含 A=项目现行本');
  check(tTun.includes('E=5000言'), '文本侧：图例含实际用到的 E');
  check(!/来源图例：[^\n]*D=武英殿/.test(tTun), '★文本侧：图例不含未用到的源 D（只列实际用到的）');

  // checked 态：文本侧应无标记（三态完整）
  const prChecked = { ...proofreadEmpty, checked: [53], crosschecked: [] };
  const resC = interpretPan(panJian, { classic, proofread: prChecked }, { only: ['classic'] });
  // ★注意：全局提示条文案本身含「〔交叉校验〕」四字（属说明文字），故只对「经文｜」行断言，
  //   否则会误判 —— 这正是「断言要盯住被锁的语义，别被无关文本误伤」。
  const tChecked = readingsText(resC, panJian).join('\n');
  const checkedLines = tChecked.split('\n').filter((l) => l.startsWith('经文｜'));
  check(
    checkedLines.length > 0 && checkedLines.every((l) => !l.includes('〔交叉校验〕') && !l.includes('〔未校对〕')),
    '★文本侧：checked 卦的经文行无任何校对标记（三态完整）'
  );
}

console.log(`经文读取测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('CLASSIC TESTS PASSED');
