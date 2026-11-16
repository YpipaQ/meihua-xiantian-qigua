// 查表工具：八卦与六十四卦的查找、爻线换算
// ⚠️ 爻序铁律（勿改）：六爻数组一律自下而上——[0]=初爻(最下)、[5]=上爻(最上)。
//    动爻位 p(1..6) → 下标 = p-1。显示层倒序只发生在渲染，算法一律本序。

export function trigramByName(trigrams, name) {
  return trigrams.find((t) => t.name === name) || null;
}

export function trigramByNumber(trigrams, num) {
  return trigrams.find((t) => t.id === num) || null;
}

export function trigramByLines(trigrams, lines) {
  if (!Array.isArray(lines) || lines.length !== 3) return null;
  const key = lines.join('');
  return trigrams.find((t) => t.lines.join('') === key) || null;
}

export function hexagramByPair(hexagrams, upperName, lowerName) {
  return hexagrams.find((h) => h.upper === upperName && h.lower === lowerName) || null;
}

// 由上下卦名拼出全卦六爻数组（自下而上：[0]=下卦初爻 … [5]=上卦上爻）
export function hexLinesByPair(trigrams, upperName, lowerName) {
  const up = trigramByName(trigrams, upperName);
  const lo = trigramByName(trigrams, lowerName);
  if (!up || !lo) throw new Error(`hexLinesByPair: 卦名不存在 upper=${upperName} lower=${lowerName}`);
  return [...lo.lines, ...up.lines];
}

// 由全卦六爻数组（自下而上）反解上下卦名
export function pairFromHexLines(trigrams, lines) {
  if (!Array.isArray(lines) || lines.length !== 6) throw new Error('pairFromHexLines: 需要 6 爻数组（自下而上）');
  const lower = trigramByLines(trigrams, lines.slice(0, 3));
  const upper = trigramByLines(trigrams, lines.slice(3, 6));
  if (!lower || !upper) throw new Error('pairFromHexLines: 爻线无法对应八卦');
  return { upper, lower };
}

// 爻位 p（1..6，自下而上）→ 数组下标（铁律映射）
export function dongYaoToIndex(p) {
  if (!Number.isInteger(p) || p < 1 || p > 6) throw new Error(`dongYaoToIndex: 爻位越界 p=${p}`);
  return p - 1;
}

const MID_LABEL = ['二', '三', '四', '五'];

// 由爻序下标与阴阳值生成爻题（初九/六二…上六），自下而上约定
export function titleOfYao(index, value) {
  const num = value === 1 ? '九' : '六';
  if (index === 0) return `初${num}`;
  if (index === 5) return `上${num}`;
  return `${num}${MID_LABEL[index - 1]}`;
}

export function flipAt(lines, index) {
  return lines.map((v, i) => (i === index ? (v === 1 ? 0 : 1) : v));
}

// 派生原子（无"单/多动"语义，先天链与铜钱链共用）：
// 按动爻【位】(1..6，自下而上)集合整体翻转（铁律：位 p → 下标 p-1）
export function flipManyAt(lines, positions) {
  const pos = new Set((Array.isArray(positions) ? positions : []).filter((p) => p >= 1 && p <= 6));
  return lines.map((v, i) => (pos.has(i + 1) ? (v === 1 ? 0 : 1) : v));
}

// 互卦取爻：本卦（自下而上 [0]=初爻）第 2/3/4 爻为内互(下)、第 3/4/5 爻为外互(上)
export function huLinesOf(lines6) {
  return { lower: lines6.slice(1, 4), upper: lines6.slice(2, 5) };
}

export default {
  trigramByName,
  trigramByNumber,
  trigramByLines,
  hexagramByPair,
  hexLinesByPair,
  pairFromHexLines,
  dongYaoToIndex,
  titleOfYao,
  flipAt,
  flipManyAt,
  huLinesOf,
};
