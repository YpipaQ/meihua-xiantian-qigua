// 详解（参考汇编）reader —— 消费 data/interpret/（schema v3-split-1，由 tools/split-interpret.mjs 从
// data/interpret 由已归档的原始语料拆分而来）：把「本卦/动爻/之卦」的经文、象辞、白话、名家详解、哲学含义、卦象关联
// 一次性结构化输出（分层折叠由 UI 负责）。
// 只“读盘 + 读参考库”，不改盘、不碰 cast：
//   deps.interp = { [order]: <data/interpret/NN-卦名.json 的整份内容> }
// 动爻取位铁律：一律经 pan-view#movingPositions 取动爻位，再以 yaos[].pos 对齐语料
//   （★ 不再用 wei 字符串匹配——那正是 D1–D3 三处语料缺陷导致静默丢文的根因）。
// 铜钱链（kind:'coin'）：照常装配（复用现有 reader，不另写一套）。
// 纯函数，无 DOM / 无 node 依赖。
import { movingPositions } from './pan-view.js';

// 来源提示（契约 §4 固定文案，勿改）
export const XIANGJIE_NOTE = '参考汇编（通行本系，来源不明），未经逐条核对通行本；AI 补写段已标注。';

// voices：字符串一律包成 {text}（契约 §2）；对象（傅佩荣/传统解卦/变卦/邵雍…）原样保留
function voicesOf(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v == null) continue;
    out[k] = typeof v === 'string' ? { text: v } : v;
  }
  return out;
}

// 该层「哲学含义」段是否来自 AI 补写（沿用原语料 meta.aiFilled：卦辞层键为 `卦辞:哲学含义`，动爻层为 `爻题:哲学含义`）
function isAiFilled(entry, yao) {
  const list = entry && entry.meta && Array.isArray(entry.meta.aiFilled) ? entry.meta.aiFilled : [];
  return list.includes(yao ? `${yao.wei}:哲学含义` : '卦辞:哲学含义');
}

// Block（字段冻结见契约 §4）：scope=ben|dong|zhi；yao 有值时出动爻层（含 wei）；relations 仅 ben 有
// 容错（契约 §5.1）：缺陷卦（D3/D4）的污染字段被移入 alt、正式字段置 null ⇒ plain 可能为 null，
// voices 可能缺键。这里按「缺即 null/空对象」如实透出，不编造内容；消费端按字段有无决定是否展示。
function blockOf(entry, scope, yao) {
  if (!entry) return null;
  const src = yao || entry.gua || {};
  const block = { scope, order: entry.order, name: entry.name };
  if (yao) block.wei = yao.wei;
  block.classic = src.classic || null;
  block.alt = src.alt || null;
  block.xiang = src.xiang || '';
  block.plain = src.plain || null;
  block.voices = voicesOf(src.voices);
  if (scope === 'ben') block.relations = entry.relations || null;
  block.aiFill = isAiFilled(entry, yao);
  return block;
}

// 主入口：pan（先天盘/铜钱盘）+ interpMap → { note, ben, dong[], zhi } | null
// interpMap 缺 / 该卦无条目 ⇒ null（注册表自动跳过，与 baihua 同）
export function xiangjieReading(pan, interpMap) {
  if (!pan || !pan.benGua || !interpMap) return null;
  const benEntry = interpMap[pan.benGua.order];
  if (!benEntry) return null;
  const out = { note: XIANGJIE_NOTE, ben: blockOf(benEntry, 'ben', null), dong: [], zhi: null };
  // 动爻：统一经 pan-view 取位（升序，1..6），再按 pos 对齐语料 yaos（不用 wei 匹配）
  const yaos = Array.isArray(benEntry.yaos) ? benEntry.yaos : [];
  for (const p of movingPositions(pan)) {
    const y = yaos.find((x) => x && x.pos === p) || null;
    if (!y) continue;
    const b = blockOf(benEntry, 'dong', y);
    if (b) out.dong.push(b);
  }
  // 之卦只给卦辞层（口径同 classic：不给之卦爻辞/互卦）
  if (pan.zhiGua && interpMap[pan.zhiGua.order]) {
    out.zhi = blockOf(interpMap[pan.zhiGua.order], 'zhi', null);
  }
  return out;
}

// 单条 voices → 文本行：{text,grade} 一行；多子键对象（傅佩荣/传统解卦）逐子键一行；
// 元数据键（order/name/engine/fromPos/grade）不单独出行
const VOICE_META_KEYS = new Set(['order', 'name', 'engine', 'fromPos', 'grade']);

function pushVoices(L, prefix, voices, aiFill) {
  if (!voices) return;
  for (const k of Object.keys(voices)) {
    const v = voices[k];
    if (!v) continue;
    const tag = k === '哲学含义' && aiFill ? '〔AI补〕' : '';
    if (typeof v.text === 'string') {
      // 变卦等条目自带卦名/卦序（契约 §2：{fromPos, order, name, text, engine}）→ 文本里带上，便于对照
      const gua = v.name ? `（${v.name}${v.order ? ` 第${v.order}卦` : ''}）` : '';
      L.push(`详解｜${prefix} · ${k}${gua}${v.grade ? `(${v.grade})` : ''}：${v.text}${tag}`);
      continue;
    }
    for (const sk of Object.keys(v)) {
      if (VOICE_META_KEYS.has(sk) || typeof v[sk] !== 'string') continue;
      L.push(`详解｜${prefix} · ${k}·${sk}：${v[sk]}${tag}`);
    }
  }
}

function pushAlt(L, prefix, alt) {
  if (!alt || !alt.text) return;
  L.push(`详解｜校对参考 · ${prefix} 语料异文：${alt.text}${alt.note ? `（${alt.note}）` : ''}`);
}

function pushRelations(L, name, rel) {
  if (!rel) return;
  const one = (k, label) => (rel[k] && rel[k].name ? `${label} ${rel[k].name}${rel[k].order ? `(第${rel[k].order}卦)` : ''}` : null);
  const parts = [one('mutual', '互'), one('opposite', '错'), one('comprehensive', '综')].filter(Boolean);
  if (parts.length) L.push(`详解｜本卦 ${name} · 卦象关联：${parts.join('／')}`);
}

// 纯文本（textPan / CLI 用）
export function xiangjieText(data) {
  if (!data) return [];
  const L = [];
  const b = data.ben;
  if (b) {
    const g = b.classic && b.classic.text ? b.classic.text : '（缺）';
    L.push(`详解｜本卦 ${b.name}（第${b.order}卦）· 卦辞：${g}`);
    pushAlt(L, `本卦 ${b.name}`, b.alt);
    if (b.xiang) L.push(`详解｜本卦 ${b.name} · 象曰：${b.xiang}`);
    if (b.plain && b.plain.译文) L.push(`详解｜本卦 ${b.name} · 白话：${b.plain.译文}`);
    if (b.plain && b.plain.象辞白话) L.push(`详解｜本卦 ${b.name} · 象辞白话：${b.plain.象辞白话}`);
    pushVoices(L, `本卦 ${b.name}`, b.voices, b.aiFill);
    pushRelations(L, b.name, b.relations);
  }
  for (const d of data.dong) {
    L.push(`详解｜动爻 ${d.wei} · 爻辞：${d.classic && d.classic.text ? d.classic.text : '（缺）'}`);
    pushAlt(L, `动爻 ${d.wei}`, d.alt);
    if (d.xiang) L.push(`详解｜动爻 ${d.wei} · 象曰：${d.xiang}`);
    if (d.plain && d.plain.译文) L.push(`详解｜动爻 ${d.wei} · 白话：${d.plain.译文}`);
    if (d.plain && d.plain.象辞白话) L.push(`详解｜动爻 ${d.wei} · 象辞白话：${d.plain.象辞白话}`);
    pushVoices(L, `动爻 ${d.wei}`, d.voices, d.aiFill);
  }
  if (data.zhi) {
    const g = data.zhi.classic && data.zhi.classic.text ? data.zhi.classic.text : '（缺）';
    L.push(`详解｜之卦 ${data.zhi.name}（第${data.zhi.order}卦）· 卦辞：${g}`);
    pushAlt(L, `之卦 ${data.zhi.name}`, data.zhi.alt);
    if (data.zhi.xiang) L.push(`详解｜之卦 ${data.zhi.name} · 象曰：${data.zhi.xiang}`);
    if (data.zhi.plain && data.zhi.plain.译文) L.push(`详解｜之卦 ${data.zhi.name} · 白话：${data.zhi.plain.译文}`);
    pushVoices(L, `之卦 ${data.zhi.name}`, data.zhi.voices, data.zhi.aiFill);
  }
  L.push(`详解｜提示：${data.note}`);
  return L;
}

export default { xiangjieReading, xiangjieText, XIANGJIE_NOTE };
