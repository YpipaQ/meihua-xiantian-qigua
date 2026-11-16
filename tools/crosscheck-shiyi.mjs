// 十翼交叉校验：源 F（data/zhouyi-shiyi.json）vs 源 G（liangzid 独立转录）
// 说明：比对口径见本文件内注释。
//
// 输入（只读）：
//   data/zhouyi-shiyi.json                                源 F（现行，单源转录）
//   data/proofread-sources/liangzid-shiyi-extract.json    源 G（第二源，独立转录）
// 输出（写）：
//   data/zhouyi-proofread.json 的 shiyi 段（sources / crosschecked / disputed）—— 只动这一段，其余原样保留
//
// 原则：
//   · 一致 ⇒ 记为 agree，提升可信度；不一致 ⇒ **不改 F**，全部留档
//   · 源 G 自身的结构性错位（33 遁）经检测识别，不参与比对（否则会把 F 的正确内容判成"分歧"）
//   · 幂等：generatedAt 固定日期
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot } from '../src/platform.mjs';

const CHECK_DATE = '2026-10-22';
// ★ 跨平台：不用 .pathname（Windows 下得到 /C:/... 会解析错）
const ROOT = projectRoot(import.meta.url, 2); // up=2：从 tools/ 或 tests/ 上溯到项目根
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// ---- 归一化 ----
// 繁→简表：由两源全部文本（1034 个汉字）经 zhconv 生成后筛选，只覆盖**实际出现**的差异字（257 条）。
// ★ 按**码点**迭代（for...of），禁止 UTF-16 下标 —— 表内含增补平面字，按码点下标切会整体错位。
// ★ 语境依赖字只保留单向：撝→㧑 与 㧑→撝 同时存在会成环、归一恒不等（v6 踩过，造过假分歧）。
const T2S = {
  乾: '干', 亂: '乱', 來: '来', 備: '备', 傷: '伤', 傾: '倾', 儀: '仪', 儉: '俭', 兌: '兑', 內: '内',
  兩: '两', 則: '则', 剛: '刚', 剝: '剥', 動: '动', 勝: '胜', 勞: '劳', 勢: '势', 勸: '劝', 厲: '厉',
  問: '问', 啞: '哑', 喪: '丧', 嚴: '严', 國: '国', 執: '执', 堅: '坚', 壯: '壮', 奮: '奋', 婦: '妇',
  宮: '宫', 實: '实', 寧: '宁', 寵: '宠', 對: '对', 帥: '帅', 師: '师', 廟: '庙', 廬: '庐', 強: '强',
  從: '从', 復: '复', 恆: '恒', 悶: '闷', 惡: '恶', 惻: '恻', 愛: '爱', 慶: '庆', 憂: '忧', 憊: '惫',
  應: '应', 懲: '惩', 懷: '怀', 懼: '惧', 戰: '战', 戶: '户', 揚: '扬', 損: '损', 擊: '击', 據: '据',
  攣: '挛', 敗: '败', 敵: '敌', 數: '数', 於: '于', 時: '时', 晉: '晋', 晝: '昼', 暉: '晖', 東: '东',
  棟: '栋', 楊: '杨', 極: '极', 榮: '荣', 樂: '乐', 橈: '桡', 機: '机', 歲: '岁', 歷: '历', 歸: '归',
  殺: '杀', 氣: '气', 決: '决', 況: '况', 淵: '渊', 渙: '涣', 湯: '汤', 滅: '灭', 滿: '满', 漣: '涟',
  漸: '渐', 潛: '潜', 澤: '泽', 濟: '济', 瀆: '渎', 災: '灾', 為: '为', 無: '无', 牽: '牵', 獄: '狱',
  獨: '独', 獲: '获', 瑣: '琐', 異: '异', 當: '当', 發: '发', 眾: '众', 碩: '硕', 祿: '禄', 禮: '礼',
  稱: '称', 積: '积', 窮: '穷', 窺: '窥', 節: '节', 篤: '笃', 紛: '纷', 終: '终', 絕: '绝', 統: '统',
  經: '经', 維: '维', 綸: '纶', 緩: '缓', 縱: '纵', 繼: '继', 續: '续', 罰: '罚', 罷: '罢', 義: '义',
  習: '习', 聖: '圣', 聞: '闻', 聰: '聪', 聽: '听', 膚: '肤', 臨: '临', 與: '与', 興: '兴', 舊: '旧',
  艱: '艰', 茲: '兹', 華: '华', 萬: '万', 蒞: '莅', 藥: '药', 蘇: '苏', 處: '处', 虛: '虚', 號: '号',
  虧: '亏', 蠱: '蛊', 見: '见', 視: '视', 覩: '睹', 親: '亲', 觀: '观', 訟: '讼', 設: '设', 試: '试',
  語: '语', 誡: '诫', 誥: '诰', 說: '说', 誰: '谁', 諸: '诸', 謀: '谋', 謂: '谓', 謙: '谦', 講: '讲',
  識: '识', 議: '议', 譽: '誉', 變: '变', 貞: '贞', 負: '负', 財: '财', 貳: '贰', 貴: '贵', 賁: '贲',
  資: '资', 賓: '宾', 賢: '贤', 賤: '贱', 踰: '逾', 躍: '跃', 車: '车', 載: '载', 輔: '辅', 輝: '辉',
  輪: '轮', 輻: '辐', 輿: '舆', 辭: '辞', 辯: '辩', 連: '连', 進: '进', 過: '过', 違: '违', 遠: '远',
  遯: '遁', 遷: '迁', 遺: '遗', 邇: '迩', 鄰: '邻', 鉉: '铉', 錫: '锡', 錯: '错', 長: '长', 門: '门',
  閉: '闭', 閑: '闲', 闃: '阒', 關: '关', 陰: '阴', 陽: '阳', 階: '阶', 隕: '陨', 際: '际', 隨: '随',
  險: '险', 雖: '虽', 離: '离', 難: '难', 雲: '云', 電: '电', 靜: '静', 鞏: '巩', 順: '顺', 須: '须',
  預: '预', 頤: '颐', 頰: '颊', 頻: '频', 顒: '颙', 顛: '颠', 類: '类', 顯: '显', 風: '风', 飛: '飞',
  飪: '饪', 飲: '饮', 飽: '饱', 養: '养', 餗: '𫗧', 馬: '马', 馴: '驯', 驚: '惊', 魚: '鱼', 鮒: '鲋',
  鳥: '鸟', 鳴: '鸣', 麗: '丽', 黃: '黄', 齎: '赍', 龍: '龙', 㧑: '撝', 𫗧: '餗',
};
const toSimp = (s) => {
  let out = '';
  for (const ch of String(s || '')) out += T2S[ch] || ch; // 按码点迭代
  return out;
};
// 剥：《彖》曰：/《象》曰： 标签、标点、括注引号
const LABEL = /^《[彖象]》曰[：:]\s*/;
const PUNCT = /[，。、；：？！「」『』（）()"“”\s]/g;
const norm = (s) => toSimp(String(s || '').replace(LABEL, '')).replace(PUNCT, '');

// ---- 读入 ----
const F = readJson('data/zhouyi-shiyi.json');
const Graw = readJson('data/proofread-sources/liangzid-shiyi-extract.json');

// 源 G 结构：数组，每项 [卦名, 卦辞, 彖传, 大象, 爻辞[], 小象[]]
const G = new Map();
for (let i = 0; i < Graw.length; i += 1) {
  const r = Graw[i];
  if (!Array.isArray(r) || r.length < 6) continue;
  G.set(i + 1, { name: r[0], guaci: r[1], tuan: r[2], daxiang: r[3], yao: r[4] || [], xiaoxiang: r[5] || [] });
}

// ---- 检测源 G 的结构性错位（不写死卦序，靠结构判定）----
// 判据：小象条数超常（一般卦应为 6；乾坤含用九/用六为 7）。
// 超常通常意味着「大象/彖传内容被塞进了小象数组首项，整体后移一条」。
// ★ 为什么不用"大象是否属彖传子串"：源 G 的 33 遁 恰恰把**彖传后半句**漏了，
//   导致该判据不成立；而条数超常是结构事实，稳定得多。
const gDefects = [];
for (const [order, g] of G) {
  const limit = order <= 2 ? 7 : 6;
  if (Array.isArray(g.xiaoxiang) && g.xiaoxiang.length > limit) {
    gDefects.push({
      order,
      why: `小象 ${g.xiaoxiang.length} 条（应为 ${limit}）：源 G 该卦存在内容错位`,
    });
  }
}
const gBadOrders = new Set(gDefects.map((d) => d.order));

// ---- 逐条比对 ----
const rows = [];
for (const h of F.hexagrams) {
  const order = h.order;
  const g = G.get(order);
  if (!g) {
    rows.push({ order, name: h.name, field: '*', status: 'missing', note: '源 G 缺该卦' });
    continue;
  }
  if (gBadOrders.has(order)) {
    rows.push({ order, name: h.name, field: '*', status: 'sourceDefect', note: `源 G 该卦结构性错位（${gDefects.find((d) => d.order === order).why}），本卦以源 F 为准` });
    continue;
  }
  const cmp = (field, a, b) => {
    const na = norm(a);
    const nb = norm(b);
    if (!nb) return 'missing';
    return na === nb ? 'agree' : 'diff';
  };
  // 彖传
  rows.push({ order, name: h.name, field: 'tuan', status: cmp('tuan', h.tuan, g.tuan), F: h.tuan, G: String(g.tuan || '').replace(LABEL, '') });
  // 大象
  rows.push({ order, name: h.name, field: 'daxiang', status: cmp('daxiang', h.daxiang, g.daxiang), F: h.daxiang, G: String(g.daxiang || '').replace(LABEL, '') });
  // 小象
  const n = Math.max(h.xiaoxiang.length, g.xiaoxiang.length);
  for (let i = 0; i < n; i += 1) {
    const fa = h.xiaoxiang[i] || '';
    const gb = g.xiaoxiang[i] || '';
    rows.push({ order, name: h.name, field: `xiaoxiang[${i + 1}]`, status: cmp('xiaoxiang', fa, gb), F: fa, G: String(gb || '').replace(LABEL, '') });
  }
}

// ---- 汇总 ----
const byStatus = (s) => rows.filter((r) => r.status === s);
const agree = byStatus('agree');
const diff = byStatus('diff');
const missing = byStatus('missing');
const defects = byStatus('sourceDefect');

const fieldStat = (field) => {
  const rs = rows.filter((r) => (field === 'xiaoxiang' ? r.field.startsWith('xiaoxiang') : r.field === field));
  return {
    total: rs.length,
    agree: rs.filter((r) => r.status === 'agree').length,
    diff: rs.filter((r) => r.status === 'diff').length,
  };
};

const out = {
  checkedAt: CHECK_DATE,
  checker: 'tools/crosscheck-shiyi.mjs',
  sources: [
    { id: 'F', file: 'data/zhouyi-shiyi.json', kind: '独立转录（维基文库系）', role: '现行本' },
    { id: 'G', file: 'data/proofread-sources/liangzid-shiyi-extract.json', kind: '独立转录（GitHub liangzid）', role: '第二源' },
  ],
  stats: {
    tuan: fieldStat('tuan'),
    daxiang: fieldStat('daxiang'),
    xiaoxiang: fieldStat('xiaoxiang'),
    agree: agree.length,
    diff: diff.length,
    missing: missing.length,
    sourceDefect: defects.length,
  },
  // 两源结构错位（源 G 的缺陷）：整卦不参与比对，以 F 为准
  sourceDefects: gDefects.map((d) => ({ source: 'G', order: d.order, why: d.why })),
  // 分歧全部留档，**不改 F**
  disputed: diff.map((r) => ({ order: r.order, name: r.name, field: r.field, F: r.F, G: r.G })),
};

// ---- 写入 data/zhouyi-proofread.json 的 shiyi 段（其余字段原样保留）----
const pfPath = path.join(ROOT, 'data/zhouyi-proofread.json');
const pf = readJson('data/zhouyi-proofread.json');
pf.shiyi = out;
fs.writeFileSync(pfPath, JSON.stringify(pf, null, 2) + '\n', 'utf8');

// ---- 控制台报告 ----
console.log('十翼交叉校验（源 F vs 源 G）');
console.log(`  彖传   一致 ${out.stats.tuan.agree}/${out.stats.tuan.total}  分歧 ${out.stats.tuan.diff}`);
console.log(`  大象   一致 ${out.stats.daxiang.agree}/${out.stats.daxiang.total}  分歧 ${out.stats.daxiang.diff}`);
console.log(`  小象   一致 ${out.stats.xiaoxiang.agree}/${out.stats.xiaoxiang.total}  分歧 ${out.stats.xiaoxiang.diff}`);
console.log(`  合计：agree ${out.stats.agree} / diff ${out.stats.diff} / 源G结构错位 ${out.stats.sourceDefect}`);
console.log(`  源 G 缺陷卦：${out.sourceDefects.map((d) => d.order + ' ' + d.why).join('；') || '无'}`);
console.log(`  → 写入 data/zhouyi-proofread.json#shiyi（分歧全部留档，未改源 F）`);
