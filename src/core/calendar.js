// 历法换算适配层（纯函数，无 DOM、无 node 依赖，浏览器/Node 通用）
// 职责：公历 → 农历/干支（年支=立春换年、月干支=节令）、时辰/24 小时互转、五鼠遁定时干、子时日界
// 农历/节气核心算法来自第三方 ISC 许可库（src/third_party/solarlunar/，署名见该目录 LICENSE），此处只做口径封装。
// 时辰字典常量 = 唯一事实源；data/ganzhi-dict.json 与其同构（tests 对拍防漂移），供展示层引用。

import sl from '../third_party/solarlunar/solarlunar.esm.js';

export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 时辰字典（对应 data/ganzhi-dict.json）
export const ZHI_DETAIL = [
  { index: 1,  zhi: '子', animal: '鼠', shichen: '子时', five: '水', hourText: '23:00–00:59', hourHours: [23, 0] },
  { index: 2,  zhi: '丑', animal: '牛', shichen: '丑时', five: '土', hourText: '01:00–02:59', hourHours: [1] },
  { index: 3,  zhi: '寅', animal: '虎', shichen: '寅时', five: '木', hourText: '03:00–04:59', hourHours: [3] },
  { index: 4,  zhi: '卯', animal: '兔', shichen: '卯时', five: '木', hourText: '05:00–06:59', hourHours: [5] },
  { index: 5,  zhi: '辰', animal: '龙', shichen: '辰时', five: '土', hourText: '07:00–08:59', hourHours: [7] },
  { index: 6,  zhi: '巳', animal: '蛇', shichen: '巳时', five: '火', hourText: '09:00–10:59', hourHours: [9] },
  { index: 7,  zhi: '午', animal: '马', shichen: '午时', five: '火', hourText: '11:00–12:59', hourHours: [11] },
  { index: 8,  zhi: '未', animal: '羊', shichen: '未时', five: '土', hourText: '13:00–14:59', hourHours: [13] },
  { index: 9,  zhi: '申', animal: '猴', shichen: '申时', five: '金', hourText: '15:00–16:59', hourHours: [15] },
  { index: 10, zhi: '酉', animal: '鸡', shichen: '酉时', five: '金', hourText: '17:00–18:59', hourHours: [17] },
  { index: 11, zhi: '戌', animal: '狗', shichen: '戌时', five: '土', hourText: '19:00–20:59', hourHours: [19] },
  { index: 12, zhi: '亥', animal: '猪', shichen: '亥时', five: '水', hourText: '21:00–22:59', hourHours: [21] },
];

export const zhiByIndex = (i) => ZHI_DETAIL.find((z) => z.index === i) || null;

// 由 24 小时(分钟)求时辰；日界约定：23:00 起算次日子时（晚子归次日 → nextDay=true）
export function branchFromClock(hour, minute = 0) {
  const h = Math.trunc(hour);
  if (h < 0 || h > 23) throw new Error(`小时越界: ${hour}`);
  const t = h * 60 + (minute | 0);
  let index;
  if (t >= 23 * 60) index = 1; // 23:00–23:59 晚子
  else if (t < 60) index = 1; // 00:00–00:59 早子
  else index = 2 + Math.floor((t - 60) / 120); // 01:00 起依次 丑→亥
  const z = zhiByIndex(index);
  return { ...z, nextDay: t >= 23 * 60 };
}

export const branchFromHour = (hour) => branchFromClock(hour, 0);

// 公历日期 → 农历要素（不含时辰；不跨日）
function solarDateToLunar(year, month, day) {
  const r = sl.solar2lunar(year, month, day);
  return {
    lunarYear: r.lYear,
    lunarMonth: r.lMonth,
    lunarDay: r.lDay,
    isLeap: r.isLeap,
    gzYear: r.gzYear,
    gzMonth: r.gzMonth,
    gzDay: r.gzDay,
  };
}

function gzYearBranchIndex(gzYear) {
  return ZHI.indexOf(gzYear.slice(1)) + 1; // 立春换年（gzYear 与库一致）
}

// 路径一：公历 + 24 小时制（精确；23:00 后自动按次日顺延，含农历日/干支）
export function solarClockToCast(year, month, day, hour, minute = 0) {
  const b = branchFromClock(hour, minute);
  const d = new Date(year, month - 1, day);
  if (b.nextDay) d.setDate(d.getDate() + 1);
  const r = solarDateToLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const warnings = [];
  if (b.nextDay) warnings.push('23:00–23:59 晚子时：已按次日（农历日/干支顺延一日）处理');
  if (r.isLeap) warnings.push(`该日属农历闰${r.lunarMonth}月，起卦按当月月数处理（可配置）`);
  return {
    solarYear: d.getFullYear(),
    solarMonth: d.getMonth() + 1,
    solarDay: d.getDate(),
    hour,
    minute,
    hourBranch: b,
    lunarYear: r.lunarYear,
    lunarMonth: r.lunarMonth,
    lunarDay: r.lunarDay,
    isLeap: r.isLeap,
    gzYear: r.gzYear,
    gzMonth: r.gzMonth,
    gzDay: r.gzDay,
    gzYearBranchIndex: gzYearBranchIndex(r.gzYear),
    warnings,
  };
}

// 路径二：公历 + 直接选时辰（不跨日；跨日与否由选"子时"者自行把握，见提示）
export function solarBranchToCast(year, month, day, branchIndex) {
  const z = zhiByIndex(branchIndex);
  if (!z) throw new Error(`时辰序数越界: ${branchIndex}`);
  const r = solarDateToLunar(year, month, day);
  const warnings = [];
  if (r.isLeap) warnings.push(`该日属农历闰${r.lunarMonth}月，起卦按当月月数处理（可配置）`);
  if (branchIndex === 1) warnings.push('所选为子时：若指 23 点后的晚子时，请改用 24 小时制输入以自动跨日');
  return {
    solarYear: year,
    solarMonth: month,
    solarDay: day,
    hourBranch: z,
    lunarYear: r.lunarYear,
    lunarMonth: r.lunarMonth,
    lunarDay: r.lunarDay,
    isLeap: r.isLeap,
    gzYear: r.gzYear,
    gzMonth: r.gzMonth,
    gzDay: r.gzDay,
    gzYearBranchIndex: gzYearBranchIndex(r.gzYear),
    warnings,
  };
}

// 五鼠遁：日干序数(0..9)与时辰地支序数(1..12) → 时干序数
export function hourStemIndex(dayGanIndex, hourBranchIndex) {
  const ziGan = (dayGanIndex % 5) * 2;
  return (ziGan + hourBranchIndex - 1) % 10;
}

export function hourGanZhi(gzDay, hourBranchIndex) {
  const dayGanIndex = GAN.indexOf(gzDay.slice(0, 1));
  return GAN[hourStemIndex(dayGanIndex, hourBranchIndex)] + ZHI[hourBranchIndex - 1];
}

export function zhiLabel(z) {
  return `${z.shichen}（${z.animal}）${z.hourText}`;
}

export default {
  GAN,
  ZHI,
  ZHI_DETAIL,
  zhiByIndex,
  branchFromClock,
  branchFromHour,
  solarClockToCast,
  solarBranchToCast,
  hourStemIndex,
  hourGanZhi,
  zhiLabel,
};
