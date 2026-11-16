// 整盘纯文本序列化（阶段三 P2：从中性模块产出，Node/浏览器/CLI 共用）
// 自 web/js/render.js 迁出（消 B2/B3：web 不再被 CLI 反向 import；DOM 渲染不掺文本拼接）。
// 文本分层（L6 blocks 输出块模型）已随 P6 取消（2026-09-08）：本模块保持“整行文本形态”为最终形态；
// 若日后需要按层输出，请在 web/文本修改需求中另行设计（需另行设计）。
// 纯函数：读盘 + 装配解读结果 → 文本行数组；不碰 DOM、不修改盘。
import { fullName, lineChar } from './present.js';
import { isCoinPan, movingPositions } from './pan-view.js';
import { interpretPan, readingsText } from './readings.js';
import { depsFromOpts } from '../catalog.js';

// opts = 渲染层 opts（含 data 与可选 ctx/ref；deps 收敛在 src/catalog.js#depsFromData）
export function textPan(pan, opts = {}) {
  const L = [];
  // 标题按盘口径：铜钱（六爻摇卦）不再冠“梅花易数 · 先天起卦”（先天链为以数起卦法）
  L.push(isCoinPan(pan) ? pan.method || '六爻铜钱起卦（摇卦）' : `梅花易数 · 先天起卦（${pan.method || pan.ruleId || '起卦'}）`);
  L.push(`本卦：${fullName(pan.benGua)} ${pan.benGua.symbol}（上${pan.benGua.upper}下${pan.benGua.lower}）`);
  const moving = movingPositions(pan);
  if (moving.length === 0) L.push('动爻：无（静卦）');
  else if (moving.length === 1) L.push(`动爻：第 ${moving[0]} 爻（${pan.yao.find((y) => y.isDong)?.title ?? ''}）`);
  else L.push(`动爻：${moving.map((p) => `第 ${p} 爻`).join('、')}（多动，${pan.yao.filter((y) => y.isDong).map((y) => y.title).join('、')}）`);
  if (pan.zhiGua) L.push(`之卦：${fullName(pan.zhiGua)} ${pan.zhiGua.symbol}`);
  if (pan.huGua) L.push(`互卦：${fullName(pan.huGua)} ${pan.huGua.symbol}`);
  if (pan.tiYong) {
    L.push(`体用：体${pan.tiYong.ti.name}（${pan.tiYong.ti.wuXing}） · 用${pan.tiYong.yong.name}（${pan.tiYong.yong.wuXing}） → ${pan.tiYong.relation}（${pan.tiYong.grade}）`);
  }
  if (pan.steps && pan.steps.upperRaw != null) {
    L.push(`演算：上卦数 ${pan.steps.upperRaw}÷8 余 ${pan.steps.upperNum}；下卦数 ${pan.steps.lowerRaw}÷8 余 ${pan.steps.lowerNum}；动爻数 ${pan.steps.moveRaw}÷6 余 ${pan.dongYao ?? '—'}`);
  }
  for (const w of pan.warnings || []) L.push(`提示：${w}`);
  // 解读模块装配（注册表：verdict 断语 → classic 经文 → najia 纳甲 → baihua 白话导读 → 未来扩展；
  // kind:'coin' 按口径空置，天然无输出）。deps 经 src/catalog.js#depsFromOpts 收敛（唯一契约）。
  // v8：分档（opts.detail = 'brief'|'full'，默认 brief）。默认只出断语+经文，一屏看完；
  //     'full' 才装纳甲/详解/六爻/十翼等深挖层（内容一直在，只是默认不糊脸）。
  L.push(...readingsText(interpretPan(pan, depsFromOpts(opts), { detail: opts.detail || 'brief' }), pan));
  L.push('');
  L.push('爻画（自上而下）：');
  for (let i = 5; i >= 0; i -= 1) {
    const y = pan.yao[i];
    L.push(`${y.title} ${lineChar(y.value)}${y.isDong ? ` ◉动${y.mark ? '(' + y.label + y.mark + ')' : ''}` : ''}`);
  }
  if (Array.isArray(pan.records)) {
    L.push('');
    L.push('掷出记录（自下而上）：');
    for (const r of pan.records) {
      L.push(`${r.title} ${r.label}${r.mark}（${r.moving ? '动' : '静'}）${r.facesText ? ' · ' + r.facesText : ''}`);
    }
  }
  return L.join('\n');
}

export default { textPan };
