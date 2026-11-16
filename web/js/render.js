// 盘对象 → DOM 渲染（纯前端叶子：不做起卦计算、不做数据装配；解读只经注册表一次装配）
// 支持两种盘：①时间/数字法（先天链 cast，单动爻 + steps）②铜钱摇卦（castCoinLines，0..6 动 + records）
// 阶段四：
//   - 爻画/卦名/爻题等呈现知识与 textPan 在 src（core/present.js、core/text-pan.js），web 只消费；
//   - 渲染只调一次 interpretPan；verdict/classic/baihua/xiangjie 有专属样式，其余 reader（如 najia）通用折叠区呈现；
//   - xiangjie（详解·参考汇编）分层折叠：白话默认展开，名家详解/哲学含义/卦象关联/校对参考收起（契约 §6）；
//   - 铜钱盘（kind:'coin'）阶段四放行解卦：classic/najia/xiangjie 照常装配（verdict 因体用恒空不产出）。
// 依赖收敛唯一出处：src/catalog.js#depsFromOpts（含可选 ref/interp 直通）。
import {
  NATURE,
  fullName,
  lineChar,
  titlesOf,
  huLinesOf,
  isCoinPan,
  movingPositions,
  interpretPan,
  readingsText,
  textPan,
} from '../../src/core/index.js';
import { depsFromOpts } from '../../src/catalog.js';

// 轻量转义（本模块新插入的外部语料文本/摘要用；防 JSON 语料含 < > & 等破坏 DOM）
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 渲染一只卦卡片；moving 为动爻位集合（1..6），用于高亮（仅当 hexa 为本卦时传）
function guaCard(title, hexa, lines, moving, opts = {}) {
  if (!hexa) return '';
  const titles = titlesOf(lines);
  const rows = [];
  for (let i = 5; i >= 0; i -= 1) {
    const isDong = opts.markDong && moving.includes(i + 1);
    const titleText = titles[i];
    rows.push(
      `<div class="yao-line ${isDong ? 'dong' : ''}">` +
        `<span class="yao-title">${titleText}${i >= 3 ? '·上' : '·下'}${isDong ? ' ◉动' : ''}</span>` +
        `<span>${lineChar(lines[i])}</span></div>`
    );
  }
  // v10 版式：卡片标题（小字标签）→ 卦名+卦符（主信息）→ 构成说明（弱）→ 爻画
  // 原来卦名和"（泽山咸 · 上兑下艮）"挤在同一行、字号相同，主次不分
  const nature = `上${NATURE[hexa.upper] || hexa.upper}下${NATURE[hexa.lower] || hexa.lower}`;
  return (
    `<div class="gua-card">` +
    `<h3>${title}</h3>` +
    `<div class="gua-head"><span class="gua-name">${hexa.name}</span>` +
    `<span class="gua-symbol">${hexa.symbol}</span></div>` +
    `<div class="gua-sub">${fullName(hexa)} · ${nature}</div>` +
    rows.join('') +
    `</div>`
  );
}

// 互卦卡片用爻画：本卦 2/3/4 爻 + 3/4/5 爻（无语义原子 huLinesOf 提供切片；与旧 huLines 同序）
function huFlatLines(lines) {
  const { lower, upper } = huLinesOf(lines);
  return [...lower, ...upper];
}

// 演算明细（先天链：时间/数字法）
function stepsHtml(pan) {
  const s = pan.steps;
  if (!s || s.upperRaw == null) return '';
  const rows = [
    `<tr><td>上卦数</td><td>${s.upperRaw} ÷ 8 余 ${s.upperNum}</td><td>${s.upperNum} = ${pan.benGua.upper}（${NATURE[pan.benGua.upper]}）</td></tr>`,
    `<tr><td>下卦数</td><td>${s.lowerRaw} ÷ 8 余 ${s.lowerNum}</td><td>${s.lowerNum} = ${pan.benGua.lower}（${NATURE[pan.benGua.lower]}）</td></tr>`,
    `<tr><td>动爻</td><td>${s.moveRaw} ÷ 6 余 ${pan.dongYao ?? '—'}</td><td>${pan.dongYao ? '第 ' + pan.dongYao + ' 爻（自下而上）动' : '无动爻（静卦）'}</td></tr>`,
  ];
  if (s.hourBranch != null) rows.push(`<tr><td>时辰</td><td>序数 ${s.hourBranch}</td><td>用于补足/动爻计算</td></tr>`);
  return `<table class="steps"><tr><th>槽位</th><th>计算</th><th>结果</th></tr>${rows.join('')}</table>`;
}

// 掷出记录（coin 盘）
function recordsHtml(pan) {
  if (!Array.isArray(pan.records)) return '';
  const rows = pan.records
    .slice()
    .reverse()
    .map((r) => {
      const tag = r.moving ? '动' : '静';
      return `<tr><td>${r.title}</td><td>${r.label}${r.mark}（${tag}）</td><td>${r.facesText ?? '—'}</td></tr>`;
    })
    .join('');
  return `<table class="steps"><tr><th>爻</th><th>掷得</th><th>三枚面</th></tr>${rows}</table>`;
}

// 体用框（盘级口径说明；解读区的体用断语来自 verdict reader，二者职责不同）
function tiyongBoxHtml(pan, isCoin, moving) {
  if (pan.tiYong) {
    return (
      `<div class="tiyong"><b>体用</b>　体：${pan.tiYong.ti.name}（${pan.tiYong.ti.wuXing}）　用：${pan.tiYong.yong.name}（${pan.tiYong.yong.wuXing}）` +
      `　→ <b>${pan.tiYong.relation}</b>（${pan.tiYong.grade}）<br/><span class="hint">${pan.tiYong.note}</span></div>`
    );
  }
  if (isCoin) {
    return `<div class="tiyong"><b>体用</b>　铜钱摇卦口径：不带梅花互卦/体用（解读留待六爻断法）。</div>`;
  }
  if (moving.length === 0) {
    return `<div class="tiyong"><b>体用</b>　静卦：无动爻，未定体用。</div>`;
  }
  return `<div class="tiyong"><b>体用</b>　未取（体用数据缺失）。</div>`;
}

// ---- 各 reader 的专属 HTML 样式（id 依赖只出现在此处：样式定制注册） ----

// verdict：卦意导语 + 体用断语（或“未取”提示）
function verdictSectionHtml(r) {
  const v = r.data;
  if (!v) return '';
  const rows = [];
  if (v.guaBrief) rows.push(`<div class="r-brief"><b>卦意导语</b>　${v.guaBrief}</div>`);
  if (v.tiYongText) {
    rows.push(
      `<div class="r-tiyong"><b>体用断语</b>　${v.tiYongText}` +
        `${v.tiYongNote ? `<span class="hint">（${v.tiYongNote}）</span>` : ''}</div>`
    );
  } else if (v.untakenText) {
    rows.push(`<div class="r-tiyong"><b>体用断语</b>　${v.untakenText}</div>`);
  }
  return rows.length ? `<div class="reading">${rows.join('')}</div>` : '';
}

// classic：经文区（本卦卦辞 + 动爻爻辞 + 之卦卦辞；三级校对角标 + 全局提示条）
// 三级角标（契约 §1.4，已冻结）：
//   proofLevel === 'checked'      → 无角标
//   proofLevel === 'crosschecked' → .badge.badge-cross（蓝色系）「交叉校验」
//   proofLevel === 'none'         → .badge（红色系，现状）「未校对」
// 兼容：classicReading 的块在 v5 增补 proofLevel 字段，但旧盘/旧缓存可能只有 proofread 布尔值，
// 故按 `proofLevel || (proofread ? 'checked' : 'none')` 归一（不猜、不编造等级）。
const PROOF_BADGE = {
  crosschecked: ' <span class="badge badge-cross">交叉校验</span>',
  none: ' <span class="badge">未校对</span>',
};

function proofBadgeOf(x) {
  const lvl = x.proofLevel || (x.proofread ? 'checked' : 'none');
  return PROOF_BADGE[lvl] || '';
}

function classicSectionHtml(r) {
  const d = r.data;
  if (!d) return '';
  const rows = [];
  if (d.metaUnchecked) {
    rows.push('<div class="c-banner">⚠ 经文尚未人工对照纸质本校对；「交叉校验」为多源机器比对一致，非人工结论。</div>');
  }
  const block = (label, x) => {
    if (!x) return '';
    const badge = proofBadgeOf(x);
    return `<div class="c-item"><b>${label} · ${x.name}（第${x.order}卦）</b>${badge}<br/>卦辞：${x.guaci}</div>`;
  };
  rows.push(block('本卦', d.benGua));
  if (d.benGua) {
    if (d.benGua.static_) rows.push('<div class="c-item c-note">静卦：无动爻，仅列卦辞。</div>');
    else {
      for (const d2 of d.benGua.dong) rows.push(`<div class="c-item c-yao"><b>动爻 ${d2.ref}</b>：${d2.text}</div>`);
    }
  }
  rows.push(block('之卦', d.zhiGua));
  // 异文留档（契约 §5.3「disputed 全部留档可见」）：收起，只陈述各源写法，不改正文、不作对错判定。
  // 数据来自 classicReading 块级 disputed（v5.1 增补）；无则整块不出现。
  const altRows = [];
  for (const [label, b] of [['本卦', d.benGua], ['之卦', d.zhiGua]]) {
    const ds = b && b.disputed ? Object.values(b.disputed).flat() : [];
    for (const x of ds) {
      const src = Object.entries(x.sources || {})
        .map(([k, v]) => `<div class="c-alt-src"><span class="c-alt-k">${esc(k)}</span>${esc(v)}</div>`)
        .join('');
      altRows.push(
        `<div class="c-alt"><div class="c-alt-h"><b>${esc(label)} ${esc(b.name)} · ${esc(x.ref)}</b>` +
          `<span class="c-alt-dissent">异议源 ${esc((x.dissent || []).join('/') || '—')}</span></div>` +
          `${src}${x.note ? `<div class="c-alt-note">${esc(x.note)}</div>` : ''}</div>`
      );
    }
  }
  if (altRows.length) {
    // 来源图例（v5.2，契约 §1.1「sources：来源登记（可追溯）」）：
    // ★ 没有它，上面的「A=… ／ B=… ／ C=…」对用户是天书 —— 留档的意义是可复核，
    //   而"哪个字母是哪本书"正是复核的第一步。只列本条实际出现的源，避免噪音。
    const used = new Set();
    for (const [, b] of [['本卦', d.benGua], ['之卦', d.zhiGua]]) {
      for (const x of (b && b.disputed ? Object.values(b.disputed).flat() : [])) {
        for (const k of Object.keys(x.sources || {})) used.add(k);
      }
    }
    const legend = (Array.isArray(d.sources) ? d.sources : [])
      .filter((s) => s && used.has(s.id))
      .map(
        (s) =>
          `<div class="c-legend-row"><span class="c-alt-k">${esc(s.id)}</span>` +
          `<span class="c-legend-kind">${esc(s.kind || '')}</span>` +
          `${s.independence ? `<span class="c-legend-ind">${esc(s.independence)}</span>` : ''}` +
          `${s.file ? `<span class="c-legend-file">${esc(s.file)}</span>` : ''}</div>`
      )
      .join('');
    // v8：简档只给一行「有 N 条异文」的提示，繁档才展开折叠区。
    //   理由：异文留档是给校对/复核用的，不是占断答案；简档里它会把真正要看的东西挤下去。
    if (d.withDisputes) {
      rows.push(
        `<details class="c-alt-wrap"><summary>异文留档（${altRows.length}）· 多源分歧，未改正文</summary>` +
          `<div class="c-alt-body">` +
          (legend ? `<div class="c-legend">${legend}</div>` : '') +
          `${altRows.join('')}</div></details>`
      );
    } else {
      rows.push(`<div class="c-note">注：本卦有 ${altRows.length} 条多源异文（不影响所取正文；切「繁」可查看留档）</div>`);
    }
  }
  const body = rows.join('');
  return body ? `<div class="classic">${body}</div>` : '';
}

// shiyi（v6）：十翼区（彖传/大象/动爻小象/文言传）—— 分层折叠，契约 §4。
// ★ 角标固定「单源」：十翼是单源转录、未经第二源交叉校验，与经文的「交叉校验」是两种不同事实，
//   不得借用「交叉校验」或「已校对」字样（借了就是冒充）。
function shiyiSectionHtml(r) {
  const d = r.data;
  if (!d) return '';
  const cc = d.crosscheck || null;
  const fold = (summary, body, open) =>
    body ? `<details class="sy-fold"${open ? ' open' : ''}><summary>${esc(summary)}</summary><div class="sy-body">${body}</div></details>` : '';
  const rows = [];
  rows.push(`<div class="sy-banner">${esc(d.note || '')}</div>`);
  // 交叉校验横幅：既说"校验过"，也**必须**说"有多少分歧" —— 只说前者等于夸大
  if (cc && cc.stats) {
    rows.push(
      `<div class="sy-cc">两源交叉校验：一致 <b>${cc.stats.agree}</b> 条、分歧 <b>${cc.stats.diff}</b> 条` +
        `${cc.stats.sourceDefect ? `；另 ${cc.stats.sourceDefect} 卦因第二源结构错位不参与比对` : ''}` +
        `${cc.stats.diff ? '（分歧全部留档，未改正文）' : ''}</div>`
    );
  }
  const blk = (label) => {
    const b = label === '本卦' ? d.ben : d.zhi;
    if (!b) return;
    // 角标：有交叉校验事实时标「交叉校验」，否则退回「单源」（不冒充）
    const isDefect = cc && cc.sourceDefect && label === '本卦';
    const badge = isDefect
      ? ' <span class="badge badge-one">仅单源（第二源该卦错位）</span>'
      : cc
        ? ' <span class="badge badge-cc">交叉校验</span>'
        : ' <span class="badge badge-one">单源</span>';
    rows.push(`<div class="sy-title"><b>${esc(label)} · ${esc(b.name)}（第${b.order}卦）</b>${badge}</div>`);
    if (b.tuan) rows.push(fold('彖传', `<div class="sy-p">${esc(b.tuan)}</div>`, true));
    if (b.daxiang) rows.push(fold('大象', `<div class="sy-p">${esc(b.daxiang)}</div>`, false));
    if (label === '本卦' && d.dong && d.dong.length) {
      const body = d.dong
        .map((x) => `<div class="sy-p"><b>${esc(x.wei || `${x.pos}爻`)}</b>：${esc(x.xiaoxiang || '—')}</div>`)
        .join('');
      rows.push(fold(`动爻小象（${d.dong.length}）`, body, false));
    }
    if (b.wenyan) rows.push(fold('文言传', `<div class="sy-p">${esc(b.wenyan)}</div>`, false));
    // 该卦的分歧留档（收起；只陈述两源写法，不改正文、不判对错）
    const disp = label === '本卦' ? (cc && cc.ben) || [] : (cc && cc.zhi) || [];
    if (disp.length) {
      const body = disp
        .map(
          (x) =>
            `<div class="sy-diff"><div class="sy-diff-h">${esc(x.field)}</div>` +
            `<div class="sy-diff-row"><span class="sy-k">F</span>${esc(x.F || '—')}</div>` +
            `<div class="sy-diff-row"><span class="sy-k">G</span>${esc(x.G || '—')}</div></div>`
        )
        .join('');
      rows.push(fold(`两源分歧留档（${disp.length}）· 未改正文`, body, false));
    }
  };
  blk('本卦');
  blk('之卦');
  const body = rows.join('');
  return body ? `<div class="shiyi">${body}</div>` : '';
}

// baihua：白话导读（参考汇编）—— 需 deps.ref（按需载入），无 ref 时 reader 不产出
function baihuaSectionHtml(r) {
  const d = r.data;
  if (!d) return '';
  const ai = (x) => (x && x.aiFill ? ' <span class="badge">AI补</span>' : '');
  const rows = [];
  if (d.refNote) rows.push(`<div class="b-banner">${esc(d.refNote)}</div>`);
  if (d.ben) {
    rows.push(
      `<div class="b-item"><b>本卦 · ${d.ben.name}（第${d.ben.order}卦）卦辞白话</b>${ai(d.ben)}<br/>${esc(d.ben.译文)}</div>`
    );
    if (d.ben.象辞白话) rows.push(`<div class="b-item b-sub">象辞白话：${esc(d.ben.象辞白话)}</div>`);
  }
  for (const y of d.dong || []) {
    rows.push(`<div class="b-item"><b>动爻 ${y.title}</b>${ai(y)}<br/>${esc(y.译文)}</div>`);
    if (y.象辞白话) rows.push(`<div class="b-item b-sub">象辞白话：${esc(y.象辞白话)}</div>`);
  }
  if (d.zhi) {
    rows.push(
      `<div class="b-item"><b>之卦 · ${d.zhi.name}（第${d.zhi.order}卦）卦辞白话</b>${ai(d.zhi)}<br/>${esc(d.zhi.译文)}</div>`
    );
  }
  return rows.length ? `<div class="baihua">${rows.join('')}</div>` : '';
}

// ---- 详解（xiangjie）：分层折叠（归属冻结见契约 §6） ----
// 白话（默认展开）：plain.译文 + plain.象辞白话 + xiang（象曰原文）；
// 名家详解（收起）：断易天机 / 邵雍（含 grade）/ 傅佩荣 / 传统解卦（+ 动爻层「变卦」，属参考汇编内的名家段）；
// 哲学含义（收起）：卦辞层 + 动爻层；卦象关联（收起）：relations 互/错/综；校对参考（收起）：仅有 alt 时出现。
const MINGJIA_ORDER = ['断易天机', '邵雍', '傅佩荣', '传统解卦'];
const VOICE_META_KEYS = new Set(['order', 'name', 'engine', 'fromPos', 'grade']);

// ---- 解读文本来源标注（v11）----
// 背景：语料抓自某转载汇编站，**该站并非这些文本的作者**。
// 经检索比对：断易天机=明代古籍、邵雍=北宋、傅佩荣=当代学者著作（有版权）、
// 传统解卦/哲学含义=来源不明的现代汇编。
// 呈现原则：**作者与原书优先标，转载站只记在脚注**；有版权的必须显式提示。
let SOURCES_MAP = null;

/** 注入来源登记表（data/sources-registry.json）。缺则返回 null，不标错。 */
export function setSourcesRegistry(reg) {
  SOURCES_MAP = reg && Array.isArray(reg.sources) ? reg : null;
}

function sourceOf(voiceKey) {
  if (!SOURCES_MAP) return null;
  return SOURCES_MAP.sources.find((s) => s.voiceKey === voiceKey) || null;
}

/** 某来源的角标：古籍→「宋/明」；有版权→「©」；来源不明→「?」 */
function sourceBadge(voiceKey) {
  const src = sourceOf(voiceKey);
  if (!src) return '';
  if (src.rightsStatus === 'public-domain') {
    const era = src.era || '';
    const tag = era.includes('北宋') ? '北宋' : era.includes('明') ? '明代' : '古籍';
    return ` <span class="badge src-pd" title="${esc(src.originalAuthor || '')}｜${esc(src.originalWork || '')}">${esc(tag)}</span>`;
  }
  if (src.rightsStatus === 'copyrighted') {
    return ` <span class="badge src-cr" title="版权归原作者；本项目仅作学习参考，不随发行版授权">© 有版权</span>`;
  }
  if (src.rightsStatus === 'uncertain') {
    return ` <span class="badge src-un" title="${esc(src.rightsNote || '来源不明')}">来源不明</span>`;
  }
  return '';
}

function xjAiBadge(on) {
  return on ? ' <span class="badge ai">AI补</span>' : '';
}

// 单个「名家」条目：{text,grade} 或 {子键: 字符串}（傅佩荣/传统解卦/变卦）
function xjVoiceHtml(name, v) {
  if (!v) return '';
  if (typeof v.text === 'string') {
    const cls = v.grade === '吉' ? ' g-ji' : v.grade === '凶' ? ' g-xiong' : '';
    const grade = v.grade ? `<span class="xj-grade${cls}">${esc(v.grade)}</span>` : '';
    return `<div class="xj-voice"><span class="xj-vname">${esc(name)}</span>${sourceBadge(name)}${grade}${esc(v.text)}</div>`;
  }
  const keys = Object.keys(v).filter((k) => !VOICE_META_KEYS.has(k) && typeof v[k] === 'string');
  if (!keys.length) return '';
  const body = keys.map((k) => `<div class="xj-kv"><span class="xj-k">${esc(k)}</span>${esc(v[k])}</div>`).join('');
  const head = v.name ? `${esc(name)}（${esc(v.name)}${v.order ? `·第${v.order}卦` : ''}）` : esc(name);
  return `<div class="xj-voice"><span class="xj-vname">${head}</span>${sourceBadge(name)}${body}</div>`;
}

function xjBlockLabel(b) {
  if (b.scope === 'dong') return `动爻 ${b.wei}`;
  if (b.scope === 'zhi') return `之卦 ${b.name}（第${b.order}卦）`;
  return `本卦 ${b.name}（第${b.order}卦）`;
}

function xjFold(summary, body, count) {
  if (!body) return '';
  return `<details class="xj-fold"><summary>${esc(summary)}${count ? `（${count}）` : ''}</summary><div class="xj-body">${body}</div></details>`;
}

// 白话层（默认展开）：译文 + 象辞白话 + 象曰原文（卦辞/爻辞由 classic reader 呈现，此处不重复）
function xjPlainHtml(b) {
  const p = b.plain || {};
  const rows = [];
  if (p.译文) rows.push(`<div class="xj-item"><b>${esc(xjBlockLabel(b))}·白话</b>${esc(p.译文)}</div>`);
  if (p.象辞白话) rows.push(`<div class="xj-item xj-sub"><b>象辞白话</b>${esc(p.象辞白话)}</div>`);
  if (b.xiang) rows.push(`<div class="xj-item xj-sub"><b>象曰</b>${esc(b.xiang)}</div>`);
  return rows.join('');
}

function xiangjieSectionHtml(r) {
  const d = r.data;
  if (!d) return '';
  const blocks = [d.ben, ...(d.dong || []), d.zhi].filter(Boolean);
  const out = [`<div class="xj-note">${esc(d.note)}</div>`];

  // v11：来源说明 —— 必须说清「谁是作者、谁是转载站」，否则用户会误以为是本项目的原创
  if (SOURCES_MAP) {
    const c = SOURCES_MAP.carrier || {};
    out.push(
      `<div class="xj-src-note"><b>以下解读文本非本项目原创。</b>` +
        `原书/作者：断易天机（明·古籍）、邵雍（北宋）、傅佩荣（当代，<b>有版权</b>）；` +
        `「传统解卦 / 哲学含义 / 变卦」为通行汇编、来源不明。` +
        `本项目语料转载自 ${esc(c.name || '第三方站点')}（${esc(c.role || '转载站')}），` +
        `仅作学习研究参考。详见 <code>data/sources-registry.json</code>。</div>`
    );
  }

  const plain = blocks.map(xjPlainHtml).filter(Boolean).join('');
  if (plain) out.push(`<div class="xj-plain">${plain}</div>`);

  // 名家详解（收起）
  const mj = [];
  for (const b of blocks) {
    const v = b.voices || {};
    const inner =
      MINGJIA_ORDER.map((k) => (v[k] ? xjVoiceHtml(k, v[k]) : '')).join('') +
      (v['变卦'] ? xjVoiceHtml('变卦', v['变卦']) : '');
    if (inner) mj.push(`<div class="xj-block"><div class="xj-head">${esc(xjBlockLabel(b))}</div>${inner}</div>`);
  }
  out.push(xjFold('名家详解', mj.join(''), mj.length));

  // 哲学含义（收起）：卦辞层 + 动爻层
  const ph = [];
  for (const b of blocks) {
    const v = b.voices && b.voices['哲学含义'];
    if (!v) continue;
    const text = typeof v === 'string' ? v : v.text;
    if (!text) continue;
    ph.push(`<div class="xj-block"><div class="xj-head">${esc(xjBlockLabel(b))}${xjAiBadge(b.aiFill)}</div><div class="xj-voice">${esc(text)}</div></div>`);
  }
  out.push(xjFold('哲学含义', ph.join(''), ph.length));

  // 卦象关联（收起，仅本卦 relations：互/错/综）
  const rel = d.ben && d.ben.relations;
  if (rel) {
    const one = (k, label) => {
      const x = rel[k];
      if (!x || !x.name) return '';
      return (
        `<div class="xj-rel"><span class="xj-rname">${label}</span>${esc(x.name)}` +
        `${x.order ? `（第${x.order}卦）` : ''}` +
        `${x.raw ? `<div class="xj-alt-raw">${esc(x.raw)}</div>` : ''}</div>`
      );
    };
    out.push(xjFold('卦象关联', one('mutual', '互卦') + one('opposite', '错卦') + one('comprehensive', '综卦')));
  }

  // 校对参考（收起，仅有 alt 时出现）
  const alts = [];
  for (const b of blocks) {
    if (!b.alt || !b.alt.text) continue;
    alts.push(
      `<div class="xj-block"><div class="xj-head">${esc(xjBlockLabel(b))}</div>` +
        `<div class="xj-alt"><span class="xj-alt-raw">${esc(b.alt.text)}</span>` +
        `${b.alt.note ? `<div class="xj-alt-note">${esc(b.alt.note)}</div>` : ''}</div></div>`
    );
  }
  out.push(xjFold('校对参考', alts.join(''), alts.length));

  return `<div class="xiangjie">${out.join('')}</div>`;
}

// 通用扩展区：无专属样式的 reader（如 najia/未来扩展）以纯文本折叠呈现（可插拔层）
function genericSectionHtml(r, pan) {
  if (r.error) {
    return `<details class="rd-ext"><summary>${esc(r.title)}（读取失败）</summary><div class="rd-lines"><div>${esc(r.error)}</div></div></details>`;
  }
  const lines = readingsText([r], pan);
  const body = lines.map((l) => `<div>${esc(l)}</div>`).join('');
  const sum = `${r.title} · ${r.id}`;
  return body ? `<details class="rd-ext"><summary>${esc(sum)}</summary><div class="rd-lines">${body}</div></details>` : '';
}

// id → 专属样式注册（未注册 → genericSectionHtml 通用折叠）
const SECTION_STYLES = {
  verdict: verdictSectionHtml,
  classic: classicSectionHtml,
  baihua: baihuaSectionHtml,
  xiangjie: xiangjieSectionHtml,
  shiyi: shiyiSectionHtml,
};

// 单一路径：按注册顺序对“一次装配结果”取样式
function readingsHtml(results, pan) {
  const out = [];
  for (const r of results) {
    const fn = SECTION_STYLES[r.id] || genericSectionHtml;
    const h = fn(r, pan);
    if (h) out.push(h);
  }
  return out.join('');
}

// 铜钱盘（kind:'coin'）阶段四放行解卦：classic/najia/xiangjie 照常装配（verdict 因体用恒空不装配）。

export function renderPan(el, pan, opts = {}) {
  const isCoin = isCoinPan(pan);
  const moving = movingPositions(pan);
  const method = pan.method || pan.ruleId || '起卦';
  const hu = pan.huGua ? guaCard('互卦（本卦 2/3/4 与 3/4/5 爻）', pan.huGua, huFlatLines(pan.lines), [], {}) : '';
  const tiHtml = tiyongBoxHtml(pan, isCoin, moving);
  const warnHtml = pan.warnings && pan.warnings.length
    ? `<div class="warnings">⚠ ${pan.warnings.join('；')}</div>`
    : '';
  // P3：解读只经注册表装配一次（verdict → classic → najia → xiangjie → 未来扩展），
  // 铜钱盘阶段四已放行（classic/najia/xiangjie 直接吃铜钱盘；verdict 因体用恒空不产出），无需 id 分支。
  // v8：分档渲染。brief（默认）= 断语＋经文；full = 追加纳甲/详解/十翼等深挖层。
  const detail = opts.detail === 'full' ? 'full' : 'brief';
  const readingHtml = readingsHtml(interpretPan(pan, depsFromOpts(opts), { detail }), pan);
  // 分档切换按钮（不删除功能，只是不该默认糊满屏）
  const detailBtn =
    `<div class="detail-switch">` +
    `<button type="button" class="ds-btn${detail === 'brief' ? ' on' : ''}" data-detail="brief">简（断语＋经文）</button>` +
    `<button type="button" class="ds-btn${detail === 'full' ? ' on' : ''}" data-detail="full">繁（含纳甲·详解·十翼）</button>` +
    `</div>`;
  const detailHtml = `<details><summary>${pan.records ? '掷出记录' : '演算步骤'}</summary>${recordsHtml(pan)}${stepsHtml(pan)}</details>`;
  el.innerHTML =
    `<div class="method">${method}</div>` +
    `<div class="pan-grid">` +
    guaCard('本卦', pan.benGua, pan.lines, moving, { markDong: true }) +
    guaCard('之卦（变卦）', pan.zhiGua, pan.zhiLines || pan.lines, [], {}) +
    hu +
    `</div>` +
    tiHtml +
    detailBtn +
    readingHtml +
    warnHtml +
    detailHtml +
    `<button type="button" id="btn-copy">复制结果文本</button>` +
    `<button type="button" id="btn-dl">下载 .txt</button>` +
    `<textarea id="copy-box" class="copy-box" readonly></textarea>`;
  for (const b of el.querySelectorAll('.ds-btn')) {
    b.addEventListener('click', () => {
      renderPan(el, pan, { ...opts, detail: b.dataset.detail });
    });
  }
  // v10：起卦/切档后自动把结果区带入视野（原来结果在视口下方，用户得自己滚，容易以为没反应）。
  // 用 rAF 等布局稳定后再滚，避免刚 innerHTML 就测量导致位置不准。
  // v10：起卦/切档后把结果区带入视野。
  // ★ 实测教训：用"可见高度 < 阈值"判断不可靠（结果区顶部刚好在视口边缘时，露出的几十像素
  //   就让阈值失效，起卦后纹丝不动）。改为**按可见比例**判断：不足一半就滚到顶。
  //   同时改 async 让布局先稳定（rAF 后立刻测量仍可能拿到旧布局）。
  const bringIntoView = async () => {
    if (typeof el.scrollIntoView !== 'function') return;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    if (rect.height > 0 && visible / Math.min(rect.height, vh) < 0.5) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  bringIntoView();

  const currentText = () => textPan(pan, { ...opts, detail });
  const copyBtn = el.querySelector('#btn-copy');
  const dlBtn = el.querySelector('#btn-dl');
  const box = el.querySelector('#copy-box');
  copyBtn.addEventListener('click', () => {
    box.value = currentText();
    box.style.display = 'block';
    box.select();
    try {
      navigator.clipboard && navigator.clipboard.writeText(box.value);
    } catch {
      /* 忽略剪贴板权限问题，用户可手动复制 */
    }
    copyBtn.textContent = '已复制 ✓';
  });
  dlBtn.addEventListener('click', () => {
    const name = `排盘-${pan.benGua ? pan.benGua.name : 'unknown'}${pan.zhiGua ? '-' + pan.zhiGua.name : ''}.txt`;
    const blob = new Blob([currentText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    dlBtn.textContent = '已下载 ✓';
    setTimeout(() => { dlBtn.textContent = '下载 .txt'; }, 1500);
  });
}
