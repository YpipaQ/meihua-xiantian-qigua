// Web 入口：界面交互编排（数据加载 / 表单 → 调用 core → 渲染）
// 代码分离：本文件不做任何易学计算；起卦一律调用 src/core；历法换算调用 src/core/calendar
import {
  cast,
  castNumbers,
  ruleIdForNumberCount,
  solarClockToCast,
  solarBranchToCast,
  branchFromClock,
  zhiByIndex,
  zhiLabel,
  hourGanZhi,
  lineOfToss,
  castCoinLines,
  isCoinPan,
} from '../../src/core/index.js';
import { loadData, loadRefMap, loadInterpMap } from './loaders.js';
import { renderPan, setSourcesRegistry } from './render.js';

const BRANCH = [
  ['子', 1], ['丑', 2], ['寅', 3], ['卯', 4], ['辰', 5], ['巳', 6],
  ['午', 7], ['未', 8], ['申', 9], ['酉', 10], ['戌', 11], ['亥', 12],
];

const $ = (id) => document.getElementById(id);
let dataPromise = null;
let numberInputs = [];
// 当前界面状态
let calMode = 'solar'; // solar | lunar
let timeType = 'clock'; // clock | branch（公历模式内）
// 起卦时刻干支上下文（纳甲六神/旺衰用）：时间公历取所选日期；铜钱/数字默认当前时刻；农历直填无公历 → null
let castCtx = null;

function solarCtxOf(r) {
  if (!r || !r.gzDay) return null;
  return {
    dayStem: r.gzDay.slice(0, 1),
    dayBranch: r.gzDay.slice(-1),
    monthBranch: r.gzMonth ? r.gzMonth.slice(-1) : null,
  };
}
function nowCtx() {
  try {
    const n = new Date();
    return solarCtxOf(solarClockToCast(n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes()));
  } catch {
    return null;
  }
}

async function ensureData() {
  if (!dataPromise) {
    dataPromise = loadData().catch((err) => {
      dataPromise = null;
      throw err;
    });
  }
  return dataPromise;
}

// 渲染 opts：loadData 的 data 整包直传 + 本次起卦 ctx（deps 收敛统一在 src/catalog.js 的 depsFromOpts）
function renderOpts(data) {
  return data ? { ...data, ctx: castCtx || undefined } : undefined;
}

// 索引归一：契约 §3 的 index.json 是 { meta, entries }，而载入器契约 §4 要求 entries 数组。
// 两种形态都接受（entries 数组 / 裸数组），避免上游 pick 口径变化时静默不显示。
function indexEntries(idx) {
  if (Array.isArray(idx)) return idx;
  if (idx && Array.isArray(idx.entries)) return idx.entries;
  return null;
}

// 统一渲染入口：起卦得盘后，按需取“本卦/之卦”的参考语料挂到 opts，再交给 renderPan。
//   - opts.ref    = 白话导读参考（旧语料 data/ref-corpus；铜钱盘按口径不取，reader 亦默认退链）
//   - opts.interp = 详解参考汇编（data/interpret，契约 §4；铜钱链阶段四已放行，故不再排除铜钱盘）
// 任一索引缺失/缺卦文件 → 不挂该键，对应 reader 自动跳过，不阻塞起卦。
async function renderPanWithMaps(el, pan, data) {
  const opts = renderOpts(data);
  if (pan && data) {
    const orders = [pan.benGua && pan.benGua.order, pan.zhiGua && pan.zhiGua.order].filter((o) => o != null);
    const refIdx = indexEntries(data.refIndex);
    const interpIdx = indexEntries(data.interpIndex);
    const wantRef = !isCoinPan(pan) && !!refIdx;
    const wantInterp = !!interpIdx;
    const [refMap, interpMap] = await Promise.all([
      wantRef ? loadRefMap(refIdx, orders) : Promise.resolve(null),
      wantInterp ? loadInterpMap(interpIdx, orders) : Promise.resolve(null),
    ]);
    if (refMap && Object.keys(refMap).length) opts.ref = refMap;
    if (interpMap && Object.keys(interpMap).length) opts.interp = interpMap;
  }
  // v11：把来源登记表注入渲染层（用于「断易天机/邵雍/傅佩荣」等作者角标）
  if (data && data.sourcesRegistry) setSourcesRegistry(data.sourcesRegistry);
  renderPan(el, pan, opts);
}

function showError(err) {
  $('result-body').innerHTML = `<div class="error">${String((err && err.message) || err)}</div>`;
}

function setSeg(containerId, activeDatasetKey, value) {
  for (const btn of document.querySelectorAll(`#${containerId} button`)) {
    btn.classList.toggle('on', btn.dataset[activeDatasetKey] === value);
  }
}

function fillBranchSelect(sel) {
  sel.innerHTML = '';
  for (const [name, v] of BRANCH) {
    const z = zhiByIndex(v);
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = `${name}时（${z.animal}）${z.hourText}`;
    sel.appendChild(o);
  }
}

function fillRange(sel, n, from = 1) {
  sel.innerHTML = '';
  for (let i = from; i <= n; i += 1) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = String(i);
    sel.appendChild(o);
  }
}

const pad2 = (n) => String(n).padStart(2, '0');
const todayValue = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
};

// ---------- 数字输入区（对外：数字起卦，按个数分派） ----------
// 批量文本 → 数字数组：支持 `12,33` / `12 33` / 换行 / 中英文逗号顿号分号 等分隔
function parseNumbersText(text) {
  return String(text == null ? '' : text)
    .split(/[\s,，、;；|/\\]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
}

// 各输入框 → 批量文本框（保持两处一致；由输入框发起的改动才回写）
function syncPasteBox() {
  const box = $('number-paste');
  if (!box) return;
  box.value = numberInputs.map((inp) => inp.value.trim()).filter((s) => s !== '').join(', ');
}

function setNumberCount(n, values = [], opts = {}) {
  const count = Math.max(1, Math.min(12, n));
  const prev = numberInputs.map((inp) => inp.value);
  const box = $('number-fields');
  box.innerHTML = '';
  numberInputs = [];
  for (let i = 0; i < count; i += 1) {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.step = '1';
    inp.placeholder = `第 ${i + 1} 个数`;
    inp.value = values[i] != null ? String(values[i]) : (prev[i] ?? '');
    inp.addEventListener('input', () => {
      updateNumberHint();
      syncPasteBox();
    });
    box.appendChild(inp);
    numberInputs.push(inp);
  }
  updateNumberHint();
  if (!opts.fromPaste) syncPasteBox();
}

// 批量文本框 → 输入框（粘贴 / 输入含分隔符时自动拆分；空文本保持当前个数）
function applyPasteBox() {
  const box = $('number-paste');
  if (!box) return;
  const vals = parseNumbersText(box.value);
  if (vals.length === 0) {
    updateNumberHint();
    return;
  }
  setNumberCount(vals.length, vals, { fromPaste: true });
}

function readNumbers() {
  return numberInputs
    .map((inp) => inp.value.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function updateNumberHint() {
  const k = readNumbers().length;
  const hintEl = $('number-hint');
  const hourWrap = $('one-hour-wrap');
  if (k === 0) {
    hintEl.textContent = '请输入至少 1 个数字。';
    hourWrap.classList.add('hidden');
    return;
  }
  const ruleId = ruleIdForNumberCount(k);
  const label =
    k === 1 ? '一数起卦法（借时辰补足下卦/动爻）'
      : k === 2 ? '二数起卦法（前1｜后1）'
        : k === 3 ? '三数起卦法（前1｜后2，默认口径）'
          : '多数起卦法（对半分组，奇数时上卦取少一半）';
  hintEl.textContent = `当前 ${k} 个数 → ${label}（规则：${ruleId}）`;
  hourWrap.classList.toggle('hidden', k !== 1);
}

// ---------- 农历/公历换算展示与起卦取值 ----------
function readSolarDate() {
  const v = $('sol-date').value; // <input type="date"> → YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100) return null;
  const dt = new Date(year, month - 1, day);
  const ok = dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
  return ok ? { year, month, day } : null;
}

function readClock() {
  const v = $('sol-clock').value; // HH:MM
  if (!v) return null;
  const [hh, mm] = v.split(':').map(Number);
  return { hour: hh, minute: mm };
}

function formatConv(r) {
  const z = r.hourBranch;
  const hz = hourGanZhi(r.gzDay, z.index);
  const leap = r.isLeap ? `（闰${r.lunarMonth}月）` : '';
  const lines = [
    `公历 ${r.solarYear}-${pad2(r.solarMonth)}-${pad2(r.solarDay)} ${pad2(r.hour)}:${pad2(r.minute ?? 0)}`,
    `→ 农历 ${r.lunarYear} 年 ${r.lunarMonth} 月 ${r.lunarDay} 日${leap}`,
    `→ 干支 ${r.gzYear} 年 ${r.gzMonth} 月 ${r.gzDay} 日 · ${z.shichen}（${z.zhi}${z.animal}）${hz}时`,
    `→ 起卦取值：年支${r.gzYear.slice(1)}(${r.gzYearBranchIndex}) + 农历月${r.lunarMonth} + 日${r.lunarDay} + 时辰序${z.index}`,
  ];
  for (const w of r.warnings) lines.push(`⚠ ${w}`);
  return lines.join('\n');
}

function updateSolarReadout() {
  const box = $('sol-readout');
  const date = readSolarDate();
  if (!date) {
    box.textContent = '';
    return;
  }
  try {
    const r =
      timeType === 'clock'
        ? (() => {
            const c = readClock();
            if (!c) return null;
            return solarClockToCast(date.year, date.month, date.day, c.hour, c.minute);
          })()
        : solarBranchToCast(date.year, date.month, date.day, Number($('sol-branch').value) || 1);
    box.textContent = r ? formatConv(r) : '';
  } catch {
    box.textContent = '';
  }
}

function updateLunarReadout() {
  const box = $('lun-readout');
  const yb = Number($('lun-year-branch').value);
  const ybZ = yb ? zhiByIndex(yb) : null;
  const m = $('lun-month').value;
  const d = $('lun-day').value;
  const hb = Number($('lun-branch').value);
  const hbZ = hb ? zhiByIndex(hb) : null;
  box.textContent =
    `农历 ${m ? m + ' 月' : '?'}${d ? d + ' 日' : ''} · ` +
    (ybZ ? `年支 ${ybZ.zhi}${ybZ.animal}（序 ${ybZ.index}）` : '年支未选') +
    (hbZ ? ` · 时辰 ${zhiLabel(hbZ)}` : '');
}

// ---------- 起卦动作 ----------
function castTimePan() {
  let values;
  const note = [];
  if (calMode === 'solar') {
    const date = readSolarDate();
    if (!date) throw new Error('公历日期无效（请选择 1900–2100 之间的日期）。');
    if (timeType === 'clock') {
      const c = readClock();
      if (!c) throw new Error('请填写 24 小时制时间（HH:MM）。');
      const r = solarClockToCast(date.year, date.month, date.day, c.hour, c.minute);
      castCtx = solarCtxOf(r);
      values = {
        yearBranch: r.gzYearBranchIndex,
        month: r.lunarMonth,
        day: r.lunarDay,
        hourBranch: r.hourBranch.index,
      };
      note.push(`公历 ${r.solarYear}-${r.solarMonth}-${r.solarDay} ${c.hour}:${pad2(c.minute)}`);
      note.push(`换算：农历 ${r.lunarYear}年${r.lunarMonth}月${r.lunarDay}日 · ${r.gzYear}年${r.gzMonth}月${r.gzDay}日 · ${r.hourBranch.zhi}时`);
      note.push(...r.warnings);
    } else {
      const bi = Number($('sol-branch').value);
      const r = solarBranchToCast(date.year, date.month, date.day, bi);
      castCtx = solarCtxOf(r);
      values = {
        yearBranch: r.gzYearBranchIndex,
        month: r.lunarMonth,
        day: r.lunarDay,
        hourBranch: r.hourBranch.index,
      };
      note.push(`公历 ${r.solarYear}-${r.solarMonth}-${r.solarDay} · 选${r.hourBranch.shichen}（${r.hourBranch.animal}）`);
      note.push(`换算：农历 ${r.lunarYear}年${r.lunarMonth}月${r.lunarDay}日 · ${r.gzYear}年`);
      note.push(...r.warnings);
    }
    note.push(`起卦取值：年支 ${values.yearBranch} · 月 ${values.month} · 日 ${values.day} · 时 ${values.hourBranch}`);
  } else {
    const yb = Number($('lun-year-branch').value);
    const m = Number($('lun-month').value);
    const d = Number($('lun-day').value);
    const hb = Number($('lun-branch').value);
    if (!yb || !m || !d || !hb) throw new Error('农历模式：请填齐 年支 / 农历月 / 农历日 / 时辰。');
    if (m < 1 || m > 12 || d < 1 || d > 30) throw new Error('农历月 1–12、日 1–30。');
    castCtx = null; // 农历直填无公历日，纳甲六神/旺衰需要干支日，无法推算
    values = { yearBranch: yb, month: m, day: d, hourBranch: hb };
    note.push(`农历 ${m}月${d}日 · 年支序 ${yb} · 时辰序 ${hb}`);
    note.push('闰月按当月月数取数（不另计月份序）。');
  }
  $('conv-note').textContent = note.join('\n');
  return { ruleId: 'time', values };
}

function castNumbersPan(data) {
  applyPasteBox(); // 兜底：用户直接在批量框里输入单个数字后点「起卦」，以批量框为准
  const nums = readNumbers();
  if (nums.length === 0) throw new Error('数字起卦：请至少输入 1 个数字。');
  const hv = $('num-hour').value;
  const hourBranch = hv === '' ? undefined : Number(hv);
  castCtx = nowCtx(); // 数字法未选公历，纳甲按当前时刻的干支日/月建参考
  return castNumbers(data, nums, hourBranch != null ? { hourBranch } : {});
}

function doCast(fn) {
  Promise.resolve()
    .then(ensureData)
    .then((data) => renderPanWithMaps($('result-body'), fn(data), data))
    .catch(showError);
}

// ---------- 铜钱摇卦（六爻，自下而上初爻→上爻） ----------
let coinCfg = { yangFace: '字' }; // 由 data/coin-config.json 注入
let coinConfigData = null;
let coinThrows = [];

function coinPosTitle(p) {
  return p === 1 ? '初爻' : p === 6 ? '上爻' : ['二', '三', '四', '五'][p - 2] + '爻';
}

function refreshCoinConfigNote() {
  if (!coinConfigData) {
    ensureData().then((d) => {
      coinConfigData = d.coinConfig;
      coinCfg = { yangFace: d.coinConfig.yangFace };
      renderCoinConfigNote();
    }).catch(() => {});
    return;
  }
  renderCoinConfigNote();
}

function renderCoinConfigNote() {
  if (!coinConfigData) return;
  const c = coinConfigData;
  const other = c.yangFace === '字' ? '背' : '字';
  $('coin-config-note').textContent =
    `铜钱面约定（上层配置 data/coin-config.json）：默认“${c.yangFace}为阳”——${c.yangFace}（${c.sides[c.yangFace]}）计阳、${other}（${c.sides[other]}）计阴；` +
    `三枚阳面数 3/2/1/0 → 老阳○（动）/ 少阳—（静）/ 少阴- -（静）/ 老阴×（动）。`;
}

function renderCoinSlots() {
  const rows = [];
  for (let p = 6; p >= 1; p -= 1) {
    const t = coinThrows[p - 1];
    rows.push(
      `<div class="yao-line"><span class="yao-title">${coinPosTitle(p)}</span>` +
        `<span>${t ? `${t.label}${t.mark} ${t.moving ? '·动' : '·静'}（${t.facesText}）` : '— 未掷 —'}</span></div>`
    );
  }
  $('coin-slots').innerHTML = rows.join('');
}

function coinAfterToss() {
  const n = coinThrows.length;
  const btn = $('btn-toss');
  btn.disabled = n >= 6;
  btn.textContent = n < 6 ? `掷第 ${n + 1} 爻` : '六爻已齐';
  $('coin-progress').textContent =
    n < 6 ? `已掷 ${n}/6 爻，请掷第 ${n + 1} 爻（自下而上：初爻→上爻）。` : '六爻已齐，正在排盘…';
  const last = coinThrows[n - 1];
  $('toss-last').textContent = last
    ? `本次掷得：${last.facesText} → ${last.label}${last.mark}（${last.moving ? '动' : '静'}）`
    : '';
  renderCoinSlots();
  if (n === 6) {
    ensureData()
      .then((data) => {
        castCtx = nowCtx(); // 摇卦按当前时刻干支（六爻断卦以问事日为准）
        const pan = castCoinLines(
          data,
          coinThrows.map((t) => ({ value: t.value, moving: t.moving, label: t.label, mark: t.mark, coins: t.coins })),
          coinCfg
        );
        return renderPanWithMaps($('result-body'), pan, data);
      })
      .catch(showError);
  }
}

function coinReset() {
  coinThrows = [];
  const btn = $('btn-toss');
  btn.disabled = false;
  btn.textContent = '掷第 1 爻';
  $('coin-progress').textContent = '共掷 6 爻（自下而上：初爻 → 上爻）。每爻掷三枚铜钱。';
  $('toss-last').textContent = '';
  renderCoinSlots();
  $('result-body').innerHTML = '<div class="placeholder">摇齐六爻后自动排盘。</div>';
}

// ---------- 初始化 ----------
function init() {
  fillBranchSelect($('sol-branch'));
  fillBranchSelect($('lun-branch'));
  fillBranchSelect($('lun-year-branch'));
  fillBranchSelect($('num-hour'));
  fillRange($('lun-month'), 12);
  fillRange($('lun-day'), 30);

  // 默认公历=今天、24h=当前
  const now = new Date();
  $('sol-date').value = todayValue();
  $('sol-clock').value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  $('sol-branch').value = String(branchFromClock(now.getHours(), now.getMinutes()).index);
  $('lun-month').value = '1';
  $('lun-day').value = '1';
  $('lun-branch').value = String(branchFromClock(now.getHours(), now.getMinutes()).index);

  // Tab 切换（时间 / 数字 / 铜钱）
  const PANELS = { time: 'panel-time', numbers: 'panel-numbers', coin: 'panel-coin' };
  for (const btn of document.querySelectorAll('#tabs .tab')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('active', b === btn));
      for (const [key, id] of Object.entries(PANELS)) {
        $(id).classList.toggle('hidden', key !== btn.dataset.tab);
      }
      if (btn.dataset.tab === 'coin') refreshCoinConfigNote();
    });
  }

  // 阴阳历切换
  for (const btn of document.querySelectorAll('#cal-seg button')) {
    btn.addEventListener('click', () => {
      calMode = btn.dataset.cal;
      setSeg('cal-seg', 'cal', calMode);
      $('time-solar').classList.toggle('hidden', calMode !== 'solar');
      $('time-lunar').classList.toggle('hidden', calMode !== 'lunar');
      $('conv-note').textContent = '';
      if (calMode === 'solar') updateSolarReadout();
      else updateLunarReadout();
    });
  }
  // 时间类型（24h / 时辰）
  for (const btn of document.querySelectorAll('#time-type-seg button')) {
    btn.addEventListener('click', () => {
      timeType = btn.dataset.tt;
      setSeg('time-type-seg', 'tt', timeType);
      $('wrap-clock').classList.toggle('hidden', timeType !== 'clock');
      $('wrap-branch').classList.toggle('hidden', timeType !== 'branch');
      updateSolarReadout();
    });
  }
  for (const id of ['sol-date', 'sol-clock', 'sol-branch']) {
    $(id).addEventListener('input', updateSolarReadout);
    $(id).addEventListener('change', updateSolarReadout);
  }
  for (const id of ['lun-year', 'lun-year-branch', 'lun-month', 'lun-day', 'lun-branch']) {
    $(id).addEventListener('input', updateLunarReadout);
    $(id).addEventListener('change', updateLunarReadout);
  }
  // 农历年份 → 自动推年支（(year-4)%12+1，可再手改）
  $('lun-year').addEventListener('input', () => {
    const y = Number($('lun-year').value);
    if (y >= 1900) {
      const bi = ((y - 4) % 12 + 12) % 12 + 1;
      $('lun-year-branch').value = String(bi);
      updateLunarReadout();
    }
  });
  // 今天
  $('btn-today').addEventListener('click', () => {
    $('sol-date').value = todayValue();
    $('conv-note').textContent = '';
    updateSolarReadout();
  });

  // 数字个数加减 + 批量粘贴拆分
  $('btn-add-number').addEventListener('click', () => setNumberCount(numberInputs.length + 1));
  $('btn-remove-number').addEventListener('click', () => {
    if (numberInputs.length > 1) setNumberCount(numberInputs.length - 1);
  });
  const pasteBox = $('number-paste');
  pasteBox.addEventListener('paste', () => setTimeout(applyPasteBox, 0));
  pasteBox.addEventListener('input', () => {
    if (/[\s,，、;；|/\\]/.test(pasteBox.value)) applyPasteBox();
    else updateNumberHint();
  });
  pasteBox.addEventListener('change', applyPasteBox);

  // 铜钱摇卦
  $('btn-toss').addEventListener('click', () => {
    if (coinThrows.length < 6) {
      coinThrows.push(lineOfToss(Math.random, coinCfg));
      coinAfterToss();
    }
  });
  $('btn-reset-coin').addEventListener('click', coinReset);

  $('btn-cast-time').addEventListener('click', () => doCast((data) => cast(data, castTimePan())));
  $('btn-cast-numbers').addEventListener('click', () => doCast(castNumbersPan));

  // 初始
  setNumberCount(2);
  renderCoinSlots();
  updateSolarReadout();
  updateLunarReadout();
  ensureData()
    .then((d) => {
      coinConfigData = d.coinConfig;
      coinCfg = { yangFace: d.coinConfig.yangFace };
      refreshCoinConfigNote();
    })
    .catch(() => {});
}

init();
