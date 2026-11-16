// 只读读盘视图（阶段三 P5）：把“先天盘（时间/数字 cast）与铜钱盘（castCoinLines）”的读取差异
// 收敛成统一字段，供解读/渲染消费——不修改盘、不抹平两线语义（先天=单动+steps；铜钱=0..6动+records）。
// 主用方：verdict/classic/najia 与未来前端，取代各处重复的 “有 movingYao 用之、否则看 dongYao” 分支。
// 纯函数，无 DOM / 无 node 依赖。

// 动爻位集合（1..6，自下而上升序）：铜钱盘用 movingYao（0..6 皆可）；其余盘用 dongYao（恰一或空）
export function movingPositions(pan) {
  if (pan && Array.isArray(pan.movingYao) && pan.movingYao.length) {
    return pan.movingYao.slice().sort((a, b) => a - b);
  }
  if (pan && pan.dongYao != null) return [pan.dongYao];
  return [];
}

// 铜钱（六爻摇卦）盘判定：kind === 'coin'
export function isCoinPan(pan) {
  return Boolean(pan && pan.kind === 'coin');
}

// 单一动爻位（恰一才有值），否则 null（与盘上 dongYao 字段一致的读法）
export function dongYaoOf(pan) {
  const m = movingPositions(pan);
  return m.length === 1 ? m[0] : null;
}

// 规整读盘视图（纯数据；缺字段给 null/[]，不抛错）
export function panView(pan) {
  if (!pan) return null;
  return {
    kind: pan.kind || 'number', // 先天(时间/数字)盘无 kind → 归一为 'number'
    method: pan.method || pan.ruleId || null,
    benGua: pan.benGua || null,
    zhiGua: pan.zhiGua || null,
    huGua: pan.huGua || null,
    tiYong: pan.tiYong || null,
    lines: Array.isArray(pan.lines) ? pan.lines : [],
    moving: movingPositions(pan), // 恒为数组：[] 静 / [p] 单动 / [p1,p2,…] 多动
    dongYao: dongYaoOf(pan),
    yao: Array.isArray(pan.yao) ? pan.yao : [],
    steps: pan.steps || null,
    records: Array.isArray(pan.records) ? pan.records : null,
    warnings: Array.isArray(pan.warnings) ? pan.warnings : [],
  };
}

export default { movingPositions, isCoinPan, dongYaoOf, panView };
