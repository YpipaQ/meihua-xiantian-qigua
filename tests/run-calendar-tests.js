// 历法换算锚点测试：node tests/run-calendar-tests.js
// 覆盖：时辰/24h 换算（含 23:00 晚子跨日）、公历→农历/干支（立春换年）、五鼠遁、字典对拍
import fs from 'node:fs';
import {
  branchFromClock,
  solarClockToCast,
  solarBranchToCast,
  hourGanZhi,
  ZHI_DETAIL,
} from '../src/core/index.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(msg);
  }
}

// ---- 时辰 ↔ 24 小时 ----
const clockCases = [
  [0, 30, 1, false], [1, 0, 2, false], [7, 30, 5, false], [10, 0, 6, false],
  [12, 0, 7, false], [15, 30, 9, false], [21, 0, 12, false], [22, 59, 12, false],
  [23, 0, 1, true], [23, 59, 1, true],
];
for (const [h, m, idx, next] of clockCases) {
  const b = branchFromClock(h, m);
  check(b.index === idx && b.nextDay === next, `时辰换算 ${h}:${String(m).padStart(2, '0')} → 应${idx}${next ? '(次日)' : ''}，实得${b.index}${b.nextDay ? '(次日)' : ''}`);
}

// ---- 字典对拍（data/ganzhi-dict.json 与模块常量同构防漂移）----
{
  const dict = JSON.parse(fs.readFileSync(new URL('../data/ganzhi-dict.json', import.meta.url), 'utf8'));
  check(dict.zhi.length === ZHI_DETAIL.length && dict.zhi.length === 12, '字典条数=12');
  let same = true;
  for (let i = 0; i < dict.zhi.length; i += 1) {
    const a = dict.zhi[i];
    const b = ZHI_DETAIL[i];
    if (a.index !== b.index || a.zhi !== b.zhi || a.animal !== b.animal || a.five !== b.five || a.hourText !== b.hourText) same = false;
  }
  check(same, 'data/ganzhi-dict.json 与 calendar.js 常量一致');
}

// ---- 公历 → 农历 / 干支（立春换年）----
{
  const a = solarClockToCast(2024, 2, 10, 12, 0); // 甲辰年正月初一
  check(a.gzYear === '甲辰' && a.gzYearBranchIndex === 5, `2024-02-10 干支年=${a.gzYear}(支序${a.gzYearBranchIndex}) 应甲辰/5`);
  check(a.lunarMonth === 1 && a.lunarDay === 1, `2024-02-10 农历应正月初一，实得${a.lunarMonth}月${a.lunarDay}日`);
  check(a.gzDay === '甲辰', `2024-02-10 日干支应甲辰，实得${a.gzDay}`);
}
{
  const b1 = solarClockToCast(2024, 2, 3, 12, 0);
  const b2 = solarClockToCast(2024, 2, 4, 12, 0);
  check(b1.gzYear === '癸卯' && b1.gzYearBranchIndex === 4, `2024-02-03 立春前应癸卯(支4)，实得${b1.gzYear}/${b1.gzYearBranchIndex}`);
  check(b2.gzYear === '甲辰' && b2.gzYearBranchIndex === 5, `2024-02-04 立春起应甲辰(支5)，实得${b2.gzYear}/${b2.gzYearBranchIndex}`);
}
{
  const c = solarClockToCast(2024, 2, 3, 23, 30); // 晚子时跨日 → 2/4
  check(c.lunarDay === 25 && c.gzYearBranchIndex === 5 && c.hourBranch.index === 1 && c.hourBranch.nextDay === true,
    `2024-02-03 23:30 晚子应跨日为 2/4（腊月廿五、辰年、子时），实得${c.solarMonth}/${c.solarDay} 腊月${c.lunarDay} 支${c.gzYearBranchIndex}`);
  check(c.warnings.some((w) => w.includes('晚子时')), '晚子时应有跨日提示');
}
{
  const d = solarClockToCast(1949, 10, 1, 10, 0); // 巳时
  check(d.gzYear === '己丑' && d.gzDay === '甲子' && d.lunarMonth === 8 && d.lunarDay === 10,
    `1949-10-01 应 己丑年/八月初十/甲子日，实得 ${d.gzYear}/${d.lunarMonth}月${d.lunarDay}日/${d.gzDay}`);
}
// ---- 时辰选择路径（不跨日）----
{
  const e = solarBranchToCast(2024, 2, 10, 5); // 辰时
  check(e.gzYearBranchIndex === 5 && e.lunarMonth === 1 && e.lunarDay === 1 && e.hourBranch.index === 5,
    `公历+时辰：2024-02-10 辰时应支5/初一/辰，实得支${e.gzYearBranchIndex}/${e.lunarMonth}月${e.lunarDay}日/时${e.hourBranch.index}`);
}
// ---- 五鼠遁 ----
check(hourGanZhi('甲辰', 1) === '甲子', '甲日子时 → 甲子');
check(hourGanZhi('甲辰', 5) === '戊辰', '甲日辰时 → 戊辰（甲己起甲子顺推）');
check(hourGanZhi('戊午', 1) === '壬子', '戊日子时 → 壬子（戊癸起壬子）');

console.log(`\n历法锚点测试：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('CALENDAR TESTS PASSED');
