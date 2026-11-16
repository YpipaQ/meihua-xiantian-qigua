// 十翼（彖传·象传·文言传）reader 测试：node tests/run-shiyi-tests.js
// 覆盖：数据完整性 / 与 data/interpret 一致性 / reader 装配（先天盘+铜钱盘）/ 缺 deps 容错 /
//       动爻按 pos 对齐（构造 wei 与 pos 错位的盘 —— 本项目两次踩过 wei 匹配的坑）/ 文本输出 / 不冒充交叉校验
import fs from 'node:fs';
import { cast, castCoinLines, shiyiEntry, shiyiReading, shiyiText, SHIYI_NOTE, interpretPan, listReaders } from '../src/core/index.js';
import { depsFromOpts, DATA_MANIFEST, assembleData } from '../src/catalog.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const shiyi = readJson('../data/zhouyi-shiyi.json');
const data = {
  trigrams: readJson('../data/trigrams.json').trigrams,
  hexagrams: readJson('../data/hexagrams.json').hexagrams,
  rules: readJson('../data/rules.json').rules,
  coinConfig: readJson('../data/coin-config.json'),
  verdictHex: readJson('../data/interpretations/hexagram-verdicts.json').hexagrams,
  verdictTiYong: readJson('../data/interpretations/tiyong-verdicts.json'),
  classic: readJson('../data/zhouyi-classic.json'),
  proofread: readJson('../data/zhouyi-proofread.json'),
  najia: readJson('../data/najia.json'),
  refIndex: readJson('../data/ref-corpus/index.json'),
  interpIndex: readJson('../data/interpret/index.json').entries,
  shiyi,
};

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// ================= 0) 数据完整性 =================
check(shiyi.meta && shiyi.meta.schema === 'v6-shiyi-1', 'schema = v6-shiyi-1');
check(Array.isArray(shiyi.hexagrams) && shiyi.hexagrams.length === 64, `64 卦（实得 ${shiyi.hexagrams.length}）`);
check(shiyi.hexagrams.filter((h) => h.tuan).length === 64, '彖传 64/64');
check(shiyi.hexagrams.filter((h) => h.daxiang).length === 64, '大象 64/64');
check(shiyi.hexagrams.reduce((a, h) => a + h.xiaoxiang.length, 0) === 386, '小象 386 条（384 爻 + 用九用六）');
check(shiyi.hexagrams.filter((h) => h.wenyan).length === 2, '文言传仅 2 卦（乾坤，符合事实）');
check(shiyi.hexagrams.filter((h) => h.wenyan).map((h) => h.order).join(',') === '1,2', '文言传恰为乾(1)/坤(2)');
check(shiyi.hexagrams[0].xiaoxiang.length === 7 && shiyi.hexagrams[1].xiaoxiang.length === 7, '乾坤小象各 7 条（含用九/用六）');
check(shiyi.hexagrams.slice(2).every((h) => h.xiaoxiang.length === 6), '其余 62 卦小象各 6 条');
check(shiyi.meta.crosschecked === false, '★meta.crosschecked = false（单源，不冒充交叉校验）');
check(typeof shiyi.meta.note === 'string' && shiyi.meta.note.includes('单源'), 'meta.note 明示单源');
check(shiyi.meta.provenance && shiyi.meta.provenance.includes('PROVENANCE'), 'meta.provenance 指向出处文件');

// 卦序/卦名与 hexagrams.json 一致（防错位）
{
  const hx = data.hexagrams;
  let bad = 0;
  for (const h of shiyi.hexagrams) {
    const e = hx.find((x) => x.order === h.order);
    if (!e || e.name !== h.name) bad += 1;
  }
  check(bad === 0, `卦序↔卦名与 hexagrams.json 全一致（不符 ${bad}）`);
}

// 口径说明：比对用**归一后**文本（剥标点），因为两处独立转录的**断句标点**本就可能不同
//   （例：语料「讼。君子以…」vs 十翼「讼；君子以…」—— 52 处属此类，不是异文）。
// 真正要一致的是**字**。另：爻级 22 条 / 卦级 7 条真异文**正文保留原样**（契约 §1.3），
//   这些条目的 xiang 与源 F 天然不等 —— 必须显式豁免，否则等于要求"留档即篡改"。
{
  // 归一必须**与生成器同口径**（繁简/异体 + 标点），否则会把异体字误当异文。
  // 这里只补测试实际用到的几组异体（遯/遁、㧑/撝、餗/𫗧），其余按剥标点处理。
  const VARIANT = { 遯: '遁', 㧑: '撝', 餗: '餗', '𫗧': '餗' };
  const norm = (s) => {
    let out = '';
    for (const ch of String(s || '')) out += VARIANT[ch] || ch; // 按码点迭代
    return out.replace(/[。，、；：！？\s「」『』（）()"“”]/g, '');
  };
  const idx = data.interpIndex;
  const rawIndex = readJson('../data/interpret/index.json');
  const xr = (rawIndex.meta && rawIndex.meta.xiangRepairs) || {};
  const guaVariantOrders = new Set(xr.guaVariantOrders || []);
  let dxSame = 0;
  let dxPunctOnly = 0;
  let dxVariant = 0;
  let dxBad = 0;
  let xxSame = 0;
  let xxVariant = 0;
  let xxBad = 0;
  let xxCompared = 0;
  for (const it of idx) {
    const j = JSON.parse(fs.readFileSync(new URL(`../data/interpret/${it.file}`, import.meta.url), 'utf8'));
    const f = shiyi.hexagrams.find((h) => h.order === j.order);
    if (!f) continue;
    // 卦级大象
    if ((j.gua.xiang || '') === (f.daxiang || '')) dxSame += 1;
    else if (norm(j.gua.xiang) === norm(f.daxiang)) dxPunctOnly += 1;
    else if (guaVariantOrders.has(j.order)) dxVariant += 1;
    else dxBad += 1;
    // 爻级小象
    for (let i = 0; i < j.yaos.length; i += 1) {
      xxCompared += 1;
      const ours = j.yaos[i].xiang || '';
      const ref = f.xiaoxiang[i] || '';
      if (ours === ref) xxSame += 1;
      else if (norm(ours) === norm(ref)) xxSame += 1; // 仅标点差异计入一致
      else if (j.yaos[i].xiangAlt && j.yaos[i].xiangAlt.kind === 'variant') xxVariant += 1;
      else xxBad += 1;
    }
  }
  check(dxSame + dxPunctOnly + dxVariant === 64, `大象：一致/仅标点/留档 三者和 = 64（${dxSame}+${dxPunctOnly}+${dxVariant}）`);
  check(dxBad === 0, `大象：无未解释的不符（不符 ${dxBad}）`);
  check(dxVariant === 7, `大象：真异文留档恰 7 卦（契约 §1.4；实得 ${dxVariant}）`);
  check(xxCompared >= 385, `小象比对条数合理（实得 ${xxCompared}）`);
  check(xxBad === 0, `小象：无未解释的不符（不符 ${xxBad}/${xxCompared}）`);
  check(xxVariant === 22, `小象：真异文留档恰 22 条（契约 §1.3；实得 ${xxVariant}）`);
  check(xxSame + xxVariant === xxCompared, `小象：一致 + 留档 = 总条数（${xxSame}+${xxVariant}=${xxCompared}）`);
}

// ================= 2) shiyiEntry =================
check(shiyiEntry(1, shiyi) && shiyiEntry(1, shiyi).name === '乾', 'shiyiEntry(1) → 乾');
check(shiyiEntry(64, shiyi) && shiyiEntry(64, shiyi).name === '未济', 'shiyiEntry(64) → 未济');
check(shiyiEntry(999, shiyi) === null, 'shiyiEntry(未知序) → null');
check(shiyiEntry(null, shiyi) === null, 'shiyiEntry(null) → null');
check(shiyiEntry(1, null) === null, 'shiyiEntry(shiyi 缺) → null');
check(shiyiEntry(1, { hexagrams: null }) === null, 'shiyiEntry(hexagrams 非数组) → null');

// ================= 3) reader：先天盘 =================
const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
const rGm = shiyiReading(guanmei, shiyi);
check(!!rGm, '先天盘（观梅占例）产出非 null');
check(rGm.note === SHIYI_NOTE, 'note 为契约固定文案');
check(rGm.ben.order === guanmei.benGua.order, 'ben.order 与本卦一致');
check(rGm.ben.tuan.length > 0, 'ben.tuan 非空（彖传）');
check(rGm.ben.xiaoxiang.length > 0, 'ben.xiaoxiang 非空');
check(Array.isArray(rGm.dong) && rGm.dong.length === 1, `单动盘 dong 长度 1（实得 ${rGm.dong.length}）`);
check(rGm.dong[0].pos === 1 && rGm.dong[0].xiaoxiang.length > 0, '动爻小象非空且位次正确');

// ================= 4) 静卦 / 多动 =================
{
  // 静卦：直接用最小盘对象（与 run-classic-tests.js 的构造方式一致）
  const staticPan = { benGua: { order: 2, name: '坤' }, movingYao: [], yao: [] };
  const rs = shiyiReading(staticPan, shiyi);
  check(rs.dong.length === 0, '静卦：dong 为空数组');
  check(rs.ben.tuan.length > 0, '静卦：彖传照常给');
}

// ================= 5) ★动爻按 pos 对齐（核心红线） =================
// 构造一个 pan：yao[].title 被人为写错（模拟语料 wei 误标，如 19 临 六三 的 wei 被标成「九三」），
// 但 yao 数组的**位次**是对的。reader 必须按 pos 取 xiaoxiang[?]，绝不能按 wei 去查。
{
  // 用 1 乾（小象 7 条）构造：动第 2 爻，但把 yao[1].title 故意写成「上九」这种错值
  const fakePan = {
    benGua: { order: 1, name: '乾' },
    zhiGua: null,
    dongYao: 2,
    yao: [
      { title: '初九' },
      { title: '上九' }, // ★ 故意错标：真实位次是九二
      { title: '九三' },
      { title: '九四' },
      { title: '九五' },
      { title: '上九' },
    ],
  };
  const r = shiyiReading(fakePan, shiyi);
  const qian = shiyi.hexagrams.find((h) => h.order === 1);
  check(r.dong.length === 1 && r.dong[0].pos === 2, '伪造盘：动爻位次识别为 2');
  check(
    r.dong[0].xiaoxiang === qian.xiaoxiang[1],
    '★红线：动爻小象按 pos 取 xiaoxiang[pos−1]（九二「见龙在田，利见大人」），未受 wei 错标影响'
  );
  check(r.dong[0].wei === '上九', 'wei 仅作展示标签（如实透出盘上的错值，不参与对齐）');
}

// ================= 6) 动爻位次与 pan-view 一致 =================
{
  const coinPan = castCoinLines(data, Array.from({ length: 6 }, (_, i) => ({ value: i % 2 === 0 ? 3 : 2, moving: i === 0 || i === 2 })), { yangFace: '字' });
  const rc = shiyiReading(coinPan, shiyi);
  check(!!rc, '铜钱盘产出非 null');
  check(rc.dong.length === 2 && rc.dong[0].pos < rc.dong[1].pos, '铜钱盘多动：dong 升序且长度 2');
  const q = shiyi.hexagrams.find((h) => h.order === coinPan.benGua.order);
  check(rc.dong.every((x) => x.xiaoxiang === q.xiaoxiang[x.pos - 1]), '铜钱盘：每个动爻小象 = xiaoxiang[pos−1]');
}

// ================= 7) 缺 deps 容错 =================
check(shiyiReading(guanmei, null) === null, '缺 shiyi → null（注册表自动跳过）');
check(shiyiReading(null, shiyi) === null, 'pan 为空 → null');
check(shiyiReading({}, shiyi) === null, 'pan 无 benGua → null');
check(shiyiReading({ benGua: { order: 999 } }, shiyi) === null, '该卦无十翼条目 → null');

// ================= 8) 注册表装配 =================
{
  const ids = listReaders().map((r) => r.id);
  check(ids.includes('shiyi'), 'shiyi 已注册');
  check(ids[ids.length - 2] === 'shiyi', `shiyi 位于 xiangjie 之后、baihua 之前（实得 …${ids.slice(-3).join(',')}）`);
  const deps = depsFromOpts({ ...data });
  check(!!deps.shiyi, 'depsFromOpts：data.shiyi 直通 deps.shiyi');
  // v8：shiyi 退链（defaultOff）—— 简档不含，繁档才有
  const resBrief = interpretPan(guanmei, deps);
  const res = interpretPan(guanmei, deps, { detail: 'full' });
  check(!resBrief.some((r) => r.id === 'shiyi'), '★简档不含 shiyi（v8 退链）');
  check(res.some((r) => r.id === 'shiyi'), '繁档装配含 shiyi');
  const only = interpretPan(guanmei, deps, { only: ['shiyi'] });
  check(only.length === 1 && only[0].id === 'shiyi', 'only:shiyi 可单独装配');
  check(interpretPan(guanmei, {}).every((r) => r.id !== 'shiyi'), '无 deps → 不装配 shiyi');
}

// ================= 9) DATA_MANIFEST =================
{
  const m = DATA_MANIFEST.find((x) => x.key === 'shiyi');
  check(!!m, 'manifest 含 shiyi');
  check(m.path === 'data/zhouyi-shiyi.json', 'shiyi 路径正确');
  check(m.optional === true, 'shiyi 为 optional（缺文件不阻塞起卦）');
  const dOpt = assembleData({
    trigrams: [], hexagrams: [], rules: [], coinConfig: {}, verdictHex: [], verdictTiYong: {}, classic: {},
  });
  check(dOpt.shiyi === null, '可选 shiyi 缺省 → null');
}

// ================= 10) 文本输出 =================
{
  const t = shiyiText(rGm);
  check(Array.isArray(t) && t.length > 0, 'shiyiText 返回非空数组');
  check(t.some((l) => l.startsWith('十翼｜') && l.includes('彖传')), '文本含「十翼｜… 彖传」行');
  check(t.some((l) => l.includes('动爻小象')), '文本含动爻小象行');
  check(t.some((l) => l.includes(SHIYI_NOTE)), '文本末尾含来源提示');
  check(shiyiText(null).length === 0, 'shiyiText(null) → []');
  // 文言传：乾卦才有
  const qianPan = { benGua: { order: 1, name: '乾' }, zhiGua: null, dongYao: null, yao: [] };
  check(shiyiText(shiyiReading(qianPan, shiyi)).some((l) => l.includes('文言传')), '乾卦文本含文言传');
  const tunPan = { benGua: { order: 3, name: '屯' }, zhiGua: null, dongYao: null, yao: [] };
  // ★注意：只查正文行（`十翼｜本卦 … 文言传：`），不查 note 行 —— note 文案本身就含「文言传」三字，会误判
  check(
    !shiyiText(shiyiReading(tunPan, shiyi)).some((l) => l.startsWith('十翼｜') && l.includes('文言传：')),
    '屯卦正文不含文言传（只有乾坤有）'
  );
}

// ================= 11) ★不冒充「交叉校验」/「已校对」 =================
{
  // ★note 里出现「未经第二源交叉校验」是**正确的**（那是在声明"没做过"），
  //   所以断言要盯「正文行不得声称做过交叉校验」，不能一刀切查关键词。
  const bodyLines = shiyiText(rGm).filter((l) => l.startsWith('十翼｜') && !l.includes('提示：'));
  check(!bodyLines.some((l) => l.includes('交叉校验')), '★十翼正文行不含「交叉校验」声称（单源 ≠ 交叉校验）');
  // v7：十翼已由两源交叉校验（F vs G），NOTE 改为陈述该事实；仍须声明「未经人工校对」
  check(SHIYI_NOTE.includes('两源交叉校验'), 'SHIYI_NOTE 声明「两源交叉校验」事实');
  check(SHIYI_NOTE.includes('未经人工校对'), 'SHIYI_NOTE 仍声明「未经人工校对」（不冒充人工）');
  check(SHIYI_NOTE.includes('分歧已留档'), 'SHIYI_NOTE 同时声明分歧已留档（不掩盖）');
  check(!bodyLines.some((l) => l.includes('已校对')), '★十翼正文行不含「已校对」字样');
  check(!bodyLines.some((l) => l.includes('checked')), '★十翼正文行不含 checked 字样');
  check(!SHIYI_NOTE.includes('单源转录，未经'), 'SHIYI_NOTE 不再声称「单源」（v7 已两源交叉校验）');
}

// ================= 12) v7：两源交叉校验 =================
// 十翼由源 F（现行）与源 G（独立转录）比对。一致 ⇒ 可信度提升；分歧 ⇒ **全部留档、不改正文**。
// 本组锁死：统计数字、分歧可查、缺陷卦被识别、不改正文、且不冒充「已校对」。
{
  const pf = readJson('../data/zhouyi-proofread.json');
  const cc = pf.shiyi;
  check(!!cc, '★zhouyi-proofread.json#shiyi 存在（交叉校验结果）');
  check(cc.checker === 'tools/crosscheck-shiyi.mjs', 'checker = tools/crosscheck-shiyi.mjs');
  check(Array.isArray(cc.sources) && cc.sources.length === 2, '登记 2 个源（F/G）');
  check(cc.sources.map((x) => x.id).join(',') === 'F,G', '源 id 为 F,G');
  check(cc.stats && cc.stats.agree > 400, `一致条数 > 400（实得 ${cc.stats && cc.stats.agree}）`);
  check(cc.stats.diff > 0, `分歧条数 > 0（实得 ${cc.stats && cc.stats.diff}）—— 有分歧才是真实校验`);
  check(Array.isArray(cc.disputed) && cc.disputed.length === cc.stats.diff, 'disputed 条数与 stats.diff 一致');
  check(
    cc.disputed.every((x) => x.order && x.field && typeof x.F === 'string' && typeof x.G === 'string'),
    'disputed 每条含 order/field/F/G（可复核）'
  );
  // ★源 G 结构缺陷被识别（33 遁），且该卦被判为「仅单源支撑」
  check(Array.isArray(cc.sourceDefects) && cc.sourceDefects.length === 1, `源 G 结构缺陷 1 处（实得 ${cc.sourceDefects.length}）`);
  check(cc.sourceDefects[0].order === 33, `缺陷卦为 33 遁（实得 ${cc.sourceDefects[0].order}）`);
  check(!cc.disputed.some((x) => x.order === 33), '★缺陷卦不参与比对（不得把 F 的正确内容判成分歧）');

  // reader 读入 crosscheck
  const rCc = shiyiReading(guanmei, shiyi, cc);
  check(!!rCc.crosscheck, 'reader：传入 crosscheck 后有 crosscheck 信息');
  check(rCc.crosscheck.stats.agree === cc.stats.agree, 'reader：stats.agree 透传');
  check(shiyiReading(guanmei, shiyi, null).crosscheck === null, 'reader：crosscheck 缺 ⇒ null（不猜）');

  // 有分歧的卦：分歧清单非空
  const monPan = { benGua: { order: 4, name: '蒙' }, zhiGua: null, dongYao: null, yao: [] };
  const rMon = shiyiReading(monPan, shiyi, cc);
  check(rMon.crosscheck.ben.length > 0, `蒙（有分歧卦）ben 分歧非空（${rMon.crosscheck.ben.length} 条）`);
  check(rMon.crosscheck.ben.every((x) => x.field && x.F !== undefined && x.G !== undefined), '分歧条目含 field/F/G');

  // 无分歧的卦：清单为空（不伪造）
  // 选一个实测确无分歧、且非缺陷的卦（2 坤）——避免把"其实有分歧"的卦当反例
  const wuPan = { benGua: { order: 2, name: '坤' }, zhiGua: null, dongYao: null, yao: [] };
  check(shiyiReading(wuPan, shiyi, cc).crosscheck.ben.length === 0, '坤（该卦无分歧）ben 为空数组');

  // 缺陷卦：sourceDefect 被标出
  const dunPan = { benGua: { order: 33, name: '遁' }, zhiGua: null, dongYao: null, yao: [] };
  const rDun = shiyiReading(dunPan, shiyi, cc);
  check(!!rDun.crosscheck.sourceDefect, '遁：crosscheck.sourceDefect 被标出（仅单源支撑）');
  check(rDun.crosscheck.sourceDefect.why.includes('小象'), '缺陷原因说明含「小象」（可读）');

  // ★不改正文：十翼数据的 tuan 必须仍等于 zhouyi-shiyi.json 原值
  const f4 = shiyi.hexagrams.find((h) => h.order === 4);
  check(rMon.ben.tuan === f4.tuan, '★交叉校验不改正文：tuan 仍等于 zhouyi-shiyi.json');

  // 文本：含交叉校验与分歧留档行
  const tMon = shiyiText(rMon).join('\n');
  check(tMon.includes('交叉校验：两源一致'), '文本含「交叉校验：两源一致」行');
  check(tMon.includes('十翼分歧留档｜'), '文本含「十翼分歧留档」行');
  check(tMon.includes('F=') && tMon.includes('G='), '分歧留档同时给出 F/G 两源写法');
  check(shiyiText(rDun).join('\n').includes('仅单源支撑'), '文本：缺陷卦注明「仅单源支撑」');

  // ---- 只锁不变量，不锁绝对数字（教训：绝对阈值与判据冲突时只能造假） ----
  const st = cc.stats;
  const totalSlots = st.tuan.total + st.daxiang.total + st.xiaoxiang.total;
  check(st.agree + st.diff === totalSlots, `不变量：agree+diff = 字段槽位总数（${st.agree}+${st.diff} vs ${totalSlots}）`);
  check(st.diff === cc.disputed.length, `不变量：stats.diff = disputed.length（${st.diff} vs ${cc.disputed.length}）`);
  const defectOrders = new Set(cc.sourceDefects.map((d) => d.order));
  check(!cc.disputed.some((d) => defectOrders.has(d.order)), '不变量：disputed 不含缺陷卦');
  // 分母 = 64 − 缺陷卦数 / 386 − 缺陷卦的小象条数
  check(st.tuan.total === 64 - cc.sourceDefects.length, `不变量：彖传分母 = 64 − 缺陷卦数（${st.tuan.total}）`);
  check(
    [st.tuan, st.daxiang, st.xiaoxiang].every((x) => x.agree + x.diff === x.total),
    '不变量：每字段 agree+diff=total'
  );

  // ★不冒充「已校对」
  const allShiyi = [SHIYI_NOTE, ...shiyiText(rMon), ...shiyiText(rDun)].join('\n');
  check(!allShiyi.includes('已校对'), '★十翼全文不含「已校对」（那专指人工对照纸质本）');
}

console.log(`十翼 reader 测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('SHIYI TESTS PASSED');
