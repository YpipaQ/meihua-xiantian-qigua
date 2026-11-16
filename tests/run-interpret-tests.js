// 解卦拆分库测试：node tests/run-interpret-tests.js
// 覆盖（契约 §2/§3/§5/§5.1/§5.2）：
//   schema 完整性、64 卦零缺、fields 契约、五类缺陷 repairs 回归、alt 判定（卦辞 2 / 爻 21）、
//   污染位正式字段已清空、幂等与语料只读（由 index.meta 声明值锁定）
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../src/platform.mjs';

// ★ 跨平台：不用 .pathname（Windows 下得到 /C:/... 会解析错）
const ROOT = projectRoot(import.meta.url, 2); // up=2：从 tools/ 或 tests/ 上溯到项目根
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const index = readJson('data/interpret/index.json');
const classic = readJson('data/zhouyi-classic.json');
const hexagrams = readJson('data/hexagrams.json').hexagrams;

let pass = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else failures.push(msg);
}

const entries = index.entries;
const byOrder = (o) => readJson(`data/interpret/${entries.find((e) => e.order === o).file}`);

// ---- 1) 索引元信息 ----
// v6：schema 升 v3-split-2（新增 xiangRepairs：象曰去污染记录）
check(index.meta.schema === 'v3-split-2', 'index.meta.schema 为 v3-split-2（v6 起）');
check(index.meta.count === 64, `index.meta.count=64（实际 ${index.meta.count}）`);
check(entries.length === 64, `entries 长度 64（实际 ${entries.length}）`);
check(index.meta.generator === 'tools/split-interpret.mjs', 'index.meta.generator 正确');
check(typeof index.meta.repairDetailCount === 'number', 'index.meta.repairDetailCount 存在');
check(index.meta.repairs === 5, 'index.meta.repairs=5（五类缺陷语义，契约 §5.1 冻结值）');
check(/5 类缺陷/.test(index.meta.repairNote || ''), 'repairNote 说明「5 类缺陷」');

// order 1..64 齐全且唯一
const orders = entries.map((e) => e.order).sort((a, b) => a - b);
check(orders.length === 64 && orders[0] === 1 && orders[63] === 64, 'order 覆盖 1..64');
check(new Set(orders).size === 64, 'order 无重复');

// 每个 file 真实存在
check(entries.every((e) => fs.existsSync(path.join(ROOT, 'data/interpret', e.file))), '所有条目 file 均存在');

// ---- 2) 单卦 schema 完整性 ----
let allYaoLayers = true;
let allFieldsOk = true;
for (const e of entries) {
  const r = byOrder(e.order);
  if (r.schema !== 'v3-split-2') allFieldsOk = false;
  if (r.order !== e.order || r.name !== e.name) allFieldsOk = false;
  if (!r.gua || !r.gua.classic || typeof r.gua.classic.text !== 'string') allFieldsOk = false;
  if (!r.gua.plain || typeof r.gua.plain['译文'] !== 'string') allFieldsOk = false;
  if (!r.relations || !('mutual' in r.relations)) allFieldsOk = false;
  if (!Array.isArray(r.yaos)) allFieldsOk = false;
  if (!r.meta || !Array.isArray(r.meta.repairs)) allFieldsOk = false;
  // 爻数：6 或（乾）7
  const n = r.yaos.length;
  if (n !== 6 && !(e.order === 1 && n === 7)) allYaoLayers = false;
  // 每爻 pos 递增、wei 非空、classic.text 为字符串
  r.yaos.forEach((y, i) => {
    if (y.pos !== i + 1) allFieldsOk = false;
    if (!y.wei) allFieldsOk = false;
    if (!y.classic || typeof y.classic.text !== 'string') allFieldsOk = false;
    if (typeof y.yin !== 'boolean' && y.yin !== null) allFieldsOk = false;
  });
}
check(allFieldsOk, '64 卦 schema 字段完整（gua/relations/yaos/meta）');
check(allYaoLayers, '爻层：6 条（乾 7 条含用九）');

// ---- 3) 爻题与卦画一致（D1/D2/D3 的 wei 修复回归）----
// 爻题形如 初九/九二/…/上九：位1 以「初」起，位6 以「上」起，位2–5 以「九」或「六」起；阴阳与卦画一致
let weiOk = true;
for (const e of entries) {
  const r = byOrder(e.order);
  r.yaos.slice(0, 6).forEach((y, i) => {
    const pos = i + 1;
    const lead = y.wei[0];
    const leadOk = pos === 1 ? lead === '初' : pos === 6 ? lead === '上' : lead === '九' || lead === '六';
    const yinOk = y.wei.includes('九') ? y.yin === false : y.wei.includes('六') ? y.yin === true : false;
    if (!leadOk || !yinOk) weiOk = false;
  });
}
check(weiOk, '爻题与卦画一致（位序 + 阴阳）');

// ---- 4) 五类缺陷 repairs 回归（D1–D5）----
const rep = (o) => byOrder(o).meta.repairs;
const kinds = (o) => rep(o).map((x) => `${x.pos}${x.kind}`);

check(rep(19).some((x) => x.pos === 3 && x.kind === 'wei' && x.to === '六三'), 'D1 临位3 wei→六三');
check(rep(27).some((x) => x.pos === 2 && x.kind === 'wei' && x.to === '六二'), 'D2 颐位2 wei→六二');
check(rep(36).some((x) => x.pos === 6 && x.kind === 'wei' && x.to === '上六'), 'D3 明夷位6 wei→上六');
check(rep(36).some((x) => x.pos === 6 && x.kind === 'text'), 'D3 明夷位6 有 text 类修复（污染字段处置）');
check(rep(36).some((x) => x.pos === 6 && x.kind === 'biangua'), 'D3 明夷位6 变卦指向已修');
check(rep(55).some((x) => x.pos === 1 && x.kind === 'text'), 'D4 丰位1 有 text 类修复');
check(rep(55).some((x) => x.pos === 1 && x.kind === 'biangua'), 'D4 丰位1 变卦指向已修');
check(rep(58).some((x) => x.pos === 4 && x.kind === 'text'), 'D5/R3 兑位4 跨位串条已处置');
check(kinds(19).includes('3wei') && kinds(27).includes('2wei'), 'D1/D2 修复记录存在');
// 缺陷只应出现在这 5 卦
const withRep = entries.filter((e) => e.repairs > 0).map((e) => e.order).sort((a, b) => a - b);
check(JSON.stringify(withRep) === JSON.stringify([19, 27, 36, 55, 58]), `仅有 19/27/36/55/58 存在修复（实际 ${withRep.join(',')}）`);
// repairDetailCount 与逐卦明细一致
const total = entries.reduce((a, e) => a + e.repairs, 0);
check(index.meta.repairDetailCount === total, `repairDetailCount 与逐卦明细一致（${index.meta.repairDetailCount} vs ${total}）`);

// ---- 5) 污染位：正式字段已清空、内容进 alt（§5.1）----
const ming = byOrder(36).yaos[5];
const feng = byOrder(55).yaos[0];
check(ming.plain === null, 'D3 明夷位6 plain 已置 null（错肉不留）');
check(!('邵雍' in ming.voices) && !('傅佩荣' in ming.voices) && !('变卦' in ming.voices), 'D3 明夷位6 污染 voices 已移出');
check(!!ming.voices['哲学含义'], 'D3 明夷位6 保留本位正确的哲学含义');
check(ming.alt && /错植|重复/.test(ming.alt.note || ''), 'D3 明夷位6 alt 留有污染说明');
check(ming.classic.text === classic.hexagrams.find((h) => h.order === 36).yaoCi[5].text, 'D3 classic 取本位经文');
check(!/箕子/.test(ming.xiang), 'D3 象曰已剔除串入的六五象辞');
check(/初登于天/.test(ming.xiang), 'D3 象曰保留本位（上六）余部');

check(feng.plain === null, 'D4 丰位1 plain 已置 null');
check(!('邵雍' in feng.voices) && !('变卦' in feng.voices), 'D4 丰位1 污染 voices 已移出');
check(feng.classic.text === classic.hexagrams.find((h) => h.order === 55).yaoCi[0].text, 'D4 classic 取丰初九经文');
check(feng.xiang === '虽旬无咎，过旬灾也。', 'D4 象曰已剥掉归妹初九前缀，保留本位');
check(feng.alt && /错植|重复/.test(feng.alt.note || ''), 'D4 alt 留档错植原文');

const dui = byOrder(58).yaos[3];
check(dui.voices['邵雍'] && !/凶[：:]/.test(dui.voices['邵雍'].text), 'R3 兑位4 邵雍仅剩本位（无串入的凶）');
check(dui.voices['变卦'] && dui.voices['变卦'].fromPos === '九四', 'R3 兑位4 变卦取本位块（九四）');
check(dui.voices['变卦'].engine.order === 60, 'R3 兑位4 变卦 engine=节(60)');
check(dui.alt && /跨位串条/.test(dui.alt.note || ''), 'R3 兑位4 alt 记录串条');
check(Array.isArray(dui.alt.voices['变卦']) && dui.alt.voices['变卦'][0].fromPos === '九五', 'R3 串入的九五块移入 alt');

// ---- 6) alt 判定口径（§5.2 R1/R2）----
const guaAlt = entries.filter((e) => byOrder(e.order).gua.alt).map((e) => e.order);
check(JSON.stringify(guaAlt) === JSON.stringify([20, 49]), `卦辞异文仅 20-观 / 49-革（实际 ${guaAlt.join(',')}）`);
const yaoAlt = entries.reduce((a, e) => a + byOrder(e.order).yaos.filter((y) => y.alt && y.pos <= 6).length, 0);
check(yaoAlt === 23, `爻层 alt（pos≤6）共 23 条＝20 异文 + 2 错植 + 1 串条（实际 ${yaoAlt}）`);
const yaoAltAll = entries.reduce((a, e) => a + byOrder(e.order).yaos.filter((y) => y.alt).length, 0);
check(yaoAltAll === 24, `爻层 alt 含乾·用九共 24 条（实际 ${yaoAltAll}）`);
// 假阳性回归：41-损#3、59-涣#1 不应出 alt
check(!byOrder(41).yaos[2].alt, 'R1 回归：41-损#3 不误报 alt');
check(!byOrder(59).yaos[0].alt, 'R1 回归：59-涣#1 不误报 alt');
// 真异文仍在
check(!!byOrder(49).yaos[1].alt, '真异文保留：49-革#2（己/巳）');
check(!!byOrder(20).gua.alt, '真异文保留：20-观 卦辞（顒/颙）');

// ---- 7) relations 裸名（契约 §2 样例）----
let relOk = true;
for (const e of entries) {
  const r = byOrder(e.order);
  for (const k of ['mutual', 'opposite', 'comprehensive']) {
    const x = r.relations[k];
    if (!x || typeof x.order !== 'number') { relOk = false; continue; }
    if (/卦$/.test(x.name || '')) relOk = false; // 不应带尾缀「卦」
    const hit = hexagrams.find((h) => h.order === x.order);
    if (!hit || hit.name !== x.name) relOk = false;
  }
}
check(relOk, 'relations 互/错/综：order 有效、name 为裸卦名且与 hexagrams 一致');
check(byOrder(49).relations.mutual.order === 44 && byOrder(49).relations.mutual.name === '姤', '样例：革的互卦=姤(44)');
check(byOrder(49).relations.opposite.order === 4 && byOrder(49).relations.opposite.name === '蒙', '样例：革的错卦=蒙(4)');
check(byOrder(49).relations.comprehensive.order === 50 && byOrder(49).relations.comprehensive.name === '鼎', '样例：革的综卦=鼎(50)');

// ---- 8) 邵雍 grade 拆分 ----
// 385 条中 D3/D4 两条的邵雍属错植 ⇒ 已移入 alt（契约 §5.1「错的不留」），正式字段为 383 条
let gradeOk = true;
let gradeCount = 0;
for (const e of entries) {
  for (const y of byOrder(e.order).yaos) {
    const sy = y.voices && y.voices['邵雍'];
    if (!sy) continue;
    gradeCount += 1;
    if (!['吉', '凶', '平'].includes(sy.grade)) gradeOk = false;
    if (/^[吉凶平][：:]/.test(sy.text)) gradeOk = false; // 正文不应残留分级头
  }
}
check(gradeOk, '邵雍爻条 grade 已拆出且正文无残留分级头');
check(gradeCount === 383, `邵雍正式字段 383 条＝385−2（D3/D4 污染移出，实际 ${gradeCount}）`);
// 移出的 2 条仍完整留档在 alt
check(byOrder(36).yaos[5].alt.voices['邵雍'] && byOrder(36).yaos[5].alt.voices['邵雍'].text.length > 0, 'D3 邵雍原文留档在 alt');
check(byOrder(55).yaos[0].alt.voices['邵雍'] && byOrder(55).yaos[0].alt.voices['邵雍'].text.length > 0, 'D4 邵雍原文留档在 alt');

// ---- 9) 变卦块 engine 对拍 ----
let bgOk = true;
for (const e of entries) {
  for (const y of byOrder(e.order).yaos) {
    const bg = y.voices && y.voices['变卦'];
    if (!bg || y.pos === 7) continue;
    if (!bg.engine || bg.engine.order !== bg.order) bgOk = false;
  }
}
check(bgOk, '变卦块 order 与 engine 一致（修后）');

// ---- 10) 佛/传子键结构保留 ----
const g49 = byOrder(49);
check(g49.gua.voices['傅佩荣'] && g49.gua.voices['傅佩荣']['时运'], '卦辞层 傅佩荣 子键保留（时运）');
check(g49.gua.voices['传统解卦'] && g49.gua.voices['传统解卦']['大象'], '卦辞层 传统解卦 子键保留（大象）');
check(Object.keys(g49.gua.voices['传统解卦']).length === 8, '传统解卦 8 子键齐全');
check(g49.yaos[0].voices['傅佩荣'] && g49.yaos[0].voices['傅佩荣']['财运'], '爻层 傅佩荣 子键保留');

// ---- 11) 乾·用九特例 ----
const qian = byOrder(1);
check(qian.yaos.length === 7 && qian.yaos[6].wei === '用九' && qian.yaos[6].special === true, '乾含第 7 条「用九」且标 special');
check(qian.yaos[6].voices['邵雍'] && ['吉', '凶', '平'].includes(qian.yaos[6].voices['邵雍'].grade), '用九 邵雍 grade 可拆');

// ---- 12) aiFilled 传递 ----
const aiTotal = entries.reduce((a, e) => a + e.aiFilled.length, 0);
check(aiTotal === 16, `aiFilled 合计 16 条（实际 ${aiTotal}）`);
check(byOrder(57).meta.aiFilled.length === 6, '57-巽 aiFilled 6 条');

// ================= v6 D6：象曰（xiang）去污染 =================
// 背景：详解语料 yaos[].xiang 混入白话释文（实测 385 条中 161 条，最长 529 字），
//   UI「象曰原文」直接展示 ⇒ 正文与译文糊在一起。由源 F（十翼抽出）比对定位后剥离。
{
  const xr = index.meta.xiangRepairs;
  check(!!xr, '★index.meta.xiangRepairs 存在（D6 修复记录）');
  check(xr.yao.stripped === 158, `爻级剥离 158 条（实得 ${xr.yao.stripped}）`);
  check(xr.yao.replaced === 3, `爻级替换 3 条（实得 ${xr.yao.replaced}）`);
  check(xr.yao.variant === 22, `爻级真异文留档 22 条（实得 ${xr.yao.variant}）`);
  check(xr.yao.detailCount === 183, `爻级合计 183（${xr.yao.detailCount}）`);
  check(xr.gua.variant === 7, `卦级大象异文 7 卦（实得 ${xr.gua.variant}）`);
  check(
    JSON.stringify(xr.guaVariantOrders) === JSON.stringify([6, 19, 23, 30, 41, 62, 63]),
    `大象异文卦序 6/19/23/30/41/62/63（契约 §1.4；实得 ${JSON.stringify(xr.guaVariantOrders)}）`
  );

  // ★核心验收：除「真异文留档」外，0 条 xiang 含白话污染
  let longClean = 0;
  let longAlt = 0;
  const noAltLong = [];
  const allJ = [];
  for (const e of entries) {
    const r = byOrder(e.order);
    allJ.push(r);
    for (const y of r.yaos) {
      const isVariant = y.xiangAlt && y.xiangAlt.kind === 'variant';
      if ((y.xiang || '').length > 45) {
        if (isVariant) longAlt += 1;
        else { longClean += 1; noAltLong.push(`${e.order}-${y.wei}`); }
      }
    }
  }
  check(longClean === 0, `★修复后无非留档的长 xiang（超 45 字且未标 variant：${longClean} 条 ${noAltLong.slice(0, 5).join(',')}）`);
  // 真异文多是短句（如「磐桓/盘桓」），只有少数几条本身很长 —— 故不要求 22 条都超 45 字，
  // 只要求「超 45 字的长串里，未标 variant 的为 0」（上一条），这里仅作信息性检查。
  check(longAlt >= 1, `长串真异文已标 variant 留档（实得 ${longAlt} 条）`);

  let altCount = 0;
  for (const r of allJ) for (const y of r.yaos) if (y.xiangAlt) altCount += 1;
  check(altCount === 183, `爻级 xiangAlt 恰 183 条（158+3+22；实得 ${altCount}）`);

  // ★留档不改正文：22 条 variant 的 xiang 必须等于原始语料原值
  {
    let same = 0;
    const bad = [];
    for (const r of allJ) {
      for (const y of r.yaos) {
        if (!y.xiangAlt || y.xiangAlt.kind !== 'variant') continue;
        const raw = JSON.parse(
          fs.readFileSync(path.join(ROOT, `data/ref-corpus/${String(r.order).padStart(2, '0')}-${r.name}卦.json`), 'utf8')
        );
        const rawX = (raw.yaos[y.pos - 1] || {}).xiang || '';
        if (rawX === y.xiang) same += 1;
        else bad.push(`${r.order}-${y.wei}`);
      }
    }
    check(same === 22, `★留档不改正文：22 条 variant 的 xiang 仍等于原始语料（实得 ${same}${bad.length ? '，不符 ' + bad.join(',') : ''}）`);
  }

  // 剥离条目的 removed 尾巴非空（证明真的剥下了东西）
  {
    let empty = 0;
    for (const r of allJ) {
      for (const y of r.yaos) {
        if (y.xiangAlt && y.xiangAlt.kind === 'stripped' && !(y.xiangAlt.removed || '').trim()) empty += 1;
      }
    }
    check(empty === 0, '剥离条目的 removed 均非空（确实剥下了内容）');
  }

  check(byOrder(3).meta.xiangRepairs && byOrder(3).meta.xiangRepairs.yao.variant === 2, '单卦 meta.xiangRepairs：屯 2 条爻级异文');
  check(byOrder(50).meta.xiangRepairs.yao.variant === 0, '单卦 meta.xiangRepairs：鼎 0 条（𫗧/餗 异体已归一，非异文）');
}

console.log(`\n解卦拆分库测试：${pass} 项通过，${failures.length} 项失败`);
if (failures.length) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('INTERPRET TESTS PASSED');
