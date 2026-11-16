// src/node-data.mjs —— Node（CLI/测试/脚本）数据装配适配层
// 与 web/js/loaders.js 走同一份 data catalog（src/catalog.js），避免各端手拼文件清单。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_MANIFEST, assembleData, depsFromData, refFileForOrder, interpFileForOrder } from './catalog.js';

// 项目根 = src/ 的上一级
export const NODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readJsonFromRoot(rel) {
  return JSON.parse(fs.readFileSync(path.join(NODE_ROOT, rel), 'utf8'));
}

// 按 manifest 装配 data（同步；与 web loadData 产出同构）
export function loadNodeData() {
  const raw = {};
  for (const it of DATA_MANIFEST) {
    try {
      raw[it.key] = readJsonFromRoot(it.path);
    } catch (e) {
      if (it.optional) { raw[it.key] = null; continue; }
      throw new Error(`读取数据失败（${it.path}）：${e.message}`);
    }
  }
  return assembleData(raw);
}

// data → deps（含 ctx），等价 depsFromData(loadNodeData(), {ctx})
export function loadNodeDeps(ctx) {
  return depsFromData(loadNodeData(), ctx ? { ctx } : {});
}

// 白话导读参考：按卦序集合装载 {order: entryJSON}（先读 index，再按需读卦文件）
export function loadRefForOrders(orders) {
  const idx = loadNodeData().refIndex; // 小文件，随 data 一并读入
  const map = {};
  for (const o of orders || []) {
    const rel = refFileForOrder(idx, o);
    if (!rel) continue;
    map[o] = readJsonFromRoot(rel);
  }
  return map;
}

// 详解参考库：按卦序集合装载 {order: entryJSON}（拆分库 data/interpret；与 web loadInterpMap 同语义）
export function loadInterpForOrders(orders) {
  const idx = loadNodeData().interpIndex;
  const map = {};
  for (const o of orders || []) {
    const rel = interpFileForOrder(idx, o);
    if (!rel) continue;
    map[o] = readJsonFromRoot(rel);
  }
  return map;
}

export default { NODE_ROOT, readJsonFromRoot, loadNodeData, loadNodeDeps, loadRefForOrders, loadInterpForOrders };
