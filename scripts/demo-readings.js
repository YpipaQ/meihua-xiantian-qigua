// CLI 全链演示：起卦 → 排盘文本（断语/经文/纳甲/白话导读；注册表可插拔）
// 用法：node scripts/demo-readings.js
// 数据装配统一走 src/catalog.js + src/node-data.mjs（与 web loadData 同构，接口只此一处）。
import {
  cast,
  castNumbers,
  castCoinLines,
  listReaders,
  interpretPan,
  registerReader,
  registerTextFormatter,
  movingPositions,
  textPan,
} from '../src/core/index.js';
import { loadNodeData, loadRefForOrders, loadInterpForOrders } from '../src/node-data.mjs';
import { depsFromData } from '../src/catalog.js';

const data = loadNodeData(); // {trigrams,hexagrams,rules,…} 与 web loadData 同构
// 与 web/loadData 同一组 deps + 本次 ctx/ref/interp（deps 收敛见 depsFromData）
const DEMO_ORDERS = [1, 2, 31, 34, 44, 49, 54];
const opts = {
  ...depsFromData(data, { ctx: { dayStem: '甲', dayBranch: '子', monthBranch: '寅' } }), // 演示以“甲子日·寅月”为例（六神/旺衰）
  ref: loadRefForOrders(DEMO_ORDERS), // 白话导读参考（baihua 已 defaultOff，显式 only 时才用）
  interp: loadInterpForOrders(DEMO_ORDERS), // 详解（xiangjie）：拆分库 data/interpret
};

// 可插拔示例：注册一个「简卦摘要」reader → 文本与复制自动带上（无需改 render）
registerReader({
  id: 'digest',
  title: '摘要',
  run: (pan) => {
    if (!pan || !pan.benGua) return null;
    const mv = movingPositions(pan); // 统一经只读读盘视图（不写来源分支）
    return { text: `${pan.benGua.name}卦 · 动${mv.join('、') || '无'} · 之${pan.zhiGua ? pan.zhiGua.name : '—'}` };
  },
});
registerTextFormatter('digest', (d) => [`摘要｜${d.text}`]);

console.log('已注册解读模块：', listReaders().map((r) => r.id).join(', '));
console.log('='.repeat(60));

const pans = [
  ['时间起卦 · 观梅占例', cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } })],
  ['数字起卦 · 二数(12,33)', castNumbers(data, [12, 33])],
  [
    '铜钱摇卦 · 乾六爻全动（之坤 → 用九）',
    castCoinLines(data, Array.from({ length: 6 }, () => ({ value: 1, moving: true, label: '○', mark: '老阳' })), { yangFace: '字' }),
  ],
];

for (const [name, pan] of pans) {
  console.log(`\n【${name}】`);
  console.log('装配结果：', interpretPan(pan, opts).map((r) => `${r.id}(${r.data && r.data.guaBrief ? '导语' : '有'}...)`).join(' | '));
  console.log('-'.repeat(60));
  console.log(textPan(pan, opts));
}
