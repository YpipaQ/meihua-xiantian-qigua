// 白话导读（参考汇编）reader —— 消费参考语料库（网络汇编、未逐条核对通行本）
// 只“读盘 + 读参考库”，不改盘、不碰 cast：
//   deps.ref = { [order]: <参考语料库/NN-卦名.json 的整份内容> }
//   输出：本卦/动爻/之卦 的白话（译文/象辞白话）＋该块可引用“名家”键清单（plain/voices 见语料 README）
// 口径：普通解释（白话）默认呈现；名家（邵雍/傅佩荣/传统解卦/哲学含义…）只列键供精确引用，不整段铺陈；
//       提示行注明“网络汇编、未逐条核对通行本；AI 补写段已标注”（meta.aiFilled）。
// 铜钱链（kind:'coin'）解卦空置口径：一律不产出（与 verdict/classic/najia 一致）。
// 纯函数，无 DOM / 无 node 依赖。
import { movingPositions } from './pan-view.js';

// 去白话句首“卦名卦：”前缀（如 “泰卦：小的去…” → “小的去…”），保持引用干净
function stripGuaPrefix(name, s) {
  if (!s) return s || '';
  const p = `${name}卦：`;
  return s.startsWith(p) ? s.slice(p.length) : s;
}

function blockOf(entry) {
  if (!entry || !entry.hexagram) return null;
  const h = entry.hexagram;
  const plain = (h.plain || {});
  return {
    order: entry.order,
    name: entry.name,
    译文: stripGuaPrefix(entry.name, plain.译文 || h.baihua || ''),
    象辞白话: stripGuaPrefix(entry.name, plain.象辞白话 || ''),
    voices: h.voices ? Object.keys(h.voices) : [],
    aiFill: ((entry.meta || {}).aiFilled || []).some((x) => String(x).includes('卦辞')),
  };
}

// 由卦条目与爻题（初九…上六）取某爻的白话块
function yaoBlockOf(entry, title) {
  if (!entry) return null;
  const y = (entry.yaos || []).find((x) => x && x.wei === title);
  if (!y) return null;
  const plain = (y.plain || {});
  return {
    title: y.wei,
    译文: stripGuaPrefix(entry.name, plain.译文 || y.baihua || ''),
    象辞白话: stripGuaPrefix(entry.name, plain.象辞白话 || ''),
    voices: y.voices ? Object.keys(y.voices) : [],
    aiFill: ((entry.meta || {}).aiFilled || []).includes(`${y.wei}:哲学含义`),
  };
}

// 主入口：pan（先天链）+ refMap → { ben, dong[], zhi } | null（无参考数据返回 null，注册表跳过）
export function refGuideReading(pan, refMap) {
  if (!pan || !pan.benGua || !refMap) return null;
  const benOrder = pan.benGua.order;
  const benEntry = refMap[benOrder];
  if (!benEntry) return null;
  const out = {
    refNote: '参考汇编（通行本系，来源不明），未经逐条核对通行本；AI 补写段已标注。',
    ben: blockOf(benEntry),
    dong: [],
    zhi: null,
  };
  // 动爻：统一经 pan-view 取动爻位，再以爻题（初九…）匹配语料 yaos[].wei
  const titlesByPos = (pan.yao || []).reduce((m, y) => { m[y.position] = y.title; return m; }, {});
  for (const p of movingPositions(pan)) {
    const title = titlesByPos[p];
    const yb = title ? yaoBlockOf(benEntry, title) : null;
    if (yb) out.dong.push(yb);
  }
  // 之卦卦辞白话（口径同 classic：给之卦卦辞，不给之卦爻辞/互卦）
  if (pan.zhiGua && refMap[pan.zhiGua.order]) {
    out.zhi = blockOf(refMap[pan.zhiGua.order]);
  }
  return out;
}

// 纯文本（textPan / CLI 用）
export function refGuideText(data) {
  if (!data) return [];
  const L = [];
  if (data.ben) {
    L.push(`白话导读｜本卦 ${data.ben.name} 卦辞白话：${data.ben.译文}${data.ben.aiFill ? '〔AI补〕' : ''}`);
    if (data.ben.象辞白话) L.push(`白话导读｜${data.ben.name}·象辞白话：${data.ben.象辞白话}`);
  }
  for (const d of data.dong) {
    L.push(`白话导读｜动爻 ${d.title}：${d.译文}${d.aiFill ? '〔AI补〕' : ''}`);
  }
  if (data.zhi) {
    L.push(`白话导读｜之卦 ${data.zhi.name} 卦辞白话：${data.zhi.译文}${data.zhi.aiFill ? '〔AI补〕' : ''}`);
  }
  L.push(`白话导读｜提示：${data.refNote}`);
  return L;
}

export default { refGuideReading, refGuideText };
