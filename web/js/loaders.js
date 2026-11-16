// 数据加载（浏览器侧）：按 src/catalog.js 的 DATA_MANIFEST 清单 fetch 全部 JSON 并装配为 data。
// 与 Node 侧（src/node-data.mjs）走同一份清单与 assembleData，产出同构 data（不再在此手拼字段）。
// 白话导读参考（data/ref-corpus）：只在起卦后按需取“本卦/之卦”两个卦文件（loadRefMap），
// 详解参考库（data/interpret）：同法按需取（loadInterpMap），均不在首屏全量拉取 64 份。
// ⚠️ file:// 直接打开会被浏览器拦截，需经本地服务器访问（node tools\serve.mjs 或双击 启动演示.cmd）。
import { DATA_MANIFEST, assembleData, refFileForOrder, interpFileForOrder } from '../../src/catalog.js';

let cache = null;

async function loadJson(rel) {
  const res = await fetch(rel);
  if (!res.ok) throw new Error(`HTTP ${res.status}：${rel}`);
  return res.json();
}

// 可选文件（校对状态/纳甲/参考索引不存在时按空处理，不阻塞起卦）
async function loadOptionalJson(rel) {
  const res = await fetch(rel);
  if (!res.ok) return null;
  return res.json();
}

export async function loadData() {
  if (cache) return cache;
  try {
    const raw = {};
    for (const it of DATA_MANIFEST) {
      raw[it.key] = it.optional ? await loadOptionalJson(it.path) : await loadJson(it.path);
    }
    cache = assembleData(raw);
  } catch (err) {
    if (window.location.protocol === 'file:') {
      throw new Error(
        '检测到以 file:// 直接打开：浏览器禁止本地读取 JSON/模块。\n' +
          '请双击「启动演示.cmd」，或执行 node tools\\serve.mjs 后访问\n' +
          'http://127.0.0.1:8642/web/index.html'
      );
    }
    throw err;
  }
  return cache;
}

// 按需取参考卦条目：index = 索引（entries 数组，可为 null）；orders = 卦序集合；fileFor = 索引条目→相对路径。
// 返回 { [order]: entryJSON }（缺文件/无索引 → 空对象）。逐文件缓存 promise：同一次会话同一卦不重复请求；
// 失败按“无此卦参考”处理，不阻塞起卦。loadRefMap（旧语料 data/ref-corpus）与 loadInterpMap
// （拆分库 data/interpret）共用本实现，保持同签名同语义（契约 §4）。
const refEntryCache = new Map(); // order → Promise<entry | null>
const interpEntryCache = new Map(); // order → Promise<entry | null>

async function loadMapByOrders(cache, fileFor, index, orders) {
  const map = {};
  if (!Array.isArray(index) || !orders || !orders.length) return map;
  const tasks = [];
  for (const order of new Set(orders)) {
    if (order == null) continue;
    if (!cache.has(order)) {
      const rel = fileFor(index, order);
      cache.set(order, rel ? loadOptionalJson(rel).catch(() => null) : Promise.resolve(null));
    }
    tasks.push(cache.get(order).then((entry) => { if (entry) map[order] = entry; }));
  }
  await Promise.all(tasks);
  return map;
}

// 按需取白话导读参考卦条目：index = data.refIndex（data/ref-corpus/index.json，可为 null）；
// orders = 卦序集合（如 [本卦order, 之卦order]）。
export function loadRefMap(index, orders) {
  return loadMapByOrders(refEntryCache, refFileForOrder, index, orders);
}

// 按需取详解参考卦条目：index = data.interpIndex（data/interpret/index.json，可为 null）；
// orders = 卦序集合（本卦/之卦，自动去重）。返回对象直接挂到渲染 opts 的 interp 键（与 ref 同构用法）。
export function loadInterpMap(index, orders) {
  return loadMapByOrders(interpEntryCache, interpFileForOrder, index, orders);
}
