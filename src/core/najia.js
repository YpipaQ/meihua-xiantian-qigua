// 纳甲装卦（京房）：八宫归属/世应/纳支/六亲/六神 + 月令旺衰 + 应期简注 + 旬空/月破（纯函数）
// 只“读盘”：需要 pan.lines（自下而上六爻）与 deps：trigrams(含 name/lines/wuXing)、najia 数据、可选 ctx{dayStem,monthBranch,dayBranch}
// 动爻集统一经 pan-view（movingPositions）读取，不关心盘来源。
import { titleOfYao } from './lookup.js';
import { movingPositions } from './pan-view.js';
import { GAN, ZHI } from './calendar.js';

const SH = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 我克
const CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };

const LEVELS = ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'];
const SHI = [6, 1, 2, 3, 4, 5, 4, 3]; // 各级别世爻位（1..6，1=初）
const YING = [3, 4, 5, 6, 1, 2, 1, 6]; // 应爻位

function qinOf(me, zhiWuXing) {
  if (zhiWuXing === me) return '兄弟';
  if (SH[me] === zhiWuXing) return '子孙';
  if (KE[me] === zhiWuXing) return '妻财';
  if (SH[zhiWuXing] === me) return '父母';
  return '官鬼'; // zhiWuXing 克 me
}

function yueState(yueX, zhiX) {
  if (yueX === zhiX) return '旺';
  if (SH[yueX] === zhiX) return '相'; // 令生者相
  if (SH[zhiX] === yueX) return '休'; // 生令者休
  if (KE[zhiX] === yueX) return '囚'; // 克令者囚
  return '死'; // 令克者死
}

// 旬空（由日柱推）：日干序 s(0–9)、日支序 b(0–11) ⇒ 空亡支 = (b−s+10)%12、(b−s+11)%12（契约 §2.1 冻结口径）
// 旬首 = 甲 + ZHI[(b−s+12)%12]（六旬之名，用于与 najia.xunKong 表对拍）
// 缺日干或日支 ⇒ null（不猜）
function xunKongOf(dayStem, dayBranch) {
  const s = GAN.indexOf(dayStem);
  const b = ZHI.indexOf(dayBranch);
  if (s < 0 || b < 0) return null;
  const xun = `甲${ZHI[(b - s + 12) % 12]}`;
  const kong = [ZHI[(b - s + 10) % 12], ZHI[(b - s + 11) % 12]];
  return { xun, kong };
}

function nameMap(trigrams) {
  const m = {};
  for (const t of trigrams || []) if (t && t.name) m[t.name] = t;
  return m;
}

// 宫谱：以某单卦（宫）本宫六爻为基础推 8 个成员爻象（自下而上 0..5）
function gongPatterns(base) {
  const flip = (arr, upto) => {
    const a = arr.slice();
    for (let i = 0; i <= upto; i += 1) a[i] = a[i] ? 0 : 1;
    return a;
  };
  const s1 = flip(base, 0);
  const s2 = flip(base, 1);
  const s3 = flip(base, 2);
  const s4 = flip(base, 3);
  const s5 = flip(base, 4);
  const you = s5.slice(); you[3] = base[3];
  const gui = you.slice(); for (let i = 0; i < 3; i += 1) gui[i] = base[i];
  return [base, s1, s2, s3, s4, s5, you, gui];
}

// 返回 {name(宫单卦名), level, levelIdx} 或 null
export function gongOf(lines6, trigrams) {
  const tm = nameMap(trigrams);
  const found = [];
  for (const name of Object.keys(tm)) {
    const base = tm[name].lines.concat(tm[name].lines);
    if (!Array.isArray(base) || base.length !== 6) continue;
    const pats = gongPatterns(base);
    for (let i = 0; i < pats.length; i += 1) {
      if (pats[i].join(',') === lines6.join(',')) found.push({ name, levelIdx: i, level: LEVELS[i] });
    }
  }
  if (found.length === 1) return found[0];
  return found.length ? found : null;
}

// 每爻装卦明细（不依赖宫，先算纳支；qin 需宫五行、shen 需日干、月旺衰需月支）
export function najiaReading(pan, trigrams, najiaData, ctx = {}) {
  const lines6 = Array.isArray(pan.lines) && pan.lines.length === 6 ? pan.lines : null;
  const notes = [];
  if (!lines6 || !najiaData) return null;
  const tm = nameMap(trigrams);
  const nazhi = najiaData.nazhi || {};
  const zwx = najiaData.zhiWuXing || {};
  const gong = gongOf(lines6, trigrams);
  if (!gong) notes.push('未能按京房八宫推得该卦归属（数据或爻象异常）。');
  const me = gong && tm[gong.name] ? tm[gong.name].wuXing : null;
  const shenOrder = najiaData.shenOrder || [];
  const shenStart = najiaData.shenStart || {};
  let shenIdx = -1;
  if (ctx.dayStem && shenStart[ctx.dayStem] != null) {
    shenIdx = shenOrder.indexOf(shenStart[ctx.dayStem]);
    if (shenIdx < 0) shenIdx = -1;
  } else if (!ctx.dayStem) {
    notes.push('未提供日干（ctx.dayStem），六神略去。');
  }
  const yueX = ctx.monthBranch ? zwx[ctx.monthBranch] : null;
  if (!ctx.monthBranch) notes.push('未提供月建（ctx.monthBranch），月令旺衰略去。');

  // 旬空：由日柱推算（契约 §2.1）。缺日干/日支 ⇒ null + notes（不猜）
  const xunKong = xunKongOf(ctx.dayStem, ctx.dayBranch);
  if (!xunKong) {
    const lack = !ctx.dayStem && !ctx.dayBranch ? '日干与日支（ctx.dayStem/ctx.dayBranch）'
      : !ctx.dayStem ? '日干（ctx.dayStem）' : '日支（ctx.dayBranch）';
    notes.push(`未提供${lack}，旬空略去。`);
  }

  // 旬空表对拍：data/najia.json#xunKong 为单一真身，代码按日柱推算后与其对拍（不一致即数据漂移，如实提示）
  if (xunKong) {
    if (!Array.isArray(najiaData.xunKong)) {
      notes.push('缺旬空表（data/najia.json#xunKong），旬空仅按日柱推算、未与表对拍。');
    } else {
      const t = najiaData.xunKong.find((e) => e && e.xun === xunKong.xun);
      if (!t) notes.push(`旬空表（data/najia.json#xunKong）缺「${xunKong.xun}」旬条目，仅按日柱推算。`);
      else if (Array.isArray(t.kong) && t.kong.join(',') !== xunKong.kong.join(',')) {
        notes.push(`旬空表与日柱推算不一致（表：${t.kong.join('')}／推算：${xunKong.kong.join('')}），请核对 data/najia.json#xunKong。`);
      }
    }
  }

  const upperName = pan.benGua && pan.benGua.upper;
  const lowerName = pan.benGua && pan.benGua.lower;
  const inner = (upperName && lowerName && nazhi[lowerName]) ? nazhi[lowerName].inner : null;
  const outer = (upperName && lowerName && nazhi[upperName]) ? nazhi[upperName].outer : null;
  if (!inner || !outer) notes.push('缺少上下卦纳支数据（需 benGua.upper/lower 与 najia.nazhi）。');

  const rows = [];
  for (let i = 0; i < 6; i += 1) {
    const pos = i + 1;
    const zhi = inner && outer ? (i < 3 ? inner[i] : outer[i - 3]) : null;
    const title = titleOfYao(i, lines6[i]);
    const row = {
      pos,
      title,
      zhi: zhi || null,
      zhiWuXing: zhi ? zwx[zhi] : null,
      qin: me && zhi ? qinOf(me, zwx[zhi]) : null,
      shen: null,
      yue: null,
      shi: gong ? gongShiYing(gong).shi === pos : false,
      ying: gong ? gongShiYing(gong).ying === pos : false,
      dong: isMoving(pan, pos),
    };
    if (shenIdx >= 0) row.shen = shenOrder[(shenIdx + i) % shenOrder.length];
    if (yueX && zhi) row.yue = yueState(yueX, zwx[zhi]);
    // 旬空：爻支落在本日旬空支内（缺日柱 ⇒ xunKong=null ⇒ 一律 false，不猜）
    row.kong = !!(xunKong && zhi && xunKong.kong.includes(zhi));
    // 月破：爻支与月建相冲（缺月建 ⇒ 一律 false，不猜）
    row.po = !!(ctx.monthBranch && zhi && CHONG[ctx.monthBranch] === zhi);
    rows.push(row);
  }

  const moving = rows.filter((r) => r.dong);
  const yingqi = moving.map((r) => {
    const chong = r.zhi ? CHONG[r.zhi] : null;
    const day = ctx.dayBranch && r.zhi === ctx.dayBranch ? '（今日值日）' : ctx.dayBranch && chong === ctx.dayBranch ? '（今日逢冲）' : '';
    // 旬空/月破口径提示：只陈述状态与处理方向，不作“必应于某日”的绝对断言（契约 §2.3）
    const kongTag = r.kong ? '（旬空，待出空/填实）' : '';
    const poTag = r.po ? '（月破，力弱）' : '';
    return `动爻${r.title}${r.zhi ? `（${r.zhi}` + (r.zhiWuXing || '') + '）' : ''}逢${r.zhi || '?'}值日或${chong || '?'}冲日可作应期参考${day}${kongTag}${poTag}`;
  });

  return {
    gong: gong ? { name: gong.name, wuXing: me, level: gong.level, ...gongShiYing(gong) } : null,
    lines: rows,
    xunKong,
    yingqi,
    notes,
  };
}

function gongShiYing(gong) {
  return { shi: SHI[gong.levelIdx], ying: YING[gong.levelIdx] };
}

function isMoving(pan, pos) {
  return movingPositions(pan).includes(pos);
}
