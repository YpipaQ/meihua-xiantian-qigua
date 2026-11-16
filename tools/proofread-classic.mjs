// 经文交叉校验生成器：data/zhouyi-classic.json（源 A，被校对对象）↔ 四个参照源
// 说明：schema v5-proofread-1 / 比对口径 / 幂等性见本文件内注释。
//
// 输入（**全部只读，一个字节都不写**）：
//   data/zhouyi-classic.json                      源 A 项目现行本（被校对对象）
//   data/ref-corpus/{index.json,NN-卦名.json}    源 B 参考汇编语料（弱参照：B 是 A 的来源之一，不计独立性）
//   data/proofread-sources/sunls2-extract.json     源 C GitHub 电子本（繁体，卦辞 + 爻辞）
//   data/proofread-sources/wuyingdian-lines.json   源 D 武英殿刊本（**无卦辞**，384 爻 + 用九/用六）
//   data/proofread-sources/y5000-extract.json      源 E 5000言（仅爻辞，缺 4 条）
// 输出（只写这一个文件）：
//   data/zhouyi-proofread.json   meta / crosschecked / disputed / sources；`checked` 原样保留
//
// 铁律（契约 §1.1 / §6）：
//   - `checked` 是**人工**结论，生成器**绝不写入**（读入后原样回写）；
//   - `crosschecked` 整份重算；`disputed` 留档不隐藏；**绝不自动改经文**；
//   - 机器结论不得冒充人工结论。
//
// 幂等：无 Date.now / 无随机 / 键序固定 / 数组按卦序与爻序 → 重跑逐字节一致。
// CLI：npm run proofread:classic   （= node tools/proofread-classic.mjs）

import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, isMainModule } from '../src/platform.mjs';

// ★ 跨平台：不用 .pathname（Windows 下得到 /C:/... 会解析错）
const ROOT = projectRoot(import.meta.url, 2); // up=2：从 tools/ 或 tests/ 上溯到项目根
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const OUT_FILE = 'data/zhouyi-proofread.json';
const UPDATED_AT = '2026-10-22'; // 固定日期（不含时间），保证重跑逐字节幂等

// ---------------------------------------------------------------------------
// 一、最小繁简差异表（零依赖，不引 npm / 不调 python）
//
// 只覆盖「实际出现在 A/B/C/D/E 五源文本里」的差异字（235 条），由
//   ① 五源全字符集与 A 的差集  ② 逐条等长比对的分歧字  两次实测筛出。
// 三个语境依赖坑（实测，勿改）：
//   - `乾` 有 qián（卦名）/ gān（乾乾、噬乾胏）两读：**比对侧一律 乾→干**。
//     若不转，21 噬嗑 九四/六五 会因 C/D 写「噬乾胏」而 A 写「噬干胏」变成假分歧；
//     若只按"卦名不动"处理，同样会漏。归一仅用于**比对**，展示文本一律用原文。
//   - `覆`、`薰` **不入表**：`反覆→反复` 与 `復→复` 语义不同，强行归一造错（实测）。
//     二者按真异文参与比对。
// 表结构：每两字一对「繁体+简体」，逐字扫描替换（一次遍历，不做链式替换，避免 乾→干→? 之类串扰）。
// ---------------------------------------------------------------------------
const T2S_PAIRS = [
  '並并乾干亂乱來来係系傾倾僕仆儀仪億亿兌兑內内則则剝剥動动勝胜勞劳匯汇厲厉叢丛問问',
  '啞哑喪丧國国園园執执堅坚塗涂壯壮婦妇宮宫實实寧宁寵宠屍尸屨屦帥帅師师帶带幹干幾几',
  '廟庙廬庐張张後后從从復复徵征恆恒惡恶惻恻慍愠慶庆憂忧懷怀戔戋戰战戶户揚扬損损撝㧑',
  '擊击據据攣挛敗败敵敌於于時时晉晋晝昼朶朵東东棄弃棟栋楊杨橈桡機机歲岁歸归殺杀決决',
  '淵渊渙涣滅灭漣涟漸渐潛潜濟济瀆渎灑洒災灾為为無无爲为爾尔牀床牽牵獄狱獨独獲获瑣琐',
  '甕瓮疇畴發发盤盘眾众碩硕禦御穫获窺窥節节約约納纳紛纷紱绂終终經经維维繫系繻𦈡纆𬙊',
  '罷罢羣群習习聞闻膚肤臘腊臨临與与興兴舊旧艱艰茲兹莧苋華华薦荐藥药蘇苏處处虛虚號号',
  '虧亏蠱蛊衆众衛卫見见視视覿觌觀观觸触訟讼誡诫說说謂谓謙谦譽誉變变豐丰豶豮貝贝貞贞',
  '負负貫贯貳贰賁贲資资賓宾賞赏躋跻躍跃車车載载輔辅輪轮輻辐輿舆連连進进過过違违遠远',
  '遯遁遲迟遷迁遺遗鄰邻醜丑鉉铉錫锡錯错鏇旋長长門门開开閑闲閒闲闃阒闚窥陰阴陸陆階阶',
  '隕陨隨随險险雖虽離离雲云靈灵鞏巩頂顶須须頤颐頰颊頻频顒颙顛颠顯显飛飞飲饮餗𫗧饋馈',
  '馬马馮冯驅驱驚惊魚鱼鮒鲋鳥鸟鳴鸣鴻鸿鶴鹤鹹咸黃黄齎赍龍龙龜龟',
].join('');

// ⚠️ 必须按**码点**切分，不能用字符串下标：表内含增补平面字（𦈡/𬙊/𫗧/㧑，UTF-16 代理对），
//    按下标切会整体错位，把「馬→马」错配成「馬→饋」，制造大量假分歧（实测踩过）。
const T2S = new Map();
{
  const cp = Array.from(T2S_PAIRS);
  if (cp.length % 2 !== 0) throw new Error(`繁简表长度必须为偶数（当前 ${cp.length} 个码点）`);
  for (let i = 0; i < cp.length; i += 2) T2S.set(cp[i], cp[i + 1]);
}

const isHan = (ch) => /\p{Script=Han}/u.test(ch);

// 繁 → 简（只查表；表外字原样返回，不做猜测性转换）
function toSimp(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) out += T2S.get(ch) || ch;
  return out;
}

// ---------------------------------------------------------------------------
// 二、归一化（契约 §1.2 第 1–3 条）
//
// ① 标点剥离：契约列举 `，。、；：？！「」『』（）《》…—·．` + 空白 + \ufeff。
//    实测补充：源 C/E 还夹 ASCII 标点（`;` `?` `"` `'` 与 `,` `.` `:` `!` `(` `)`）及弯引号
//    （如 C 1 九三「夕惕若;厲」）。若只剥契约列出的字，这类行会 100% 假分歧 ⇒ 一并剥除。
//    这是「同一条口径下的标点集合补全」，不放宽任何实质比对。
// ② 爻题剥离：**只许枚举正则**。历史事故（历史事故，记于此）：
//    字符类 /[初六九二三四五上用]+/ 会把正文首字一起吞（「六三。三人行」→「人行」），
//    曾致 64/64 卦辞假异文。故此处用枚举 + 可选分隔符，且只在串首匹配。
// ---------------------------------------------------------------------------
const PUNCT = /[\s\ufeff，。、；：？！「」『』（）《》…—·．,.;:?!"'“”‘’()\[\]【】〔〕〈〉]/g;
const YAO_TITLE = /^(初[六九]|[六九][二三四五]|上[六九]|用[六九])[。.、]?/;

const stripPunct = (s) => String(s == null ? '' : s).replace(PUNCT, '');
const stripYaoTitle = (s) => String(s == null ? '' : s).replace(YAO_TITLE, '');

// 比对用归一：剥爻题 → 繁转简 → 剥标点（顺序无关，因三步互不产生/吞掉他类字符）
const normForCompare = (s) => stripPunct(toSimp(stripYaoTitle(s)));

// 展示用原文：剥爻题 + 剥爻题后残留的分隔符（保留正文标点与繁体原样）
// —— disputed 里给人看的必须是**原文**，不能是归一后的文本（契约要求可追溯）
// 注意：D 源行格式为「九二：困于酒食…」，爻题后是全角冒号，而 YAO_TITLE 只吃 [。.、]，
//       故须再剥一次行首分隔符，否则留档里会出现 "：困于酒食…" 这样的前导冒号（显示瑕疵）。
const LEAD_SEP = /^[：:。.、，,；;·\s]+/;
const rawBody = (s) => stripYaoTitle(String(s == null ? '' : s)).replace(LEAD_SEP, '').trim();

// ---------------------------------------------------------------------------
// 三、载入五源（只读）
// ---------------------------------------------------------------------------
function loadSources() {
  const A = readJson('data/zhouyi-classic.json');
  const C = readJson('data/proofread-sources/sunls2-extract.json');
  const D = readJson('data/proofread-sources/wuyingdian-lines.json');
  const E = readJson('data/proofread-sources/y5000-extract.json');
  const Bidx = readJson('data/ref-corpus/index.json');

  const B = new Map();
  for (const it of Bidx) {
    B.set(it.order, readJson('data/ref-corpus/' + it.file));
  }
  return { A, C, D, E, B, Bidx };
}

// 源 B 卦辞形如「乾。元，亨，利，贞。」：按**卦名精确**剥前缀
// （历史事故：按 h.text !== cl.guaci 判会 64/64 全误判）
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function stripBNamePrefix(text, name) {
  const re = new RegExp('^' + escapeRe(name) + '[。：.]?');
  return String(text == null ? '' : text).replace(re, '');
}

// ---------------------------------------------------------------------------
// 四、源 B 对齐口径（★ 铁律：按**位次**对齐，绝不按 wei 字符串匹配）
//
// B 是**按位置**的六爻语料（yaos[0..5] 自下而上，与 A 的 yaoCi[0..] 一一对应）。
// 其 `wei` 字段存在已登记的错标：
//   D1  19 临 位3  wei=九三（实为六三，正文亦自带「六三。」）
//   D2  27 颐 位2  wei=九二（实为六二）
//   D3  36 明夷 位6 wei=六五 重复（实为上六）
//
// 为什么必须按位次：若写 `B.yaos.find(x => x.wei === y.ref)`，
//   ① 19 临 六三 会因 wei 误标九三而**静默取不到票**（B 里根本没有 wei=六三 的条目）
//      ⇒ 该条异议源只剩 C 一个，够不上「≥2 异议源」⇒ 漏判 disputed；
//   ② 36 明夷 上六 会因 wei 重复而取到错误的邻位。
// 这正是 v4 阶段的同一根因：`xiangjie` reader 当年就因为用 wei 匹配而静默丢文，
// 后来改成按 pos 对齐（见 src/core/xiangjie.js 第 58–61 行：
// 「动爻：统一经 pan-view 取位（升序，1..6），再按 pos 对齐语料 yaos（不用 wei 匹配）」）。
// ⚠️ 以后**不要**把这处"优化"成 wei 匹配，会重犯 D1/D2/D3。
//
// 错标不作为异文（那是语料元数据缺陷，不是经文文本差异），但要**打印诊断**，不隐藏。
function bYaoAt(bEntry, index) {
  const yaos = bEntry && Array.isArray(bEntry.yaos) ? bEntry.yaos : [];
  return yaos[index] || null;
}

// 诊断：B 的正文爻题 vs wei vs A.ref 三方差（容错不抛错，只报告）
function bMetaAnomalies(A, B) {
  const out = [];
  for (const e of A.hexagrams) {
    const b = B.get(e.order);
    if (!b) continue;
    (b.yaos || []).forEach((y, i) => {
      const titleFromText = (String(y.text || '').match(YAO_TITLE) || [null])[0];
      const title = titleFromText ? titleFromText.replace(/[。.、]$/, '') : null;
      const aRef = e.yaoCi[i] ? e.yaoCi[i].ref : null;
      if (title !== aRef || y.wei !== aRef) {
        out.push({ order: e.order, index: i, wei: y.wei, textTitle: title, aRef });
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 五、三重自洽校验（契约 §0 Q1「可达公开源交叉比对 + 三重自洽校验」的第三条腿）
//   ① 卦符 = U+4DC0 + order − 1
//   ② 爻题阴阳 ↔ 上下卦爻线（自下而上，[0]=初爻）
//   ③ 用九仅在乾 / 用六仅在坤
//   ④ 空文本 0
//   ⑤ 爻辞跨卦重复 0
// 全部通过 ⇒ meta.selfCheck.pass = true；任何一项不过都如实记数（不吞）
// ---------------------------------------------------------------------------
function selfCheck(A, trigrams, hexagrams) {
  const triByName = new Map(trigrams.map((t) => [t.name, t]));
  const hexByOrder = new Map(hexagrams.map((h) => [h.order, h]));
  let symbolOk = 0;
  let yaoOk = 0;
  let yaoTotal = 0;
  let yongOk = 0;
  const failures = [];

  const dupMap = new Map();
  let emptyText = 0;

  for (const e of A.hexagrams) {
    // ① 卦符
    const want = String.fromCodePoint(0x4dc0 + e.order - 1);
    if (e.symbol === want) symbolOk += 1;
    else failures.push(`order ${e.order}：卦符 ${e.symbol} ≠ ${want}`);

    // ② 爻题阴阳 ↔ 卦画
    const h = hexByOrder.get(e.order);
    const lo = h ? triByName.get(h.lower) : null;
    const up = h ? triByName.get(h.upper) : null;
    if (lo && up) {
      const lines = [...lo.lines, ...up.lines]; // 自下而上
      for (let i = 0; i < 6; i += 1) {
        const y = e.yaoCi[i];
        yaoTotal += 1;
        if (!y) {
          failures.push(`order ${e.order} 位${i + 1}：缺爻辞`);
          continue;
        }
        const isYang = /九/.test(y.ref);
        if (isYang === (lines[i] === 1)) yaoOk += 1;
        else failures.push(`order ${e.order} ${y.ref}：爻题阴阳与卦画不符（位${i + 1}）`);
      }
    } else {
      failures.push(`order ${e.order}：上下卦查表失败`);
    }

    // ③ 用九/用六归属（只有乾有「用九」、只有坤有「用六」，其余卦一律不得有）
    const yong = e.yaoCi.filter((y) => /^用[六九]/.test(y.ref)).map((y) => y.ref);
    const yongWant = e.order === 1 ? ['用九'] : e.order === 2 ? ['用六'] : [];
    if (yong.join() === yongWant.join()) yongOk += 1;
    else failures.push(`order ${e.order}：用九/用六 ${JSON.stringify(yong)} ≠ ${JSON.stringify(yongWant)}`);

    // ④ 空文本 / ⑤ 跨卦重复
    if (!e.guaci || !String(e.guaci).trim()) emptyText += 1;
    for (const y of e.yaoCi) {
      if (!y.text || !String(y.text).trim()) emptyText += 1;
      const key = stripPunct(y.text);
      if (!dupMap.has(key)) dupMap.set(key, []);
      dupMap.get(key).push(`${e.order}/${y.ref}`);
    }
  }

  const dups = [...dupMap.values()].filter((v) => v.length > 1);
  return {
    symbol: `${symbolOk}/64`,
    yaoYinYang: `${yaoOk}/${yaoTotal}`,
    // 键名自明：「用九用六仅在乾坤」——值形如 "64/64"，指 64 卦的用九/用六归属全部正确
    yongJiuLiuOnlyQianKun: `${yongOk}/64`,
    emptyText,
    dupAcrossHexagrams: dups.length,
    pass:
      symbolOk === 64 &&
      yaoTotal === 384 &&
      yaoOk === 384 &&
      yongOk === 64 &&
      emptyText === 0 &&
      dups.length === 0,
    failures,
  };
}

// ---------------------------------------------------------------------------
// 六、交叉比对 + 多数票
//
// 异议判据（契约 §1.2 第 4 条，2026-10-22 修订）：
//   异议源数 ≥ 2 且其中至少 1 个是独立源（C/D/E，B 不计）⇒ 记 disputed。
//   - 为什么把 B 算一票：卦辞只有 C 一个独立源（D/E 均无卦辞），按原「≥2 独立源」口径
//     49 革 卦辞 巳/己 永远判不出来；
//   - 为什么必须至少 1 个独立源：防止「A 的母语料 B + 另一个同源抄本」自证。
// 一条不差 ⇒ 该卦进 crosschecked；一条有异议 ⇒ 该卦不进 crosschecked（disputed 已留档）。
// ---------------------------------------------------------------------------
const INDEPENDENT = new Set(['C', 'D', 'E']);
const SOURCE_IDS = ['B', 'C', 'D', 'E'];

function compareAll({ A, B, C, D, E }) {
  const cByOrder = new Map(C.map((x) => [x.order, x]));
  const dByNumber = new Map(D.hexagrams.map((x) => [x.number, x]));
  const eByOrder = new Map(E.map((x) => [x.order, x]));

  const crosschecked = [];
  const disputed = [];
  const notes = []; // 只打印，不进数据文件（保持文件语义纯净）

  for (const entry of A.hexagrams) {
    const order = entry.order;
    const b = B.get(order);
    const c = cByOrder.get(order) || null;
    const d = dByNumber.get(order) || null;
    const e = eByOrder.get(order) || null;
    const rows = [];

    // ---- 卦辞行（D/E 无卦辞 ⇒ 只有 B、C 可投）----
    {
      const srcs = {};
      if (b && b.hexagram && b.hexagram.text) {
        srcs.B = rawBody(stripBNamePrefix(b.hexagram.text, b.name || entry.name));
      }
      if (c && c.guaci) srcs.C = rawBody(c.guaci);
      rows.push({ ref: '卦辞', chosen: entry.guaci, srcs, hasD: false, hasE: false });
    }

    // ---- 爻辞行（按位序对齐，自下而上）----
    entry.yaoCi.forEach((y, i) => {
      const srcs = {};
      const by = bYaoAt(b, i);
      if (by && by.text) srcs.B = rawBody(by.text);
      if (c && c.yao && c.yao[y.ref]) srcs.C = rawBody(c.yao[y.ref]);
      if (d) {
        if (y.ref === '用九' || y.ref === '用六') {
          if (d.special && d.special.text) srcs.D = rawBody(d.special.text);
        } else if (d.lines && d.lines[i]) {
          // D 的行形如「初九：潛龍勿用」⇒ 枚举剥爻题后再剥全角冒号
          srcs.D = rawBody(d.lines[i]);
        }
      }
      if (e && e.yao && e.yao[y.ref]) srcs.E = rawBody(e.yao[y.ref]);
      rows.push({ ref: y.ref, chosen: y.text, srcs, hasD: !!d, hasE: !!(e && e.yao) });
    });

    // ---- 逐条比 ----
    let clean = true;
    for (const row of rows) {
      const cur = normForCompare(row.chosen);
      const dissent = [];
      for (const id of SOURCE_IDS) {
        if (!(id in row.srcs)) continue;
        if (normForCompare(row.srcs[id]) !== cur) dissent.push(id);
      }
      if (dissent.length === 0) continue;

      const hasIndependent = dissent.some((id) => INDEPENDENT.has(id));
      const isDisputed = dissent.length >= 2 && hasIndependent;

      if (isDisputed) {
        clean = false;
        const sources = { A: rawBody(row.chosen) };
        for (const id of dissent) sources[id] = row.srcs[id];
        disputed.push({
          order,
          name: entry.name,
          ref: row.ref,
          chosen: rawBody(row.chosen),
          sources,
          dissent,
          note:
            `异议源 ${dissent.join('/')}（${dissent.length} 个，其中独立源 ${dissent
              .filter((id) => INDEPENDENT.has(id))
              .join('/')}）；按契约 §1.2 第 4 条留档，**不自动改经文**`,
        });
      } else {
        // 单源异议 / 无独立源异议：不够多数票，不进 disputed，但必须可追溯（打印到报告）
        notes.push(
          `${order} ${entry.name} ${row.ref}：仅 ${dissent.join('/')} 异议` +
            `（${dissent.length} 票，独立源 ${hasIndependent ? '有' : '无'}）⇒ 不记 disputed`
        );
      }
    }
    if (clean) crosschecked.push(order);
  }

  return { crosschecked, disputed, notes };
}

// ---------------------------------------------------------------------------
// 七、未覆盖差异字诊断（契约 §1.2 第 1 条：「首次运行打印未覆盖差异，人工补表」）
// 归一后仍逐字不同的位置，若两侧都是汉字，就把字对列出来 —— 人可据此判断
// 是「繁简/异体漏收（补表）」还是「真异文（留 disputed）」。
// ---------------------------------------------------------------------------
function residualCharPairs({ A, B, C, D, E }) {
  const cByOrder = new Map(C.map((x) => [x.order, x]));
  const dByNumber = new Map(D.hexagrams.map((x) => [x.number, x]));
  const eByOrder = new Map(E.map((x) => [x.order, x]));
  const pairs = new Map(); // "x→y" -> 首个出现位置

  const scan = (cur, other, where) => {
    if (cur.length !== other.length) return; // 长度不等另有报告，不做逐字对齐
    for (let i = 0; i < cur.length; i += 1) {
      if (cur[i] === other[i]) continue;
      if (!isHan(cur[i]) || !isHan(other[i])) continue;
      const key = `${cur[i]}→${other[i]}`;
      if (!pairs.has(key)) pairs.set(key, where);
    }
  };

  for (const entry of A.hexagrams) {
    const b = B.get(entry.order);
    const c = cByOrder.get(entry.order) || null;
    const d = dByNumber.get(entry.order) || null;
    const e = eByOrder.get(entry.order) || null;

    if (c && c.guaci) scan(normForCompare(entry.guaci), normForCompare(c.guaci), `${entry.order}卦辞@C`);
    if (b && b.hexagram && b.hexagram.text) {
      scan(
        normForCompare(entry.guaci),
        normForCompare(stripBNamePrefix(b.hexagram.text, b.name || entry.name)),
        `${entry.order}卦辞@B`
      );
    }
    entry.yaoCi.forEach((y, i) => {
      const cur = normForCompare(y.text);
      const by = bYaoAt(b, i);
      if (by && by.text) scan(cur, normForCompare(by.text), `${entry.order}${y.ref}@B`);
      if (c && c.yao && c.yao[y.ref]) scan(cur, normForCompare(c.yao[y.ref]), `${entry.order}${y.ref}@C`);
      if (d) {
        const dtxt = y.ref === '用九' || y.ref === '用六' ? d.special && d.special.text : d.lines && d.lines[i];
        if (dtxt) scan(cur, normForCompare(dtxt), `${entry.order}${y.ref}@D`);
      }
      if (e && e.yao && e.yao[y.ref]) scan(cur, normForCompare(e.yao[y.ref]), `${entry.order}${y.ref}@E`);
    });
  }
  return pairs;
}

// 长度不等（截断/增补）诊断：不当异文，只提示
function lengthMismatches({ A, B, C, D, E }) {
  const cByOrder = new Map(C.map((x) => [x.order, x]));
  const dByNumber = new Map(D.hexagrams.map((x) => [x.number, x]));
  const eByOrder = new Map(E.map((x) => [x.order, x]));
  const out = [];
  const push = (where, cur, other) => {
    if (cur.length !== other.length) out.push(`${where}：A ${cur.length} 字 / 源 ${other.length} 字`);
  };
  for (const entry of A.hexagrams) {
    const b = B.get(entry.order);
    const c = cByOrder.get(entry.order) || null;
    const d = dByNumber.get(entry.order) || null;
    const e = eByOrder.get(entry.order) || null;
    if (c && c.guaci) push(`${entry.order}卦辞@C`, normForCompare(entry.guaci), normForCompare(c.guaci));
    entry.yaoCi.forEach((y, i) => {
      const cur = normForCompare(y.text);
      const by = bYaoAt(b, i);
      if (by && by.text) push(`${entry.order}${y.ref}@B`, cur, normForCompare(by.text));
      if (c && c.yao && c.yao[y.ref]) push(`${entry.order}${y.ref}@C`, cur, normForCompare(c.yao[y.ref]));
      if (d) {
        const dtxt = y.ref === '用九' || y.ref === '用六' ? d.special && d.special.text : d.lines && d.lines[i];
        if (dtxt) push(`${entry.order}${y.ref}@D`, cur, normForCompare(dtxt));
      }
      if (e && e.yao && e.yao[y.ref]) push(`${entry.order}${y.ref}@E`, cur, normForCompare(e.yao[y.ref]));
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 八、组装输出（纯函数：给定 sources + 既有文件 → 输出对象；不写盘）
//   opts.existing：读到的现有 data/zhouyi-proofread.json（用于原样保留 checked，
//                  以及**其它工具写入的外来段**，如 crosscheck-shiyi.mjs 写入的 `shiyi`）
// ---------------------------------------------------------------------------
export function buildProofread(opts = {}) {
  const src = opts.sources || loadSources();
  const existing = opts.existing || null;
  const trigrams = opts.trigrams || readJson('data/trigrams.json').trigrams;
  const hexagrams = opts.hexagrams || readJson('data/hexagrams.json').hexagrams;

  const { crosschecked, disputed, notes } = compareAll(src);
  const checks = selfCheck(src.A, trigrams, hexagrams);

  // `checked` 原样保留：只认现有文件里的数组；缺失/非数组 ⇒ []（**绝不**由生成器推断或写入）
  const checked = existing && Array.isArray(existing.checked) ? existing.checked.slice() : [];

  const out = {
    meta: {
      schema: 'v5-proofread-1',
      title: '《周易》经文校对状态',
      levels: {
        checked: '已对照权威纸质本人工校对',
        crosschecked: '多源交叉校验一致（机器比对，非人工）',
        none: '未校对',
      },
      updatedAt: UPDATED_AT,
      // 三重自洽校验（第三条腿）：全部通过才 pass=true；失败明细只打印，不入文件（保持文件稳定）
      selfCheck: {
        symbol: checks.symbol,
        yaoYinYang: checks.yaoYinYang,
        yongJiuLiuOnlyQianKun: checks.yongJiuLiuOnlyQianKun,
        emptyText: checks.emptyText,
        dupAcrossHexagrams: checks.dupAcrossHexagrams,
        pass: checks.pass,
      },
    },
    checked,
    crosschecked,
    disputed,
    sources: [
      { id: 'A', file: 'data/zhouyi-classic.json', kind: '项目现行本', independence: '—' },
      { id: 'B', file: 'data/ref-corpus/', kind: '参考汇编语料（原始站点已移除）', independence: '语料源' },
      { id: 'C', file: 'data/proofread-sources/sunls2-extract.json', kind: 'GitHub 电子本', independence: '独立转录' },
      {
        id: 'D',
        file: 'data/proofread-sources/wuyingdian-lines.json',
        kind: '武英殿刊本（1715）逐爻影像转录',
        independence: '★最强：原刻影像核对',
      },
      {
        id: 'E',
        file: 'data/proofread-sources/y5000-extract.json',
        kind: '5000言 已校订本',
        independence: '独立转录（爻辞）',
      },
    ],
  };

  // ★ 跨工具数据保真：本工具只负责 meta/checked/crosschecked/disputed/sources。
  //   `shiyi` 段由 tools/crosscheck-shiyi.mjs 写入 —— 若不清白地搬回，本工具一跑就把它整段抹掉
  //   （实测发生过：跑一次 proofread-classic 后 shiyi 消失，交叉校验成果全丢）。
  //   凡不属于本工具的顶层键，一律**原样保留**，避免多生成器互相覆盖。
  const OWNED_KEYS = new Set(['meta', 'checked', 'crosschecked', 'disputed', 'sources']);
  if (existing && typeof existing === 'object') {
    for (const k of Object.keys(existing)) {
      if (!OWNED_KEYS.has(k)) out[k] = existing[k];
    }
  }

  return { out, checks, notes };
}

// 逐字节幂等的序列化：2 空格缩进 + 末尾换行，键序由构造顺序固定
const serialize = (obj) => JSON.stringify(obj, null, 2) + '\n';

// ---------------------------------------------------------------------------
// 九、CLI
// ---------------------------------------------------------------------------
function main() {
  const outPath = path.join(ROOT, OUT_FILE);
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null;
  const src = loadSources();
  const { out, checks, notes } = buildProofread({ sources: src, existing });

  fs.writeFileSync(outPath, serialize(out), 'utf8');

  // ---- 报告（只打印，不影响文件字节）----
  console.log('经文交叉校验完成 → ' + OUT_FILE);
  console.log(`  卦数：${out.crosschecked.length} crosschecked / ${out.disputed.length} 条 disputed`);
  console.log(`  checked（人工，生成器不写）：${JSON.stringify(out.checked)}`);
  console.log(
    `  自洽校验：卦符 ${checks.symbol}、爻题阴阳 ${checks.yaoYinYang}、用九用六 ${checks.yongJiuLiuOnlyQianKun}、` +
      `空文本 ${checks.emptyText}、跨卦重复 ${checks.dupAcrossHexagrams} ⇒ ${checks.pass ? '全部通过' : '有失败项'}`
  );
  for (const f of checks.failures) console.log('    ✗ ' + f);

  if (out.disputed.length) {
    console.log('  disputed 明细：');
    for (const d of out.disputed) console.log(`    ${d.order} ${d.name} ${d.ref}  异议源=${d.dissent.join(',')}`);
  }

  const bAnom = bMetaAnomalies(src.A, src.B);
  if (bAnom.length) {
    console.log(`  源 B 元数据错标（已按位序对齐容错）：${bAnom.length} 处`);
    for (const a of bAnom) {
      console.log(`    位序 ${a.index + 1}：wei=${a.wei} 正文爻题=${a.textTitle} A.ref=${a.aRef}（order ${a.order}）`);
    }
  }

  if (notes.length) {
    console.log(`  单源异议（不够多数票，不记 disputed，留报告可追溯）：${notes.length} 条`);
    for (const n of notes) console.log('    · ' + n);
  }

  const pairs = residualCharPairs(src);
  if (pairs.size) {
    console.log(`  未覆盖差异字（归一后仍不同的字对；若属繁简/异体请补 T2S 表，否则即为真异文）：${pairs.size} 组`);
    console.log(
      '    ' +
        [...pairs.entries()]
          .map(([k, v]) => `${k}@${v}`)
          .sort()
          .join('  ')
    );
  } else {
    console.log('  未覆盖差异字：0 组（繁简表已覆盖全部实际差异）');
  }

  const lens = lengthMismatches(src);
  if (lens.length) {
    console.log(`  长度不等（截断/增补，按异文参与比对，不当缺项）：${lens.length} 条`);
    for (const l of lens) console.log('    · ' + l);
  }

  console.log('  提示：源 D 无卦辞、源 E 无卦辞且缺 4 条爻辞（比·九五、复·上六、睽·上九、震·上六）——缺项按"无票"处理，不判不一致。');
}

// ★ 跨平台入口判定：旧的 path.resolve(pathname) 比较在 Windows 上会因盘符/斜杠差异失败
if (isMainModule(import.meta.url)) main();
