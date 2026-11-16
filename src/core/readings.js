// 解读模块注册表与装配（纯函数，无 DOM / 无 node 依赖）
// 可插拔：新增“解读/结果模块” = registerReader({ id, title, run, defaultOff? })
//   run(pan, deps) → 模块原生数据 | null（null=本模块对该盘不产出）
// 默认注册：verdict（卦意导语/体用断语）→ classic（《周易》经文）→ najia（纳甲装卦）
//          → liuyao（六爻断法·阶段五，消费 najia 装卦结果）→ xiangjie（详解·参考汇编
//          data/interpret，需 deps.interp，缺则跳过）。
// 读取顺序 = 注册顺序；文本格式化按 id 由 readingsText 统一产出（可 registerTextFormatter 扩展）。
// ★ defaultOff（阶段四）：注册但**不进默认链**，仅 `interpretPan(pan, deps, { only:['<id>'] })`
//   可显式调用。baihua（白话导读·旧语料 data/ref-corpus）即以此退链——避免与 xiangjie 重复展示。
// ★ 主线口径（阶段四）：铜钱链（kind:'coin'，六爻摇卦）放行 classic/najia/xiangjie
//   （复用现有 reader；实测三者直接吃铜钱盘均正常）。verdict 因铜钱盘体用恒空，
//   保持不装配（其 untaken 文案不对 coin 盘产出，测试锁定）。
// ★ 阶段五（v5）：新增 liuyao（六爻断法）——**仅铜钱盘产出**（自身对 !isCoinPan 返回 null），
//   插在 najia 之后（消费其装卦结果）；verdict 门控与语义一行未改。
// 用途：render/textPan（网页演示）、CLI 演示、未来模块（六爻断法/旺衰深化…）即插即用。
import { assembleVerdict } from './verdict.js';
import { classicReading } from './classic.js';
import { najiaReading } from './najia.js';
import { liuyaoReading, liuyaoText } from './liuyao.js';
import { isCoinPan } from './pan-view.js';
import { refGuideReading, refGuideText } from './refguide.js';
import { xiangjieReading, xiangjieText } from './xiangjie.js';
import { shiyiReading, shiyiText } from './shiyi.js';

const readers = [];
const texters = {};

export function registerReader(r) {
  if (!r || typeof r.id !== 'string' || !r.id || typeof r.run !== 'function') {
    throw new Error('reader 需含 id 与 run(pan, deps)');
  }
  if (readers.some((x) => x.id === r.id)) throw new Error(`重复注册 reader: ${r.id}`);
  readers.push({ id: r.id, title: r.title || r.id, run: r.run, defaultOff: Boolean(r.defaultOff) });
  return readers.length;
}

export function unregisterReader(id) {
  const i = readers.findIndex((x) => x.id === id);
  if (i >= 0) readers.splice(i, 1);
}

export function listReaders() {
  // v8：暴露 defaultOff —— 此前 listReaders 不返回该字段，导致外部无法判断哪些 reader 在默认链里
  //   （外部探测脚本曾因此误判 baihua 为「默认装配」）。
  return readers.map((r) => ({ id: r.id, title: r.title, defaultOff: Boolean(r.defaultOff) }));
}

// 按注册顺序装配：每个 reader 跑一次，null 跳过；返回 [{id,title,data}]
//
// ★ 呈现分档（v8）：
//   opts.detail = 'brief'（默认）—— 只装**核心 reader**（断语 + 经文），一屏能看完
//   opts.detail = 'full'          —— 装入**全部**已注册 reader（含纳甲/详解/六爻/十翼等深挖层）
//   opts.only 优先级最高：显式点名时忽略 detail。
//   分档不是"删除功能"：深挖内容全部保留，只是默认不糊在脸上。
export const DETAIL_LEVELS = ['brief', 'full'];

export function interpretPan(pan, deps = {}, opts = {}) {
  const only = Array.isArray(opts.only) ? opts.only : null;
  const detail = DETAIL_LEVELS.includes(opts.detail) ? opts.detail : 'brief';
  const out = [];
  for (const r of readers) {
    if (only) {
      if (!only.includes(r.id)) continue;
    } else if (detail === 'brief') {
      // brief：只装未标 defaultOff 的（= 核心链）
      if (r.defaultOff) continue;
    }
    // detail === 'full'：不跳过任何 reader
    let data;
    try {
      data = r.run(pan, deps);
    } catch (e) {
      out.push({ id: r.id, title: r.title, error: String((e && e.message) || e) });
      continue;
    }
    if (data == null) continue;
    out.push({ id: r.id, title: r.title, data });
  }
  return out;
}

export function registerTextFormatter(id, fn) {
  if (typeof fn !== 'function') throw new Error('formatter 需为函数');
  texters[id] = fn;
}

// 默认文本格式化（与 textPan 输出同构）
function verdictText(data) {
  const L = [];
  if (data && data.guaBrief) L.push(`卦意导语：${data.guaBrief}`);
  if (data && data.tiYongText) {
    L.push(`体用断语：${data.tiYongText}${data.tiYongNote ? `（${data.tiYongNote}）` : ''}`);
  } else if (data && data.untakenText) {
    L.push(`体用断语：${data.untakenText}`);
  }
  return L;
}

function classicText(data) {
  const L = [];
  if (!data) return L;
  // 三级校对标记（契约 §1.4）：文本侧与 UI 角标必须同口径 ——
  //   checked → 无标记 / crosschecked → 〔交叉校验〕 / none → 〔未校对〕
  // ★ v5.1 修正：原实现只看 proofread 布尔（= level!=='none'），导致 crosschecked 卦在文本里
  //   完全无标记，与 UI 蓝色角标不一致（53 渐 即为例）。现按 proofLevel 三分。
  const lvlOf = (x) => (x && x.proofLevel ? x.proofLevel : x && x.proofread ? 'checked' : 'none');
  const tag = (x) => {
    const lvl = lvlOf(x);
    if (lvl === 'crosschecked') return '〔交叉校验〕';
    if (lvl === 'none') return '〔未校对〕';
    return '';
  };
  if (data.metaUnchecked) L.push('提示：经文尚未人工对照纸质本校对；〔交叉校验〕为多源机器比对一致，非人工结论。');
  if (data.benGua) {
    L.push(`经文｜本卦 ${data.benGua.name}（第${data.benGua.order}卦）卦辞：${data.benGua.guaci}${tag(data.benGua)}`);
    if (data.benGua.static_) L.push('经文｜静卦：无动爻，仅列卦辞。');
    else for (const d of data.benGua.dong) L.push(`经文｜${d.ref}：${d.text}`);
  }
  if (data.zhiGua) {
    L.push(`经文｜之卦 ${data.zhiGua.name}（第${data.zhiGua.order}卦）卦辞：${data.zhiGua.guaci}${tag(data.zhiGua)}`);
  }
  // 异文留档（v8）：**默认不出**。它是给校对/复核用的，不是给占断用的 ——
  //   设计取向：力求简洁。524 字里塞 4 条异文 + 图例会淹没真正的答案。
  //   需要时用 `interpretPan(pan, deps, {only:['classic'], withDisputes:true})` 或看 UI 折叠区。
  if (data.withDisputes) {
    for (const [label, b] of [['本卦', data.benGua], ['之卦', data.zhiGua]]) {
      const ds = b && b.disputed ? Object.values(b.disputed).flat() : [];
      for (const d of ds) {
        const src = Object.entries(d.sources || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(' ／ ');
        L.push(`异文留档｜${label} ${b.name} ${d.ref}：${src}${d.dissent && d.dissent.length ? `（异议源 ${d.dissent.join('/')}）` : ''}`);
      }
    }
    const usedIds = new Set();
    for (const b of [data.benGua, data.zhiGua]) {
      for (const d of (b && b.disputed ? Object.values(b.disputed).flat() : [])) {
        for (const k of Object.keys(d.sources || {})) usedIds.add(k);
      }
    }
    const legend = (Array.isArray(data.sources) ? data.sources : []).filter((s) => s && usedIds.has(s.id));
    if (legend.length) {
      L.push(
        '异文留档｜来源图例：' +
          legend.map((s) => `${s.id}=${s.kind || '?'}${s.independence ? `（${s.independence}）` : ''}`).join(' ／ ')
      );
    }
  }
  // 只给一行「有多少条分歧」的提示（不展开），保留可复核性又不淹没答案
  const nDisp = [data.benGua, data.zhiGua].reduce(
    (a, b) => a + (b && b.disputed ? Object.values(b.disputed).flat().length : 0),
    0
  );
  if (nDisp && !data.withDisputes) {
    L.push(`经文｜注：本卦有 ${nDisp} 条多源异文（不影响所取正文，详见网页「异文留档」）`);
  }
  return L;
}

function najiaText(data) {
  const L = [];
  if (!data) return L;
  if (data.gong) {
    L.push(`纳甲｜${data.gong.name}宫（${data.gong.wuXing}）· ${data.gong.level} · 世在${data.gong.shi}爻 应在${data.gong.ying}爻`);
  }
  for (const x of data.lines || []) {
    const parts = [];
    if (x.shi) parts.push('世');
    if (x.ying) parts.push('应');
    if (x.dong) parts.push('动');
    L.push(
      `纳甲｜${x.pos}${x.title} ${x.zhi || '—'}${x.zhiWuXing ? x.zhiWuXing : ''} ${x.qin || ''}` +
        `${x.shen ? ` ${x.shen}` : ''}${x.yue ? `（${x.yue}）` : ''}${parts.length ? '·' + parts.join('·') : ''}`
    );
  }
  for (const y of data.yingqi || []) L.push(`应期参考｜${y}`);
  for (const n of data.notes || []) L.push(`纳甲提示｜${n}`);
  return L;
}

registerTextFormatter('verdict', verdictText);
registerTextFormatter('classic', classicText);
registerTextFormatter('najia', najiaText);
registerTextFormatter('liuyao', (data) => liuyaoText(data));
registerTextFormatter('baihua', (data) => refGuideText(data));
registerTextFormatter('xiangjie', (data) => xiangjieText(data));
registerTextFormatter('shiyi', (data) => shiyiText(data));

// 将装配结果转为纯文本行（供复制/CLI/日志）
export function readingsText(results, pan) {
  const L = [];
  for (const r of results) {
    if (r.error) {
      L.push(`[${r.id}] 读取失败：${r.error}`);
      continue;
    }
    const fn = texters[r.id];
    if (fn) L.push(...fn(r.data, pan));
  }
  return L;
}

// ---- 默认装配 ----
// 铜钱链（kind:'coin'）阶段四放行 classic/najia/xiangjie（复用现有 reader，实测直接吃铜钱盘正常）；
// verdict 因铜钱盘体用恒空（pan.tiYong=null）保持不装配——其 untaken 文案只对先天盘静卦/多动给。
registerReader({
  id: 'verdict',
  title: '断语',
  run: (pan, deps) =>
    !isCoinPan(pan) && deps.verdictHex && deps.verdictTiYong
      ? assembleVerdict(pan, deps.verdictHex, deps.verdictTiYong)
      : null,
});
registerReader({
  id: 'classic',
  title: '经文',
  run: (pan, deps) =>
    deps.classic
      ? classicReading(pan, deps.classic, deps.proofread, { withDisputes: Boolean(deps.withDisputes) })
      : null,
});
registerReader({
  id: 'najia',
  title: '纳甲装卦',
  // ★ v8：退链（defaultOff）。设计取向：力求简洁、不必过细——
  //   纳甲是六爻装卦体系（八宫/六亲/六神/旬空/月破），对梅花易数的体用判断非必需。
  defaultOff: true,
  run: (pan, deps) =>
    deps.najia && deps.trigrams ? najiaReading(pan, deps.trigrams, deps.najia, deps.ctx || {}) : null,
});
// 六爻断法（阶段五）：仅铜钱盘产出（liuyaoReading 自身对 !isCoinPan 返回 null → 注册表跳过）；
// 复用 najiaReading 装卦，缺 deps.najia/trigrams 时降级为 grade:'略' 并写明缺什么（不崩、不编造）。
registerReader({
  id: 'liuyao',
  title: '六爻断法',
  // ★ v8：退链（defaultOff）。六爻断法是另一套体系，且本实现 grade 恒「略」，
  //   默认展示只会增加噪音。
  defaultOff: true,
  run: (pan, deps) => liuyaoReading(pan, deps),
});
registerReader({
  id: 'xiangjie',
  title: '详解（参考汇编）',
  // ★ v8：退链（defaultOff）。详解单卦 3733 字、占整盘输出 74%，是「想深挖」时才看的内容，
  //   不该默认糊满结果页。
  defaultOff: true,
  run: (pan, deps) => (deps && deps.interp ? xiangjieReading(pan, deps.interp) : null),
});
// shiyi（v6）：十翼（彖传/象传/文言传）。置链末——最学术、最不常用的一层，不挤压常用信息。
// ★ 单源转录，未经交叉校验；UI 角标必须标「单源」，不得借用「交叉校验」/「已校对」（契约 §4）。
registerReader({
  id: 'shiyi',
  title: '十翼（彖传·象传·文言传）',
  // ★ v8：退链（defaultOff）。十翼是学术层，普通占断不看彖传文言。
  defaultOff: true,
  // 附带交叉校验信息（deps.proofread.shiyi）；缺则只出内容、不做分歧标注（不猜）
  run: (pan, deps) =>
    deps && deps.shiyi ? shiyiReading(pan, deps.shiyi, (deps.proofread && deps.proofread.shiyi) || null) : null,
});
// baihua：白话导读（旧语料 data/ref-corpus）—— 阶段四退出默认链（避免与 xiangjie 重复展示），
// 代码保留、行为不变（含铜钱盘不产出），仍可 interpretPan(pan, deps, { only:['baihua'] }) 显式调用。
registerReader({
  id: 'baihua',
  title: '白话导读（参考汇编）',
  defaultOff: true,
  run: (pan, deps) => (!isCoinPan(pan) && deps && deps.ref ? refGuideReading(pan, deps.ref) : null),
});
