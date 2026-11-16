// 经文（卦辞/爻辞）读取模块（纯函数，无 DOM / 无 node 依赖，Node 与浏览器通用）
// 只“读盘”：按 order 查 data/zhouyi-classic.json；动爻爻题→yaoCi[].ref 定位；乾坤六爻全动→用九/用六。
// 校对口径：meta.proofread=true 视为全已校对；否则看 proofread 文件 { checked:[order,…] } 逐卦增量。
// 动爻集统一经 pan-view（movingPositions）读取，不关心盘来源。
import { movingPositions } from './pan-view.js';

// 按卦序取经文条目（缺数据返回 null，不抛错）
export function classicEntry(order, classicHexagrams) {
  if (!order || !Array.isArray(classicHexagrams)) return null;
  return classicHexagrams.find((e) => e && e.order === order) || null;
}

// 三级校对状态（已冻结）：checked（人工）/ crosschecked（机器交叉校验）/ none（未校对）
// 机器结论绝不冒充人工结论 —— crosschecked 与 checked 是两种不同的事实。
export const PROOFREAD_LEVELS = ['checked', 'crosschecked', 'none'];

// 三级判定（唯一口径）：
//   - classicMeta.proofread === true → 'checked'（全局人工校对标记）
//   - order ∈ proofreadMap.checked   → 'checked'（逐卦人工校对）
//   - order ∈ proofreadMap.crosschecked → 'crosschecked'（多源机器比对一致，非人工）
//   - 其余                          → 'none'
export function proofreadLevel(order, classicMeta, proofreadMap) {
  if (!order) return 'none';
  if (classicMeta && classicMeta.proofread === true) return 'checked';
  const checked = proofreadMap && Array.isArray(proofreadMap.checked) ? proofreadMap.checked : [];
  if (checked.includes(order)) return 'checked';
  const cross =
    proofreadMap && Array.isArray(proofreadMap.crosschecked) ? proofreadMap.crosschecked : [];
  if (cross.includes(order)) return 'crosschecked';
  return 'none';
}

// 某卦是否“已校对”（旧签名与旧语义保留 = level !== 'none'，既有调用点不改）
export function isProofread(order, classicMeta, proofreadMap) {
  return proofreadLevel(order, classicMeta, proofreadMap) !== 'none';
}

// 该卦的异文留档（契约 §1.1 disputed / §5.3「disputed 全部留档可见」）：
// 返回 [{ref, chosen, sources:{A,B,…}, dissent:[…], note}]，无则 []。
// ★ 只读留档、绝不参与“取哪句”的决策 —— 展示层据此提示「此条有多源分歧」，
//   经文正文一律仍取 zhouyi-classic（chosen 与正文同源），不改字。
export function disputedOf(order, proofreadMap) {
  if (!order) return [];
  const list = proofreadMap && Array.isArray(proofreadMap.disputed) ? proofreadMap.disputed : [];
  return list.filter((d) => d && d.order === order);
}

// 动爻对应的爻题列表（自下而上顺序）：铜钱多动用 movingYao；时间/数字用 dongYao；
// 乾(1)/坤(2) 六爻全动 → 分别取用九/用六（总纲辞），不再逐条列六爻。
export function dongRefs(pan) {
  if (!pan || !pan.benGua) return [];
  const pos = movingPositions(pan); // 恒为升序位集合：[] 静 / [p] / [p1,p2,…]
  if (pos.length === 6) {
    if (pan.benGua.order === 1) return ['用九'];
    if (pan.benGua.order === 2) return ['用六'];
  }
  const yaos = Array.isArray(pan.yao) ? pan.yao : [];
  return pos
    .map((p) => {
      const y = yaos[p - 1];
      return y && y.title ? y.title : null;
    })
    .filter(Boolean);
}

// 组装经文视图（供 Web 展示 / textPan 复制）
export function classicReading(pan, classic, proofread, opts = {}) {
  const c = classic && Array.isArray(classic.hexagrams) ? classic.hexagrams : [];
  const meta = classic && classic.meta ? classic.meta : null;
  const ben = classicEntry(pan && pan.benGua ? pan.benGua.order : null, c);
  const zhiGua = pan && pan.zhiGua ? pan.zhiGua : null;
  const zhi = classicEntry(zhiGua ? zhiGua.order : null, c);
  const refs = dongRefs(pan);
  const pick = (entry, ref) =>
    entry && Array.isArray(entry.yaoCi) ? entry.yaoCi.find((x) => x && x.ref === ref) || null : null;
  const dong = refs.map((ref) => pick(ben, ref)).filter(Boolean).map((x) => ({ ref: x.ref, text: x.text }));
  // 异文留档：按 ref 索引，供块级透出（契约 §5.3 留档可见）。只做展示，不参与取字。
  const disputedByRef = (order) => {
    const out = {};
    for (const d of disputedOf(order, proofread)) {
      const k = d.ref || '卦辞';
      (out[k] || (out[k] = [])).push({
        ref: k,
        chosen: d.chosen || '',
        sources: d.sources || {},
        dissent: Array.isArray(d.dissent) ? d.dissent : [],
        note: d.note || '',
      });
    }
    return out;
  };
  const block = (entry) => {
    const level = proofreadLevel(entry.order, meta, proofread);
    return {
      order: entry.order,
      name: entry.name,
      guaci: entry.guaci,
      // v5 增补：三级校对等级；保留旧布尔 proofread（= proofLevel !== 'none'）以免破坏既有测试与文本导出
      proofLevel: level,
      proofread: level !== 'none',
      // v5.1 增补：本卦异文留档 { ref: [ {chosen, sources, dissent, note} ] }；无则空对象
      disputed: disputedByRef(entry.order),
    };
  };
  return {
    benGua: ben ? { ...block(ben), dong, static_: refs.length === 0 } : null,
    zhiGua: zhi ? block(zhi) : null,
    metaUnchecked: meta && meta.proofread !== true, // 全局“未经人工校对”是否生效
    // v8：是否展开异文留档（默认 false —— 简档不糊脸；UI 折叠区/withDisputes 才展开）
    withDisputes: Boolean(opts && opts.withDisputes),
    // v5.2 增补：来源登记图例（契约 §1.1「sources：来源登记（可追溯）」）。
    // ★ 没有它，UI 上的「A=… ／ B=… ／ C=…」对用户就是天书 —— 留档的意义是**可复核**，
    //   而"哪个字母是哪本书"正是复核的第一步。数据一直在 deps.proofread.sources，只是从未透出。
    sources: proofread && Array.isArray(proofread.sources) ? proofread.sources : [],
  };
}
