// src/catalog.js —— 数据目录 + 装配/依赖契约（唯一清单，环境无关：Node / 浏览器 / 未来前端共用）
// 职责：
//   1) DATA_MANIFEST：项目数据文件的唯一清单（key/path/optional/pick）；
//   2) assembleData(rawByKey)：把各来源解析后的 JSON 装配成 data（唯一数据源结构，含缺省）；
//   3) depsFromData(data)：按解读注册表约定收敛出 deps 字段（供 interpretPan/readingsText）；
//   4) refFileForOrder / interpFileForOrder：参考语料（data/ref-corpus 旧库、data/interpret 拆分库）
//      按卦序取文件。
// 约定：所有“对外接口/消费端”只 import 本模块（或本模块的 Node/Web 适配器），禁止各自手拼清单。
// 纯函数：不 import fs/fetch/DOM；读取动作由适配层注入（web/js/loaders.js、src/node-data.mjs）。

export const DATA_MANIFEST = [
  { key: 'trigrams', path: 'data/trigrams.json', optional: false, pick: (j) => j.trigrams },
  { key: 'hexagrams', path: 'data/hexagrams.json', optional: false, pick: (j) => j.hexagrams },
  { key: 'rules', path: 'data/rules.json', optional: false, pick: (j) => j.rules },
  { key: 'coinConfig', path: 'data/coin-config.json', optional: false, pick: (j) => j },
  { key: 'verdictHex', path: 'data/interpretations/hexagram-verdicts.json', optional: false, pick: (j) => j.hexagrams },
  { key: 'verdictTiYong', path: 'data/interpretations/tiyong-verdicts.json', optional: false, pick: (j) => j },
  { key: 'classic', path: 'data/zhouyi-classic.json', optional: false, pick: (j) => j },
  { key: 'proofread', path: 'data/zhouyi-proofread.json', optional: true, pick: (j) => j },
  { key: 'najia', path: 'data/najia.json', optional: true, pick: (j) => j },
  { key: 'refIndex', path: 'data/ref-corpus/index.json', optional: true, pick: (j) => j }, // 白话导读参考索引（文件本身为裸数组：order→file）
  { key: 'interpIndex', path: 'data/interpret/index.json', optional: true, pick: (j) => j.entries }, // 详解索引（文件为 {meta,entries}；契约 §4 要求载入器吃 entries 数组，与 refIndex 同构）
  // v5 §4.1 补齐：以下两项均 optional（缺文件不阻塞起卦），且 **不进解读链**（depsFromData 不新增键）。
  //   ganzhiDict：干支/时辰字典（与 src/core/calendar.js#ZHI_DETAIL 同构，供展示层引用与对拍防漂移）
  //   cases：文档/演示用例集（仅供展示与测试，不参与起卦或解读）
  { key: 'ganzhiDict', path: 'data/ganzhi-dict.json', optional: true, pick: (j) => j },
  { key: 'cases', path: 'data/cases.json', optional: true, pick: (j) => j.cases },
  // v6 §2.1：十翼（彖传/象传/文言传）。单文件 43 KB，随清单一次载入，不需要按卦懒加载。
  // 不进 depsFromData（它是可选展示层数据），由 depsFromOpts 直通 deps.shiyi。
  { key: 'shiyi', path: 'data/zhouyi-shiyi.json', optional: true, pick: (j) => j },
  // v11 §来源标注：解读文本的作者/原书/转载站登记（用于 UI 角标，不进解读链）
  { key: 'sourcesRegistry', path: 'data/sources-registry.json', optional: true, pick: (j) => j },
];

// 逐文件 pick 后的键（本模块名 = loadData 返回的 data 字段名）
export function assembleData(rawByKey) {
  const data = {};
  for (const it of DATA_MANIFEST) {
    const raw = rawByKey == null ? null : rawByKey[it.key];
    if (raw == null) {
      if (!it.optional) throw new Error(`数据缺失（${it.path}）`);
      data[it.key] = it.key === 'proofread' ? { checked: [] } : null; // 校对缺省=全未校对
      continue;
    }
    data[it.key] = typeof it.pick === 'function' ? it.pick(raw) : raw;
  }
  return data;
}

// deps 收敛：data → 解读注册表所需字段（verdict/classic/najia/baihua/xiangjie 各自所需；缺则不给）
export function depsFromData(data, extra = {}) {
  const d = {};
  if (data.verdictHex && data.verdictTiYong) {
    d.verdictHex = data.verdictHex;
    d.verdictTiYong = data.verdictTiYong;
  }
  if (data.classic) {
    d.classic = data.classic;
    d.proofread = data.proofread || { checked: [] };
  }
  if (data.trigrams && data.najia) {
    d.trigrams = data.trigrams;
    d.najia = data.najia;
    d.ctx = extra.ctx || data.ctx || {};
  }
  if (data.refIndex) d.refIndex = data.refIndex; // 参考库索引（按需再取具体卦文件）
  if (data.interpIndex) d.interpIndex = data.interpIndex; // 详解参考库索引（按需再取具体卦文件）
  return d;
}

// 参考语料：index 条目（{order,name,file}）→ 相对路径（供 Node/web 按需读取某一卦）
export function refEntryForOrder(index, order) {
  return Array.isArray(index) ? (index.find((x) => x && x.order === order) || null) : null;
}

export function refFileForOrder(index, order) {
  const e = refEntryForOrder(index, order);
  return e ? `data/ref-corpus/${e.file}` : null;
}

// 详解参考库（data/interpret）：同一套「索引条目 → 相对路径」读法（见契约 §3）
export function interpEntryForOrder(index, order) {
  return Array.isArray(index) ? (index.find((x) => x && x.order === order) || null) : null;
}

export function interpFileForOrder(index, order) {
  const e = interpEntryForOrder(index, order);
  return e ? `data/interpret/${e.file}` : null;
}

// 渲染/纯文本侧 opts（= assembleData 整包 + 可选 ctx/ref/interp）→ deps：depsFromData 之上只补直通
// （白话导读需按需载入的参考卦条目 {order: entry}、详解参考库 {order: entry}）。
// text-pan / render / CLI 共用，不各自手拼。
export function depsFromOpts(opts) {
  const d = depsFromData(opts || {});
  if (opts && opts.ref) d.ref = opts.ref;
  if (opts && opts.interp) d.interp = opts.interp;
  if (opts && opts.shiyi) d.shiyi = opts.shiyi; // v6：十翼（单文件，直通）
  // v8：繁档（detail:'full'）才展开异文留档 —— 简档只给一行条数注
  if (opts && opts.detail === 'full') d.withDisputes = true;
  return d;
}

// 渲染层 opts（loadData 返回的 data + 本次会话 ctx）→ 与 deps 同构的“可展示”键清单说明
// （render.js 经 depsFromOpts 收敛，不再自行挑选字段）
export const DEFAULT_OPTS_HELP = 'data 即 opts：把 assembleData 结果整包传给 renderPan(el,pan,{...data,ctx,ref?,interp?})。';

export default {
  DATA_MANIFEST,
  assembleData,
  depsFromData,
  depsFromOpts,
  refEntryForOrder,
  refFileForOrder,
  interpEntryForOrder,
  interpFileForOrder,
};
