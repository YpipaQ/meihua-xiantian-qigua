// 取模工具：先天起卦法『卦以八除，爻以六除』
// 规则：n % m 的余数为结果；余 0 记作 zeroAs（8=坤 或 6=上爻）；保证对负数亦取正余。
export function mod(n, m, zeroAs) {
  if (!Number.isFinite(n)) throw new Error(`mod: 输入非法 n=${n}`);
  const r = ((n % m) + m) % m;
  return r === 0 ? zeroAs : r;
}

export const mod8 = (n) => mod(n, 8, 8); // 余 0 → 8（坤）
export const mod6 = (n) => mod(n, 6, 6); // 余 0 → 6（上爻）

export default { mod, mod8, mod6 };
