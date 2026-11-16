// 纳甲装卦测试：node tests/run-najia-tests.js
// 覆盖：64 卦八宫归属与级别（对照通行八宫表）、乾宫世应、乾卦装卦明细（纳支/六亲/六神）、月令旺衰、应期简注、缺数据容错
// 阶段五（v5）增量：旬空（由日柱推，60 甲子穷举对拍 xunKong 表）、月破（爻支冲月建）、应期口径提示、缺 ctx 容错
import fs from 'node:fs';
import { gongOf, najiaReading } from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const tris = readJson('../data/trigrams.json').trigrams;
const hexs = readJson('../data/hexagrams.json').hexagrams;
const najiaData = readJson('../data/najia.json');
const tm = {};
tris.forEach((t) => { tm[t.name] = t; });

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}
function linesOf(order) {
  const h = hexs.find((e) => e.order === order);
  return [...tm[h.lower].lines, ...tm[h.upper].lines];
}
function panOf(order, dong = null) {
  const lines = linesOf(order);
  const h = hexs.find((e) => e.order === order);
  return {
    benGua: { order: h.order, name: h.name, upper: h.upper, lower: h.lower },
    lines,
    dongYao: dong,
    movingYao: dong ? [dong] : [],
  };
}

// ---- 0) 64 卦八宫归属与级别（对照通行八宫表） ----
const expected = {
  乾: [1, 44, 33, 12, 20, 23, 35, 14], 坤: [2, 24, 19, 11, 34, 43, 5, 8],
  震: [51, 16, 40, 32, 46, 48, 28, 17], 坎: [29, 60, 3, 63, 49, 55, 36, 7],
  艮: [52, 22, 26, 41, 38, 10, 61, 53], 巽: [57, 9, 37, 42, 25, 21, 27, 18],
  离: [30, 56, 50, 64, 4, 59, 6, 13], 兑: [58, 47, 45, 31, 39, 15, 62, 54],
};
for (const gong of Object.keys(expected)) {
  expected[gong].forEach((order, lv) => {
    const g = gongOf(linesOf(order), tris);
    check(g && g.name === gong && g.levelIdx === lv && g.level !== undefined, `八宫：order ${order} → ${gong}宫 第${lv}级`);
  });
}

// ---- 1) 乾宫世应 ----
const dryOrders = [1, 44, 33, 12, 20, 23, 35, 14];
const dryShiYing = [[6, 3], [1, 4], [2, 5], [3, 6], [4, 1], [5, 2], [4, 1], [3, 6]];
dryOrders.forEach((order, i) => {
  const r = najiaReading(panOf(order), tris, najiaData, {});
  check(r.gong.name === '乾' && r.gong.shi === dryShiYing[i][0] && r.gong.ying === dryShiYing[i][1],
    `乾宫世应：order ${order} 世${dryShiYing[i][0]}应${dryShiYing[i][1]}`);
});

// ---- 2) 乾为天装卦明细（对照通行装卦） ----
const rQian = najiaReading(panOf(1, 1), tris, najiaData, { dayStem: '甲', monthBranch: '寅', dayBranch: '子' });
check(rQian.gong.name === '乾' && rQian.gong.wuXing === '金' && rQian.gong.level === '本宫', '乾 → 乾宫金 本宫');
const qianRow = (i) => rQian.lines[i];
check(qianRow(0).zhi === '子' && qianRow(0).zhiWuXing === '水' && qianRow(0).qin === '子孙' && qianRow(0).dong && !qianRow(0).shi, '初爻 子水 子孙 动');
check(qianRow(1).zhi === '寅' && qianRow(1).qin === '妻财' && qianRow(1).yue === '旺', '二爻 寅木 妻财 旺');
check(qianRow(2).zhi === '辰' && qianRow(2).qin === '父母' && qianRow(2).ying && qianRow(2).yue === '死', '三爻 辰土 父母 应 死');
check(qianRow(3).qin === '官鬼' && qianRow(3).yue === '相', '四爻 午火 官鬼 相');
check(qianRow(4).zhi === '申' && qianRow(4).qin === '兄弟' && qianRow(4).yue === '囚', '五爻 申金 兄弟 囚');
check(qianRow(5).qin === '父母' && qianRow(5).shi && qianRow(5).yue === '死', '上爻 戌土 父母 世 死');
const shens = rQian.lines.map((x) => x.shen);
check(shens.join(',') === '青龙,朱雀,勾陈,螣蛇,白虎,玄武', '甲日起青龙 六神顺布');

// ---- 3) 月令旺衰缺省 / 应期 ----
const rNoCtx = najiaReading(panOf(1, 1), tris, najiaData, {});
check(rNoCtx.lines.every((x) => x.yue === null && x.shen === null), '无日干/月建 → 六神/旺衰空');
check(rNoCtx.notes.length >= 2, '缺日干/月建 → 有提示');
const rYq = najiaReading(panOf(1, 1), tris, najiaData, { dayBranch: '午' });
check(rYq.yingqi.length === 1 && rYq.yingqi[0].includes('午冲日') && rYq.yingqi[0].includes('今日逢冲'), '应期：动爻子水逢午冲日（今日冲）提示');

// ---- 4) 缺数据容错 ----
check(najiaReading(panOf(1), tris, null, {}) === null, '缺 najia 数据 → null');
check(najiaReading({ benGua: { upper: '乾', lower: '乾' }, lines: [1, 1, 1] }, tris, najiaData, {}) === null, '爻线不足六 → null');
const miss = najiaReading({ benGua: { order: 1, upper: '乾', lower: '乾' }, lines: linesOf(1) }, tris, najiaData, { dayStem: '戊' });
check(miss.lines[0].shen === '勾陈', '戊日起勾陈');

// ============================================================
// 旬空 + 月破
// 以上 86 项为回归锁，一项未改；以下全部为新增断言。
// ============================================================
const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 契约 §2.1 冻结口径：日干序 s、日支序 b ⇒ 空亡支 = (b−s+10)%12、(b−s+11)%12
const kongOf = (stem, branch) => {
  const s = GAN.indexOf(stem);
  const b = ZHI.indexOf(branch);
  return [ZHI[(b - s + 10) % 12], ZHI[(b - s + 11) % 12]];
};

// ---- 5) 六旬锚点（契约 §2.1 自校验，逐字硬编码，不引用被测实现） ----
const ANCHORS = [
  ['甲子', ['戌', '亥']], ['甲戌', ['申', '酉']], ['甲申', ['午', '未']],
  ['甲午', ['辰', '巳']], ['甲辰', ['寅', '卯']], ['甲寅', ['子', '丑']],
];
for (const [gz, want] of ANCHORS) {
  const [stem, branch] = [gz.slice(0, 1), gz.slice(1)];
  check(kongOf(stem, branch).join(',') === want.join(','), `旬空锚点：${gz}日 → ${want.join('')}`);
}
// 锚点同时校验数据表本身（表 = 单一真身）
for (const [gz, want] of ANCHORS) {
  const e = najiaData.xunKong.find((x) => x.xun === gz);
  check(e && e.kong.join(',') === want.join(','), `xunKong 表：${gz} → ${want.join('')}`);
}

// ---- 6) 60 甲子穷举：代码推算 与 xunKong 表 对拍（6 旬 × 10 日 = 60 条全覆盖） ----
// 合法日柱 = 干支同奇偶（60 个）；逐一验证推得的旬名与空亡支均与表一致。
let exhaustive = 0;
let exhaustiveBad = [];
for (let i = 0; i < 60; i += 1) {
  const s = i % 10;
  const b = i % 12;
  if ((b - s) % 2 !== 0) continue; // 阴阳不配，非合法日柱
  const stem = GAN[s];
  const branch = ZHI[b];
  const xun = `甲${ZHI[(b - s + 12) % 12]}`;
  const kong = kongOf(stem, branch);
  const row = najiaData.xunKong.find((x) => x.xun === xun);
  exhaustive += 1;
  if (!row || row.kong.join(',') !== kong.join(',')) {
    exhaustiveBad.push(`${stem}${branch}日 推得旬${xun}空${kong.join('')} vs 表${row ? row.kong.join('') : '(缺)'}`);
  }
}
check(exhaustive === 60, `60 甲子穷举：合法日柱覆盖 60 条（实得 ${exhaustive}）`);
check(exhaustiveBad.length === 0, `60 甲子穷举：表与代码逐条对拍一致（不一致 ${exhaustiveBad.length} 条）`);
if (exhaustiveBad.length) exhaustiveBad.forEach((m) => console.log('  ✗ ' + m));

// 60 甲子穷举（经 najiaReading 实跑）：不只测测试内的公式副本，逐一喂 ctx 验证**实现**输出与表一致。
// 这是"表 ↔ 实现"的真对拍：实现若漂移（如取模写错），此处必红。
let implBad = [];
for (let i = 0; i < 60; i += 1) {
  const s = i % 10;
  const b = i % 12;
  if ((b - s) % 2 !== 0) continue;
  const stem = GAN[s];
  const branch = ZHI[b];
  const r = najiaReading(panOf(1), tris, najiaData, { dayStem: stem, dayBranch: branch });
  const row = r.xunKong ? najiaData.xunKong.find((x) => x.xun === r.xunKong.xun) : null;
  const want = row ? row.kong.join(',') : null;
  if (!r.xunKong || r.xunKong.kong.join(',') !== want) {
    implBad.push(`${stem}${branch}日 → 实现得 ${r.xunKong ? r.xunKong.xun + ':' + r.xunKong.kong.join('') : 'null'} vs 表 ${want}`);
  }
}
check(implBad.length === 0, `60 甲子穷举（经 najiaReading 实跑）：实现与表逐日一致（不一致 ${implBad.length} 条）`);
if (implBad.length) implBad.forEach((m) => console.log('  ✗ ' + m));

// 表结构自洽：恰好 6 旬、每旬 2 空支、旬名互异、空支两两不重叠且合计覆盖 12 支
check(Array.isArray(najiaData.xunKong) && najiaData.xunKong.length === 6, 'xunKong 表：恰 6 旬');
check(najiaData.xunKong.every((e) => Array.isArray(e.kong) && e.kong.length === 2), 'xunKong 表：每旬 2 个空亡支');
const allKong = najiaData.xunKong.flatMap((e) => e.kong);
check(new Set(najiaData.xunKong.map((e) => e.xun)).size === 6, 'xunKong 表：旬名互异');
check(new Set(allKong).size === 12 && allKong.length === 12, 'xunKong 表：六旬空支合计恰好覆盖 12 地支不重不漏');
check(najiaData.xunKong.every((e) => e.kong.every((z) => ZHI.includes(z))), 'xunKong 表：空亡支均为合法地支');

// ---- 7) 顶层 xunKong 输出（经 najiaReading 实跑，乾为天盘） ----
// 乾为天纳支：初子 二寅 三辰 四午 五申 上戌
const rJiaZi = najiaReading(panOf(1, 1), tris, najiaData, { dayStem: '甲', dayBranch: '子', monthBranch: '寅' });
check(rJiaZi.xunKong && rJiaZi.xunKong.xun === '甲子' && rJiaZi.xunKong.kong.join('') === '戌亥',
  'xunKong 顶层：甲子日 → 甲子旬 空戌亥');
check(rJiaZi.lines.find((x) => x.zhi === '戌').kong === true, '旬空：甲子日 上爻戌土 → kong=true');
check(rJiaZi.lines.find((x) => x.zhi === '亥') === undefined, '乾卦无亥爻（对照：空支仅戌在卦中）');
check(rJiaZi.lines.filter((x) => x.kong).length === 1, '旬空：甲子日乾卦仅戌爻空（亥不在卦中）');

// 六个锚点日逐一过 najiaReading（不只测纯函数）：甲戌日空申酉 → 乾卦五爻申金空
const anchorRuns = [
  ['甲子', '戌', '甲子'], ['甲戌', '申', '甲戌'], ['甲申', '午', '甲申'],
  ['甲午', '辰', '甲午'], ['甲辰', '寅', '甲辰'], ['甲寅', '子', '甲寅'],
];
for (const [gz, kongZhiInQian, wantXun] of anchorRuns) {
  const r = najiaReading(panOf(1), tris, najiaData, { dayStem: gz.slice(0, 1), dayBranch: gz.slice(1) });
  check(r.xunKong && r.xunKong.xun === wantXun, `锚点实跑：${gz}日 → 旬${wantXun}`);
  check(r.lines.find((x) => x.zhi === kongZhiInQian).kong === true,
    `锚点实跑：${gz}日 乾卦${kongZhiInQian}爻 → kong=true`);
}

// ---- 8) 月破：爻支与月建相冲 ----
// 乾卦纳支 子寅辰午申戌；月建取"午" ⇒ 冲子 ⇒ 仅初爻子水破
const rPo = najiaReading(panOf(1), tris, najiaData, { monthBranch: '午' });
check(rPo.lines[0].po === true && rPo.lines[0].zhi === '子', '月破：月建午 → 初爻子水 po=true');
check(rPo.lines.filter((x) => x.po).length === 1, '月破：月建午 乾卦仅子爻破（冲表唯一）');
check(rPo.lines.slice(1).every((x) => x.po === false), '月破：其余五爻 po=false');

// 月建"寅" ⇒ 冲申 ⇒ 五爻申金破
const rPo2 = najiaReading(panOf(1), tris, najiaData, { monthBranch: '寅' });
check(rPo2.lines.find((x) => x.zhi === '申').po === true, '月破：月建寅 → 五爻申金 po=true');
check(rPo2.lines.find((x) => x.zhi === '申').pos === 5, '月破：申爻位为五爻');
check(rPo2.lines.filter((x) => x.po).length === 1, '月破：月建寅 乾卦仅申爻破');

// 月破穷举：12 个月建 × 乾卦 6 爻，破的爻恰为"冲月建之支"，且至多 1 爻
const CHONG_REF = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };
let poBad = 0;
for (const yue of ZHI) {
  const r = najiaReading(panOf(1), tris, najiaData, { monthBranch: yue });
  for (const row of r.lines) {
    const want = row.zhi === CHONG_REF[yue];
    if (row.po !== want) poBad += 1;
  }
}
check(poBad === 0, `月破穷举：12 月建 × 6 爻逐爻判定正确（错 ${poBad} 处）`);

// ---- 9) 缺 ctx 容错（不猜：null / false + notes） ----
const rNoCtxV5 = najiaReading(panOf(1, 1), tris, najiaData, {});
check(rNoCtxV5 !== null && typeof rNoCtxV5 === 'object', '缺 ctx：najiaReading 不崩、返回对象');
check(rNoCtxV5.xunKong === null, '缺 ctx：xunKong === null');
check(rNoCtxV5.lines.every((x) => x.kong === false), '缺 ctx：所有爻 kong === false（不猜）');
check(rNoCtxV5.lines.every((x) => x.po === false), '缺 ctx：所有爻 po === false（不猜）');
check(rNoCtxV5.notes.some((n) => n.includes('旬空')), '缺 ctx：notes 有旬空说明');
check(rNoCtxV5.notes.some((n) => n.includes('月建')), '缺 ctx：notes 有月建说明');

// 只缺日支 ⇒ xunKong 仍为 null（旬需日干+日支齐备）
const rOnlyStem = najiaReading(panOf(1), tris, najiaData, { dayStem: '甲' });
check(rOnlyStem.xunKong === null, '只给日干缺日支 → xunKong=null');
check(rOnlyStem.notes.some((n) => n.includes('日支')), '只给日干缺日支 → notes 指明缺日支');
// 只缺月建 ⇒ po 全 false，但 kong 仍可算
const rOnlyDay = najiaReading(panOf(1), tris, najiaData, { dayStem: '甲', dayBranch: '子' });
check(rOnlyDay.xunKong && rOnlyDay.xunKong.kong.join('') === '戌亥', '缺月建不影响旬空：甲子日仍空戌亥');
check(rOnlyDay.lines.every((x) => x.po === false), '缺月建 → po 全 false');
// 非法日干/日支 ⇒ null（不猜）
check(najiaReading(panOf(1), tris, najiaData, { dayStem: 'X', dayBranch: '子' }).xunKong === null, '非法日干 → xunKong=null');
check(najiaReading(panOf(1), tris, najiaData, { dayStem: '甲', dayBranch: 'Y' }).xunKong === null, '非法日支 → xunKong=null');

// 旧数据兼容：najia.json 尚无 xunKong 键时，旬空仍按日柱推算（不崩），并如实说明未对拍
const legacyNajia = { ...najiaData };
delete legacyNajia.xunKong;
const rLegacy = najiaReading(panOf(1), tris, legacyNajia, { dayStem: '甲', dayBranch: '子' });
check(rLegacy !== null && rLegacy.xunKong && rLegacy.xunKong.kong.join('') === '戌亥', '旧数据无 xunKong 键：仍按日柱推出 甲子日空戌亥');
check(rLegacy.lines.filter((x) => x.kong).map((x) => x.zhi).join('') === '戌', '旧数据无 xunKong 键：kong 判定仍生效');
check(rLegacy.notes.some((n) => n.includes('缺旬空表')), '旧数据无 xunKong 键：notes 说明未与表对拍（不谎称已对拍）');

// ---- 10) 应期口径提示（只在有依据时追加，不作绝对断言） ----
// 甲子日 + 月建午：初爻子水 动 → 旬空？子不在戌亥 → 不空；月破？午冲子 → 破
const rYqPo = najiaReading(panOf(1, 1), tris, najiaData, { dayStem: '甲', dayBranch: '子', monthBranch: '午' });
check(rYqPo.lines[0].po === true && rYqPo.lines[0].kong === false, '应期：初爻子水 月破非旬空');
check(rYqPo.yingqi.length === 1 && rYqPo.yingqi[0].includes('（月破，力弱）'), '应期：动爻月破 → 追加「（月破，力弱）」');
check(!rYqPo.yingqi[0].includes('旬空'), '应期：非旬空 → 不追加旬空提示');

// 动爻旬空：取乾卦上爻戌动（甲子日空戌亥 ⇒ 戌空）
const rYqKong = najiaReading(panOf(1, 6), tris, najiaData, { dayStem: '甲', dayBranch: '子' });
const rowXu = rYqKong.lines[5];
check(rowXu.zhi === '戌' && rowXu.kong === true && rowXu.dong === true, '应期：上爻戌土 动 且旬空');
check(rYqKong.yingqi.length === 1 && rYqKong.yingqi[0].includes('（旬空，待出空/填实）'), '应期：动爻旬空 → 追加「（旬空，待出空/填实）」');

// 空破俱有：上爻戌动、月建辰（辰冲戌）+ 甲子日（空戌亥）⇒ 旬空与月破同时成立，两条并列
const rBoth = najiaReading(panOf(1, 6), tris, najiaData, { dayStem: '甲', dayBranch: '子', monthBranch: '辰' });
const rowBoth = rBoth.lines[5];
check(rowBoth.kong === true && rowBoth.po === true, '空破俱有：上爻戌 既旬空又月破');
check(rBoth.yingqi[0].includes('（旬空，待出空/填实）') && rBoth.yingqi[0].includes('（月破，力弱）'),
  '空破俱有：两条提示并列，不合并、不互相抵消');
check(rBoth.yingqi[0].indexOf('旬空') < rBoth.yingqi[0].indexOf('月破'), '空破俱有：旬空提示在前、月破在后（顺序固定）');

// 无依据不追加：动爻既不空也不破 ⇒ 句尾无提示
const rPlain = najiaReading(panOf(1, 1), tris, najiaData, { dayStem: '甲', dayBranch: '子', monthBranch: '寅' });
check(!rPlain.yingqi[0].includes('旬空') && !rPlain.yingqi[0].includes('月破'), '应期：无空无破 → 不追加任何提示');
// 契约红线：不得出现"必应于某日"之类绝对断言
check(!rPlain.yingqi[0].includes('必应') && !rBoth.yingqi[0].includes('必应'), '应期：不含「必应」绝对断言');

// 静卦：yingqi 为空数组，不因新增提示逻辑而产出
const rStatic = najiaReading(panOf(1), tris, najiaData, { dayStem: '甲', dayBranch: '子', monthBranch: '午' });
check(Array.isArray(rStatic.yingqi) && rStatic.yingqi.length === 0, '静卦：无动爻 → yingqi 空数组（旬空/月破不产出应期行）');

// ---- 11) 每爻字段形状契约（供 liuyao reader 消费） ----
check(rJiaZi.lines.every((x) => typeof x.kong === 'boolean'), '形状：每爻 kong 恒为 boolean（无 null/undefined）');
check(rJiaZi.lines.every((x) => typeof x.po === 'boolean'), '形状：每爻 po 恒为 boolean（无 null/undefined）');
check(rNoCtxV5.lines.every((x) => typeof x.kong === 'boolean' && typeof x.po === 'boolean'),
  '形状：缺 ctx 时 kong/po 仍为 boolean（false，非 null）');
check(rJiaZi.xunKong && typeof rJiaZi.xunKong.xun === 'string' && Array.isArray(rJiaZi.xunKong.kong)
  && rJiaZi.xunKong.kong.length === 2, '形状：xunKong = { xun: string, kong: [支,支] }');
check(rJiaZi.lines.every((x) => 'kong' in x && 'po' in x), '形状：kong/po 键恒存在（不只是有值时才有）');
// 既有字段一项未改（回归锁的字段级复核）
const v5RowKeys = Object.keys(rJiaZi.lines[0]).sort().join(',');
check(['pos', 'title', 'zhi', 'zhiWuXing', 'qin', 'shen', 'yue', 'shi', 'ying', 'dong'].every((k) => k in rJiaZi.lines[0]),
  `形状：既有 10 个行字段全部保留（实得 ${v5RowKeys}）`);

console.log(`纳甲测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('NAJIA TESTS PASSED');
