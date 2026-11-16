// 呈现层原语（阶段三 P2：中性模块，无 DOM / 无 node 依赖）
// 把“卦象→显示文本”知识（八卦自然象、卦名全称、爻画字符、爻题序列）从 web/js/render.js 中提出，
// 供 DOM 渲染 / 纯文本（textPan）/ CLI / 未来前端共用 —— 不再存在“第三份爻画知识”。
// 纯函数：只做查表与字符串，不碰 DOM、不修改盘。
import { titleOfYao } from './lookup.js';

// 八卦 ↔ 自然象（显示用：兑→泽 等）
export const NATURE = { 乾: '天', 兑: '泽', 离: '火', 震: '雷', 巽: '风', 坎: '水', 艮: '山', 坤: '地' };

// 卦名全称：{上}{下}{名}；纯卦为 “X为Y”（如 乾为天）
export function fullName(hexa) {
  if (!hexa) return '—';
  if (hexa.upper === hexa.lower) return `${hexa.name}为${NATURE[hexa.upper]}`;
  return `${NATURE[hexa.upper]}${NATURE[hexa.lower]}${hexa.name}`;
}

// 爻画字符：阳爻 ━━━ / 阴爻 ━ ━
export function lineChar(v) {
  return v === 1 ? '━━━' : '━ ━';
}

// 爻题文本序列（自下而上，与 lines 同序）：下标 i → 初/二/…/上 + 九/六
export function titlesOf(lines) {
  return lines.map((v, i) => titleOfYao(i, v));
}

export default { NATURE, fullName, lineChar, titlesOf };
