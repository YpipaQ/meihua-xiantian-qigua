// 拆分解卦语料：data/ref-corpus/ → data/interpret/（schema v3-split-2）
// 说明：schema / 索引 / 修复规则 / 污染字段处置见本文件内注释。
//
// 输入（只读）：
//   data/ref-corpus/{index.json, NN-卦名.json}   网络汇编语料（原始素材，绝不改写）
//   data/zhouyi-classic.json                       《周易》经文（原文锚点）
//   data/trigrams.json / data/hexagrams.json       卦画（几何锚点）
//   data/proofread-sources/pippobenben-shiyi-extract.json  十翼参照（源 F）—— 用于 xiang 去污染（D6）
// 输出（写）：
//   data/interpret/NN-卦名.json × 64 + data/interpret/index.json
//
// 纯生成、幂等：时间戳固定 SPLIT_DATE，重跑逐字节一致。
// 三重校验锚点：① 卦画（爻题/阴阳）② 经文（classic 原文）③ 引擎（之卦 flipAt+hexagramByPair）
//
// 修复原则（契约 §5.1）：错的不留、对的可留；判定为错植/串位的内容移入 alt 留档，正式字段置 null 或取正确部分。
// 两类污染（均由**检测**定位，不写死坐标）：
//   A. 整条错植/重复：签名去重命中 ⇒ 与参照爻逐字相同的那条为污染源
//   B. 跨位串条：同字段含 ≥2 个分级头/变卦块 ⇒ 保留本位部分、剔出串入的邻位内容
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, isMainModule } from '../src/platform.mjs';

const SPLIT_DATE = '2026-10-14'; // 固定，保证幂等
// ★ 跨平台：不用 .pathname（Windows 下得到 /C:/... 会解析错），改用 platform.mjs
const ROOT = projectRoot(import.meta.url, 2); // up=2：从 tools/ 或 tests/ 上溯到项目根
const { hexLinesByPair, titleOfYao, flipAt, pairFromHexLines, hexagramByPair } = await import(
  path.join(ROOT, 'src/core/index.js')
);

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const trigrams = readJson('data/trigrams.json').trigrams;
const hexagrams = readJson('data/hexagrams.json').hexagrams;
const classic = readJson('data/zhouyi-classic.json');
const srcIndex = readJson('data/ref-corpus/index.json');
// 源 F：十翼参照（只读）。卦名以项目 hexagrams.json 为准（源 F 的「遯」统一为「遁」）。
const shiyiSrc = readJson('data/proofread-sources/pippobenben-shiyi-extract.json');
const shiyiByOrder = new Map();
for (const h of shiyiSrc.hexagrams || []) {
  const proj = hexagrams.find((x) => x.order === h.order);
  shiyiByOrder.set(h.order, { ...h, name: (proj && proj.name) || h.name });
}

// ---- 文本归一化 ----
// ⚠️ 爻题必须用**枚举**而非字符类：字符类 /[初六九二三四五上用]+/ 会连正文首字一起吞
//    （如「六三。三人行…」→「人行…」），造成假异文（实测误报 41-损#3、59-涣#1）。
const YAO_PREFIX = /^(初九|初六|九二|六二|九三|六三|九四|六四|九五|六五|上九|上六|用九|用六)[。.、]?/;
const PUNCT = /[。，、；：！？\s「」『』（）()"“”]/g;
// 语料侧剥爻题；经文侧本不含爻题，**不可**再剥（否则吃掉首字，如 41 的「三」）
const normCorpusYao = (s) => String(s || '').replace(YAO_PREFIX, '').replace(PUNCT, '');
const normClassicYao = (s) => String(s || '').replace(PUNCT, '');
// 卦辞：语料带「卦名。」前缀，按卦名精确剥；不剥会导致 64/64 全误判异文
const normCorpusGua = (s, name) => String(s || '').replace(new RegExp('^' + name + '[。.、]?'), '').replace(PUNCT, '');
const normClassicGua = (s) => String(s || '').replace(PUNCT, '');

// ---- D6：象曰（xiang）去污染 ----
// 汇总计数（模块级；每次 splitAll 前重置，保证幂等）
const xiangStats = { stripped: 0, replaced: 0, variant: 0 }; // 爻级
const xiangGuaStats = { stripped: 0, replaced: 0, variant: 0 }; // 卦级（大象）
const xiangGuaAlts = [];

// 问题：详解语料 yaos[].xiang 里混入白话释文（实测 385 条中 161 条，最长 529 字），
//   UI「象曰原文」直接展示 ⇒ 正文与译文糊在一起。由参照源 F（十翼）比对定位。
// 归一：源 F 为繁体，需繁→简；再剥标点空白。仅用于**比对**，输出取源 F 的标点版本。
// 繁简表按**码点**切分（String 迭代器），不能用 UTF-16 下标 —— 表含增补平面字，按码点下标切会整体错位。
const T2S = {
  並: '并', 乾: '干', 亂: '乱', 來: '来', 係: '系', 傾: '倾', 僕: '仆', 儀: '仪', 億: '亿', 兌: '兑',
  內: '内', 則: '则', 剝: '剥', 動: '动', 勝: '胜', 勞: '劳', 匯: '汇', 厲: '厉', 叢: '丛', 問: '问',
  啞: '哑', 喪: '丧', 國: '国', 園: '园', 執: '执', 堅: '坚', 塗: '涂', 壯: '壮', 婦: '妇', 宮: '宫',
  實: '实', 寧: '宁', 寵: '宠', 屍: '尸', 屨: '屦', 帥: '帅', 師: '师', 帶: '带', 幹: '干', 幾: '几',
  廟: '庙', 廬: '庐', 張: '张', 後: '后', 從: '从', 徵: '征', 恆: '恒', 惡: '恶', 惻: '恻', 慍: '愠',
  慶: '庆', 憂: '忧', 懷: '怀', 戔: '戋', 戰: '战', 戶: '户', 揚: '扬', 損: '损', 擊: '击',
  據: '据', 攣: '挛', 敗: '败', 敵: '敌', 於: '于', 時: '时', 晉: '晋', 晝: '昼', 朶: '朵', 東: '东',
  棄: '弃', 棟: '栋', 楊: '杨', 橈: '桡', 機: '机', 歲: '岁', 歸: '归', 殺: '杀', 決: '决', 淵: '渊',
  渙: '涣', 滅: '灭', 漣: '涟', 漸: '渐', 潛: '潜', 濟: '济', 瀆: '渎', 灑: '洒', 災: '灾', 為: '为',
  無: '无', 爲: '为', 爾: '尔', 牀: '床', 牽: '牵', 獄: '狱', 獨: '独', 獲: '获', 瑣: '琐', 甕: '瓮',
  疇: '畴', 發: '发', 盤: '盘', 眾: '众', 碩: '硕', 禦: '御', 穫: '获', 窺: '窥', 節: '节', 約: '约',
  納: '纳', 紛: '纷', 紱: '绂', 終: '终', 經: '经', 維: '维', 繫: '系', 繻: '繻', 纆: '纆', 罷: '罢',
  羣: '群', 習: '习', 聞: '闻', 膚: '肤', 臘: '腊', 臨: '临', 與: '与', 興: '兴', 舊: '旧', 艱: '艰',
  茲: '兹', 莧: '苋', 華: '华', 薦: '荐', 藥: '药', 蘇: '苏', 處: '处', 虛: '虚', 號: '号', 虧: '亏',
  蠱: '蛊', 衆: '众', 衛: '卫', 見: '见', 視: '视', 覿: '觌', 觀: '观', 觸: '触', 訟: '讼', 誡: '诫',
  說: '说', 謂: '谓', 謙: '谦', 譽: '誉', 變: '变', 豐: '丰', 豶: '豮', 貝: '贝', 貞: '贞', 負: '负',
  貫: '贯', 貳: '贰', 賁: '贲', 資: '资', 賓: '宾', 賞: '赏', 躋: '跻', 躍: '跃', 車: '车', 載: '载',
  輔: '辅', 輪: '轮', 輻: '辐', 輿: '舆', 連: '连', 進: '进', 過: '过', 違: '违', 遠: '远', 遯: '遁',
  遲: '迟', 遷: '迁', 遺: '遗', 鄰: '邻', 醜: '丑', 鉉: '铉', 錫: '锡', 錯: '错', 鏇: '镟', 長: '长',
  門: '门', 開: '开', 閑: '闲', 閒: '闲', 闃: '阒', 闚: '窥', 陰: '阴', 陸: '陆', 階: '阶', 隕: '陨',
  隨: '随', 險: '险', 雖: '虽', 離: '离', 雲: '云', 靈: '灵', 鞏: '巩', 頂: '顶', 須: '须', 頤: '颐',
  頰: '颊', 頻: '频', 顒: '颙', 顛: '颠', 顯: '显', 飛: '飞', 飲: '饮', 餗: '餗', 饋: '馈', 馬: '马',
  馮: '冯', 驅: '驱', 驚: '惊', 魚: '鱼', 鮒: '鲋', 鳥: '鸟', 鳴: '鸣', 鴻: '鸿', 鶴: '鹤', 鹹: '咸',
  黃: '黄', 齎: '赍', 龍: '龙', 龜: '龟', 徵: '征', 復: '复', 從: '从', 損: '损', 譽: '誉', 輿: '舆',
  // ★增补平面字（U+2B5E7）：源 F 用「𫗧」，语料用「餗」，同字异体。
  // 必须显式映射 —— 否则归一失败会被误判为"真异文"（50 鼎 九四 就是因此多出 1 条 variant）。
  '𫗧': '餗',
  // ★异体字归一到**语料用字**（源 F 与语料各用一体，非异文；不映射会造假分歧）：
  //   遯→遁（28 大过 大象、33 遁 大象）、㧑→撝（15 谦 六四 小象）。
  //   注意只能单向：若表里另有一条 撝→㧑 会形成循环，归一恒不相等 ⇒ 反而造新分歧。
  遯: '遁', 㧑: '撝',
};
const toSimp = (s) => {
  let out = '';
  for (const ch of String(s || '')) out += T2S[ch] || ch; // 按码点迭代
  return out;
};
const XIANG_PUNCT = /[。，、；：！？\s「」『』（）()"“”]/g;
const normXiang = (s) => toSimp(s).replace(XIANG_PUNCT, '');

// 去污染：返回 { xiang, alt } —— alt 仅在有剥离/替换/留档时非 null
function cleanXiang(rawXiang, refXiang) {
  const raw = String(rawXiang || '');
  if (!raw) return { xiang: raw, alt: null };
  const ref = String(refXiang || '');
  const nRaw = normXiang(raw);
  const nRef = normXiang(ref);
  // 无参照：不动（不猜）
  if (!nRef) return { xiang: raw, alt: null };
  if (nRaw === nRef) return { xiang: raw, alt: null }; // 已干净（保留语料原标点，不无谓改写）
  if (nRaw.startsWith(nRef)) {
    // 正确小象作前缀 + 白话污染 ⇒ 取源 F 版本（带标点），尾巴留档
    const tail = raw.slice(ref.length).trim();
    return { xiang: ref, alt: { kind: 'stripped', removed: tail, note: '已剥离尾随白话/释文污染（源 F 比对定位）' } };
  }
  if (nRaw.includes(nRef)) {
    return { xiang: ref, alt: { kind: 'replaced', removed: raw, note: '原文中夹入非象曰内容，按源 F 替换；原值留档' } };
  }
  // 真异文/错植 ⇒ **正文不动**，只留档（不擅自定夺谁对）
  return { xiang: raw, alt: { kind: 'variant', ref, note: '与源 F 存在实质差异，正文保留原样待人工裁定' } };
}

// ---- 拆分原语 ----

// 邵雍爻条：首字 吉/凶/平 + 冒号 ⇒ {grade, text}
function splitShaoyong(s) {
  const m = String(s || '').match(/^([吉凶平])[：:]\s*([\s\S]*)$/);
  return m ? { grade: m[1], text: m[2].trim() } : { grade: null, text: String(s || '').trim() };
}

// 变卦散文（可含多块，用 lookahead 切分）：
// 『X爻动变得周易第N卦：卦名。说明』⇒ [{fromPos, order, name, text}]
function parseBianguaBlocks(s) {
  const str = String(s || '');
  const re = /([初六九二三四五上用]+)爻动变得周易第(\d+)卦[：:]\s*([^。]*)。?([\s\S]*?)(?=[初六九二三四五上用]+爻动变得周易第\d+卦|$)/g;
  const out = [];
  let m;
  while ((m = re.exec(str))) {
    out.push({ fromPos: m[1], order: Number(m[2]), name: m[3].trim(), text: m[4].trim() });
  }
  return out;
}

// 卦象关联：『第N卦：卦名（上下卦…）』⇒ {order, name, raw}
// name 去尾部「卦」以对齐契约 §2 样例（经 hexagrams.json 校验，去尾后恒命中）
function splitRelation(s) {
  if (!s) return null;
  const m = String(s).match(/^第(\d+)卦[：:]\s*([^（(]+)/);
  if (!m) return { order: null, name: null, raw: String(s) };
  return { order: Number(m[1]), name: m[2].trim().replace(/卦$/, ''), raw: String(s) };
}

// 字符串 ⇒ {text}；对象原样保留（傅佩荣/传统解卦 本身结构化）
function voiceOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object') return Object.keys(v).length ? v : null;
  const t = String(v).trim();
  return t ? { text: t } : null;
}

// 引擎之卦：第 pos 位动 ⇒ {order, name}
function engineZhi(order, pos) {
  const ben = hexagrams.find((h) => h.order === order);
  if (!ben) return null;
  const lines = hexLinesByPair(trigrams, ben.upper, ben.lower);
  const pair = pairFromHexLines(trigrams, flipAt(lines, pos - 1));
  const z = hexagramByPair(hexagrams, pair.upper.name, pair.lower.name);
  return z ? { order: z.order, name: z.name } : null;
}

// ---- 污染检测（不写死坐标）----

// A. 整条错植/重复：六字段签名去重（全库恰好命中 2 组：明夷#5==#6、归妹#1==丰#1）
function detectWholeContamination() {
  const sig = (y) =>
    JSON.stringify([
      y.text,
      y.plain && y.plain['译文'],
      y.plain && y.plain['象辞白话'],
      y.voices && y.voices['邵雍'],
      y.voices && y.voices['傅佩荣'],
      y.voices && y.voices['变卦'],
    ]);
  const groups = new Map();
  for (const e of srcIndex) {
    const j = readJson(`data/ref-corpus/${e.file}`);
    const cl = classic.hexagrams.find((h) => h.order === e.order);
    (j.yaos || []).slice(0, 6).forEach((y, i) => {
      const k = sig(y);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ order: e.order, pos: i + 1, y, clYao: cl.yaoCi[i] });
    });
  }
  // 组内 >1 ⇒ 污染；污染源＝正文与其本位经文**不符**的那条（另一条为本位正确内容）
  const bad = new Map(); // "order:pos" -> partner 描述
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    for (const m of members) {
      const mismatch = normCorpusYao(m.y.text) !== normClassicYao(m.clYao.text);
      if (!mismatch) continue; // 本位正确者保留
      const partner = members.find((x) => x !== m);
      bad.set(`${m.order}:${m.pos}`, `${partner.order}-${partner.pos}`);
    }
  }
  return bad;
}

// B. 跨位串条：同字段含 ≥2 个分级头 / ≥2 个变卦块（全库唯一：58-兑#4）
function detectPartialBleed() {
  const bad = new Map();
  for (const e of srcIndex) {
    const j = readJson(`data/ref-corpus/${e.file}`);
    (j.yaos || []).slice(0, 6).forEach((y, i) => {
      const v = y.voices || {};
      const grades = (String(v['邵雍'] || '').match(/[吉凶平][：:]/g) || []).length;
      const blocks = parseBianguaBlocks(v['变卦']).length;
      if (grades > 1 || blocks > 1) {
        bad.set(`${e.order}:${i + 1}`, { grades, blocks });
      }
    });
  }
  return bad;
}

const WHOLE_BAD = detectWholeContamination();
const PARTIAL_BAD = detectPartialBleed();

// ---- 单卦拆分 ----

export function splitHexagram(order) {
  const entry = srcIndex.find((x) => x.order === order);
  if (!entry) throw new Error(`语料索引缺 order=${order}`);
  const j = readJson(`data/ref-corpus/${entry.file}`);
  const cl = classic.hexagrams.find((h) => h.order === order);
  const ben = hexagrams.find((h) => h.order === order);
  if (!cl || !ben) throw new Error(`锚点缺失 order=${order}`);
  const lines = hexLinesByPair(trigrams, ben.upper, ben.lower);
  const h = j.hexagram;
  const repairs = [];
  const xiangLocal = { yao: { stripped: 0, replaced: 0, variant: 0 }, gua: { stripped: 0, replaced: 0, variant: 0 } };

  // ---- 卦辞层 ----
  const guaVoices = {};
  for (const [k, v] of Object.entries(h.voices || {})) {
    const x = voiceOf(v);
    if (x) guaVoices[k] = x;
  }
  // 卦辞异文：按卦名剥前缀后比对（不剥 ⇒ 64/64 全误判）
  const guaDiffers = normCorpusGua(h.text, j.name) !== normClassicGua(cl.guaci);
  // 卦级大象去污染（D6）：64 条中 7 条有异文（作/做、容/客、惩/征、哀/衰、豫/预、脱字 2 处）
  const shiyiGua = shiyiByOrder.get(order);
  const guaClean = cleanXiang(h.xiang || '', shiyiGua ? shiyiGua.daxiang : '');
  if (guaClean.alt) {
    if (guaClean.alt.kind === 'stripped') { xiangGuaStats.stripped += 1; xiangLocal.gua.stripped += 1; }
    else if (guaClean.alt.kind === 'replaced') { xiangGuaStats.replaced += 1; xiangLocal.gua.replaced += 1; }
    else { xiangGuaStats.variant += 1; xiangLocal.gua.variant += 1; }
    xiangGuaAlts.push({ order, ...guaClean.alt });
  }
  const gua = {
    classic: { text: cl.guaci },
    alt: guaDiffers ? { text: h.text, note: '语料异文（待校对）' } : null,
    xiang: guaClean.xiang,
    plain: { 译文: (h.plain || {})['译文'] || '', 象辞白话: (h.plain || {})['象辞白话'] || '' },
    voices: guaVoices,
  };

  // ---- 爻层 ----
  const yaos = [];
  const nYao = Math.min(6, j.yaos.length);
  for (let i = 0; i < nYao; i += 1) {
    const y = j.yaos[i];
    const pos = i + 1;
    const expectWei = titleOfYao(i, lines[i]);
    const clYao = cl.yaoCi[i] || {};
    const yv = y.voices || {};
    const key = `${order}:${pos}`;
    const wholeBad = WHOLE_BAD.get(key);
    const partial = PARTIAL_BAD.get(key);

    // ① 爻题校验（卦画锚点）
    let wei = y.wei;
    if (wei !== expectWei) {
      repairs.push({ pos, kind: 'wei', from: wei, to: expectWei, why: `与卦画（上${ben.upper}下${ben.lower}）不符` });
      wei = expectWei;
    }

    // ② 经文校验：语料爻辞与本位经文不一致 ⇒ 语料原文进 alt，正式取经文
    const textDiffers = normCorpusYao(y.text) !== normClassicYao(clYao.text);

    let altObj = null;
    let xiang = y.xiang || '';
    let xiangAlt = null;
    const yaoVoices = {};
    let plainOut = { 译文: (y.plain || {})['译文'] || '', 象辞白话: (y.plain || {})['象辞白话'] || '' };
    let finalTextAlt = textDiffers ? { text: y.text || null, note: '语料异文（待校对）' } : null;

    if (wholeBad) {
      // ---- A 整条错植/重复：正文整体移入 alt，正式字段取经文；仅保留本位正确内容 ----
      repairs.push({
        pos,
        kind: 'text',
        from: `整条错植/重复（与 ${wholeBad} 逐字相同）`,
        to: '以经文重建 classic，污染字段移入 alt',
        why: '六字段签名与参照爻完全相同，属源站错植',
      });
      altObj = {
        text: y.text || null,
        note: `错植/重复内容（实为 ${wholeBad}），源站缺陷，留档备查`,
        plain: { ...plainOut },
        voices: {
          邵雍: voiceOf(yv['邵雍']),
          傅佩荣: voiceOf(yv['傅佩荣']),
          变卦: parseBianguaBlocks(yv['变卦']).map((b) => ({ ...b })).find(Boolean) || null,
        },
      };
      // 象曰常为「参照爻象辞前缀 + 本位余部」⇒ 剥掉参照前缀，保留本位部分
      // wholeBad 形如 "54-1"（partnerOrder-partnerPos）
      const pm = String(wholeBad).match(/^(\d+)-(\d+)$/);
      if (pm) {
        const [pOrder, pPos] = [Number(pm[1]), Number(pm[2])];
        const pe = srcIndex.find((x) => x.order === pOrder);
        const pj = readJson(`data/ref-corpus/${pe.file}`);
        const pXiang = (pj.yaos || [])[pPos - 1] || {};
        if (pXiang.xiang && xiang.startsWith(pXiang.xiang)) {
          const tail = xiang.slice(pXiang.xiang.length).trim();
          if (tail) {
            repairs.push({
              pos,
              kind: 'text',
              from: `象曰串入参照爻内容（${pXiang.xiang.slice(0, 24)}…）`,
              to: tail.slice(0, 40),
              why: '象曰前缀属参照爻，余部才是本位',
            });
            xiang = tail;
          }
        }
      }
      // 变卦：语料该位的变卦块实为参照爻的 ⇒ 以引擎为准，并留档
      const wBlocks = parseBianguaBlocks(yv['变卦']);
      const wEng = engineZhi(order, pos);
      if (wBlocks.length && (!wEng || wBlocks[0].order !== wEng.order)) {
        repairs.push({
          pos,
          kind: 'biangua',
          from: wBlocks[0].order,
          to: wEng ? wEng.order : null,
          why: '该位变卦块属参照爻，与引擎之卦不符',
        });
      }
      // 哲学含义经核验属本位正确内容 ⇒ 保留
      const ph = voiceOf(yv['哲学含义']);
      if (ph) yaoVoices['哲学含义'] = ph;
      plainOut = null; // 污染位 plain 属错植内容，不留在正式字段
      finalTextAlt = altObj;
    } else if (partial) {
      // ---- B 跨位串条：保留本位部分，剔出串入的邻位内容 ----
      repairs.push({
        pos,
        kind: 'text',
        from: `跨位串条（邵雍 ${partial.grades} 个分级头 / 变卦 ${partial.blocks} 块）`,
        to: '保留本位部分，串入内容移入 alt',
        why: '源站该位混入邻位（下一爻）内容',
      });
      const bleed = { text: null, note: '跨位串条：剔出的邻位内容', voices: {} };
      // 邵雍：截到串入段之前（「台湾国学大儒…」或第二个分级头）
      let syRaw = String(yv['邵雍'] || '');
      const cutAt = syRaw.indexOf('台湾国学大儒');
      if (cutAt > 0) {
        bleed.voices['邵雍'] = voiceOf(syRaw.slice(cutAt));
        syRaw = syRaw.slice(0, cutAt).trim();
      } else {
        const m2 = syRaw.match(/[吉凶平][：:]/g);
        if (m2 && m2.length > 1) {
          const idx = syRaw.indexOf(m2[1], syRaw.indexOf(m2[0]) + 1);
          if (idx > 0) {
            bleed.voices['邵雍'] = voiceOf(syRaw.slice(idx - 3));
            syRaw = syRaw.slice(0, idx - 3).trim();
          }
        }
      }
      // 变卦：只取 fromPos === 本位爻题 的块
      const blocks = parseBianguaBlocks(yv['变卦']);
      const mine = blocks.find((b) => b.fromPos === expectWei) || null;
      const others = blocks.filter((b) => b !== mine);
      if (others.length) bleed.voices['变卦'] = others.map((b) => ({ ...b }));
      // 象辞白话：截到串入的邻位标签之前
      const nextWei = titleOfYao(Math.min(i + 1, 5), lines[Math.min(i + 1, 5)]);
      const pb = plainOut['象辞白话'];
      const pbCut = pb.indexOf(nextWei + '：') >= 0 ? pb.indexOf(nextWei + '：') : pb.indexOf(nextWei);
      if (pbCut > 0) {
        bleed.plain = { 象辞白话: pb.slice(pbCut).trim() };
        plainOut = { ...plainOut, 象辞白话: pb.slice(0, pbCut).trim() };
      }
      altObj = bleed;
      yaoVoices['邵雍'] = splitShaoyong(syRaw);
      const fp = voiceOf(yv['傅佩荣']);
      if (fp) yaoVoices['傅佩荣'] = fp;
      if (mine) {
        const eng = engineZhi(order, pos);
        if (!eng || mine.order !== eng.order) {
          repairs.push({
            pos,
            kind: 'biangua',
            from: mine.order,
            to: eng ? eng.order : null,
            why: '本位变卦块指向与引擎之卦不符',
          });
        }
        yaoVoices['变卦'] = { ...mine, engine: eng };
      }
      const ph = voiceOf(yv['哲学含义']);
      if (ph) yaoVoices['哲学含义'] = ph;
      finalTextAlt = altObj;
    } else {
      // ---- 常规位 ----
      const eng = engineZhi(order, pos);
      const blocks = parseBianguaBlocks(yv['变卦']);
      const mine = blocks.length ? blocks[0] : null;
      if (mine) {
        if (!eng || mine.order !== eng.order) {
          repairs.push({
            pos,
            kind: 'biangua',
            from: mine.order,
            to: eng ? eng.order : null,
            why: '散文指向与引擎之卦不符',
          });
        }
        yaoVoices['变卦'] = { ...mine, engine: eng };
      }
      const sy = splitShaoyong(yv['邵雍']);
      if (sy.text || sy.grade) yaoVoices['邵雍'] = sy;
      const fp = voiceOf(yv['傅佩荣']);
      if (fp) yaoVoices['傅佩荣'] = fp;
      const ph = voiceOf(yv['哲学含义']);
      if (ph) yaoVoices['哲学含义'] = ph;
    }

    // ---- D6：象曰去污染（在既有串条修复之后，作为最后一道） ----
    const shiyiEnt = shiyiByOrder.get(order);
    const refXx = shiyiEnt && Array.isArray(shiyiEnt.xiaoxiang) ? shiyiEnt.xiaoxiang[i] : '';
    const cleaned = cleanXiang(xiang, refXx);
    xiang = cleaned.xiang;
    if (cleaned.alt) {
      xiangAlt = cleaned.alt;
      if (cleaned.alt.kind === 'stripped') { xiangStats.stripped += 1; xiangLocal.yao.stripped += 1; }
      else if (cleaned.alt.kind === 'replaced') { xiangStats.replaced += 1; xiangLocal.yao.replaced += 1; }
      else { xiangStats.variant += 1; xiangLocal.yao.variant += 1; }
    }

    const yaoOut = {
      pos,
      wei,
      yin: lines[i] === 0,
      classic: { text: clYao.text || '' },
      alt: finalTextAlt,
      xiang,
      plain: plainOut,
      voices: yaoVoices,
    };
    if (xiangAlt) yaoOut.xiangAlt = xiangAlt;
    yaos.push(yaoOut);
  }

  // ---- 乾·用九（第 7 条，特例）----
  if (j.yaos.length > 6) {
    const y = j.yaos[6];
    const yv = y.voices || {};
    const yaoVoices = {};
    const sy = splitShaoyong(yv['邵雍']);
    if (sy.text || sy.grade) yaoVoices['邵雍'] = sy;
    const fp = voiceOf(yv['傅佩荣']);
    if (fp) yaoVoices['傅佩荣'] = fp;
    const blocks = parseBianguaBlocks(yv['变卦']);
    if (blocks.length) yaoVoices['变卦'] = { ...blocks[0], engine: null }; // 用九无对应爻位，engine 不适用
    const ph = voiceOf(yv['哲学含义']);
    if (ph) yaoVoices['哲学含义'] = ph;
    const clYong = (cl.yaoCi || [])[6] || {};
    yaos.push({
      pos: 7,
      wei: '用九',
      special: true,
      yin: null,
      classic: { text: clYong.text || '' },
      alt: y.text ? { text: y.text, note: '语料用九' } : null,
      xiang: y.xiang || '',
      plain: { 译文: (y.plain || {})['译文'] || '', 象辞白话: (y.plain || {})['象辞白话'] || '' },
      voices: yaoVoices,
    });
  }

  return {
    schema: 'v3-split-2',
    order,
    name: j.name,
    // ★ v11：**不再写入来源站 URL**。每个数据文件里塞转载站链接，等于替它做广告，
    //   而该站并非这些文本的作者。改为中性标注：来源不明（通行本系汇编）。
    //   逐项归属见 data/sources-registry.json。
    source: 'compiled-unknown',
    gua,
    relations: {
      mutual: splitRelation(h.mutual),
      opposite: splitRelation(h.opposite),
      comprehensive: splitRelation(h.comprehensive),
    },
    yaos,
    meta: {
      splitAt: SPLIT_DATE,
      splitter: 'tools/split-interpret.mjs',
      repairs,
      // D6：本卦象曰去污染计数（爻级 + 卦级）
      xiangRepairs: xiangLocal,
      aiFilled: (j.meta || {}).aiFilled || [],
    },
  };
}

// ---- 批量生成 ----

export function splitAll() {
  xiangStats.stripped = 0;
  xiangStats.replaced = 0;
  xiangStats.variant = 0;
  xiangGuaStats.stripped = 0;
  xiangGuaStats.replaced = 0;
  xiangGuaStats.variant = 0;
  xiangGuaAlts.length = 0;
  return srcIndex.map((e) => splitHexagram(e.order));
}

function main() {
  const outDir = path.join(ROOT, 'data/interpret');
  fs.mkdirSync(outDir, { recursive: true });
  const all = splitAll();
  const entries = [];
  let repairDetails = 0;
  for (const r of all) {
    const file = `${String(r.order).padStart(2, '0')}-${r.name}.json`;
    fs.writeFileSync(path.join(outDir, file), JSON.stringify(r, null, 2) + '\n');
    repairDetails += r.meta.repairs.length;
    entries.push({ order: r.order, name: r.name, file, repairs: r.meta.repairs.length, aiFilled: r.meta.aiFilled });
  }
  const index = {
    meta: {
      schema: 'v3-split-2',
      generatedAt: SPLIT_DATE,
      generator: 'tools/split-interpret.mjs',
      count: entries.length,
      repairs: 5, // 语义＝D1–D5 五类缺陷（契约 §5.1）
      repairDetailCount: repairDetails,
      repairNote: `5 类缺陷 / ${repairDetails} 条明细`,
      // D6（v6）：象曰字段去污染 —— 由源 F（十翼）比对定位，禁止写死坐标（契约 §1.3）
      xiangRepairs: {
        yao: { ...xiangStats, detailCount: xiangStats.stripped + xiangStats.replaced + xiangStats.variant },
        gua: { ...xiangGuaStats, detailCount: xiangGuaStats.stripped + xiangGuaStats.replaced + xiangGuaStats.variant },
        detailCount:
          xiangStats.stripped + xiangStats.replaced + xiangStats.variant +
          xiangGuaStats.stripped + xiangGuaStats.replaced + xiangGuaStats.variant,
        guaVariantOrders: xiangGuaAlts.filter((x) => x.kind === 'variant').map((x) => x.order),
        note:
          'stripped=剥离尾随白话；replaced=夹入非象曰内容按源 F 替换；variantKept=真异文正文保留待人工。' +
          'yao=爻级小象，gua=卦级大象，分开计数（大象异文集中于 7 卦）。',
      },
      altGua: all.filter((r) => r.gua.alt).map((r) => r.order),
      altYao: all.reduce((a, r) => a + r.yaos.filter((y) => y.alt && y.pos <= 6).length, 0),
    },
    entries,
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`已生成 ${entries.length} 卦 → data/interpret/`);
  console.log(`repairs：5 类缺陷 / ${repairDetails} 条明细`);
  console.log(`卦辞 alt：${index.meta.altGua.length} 处（${index.meta.altGua.join(',')}）｜爻 alt：${index.meta.altYao} 处`);
  for (const r of all) {
    if (!r.meta.repairs.length) continue;
    console.log(
      `  ${String(r.order).padStart(2, '0')} ${r.name}: ` + r.meta.repairs.map((x) => `${x.pos}${x.kind}`).join(', ')
    );
  }
}

// ★ 跨平台入口判定：`file://${process.argv[1]}` 在 Windows 上永不相等，改用 isMainModule
if (isMainModule(import.meta.url)) main();
