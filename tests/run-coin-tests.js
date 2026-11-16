// 六爻铜钱起卦测试：node tests/run-coin-tests.js
// 覆盖：铜钱面→爻映射、成卦/之卦、动爻标注、体用/互卦恒空；★阶段四：铜钱盘解卦放行（classic/najia/xiangjie）
import fs from 'node:fs';
import { lineFromCoins, tossThree, castCoinLines, COIN_SIDES, interpretPan } from '../src/core/index.js';
import { depsFromData } from '../src/catalog.js';
import { loadNodeData } from '../src/node-data.mjs';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const tri = readJson('../data/trigrams.json').trigrams;
const hex = readJson('../data/hexagrams.json').hexagrams;
const data = { trigrams: tri, hexagrams: hex };

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(msg);
  }
}
const eq = (o, want) => o.value === want.value && o.moving === want.moving && o.label === want.label;

// ---- 映射（默认 字为阳）----
{
  const cfg = { yangFace: '字' };
  check(eq(lineFromCoins(['字', '字', '字'], cfg), { value: 1, moving: true, label: '老阳' }), '字字字 → 老阳(动)');
  check(eq(lineFromCoins(['字', '字', '背'], cfg), { value: 1, moving: false, label: '少阳' }), '字字背 → 少阳(静)');
  check(eq(lineFromCoins(['字', '背', '背'], cfg), { value: 0, moving: false, label: '少阴' }), '字背背 → 少阴(静)');
  check(eq(lineFromCoins(['背', '背', '背'], cfg), { value: 0, moving: true, label: '老阴' }), '背背背 → 老阴(动)');
}
// ---- 切"背为阳"（映射对称）----
{
  const cfg = { yangFace: '背' };
  check(eq(lineFromCoins(['背', '背', '背'], cfg), { value: 1, moving: true, label: '老阳' }), '背为阳：背背背 → 老阳');
  check(eq(lineFromCoins(['字', '字', '字'], cfg), { value: 0, moving: true, label: '老阴' }), '背为阳：字字字 → 老阴');
}
// ---- 三枚全排列组合均为合法（8 种面排列覆盖 4 结果）----
{
  let ok = true;
  const seen = new Set();
  for (const a of COIN_SIDES) for (const b of COIN_SIDES) for (const c of COIN_SIDES) {
    const l = lineFromCoins([a, b, c]);
    seen.add(l.label);
    if (![1, 0].includes(l.value)) ok = false;
  }
  check(ok && seen.size === 4, '8 种面排列 → 覆盖 老阳/少阳/少阴/老阴');
}
// ---- 确定性 RNG ----
{
  let i = 0;
  const seq = [0.9, 0.1, 0.1]; // 0.9→'字'?（rng<0.5→'背'，≥0.5→'字'）
  const rng = () => seq[i++ % seq.length];
  const coins = tossThree(rng);
  check(coins.join('') === '字背背', `tossThree 按序列 0.9,0.1,0.1 → 应 字背背，实得 ${coins.join('')}`);
}
// ---- 成卦：乾之初爻动 → 姤；唯一动爻 → 体用 ----
{
  const throws = [
    { value: 1, moving: true },  // 初爻动
    { value: 1, moving: false },
    { value: 1, moving: false },
    { value: 1, moving: false },
    { value: 1, moving: false },
    { value: 1, moving: false },
  ];
  const pan = castCoinLines(data, throws, { yangFace: '字' });
  check(pan.benGua.order === 1 && pan.benGua.name === '乾', `本卦应乾，实得 ${pan.benGua.name}`);
  check(pan.zhiGua && pan.zhiGua.order === 44 && pan.zhiGua.name === '姤', `之卦应姤，实得 ${pan.zhiGua ? pan.zhiGua.name : '无'}`);
  check(pan.dongYao === 1 && pan.movingYao.length === 1, '动爻应唯一(1)');
  check(pan.tiYong === null && pan.huGua === null, '铜钱盘恒不带梅花派生：唯一动爻也不给互卦/体用');
  check(pan.steps === null && Array.isArray(pan.records) && pan.records.length === 6, '铜钱盘无 steps、带 6 条掷出记录');
  check(pan.yao[0].isDong === true && pan.yao.filter((y) => y.isDong).length === 1, '动爻标注只命中初爻');
}
// ---- 多动：泰之二、五爻动 → 既济；多动不取体用 ----
{
  // 泰 = 上坤(000) 下乾(111)；自下而上 [1,1,1,0,0,0]
  const throws = [1, 1, 1, 0, 0, 0].map((value, i) => ({ value, moving: i === 1 || i === 4 }));
  const pan = castCoinLines(data, throws, { yangFace: '字' });
  check(pan.benGua.name === '泰' && pan.zhiGua && pan.zhiGua.order === 63 && pan.zhiGua.name === '既济',
    `泰动二五应之既济，实得 ${pan.zhiGua ? pan.zhiGua.name : '无'}（本卦${pan.benGua.name}）`);
  check(pan.tiYong === null && pan.movingYao.length === 2, '多动：不取体用、动爻列 2 位');
  check(pan.warnings.some((w) => w.includes('多动')), '多动应有提示');
}
// ---- 静卦（无动）与全动（六爻皆动）边界 ----
{
  const still = [1, 0, 1, 0, 1, 1].map((value) => ({ value, moving: false }));
  const p1 = castCoinLines(data, still, { yangFace: '字' });
  check(p1.zhiGua === null && p1.tiYong === null && p1.warnings.some((w) => w.includes('静卦')), '静卦：无之卦/无体用/有提示');
  const all = [1, 1, 1, 1, 1, 1].map((value, i) => ({ value, moving: true }));
  const p2 = castCoinLines(data, all, { yangFace: '字' });
  check(p2.zhiGua && p2.zhiGua.order === 2 && p2.zhiGua.name === '坤', '乾全爻动 → 之卦坤');
  check(p2.yao.every((y) => y.isDong), '六爻皆标动');
}

// ---- 阶段四：铜钱盘解卦放行（复用现有 reader）----
{
  const throws = [1, 1, 1, 1, 1, 1].map((value, i) => ({ value, moving: i === 0 }));
  const pan = castCoinLines(data, throws, { yangFace: '字' });
  const node = loadNodeData();
  const deps = depsFromData(node);
  const res = interpretPan(pan, deps);
  const ids = res.map((r) => r.id);
  // v8：najia 退链（defaultOff）—— 简档只出核心；繁档（detail:'full'）仍可拿到 najia。
  //   本条锁的语义是「铜钱盘能装配经文」，najia 改为在繁档断言。
  check(ids.includes('classic'), `铜钱盘简档放行 classic（实得 ${ids.join(',')}）`);
  {
    const full = interpretPan(pan, deps, { detail: 'full' }).map((r) => r.id);
    check(full.includes('najia'), `铜钱盘繁档含 najia（实得 ${full.join(',')}）`);
  }
  check(!ids.includes('verdict'), '铜钱盘 verdict 不装配（体用恒空）');
  check(res.every((r) => !r.error), '铜钱盘各 reader 无错误');
  const xj = node.interpIndex ? interpretPan(pan, { ...deps, interp: null }, { only: ['xiangjie'] }) : [];
  check(xj.length === 0, '无 deps.interp → xiangjie 对铜钱盘亦跳过（缺数据不产出，非盘类型门控）');
}

console.log(`\n铜钱摇卦测试：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('COIN TESTS PASSED');
