// 六爻断法 reader（阶段五 v5）：以世应、六亲、动变生克为纲的「参考口径」输出（纯函数，无 DOM / 无 node 依赖）
// 边界（冻结）：
//   - 仅铜钱盘（kind:'coin'）产出；先天盘/数字盘 → null（注册表自动跳过）
//   - 不动 verdict：verdict.js 一行不改；铜钱盘 verdict 因体用恒空本就不装配
//   - 装卦一律复用 najiaReading（唯一纳甲真身）——本模块只「读 najia 结果 + 组织生克措辞」，
//     不复制纳甲/八宫/纳支逻辑；变爻纳支亦由 najiaReading 读之卦得出
//   - 不作绝对吉凶：grade 恒 '略'，只列依据（宁缺毋滥，缺依据处如实写「略」）
// 动爻集统一经 pan-view#movingPositions 读取，不关心盘来源；五行生克复用 cast.js#wuXingRelation（唯一生克表）。
import { najiaReading } from './najia.js';
import { isCoinPan, movingPositions } from './pan-view.js';
import { flipManyAt, trigramByLines } from './lookup.js';
import { wuXingRelation } from './cast.js';

// 契约 §3.2 固定文案，勿改
export const LIUYAO_NOTE = '六爻断法（参考口径）：以世应、六亲、动变生克为纲，不作绝对吉凶断言。';

const YONG_BASIS_DEFAULT = '默认（未指定占事，以世爻为用神）';

// wuXingRelation(体, 用) 的命名 → 世应口径（世为体）
const SHI_YING_NAME = {
  比和: '世应比和',
  体克用: '世克应',
  用克体: '应克世',
  体生用: '世生应',
  用生体: '应生世',
};

function shiYingRelation(shiWx, yingWx) {
  const r = wuXingRelation(shiWx, yingWx);
  return r ? SHI_YING_NAME[r.name] || null : null;
}

// 变爻（体）与用神/世爻（用）的生克措辞；target 为 '用神' | '世爻'
function bianRelation(bianWx, targetWx, target) {
  const r = wuXingRelation(bianWx, targetWx);
  if (!r) return null;
  if (r.name === '比和') return `变爻与${target}比和`;
  if (r.name === '体克用') return `变爻克${target}`;
  if (r.name === '用克体') return `${target}克变爻`;
  if (r.name === '体生用') return `变爻生${target}`;
  return `${target}生变爻`;
}

// 单爻标签：六亲 + 地支 + 五行（缺项略去，全缺给「略」）
function yaoLabel(row) {
  if (!row) return '（略）';
  const s = `${row.qin || ''}${row.zhi || ''}${row.zhiWuXing || ''}`;
  return s || '（略）';
}

function noteOf(row, yongPos) {
  const parts = [];
  if (row.shi) parts.push('世');
  if (row.ying) parts.push('应');
  if (yongPos != null && row.pos === yongPos) parts.push('用神');
  return parts.join('·');
}

// 之卦装卦：只为取「变爻纳支/五行」。之卦爻线优先用盘上 zhiLines，缺失则用共享原子 flipManyAt 推。
// 失败（缺卦/缺纳支数据）返回 null —— 变爻信息如实写「略」，不编造。
function zhiNajiaOf(pan, moving, trigrams, najiaData) {
  if (!trigrams || !najiaData || !Array.isArray(pan.lines) || pan.lines.length !== 6) return null;
  const zhiLines =
    Array.isArray(pan.zhiLines) && pan.zhiLines.length === 6 ? pan.zhiLines : flipManyAt(pan.lines, moving);
  const lower = trigramByLines(trigrams, zhiLines.slice(0, 3));
  const upper = trigramByLines(trigrams, zhiLines.slice(3, 6));
  if (!lower || !upper) return null;
  return najiaReading({ lines: zhiLines, benGua: { upper: upper.name, lower: lower.name } }, trigrams, najiaData, {});
}

// 主入口：pan（仅铜钱盘）+ deps{trigrams,najia,ctx} → 契约 §3.3 结构 | null
// 容错（契约要求）：缺 deps.najia / deps.trigrams / ctx → 不崩，缺的字段一律 false / null / '略'，
// 并在 verdict.basis 写明缺什么。旬空(kong)/月破(po) 由 najiaReading 依 ctx 推导（T2 已落地），
// 本模块只透传、不重算；xunKong 可能为 null（缺日柱）→ 先判空再取。
export function liuyaoReading(pan, deps = {}) {
  if (!isCoinPan(pan)) return null; // 仅铜钱盘产出（先天盘/数字盘 null，注册表自动跳过）
  const d = deps || {};
  const najiaData = d.najia || null;
  const trigrams = d.trigrams || null;
  const ctx = d.ctx || {};
  const moving = movingPositions(pan);

  const out = {
    note: LIUYAO_NOTE,
    yongShen: { qin: null, pos: null, wei: null, basis: '' },
    shiYing: { shi: null, ying: null, relation: null, text: '' },
    lines: [],
    changes: [],
    verdict: { grade: '略', text: '', basis: [] },
  };

  // ---- 装卦：复用 najiaReading（唯一纳甲真身）----
  const nj = najiaData && trigrams ? najiaReading(pan, trigrams, najiaData, ctx) : null;
  if (!nj) {
    const why =
      !najiaData || !trigrams
        ? '缺 deps.najia / deps.trigrams，无法装卦'
        : '爻线不足六或装卦数据不足，无法装卦';
    out.yongShen.basis = `略（${why}，用神从缺）`;
    out.shiYing.text = `略（${why}）`;
    out.verdict.text = `略：${why}，不作吉凶断言。`;
    out.verdict.basis = [why];
    return out;
  }

  const rows = Array.isArray(nj.lines) ? nj.lines : [];
  const shi = nj.gong && nj.gong.shi != null ? nj.gong.shi : null;
  const ying = nj.gong && nj.gong.ying != null ? nj.gong.ying : null;
  const shiRow = shi != null ? rows.find((r) => r.pos === shi) || null : null;
  const yingRow = ying != null ? rows.find((r) => r.pos === ying) || null : null;

  // ---- 用神：未指定占事 ⇒ 默认世爻（契约 §3.3）----
  const yongPos = shiRow ? shiRow.pos : null;
  out.yongShen = {
    qin: shiRow ? shiRow.qin || null : null,
    pos: yongPos,
    wei: shiRow ? shiRow.title || null : null,
    basis: yongPos != null ? YONG_BASIS_DEFAULT : '略（八宫归属未定，世爻从缺，用神无从取）',
  };
  // 用神五行 = 世爻纳支五行（默认口径）；用于「变爻 vs 用神」生克措辞
  const targetWx = shiRow ? shiRow.zhiWuXing || null : null;
  const targetLabel = '用神';

  // ---- 世应 ----
  const shiYingRel = shiYingRelation(
    shiRow ? shiRow.zhiWuXing : null,
    yingRow ? yingRow.zhiWuXing : null
  );
  out.shiYing = {
    shi,
    ying,
    relation: shiYingRel,
    text:
      shi != null && ying != null
        ? `世在${shi}爻（${yaoLabel(shiRow)}）· 应在${ying}爻（${yaoLabel(yingRow)}）· ${
            shiYingRel || '世应生克略（纳支五行不足）'
          }`
        : '略（八宫归属未定，世应从缺）',
  };

  // ---- 逐爻 ----
  out.lines = rows.map((r) => ({
    pos: r.pos,
    wei: r.title || null,
    qin: r.qin || null,
    zhi: r.zhi || null,
    dong: r.dong === true,
    // 旬空/月破：直接透传 najiaReading 真值（本模块不自行推算，避免两处口径漂移）。
    // 防御：字段未落地时 undefined → Boolean() 归一为 false（契约「缺失即 false」）。
    kong: Boolean(r.kong),
    po: Boolean(r.po),
    yue: r.yue || null,
    note: noteOf(r, yongPos),
  }));

  // ---- 动变：变爻纳支读之卦装卦（复用 najiaReading），只给生克措辞 ----
  const zhiNj = moving.length ? zhiNajiaOf(pan, moving, trigrams, najiaData) : null;
  for (const pos of moving) {
    const row = rows.find((r) => r.pos === pos) || null;
    const zr = zhiNj ? zhiNj.lines.find((x) => x.pos === pos) || null : null;
    const toZhi = zr ? zr.zhi || null : null;
    const toWx = zr ? zr.zhiWuXing || null : null;
    const toLabel = toZhi ? `${toZhi}${toWx || ''}` : null;
    const rel = toWx && targetWx ? bianRelation(toWx, targetWx, targetLabel) : null;
    out.changes.push({
      pos,
      from: yaoLabel(row),
      to: toLabel,
      relation: rel,
      text: `${row ? row.title || `第${pos}爻` : `第${pos}爻`}动：${yaoLabel(row)} → ${
        toLabel || '变爻略（之卦装卦不足）'
      }${rel ? `，${rel}` : '，生克略'}`,
    });
  }

  // ---- 断语：只列依据，不作吉凶断言（grade 恒 '略'）----
  const basis = [];
  if (shiRow) basis.push(`世爻${shiRow.title}（${yaoLabel(shiRow)}）`);
  else basis.push('八宫归属未定，世爻从缺');
  if (yingRow) basis.push(`应爻${yingRow.title}（${yaoLabel(yingRow)}）`);
  else basis.push('应爻从缺');
  if (shiYingRel) basis.push(shiYingRel);
  else basis.push('世应生克略（纳支五行不足）');
  if (moving.length === 0) basis.push('静卦：无动爻，动变生克无从取');
  else {
    basis.push(`动爻${moving.length}个（${moving.join('、')}）`);
    for (const c of out.changes) {
      basis.push(`动爻${c.pos}：${c.from} → ${c.to || '略'}${c.relation ? `，${c.relation}` : '，生克略'}`);
    }
  }
  if (!ctx.monthBranch) basis.push('未提供月建（ctx.monthBranch），月令旺衰略');
  if (!ctx.dayStem) basis.push('未提供日干（ctx.dayStem），六神略');
  if (!ctx.dayBranch) basis.push('未提供日支（ctx.dayBranch），应期略');
  // 旬空/月破（T2 增补于 najiaReading）：字段缺失时如实披露，不把「缺字段」冒充成「不空不破」；
  // 字段在则只做上下文说明（真值已在 lines[].kong/po）。xunKong 可能为 null（缺日柱）→ 先判空。
  const hasKongPo = rows.some(
    (r) => Object.prototype.hasOwnProperty.call(r, 'kong') || Object.prototype.hasOwnProperty.call(r, 'po')
  );
  if (!hasKongPo) basis.push('纳甲未提供旬空/月破字段，kong/po 按 false 处理');
  else if (nj.xunKong && Array.isArray(nj.xunKong.kong) && nj.xunKong.kong.length) {
    basis.push(`本日${nj.xunKong.xun}旬，旬空${nj.xunKong.kong.join('')}`);
  }
  basis.push('仅列世应/六亲/动变生克参考，不作绝对吉凶断言');

  const moveTxt = moving.length === 0 ? '静卦无动爻' : `动爻${moving.length}个`;
  out.verdict = {
    grade: '略', // 依据不足一律「略」：本项目铁律「不猜」，宁缺毋滥
    text:
      `六爻参考：世在${shi ?? '—'}爻、应在${ying ?? '—'}爻，${
        shiYingRel || '世应生克略'
      }；${moveTxt}。` + '仅列依据，不作绝对吉凶断言。',
    basis,
  };

  return out;
}

// 纯文本（readingsText / textPan / CLI 用）：契约 §3.2 → string[]
export function liuyaoText(data) {
  if (!data) return [];
  const L = [];
  const y = data.yongShen || {};
  L.push(`六爻｜用神：${y.wei ? `${y.wei} ` : ''}${y.qin || '略'}${y.pos != null ? `（${y.pos}爻）` : ''} · ${y.basis || '略'}`);
  const s = data.shiYing || {};
  L.push(`六爻｜世应：${s.text || '略'}`);
  for (const x of data.lines || []) {
    const marks = [];
    if (x.dong) marks.push('动');
    if (x.kong) marks.push('旬空');
    if (x.po) marks.push('月破');
    L.push(
      `六爻｜${x.wei || `${x.pos}爻`} ${x.qin || '—'}${x.zhi || '—'}${x.yue ? `（${x.yue}）` : ''}` +
        `${x.note ? `·${x.note}` : ''}${marks.length ? `·${marks.join('·')}` : ''}`
    );
  }
  for (const c of data.changes || []) L.push(`六爻｜动变 ${c.text || `${c.pos}爻`}`);
  const v = data.verdict || {};
  L.push(`六爻｜断语（${v.grade || '略'}）：${v.text || '略'}`);
  for (const b of v.basis || []) L.push(`六爻｜依据：${b}`);
  L.push(`六爻｜提示：${data.note || LIUYAO_NOTE}`);
  return L;
}

export default { LIUYAO_NOTE, liuyaoReading, liuyaoText };
