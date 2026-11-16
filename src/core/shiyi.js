// 十翼（彖传·象传·文言传）读取模块 —— 纯函数，无 DOM / 无 node 依赖，Node 与浏览器通用。
// 只"读盘"：按 order 查 data/zhouyi-shiyi.json（schema v6-shiyi-1）；不碰 cast、不改盘。
//   deps.shiyi = data/zhouyi-shiyi.json 整份内容（单文件 43 KB，随 DATA_MANIFEST 一次载入）。
//
// ★ 动爻小象对齐铁律：一律经 pan-view#movingPositions 取动爻位，再以 pos 对齐 xiaoxiang[pos-1]。
//   严禁用 wei 字符串匹配 —— 本项目的语料存在 wei 误标缺陷（如 19 临 六三 的 wei 被标成「九三」），
//   按 wei 匹配会静默丢文。v4（xiangjie）与 v5（crosscheck 复核）各踩过一次，契约 §6 已列为红线。
//
// ★ 可信度口径（v7 起）：十翼现由**两个独立转录源**（F/G）交叉比对，一致率高但不等于全部一致。
//   - 整篇 468 条一致 / 38 条有分歧（分歧**全部留档**，未改正文）
//   - 呈现层标「交叉校验」时**必须同时给出分歧数与留档入口**，不得只说"已校验"
//   - 仍**不得**标「已校对」（那专指人工对照纸质本）
import { movingPositions } from './pan-view.js';

// 来源提示（固定文案）
export const SHIYI_NOTE = '十翼（彖传·象传·文言传）：两源交叉校验（分歧已留档），未经人工校对。';

// 该卦/该条是否被交叉校验发现分歧（crosscheck = data/zhouyi-proofread.json#shiyi，可缺）
function disputedOf(order, crosscheck, field) {
  const list = crosscheck && Array.isArray(crosscheck.disputed) ? crosscheck.disputed : [];
  return list.filter((d) => d && d.order === order && (!field || d.field === field));
}

// 该卦是否为第二源结构缺陷卦（整卦不参与比对，以现行本为准）
function isSourceDefect(order, crosscheck) {
  const list = crosscheck && Array.isArray(crosscheck.sourceDefects) ? crosscheck.sourceDefects : [];
  return list.find((d) => d && d.order === order) || null;
}

// 按卦序取十翼条目（缺数据返回 null，不抛错）
export function shiyiEntry(order, shiyi) {
  if (!order) return null;
  const list = shiyi && Array.isArray(shiyi.hexagrams) ? shiyi.hexagrams : [];
  return list.find((e) => e && e.order === order) || null;
}

// 单卦块的统一形状（ben/zhi 共用）：缺字段如实给 null/空数组，不编造
function blockOf(entry) {
  if (!entry) return null;
  return {
    order: entry.order,
    name: entry.name || '',
    tuan: entry.tuan || '',
    daxiang: entry.daxiang || '',
    xiaoxiang: Array.isArray(entry.xiaoxiang) ? entry.xiaoxiang.slice() : [],
    wenyan: entry.wenyan || null,
  };
}

// 主入口：pan + shiyi + crosscheck → { note, ben, zhi, dong[], crosscheck } | null
// shiyi 缺 / 该卦无条目 ⇒ null（注册表自动跳过，与 xiangjie / baihua 同）
// crosscheck 可缺（缺则不做分歧标注，仅给基础内容 —— 不猜）
export function shiyiReading(pan, shiyi, crosscheck = null) {
  if (!pan || !pan.benGua || !shiyi) return null;
  const benEntry = shiyiEntry(pan.benGua.order, shiyi);
  if (!benEntry) return null;

  const ben = blockOf(benEntry);
  const zhiEntry = pan.zhiGua ? shiyiEntry(pan.zhiGua.order, shiyi) : null;

  // 动爻小象：经 pan-view 取位（升序），再按 pos 对齐（pos-1 下标），不用 wei
  const dong = [];
  for (const pos of movingPositions(pan)) {
    const txt = ben.xiaoxiang[pos - 1];
    // 位次由 pan.yao 提供（存在时）；wei 仅作**展示标签**，不参与对齐
    const y = Array.isArray(pan.yao) ? pan.yao[pos - 1] : null;
    dong.push({ pos, wei: (y && y.title) || null, xiaoxiang: txt || '' });
  }

  const zhi = blockOf(zhiEntry);

  // 交叉校验信息（按卦聚合）：只陈述事实，不改正文
  let cc = null;
  if (crosscheck) {
    const benDisp = disputedOf(ben.order, crosscheck);
    const zhiDisp = zhi ? disputedOf(zhi.order, crosscheck) : [];
    const defect = isSourceDefect(ben.order, crosscheck);
    const st = crosscheck.stats || null;
    cc = {
      // 整篇统计（供 banner 展示）
      stats: st ? { agree: st.agree, diff: st.diff, sourceDefect: st.sourceDefect } : null,
      // 本卦/之卦的分歧条目（供 UI 折叠留档）
      ben: benDisp.map((d) => ({ field: d.field, F: d.F, G: d.G })),
      zhi: zhiDisp.map((d) => ({ field: d.field, F: d.F, G: d.G })),
      // 本卦若为第二源结构缺陷卦，如实标注（该卦实际只有单源支撑）
      sourceDefect: defect ? { order: defect.order, why: defect.why } : null,
    };
  }

  return { note: SHIYI_NOTE, ben, zhi, dong, crosscheck: cc };
}

// 纯文本（readingsText / textPan / CLI 用）→ string[]
export function shiyiText(data) {
  if (!data) return [];
  const L = [];
  const blk = (label, b) => {
    if (!b) return;
    if (b.tuan) L.push(`十翼｜${label} ${b.name} 彖传：${b.tuan}`);
    // 大象不在文本里重复——经文区/详解区已展示，这里只在有彖传时顺带说明
    if (b.wenyan) L.push(`十翼｜${label} ${b.name} 文言传：${b.wenyan}`);
    if (b.xiaoxiang.length && !b.tuan) {
      // 无彖传的卦（不应发生，但容错）：至少给大象
      L.push(`十翼｜${label} ${b.name} 大象：${b.daxiang}`);
    }
  };
  blk('本卦', data.ben);
  for (const d of data.dong || []) {
    if (d.xiaoxiang) L.push(`十翼｜动爻小象 ${d.wei || `${d.pos}爻`}：${d.xiaoxiang}`);
  }
  blk('之卦', data.zhi);
  // 交叉校验留档（v7）：只陈述分歧，不改正文、不判对错
  const cc = data.crosscheck;
  if (cc) {
    if (cc.stats) {
      L.push(
        `十翼｜交叉校验：两源一致 ${cc.stats.agree} 条、分歧 ${cc.stats.diff} 条` +
          `${cc.stats.sourceDefect ? `（另有 ${cc.stats.sourceDefect} 卦因第二源结构错位不参与比对）` : ''}`
      );
    }
    for (const [label, arr] of [['本卦', cc.ben || []], ['之卦', cc.zhi || []]]) {
      for (const d of arr) {
        L.push(`十翼分歧留档｜${label} ${d.field}：F=${d.F}`);
        L.push(`十翼分歧留档｜${label} ${d.field}：G=${d.G}`);
      }
    }
    if (cc.sourceDefect) {
      L.push(`十翼｜注意：本卦（第${cc.sourceDefect.order}卦）第二源存在结构错位（${cc.sourceDefect.why}），仅单源支撑`);
    }
  }
  L.push(`十翼｜提示：${data.note || SHIYI_NOTE}`);
  return L;
}

export default { SHIYI_NOTE, shiyiEntry, shiyiReading, shiyiText };
