// 解读模块注册表测试：node tests/run-readings-tests.js
// 覆盖：默认装配顺序、按 deps 裁剪、插拔（register/unregister）、重复注册报错、only 过滤、统一文本输出、
//       错误隔离、defaultOff（baihua 退链）、铜钱链放行（classic/najia/xiangjie，verdict 不装配）
import fs from 'node:fs';
import {
  cast,
  castCoinLines,
  registerReader,
  unregisterReader,
  listReaders,
  interpretPan,
  registerTextFormatter,
  readingsText,
} from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const deps = {
  verdictHex: readJson('../data/interpretations/hexagram-verdicts.json').hexagrams,
  verdictTiYong: readJson('../data/interpretations/tiyong-verdicts.json'),
  classic: readJson('../data/zhouyi-classic.json'),
  proofread: readJson('../data/zhouyi-proofread.json'),
};
const data = {
  trigrams: readJson('../data/trigrams.json').trigrams,
  hexagrams: readJson('../data/hexagrams.json').hexagrams,
  rules: readJson('../data/rules.json').rules,
};

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// ---- 0) 默认装配（顺序：verdict → classic → najia → xiangjie；baihua 退链 defaultOff）----
const ids = listReaders().map((r) => r.id);
// liuyao：插在 najia 之后（消费其装卦结果）
// shiyi：置链末（最学术、最不常用）
check(ids.join(',') === 'verdict,classic,najia,liuyao,xiangjie,shiyi,baihua', `默认链序 verdict,classic,najia,liuyao,xiangjie,shiyi,baihua（实得 ${ids.join(',')}）`);

const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });

// ---- 1) 无 deps → 各模块都跳过 ----
check(interpretPan(guanmei, {}).length === 0, '无 deps → 无结果（可插拔裁剪）');

// ---- 2) 全 deps → 按注册顺序产出 ----
const resAll = interpretPan(guanmei, deps);
check(resAll.length === 2 && resAll[0].id === 'verdict' && resAll[1].id === 'classic', '全 deps（无 interp）→ 按注册顺序产出 verdict/classic');
check(resAll[0].data.guaBrief.length > 10, 'verdict 数据含导语');
check(resAll[1].data.benGua.order === 49, 'classic 数据本卦=革(49)');
check(resAll[1].data.benGua.dong[0].ref === '初九', 'classic 动爻=初九');

// ---- 3) 统一文本 ----
const text = readingsText(resAll, guanmei);
check(text.some((l) => l.startsWith('卦意导语：')), '文本含卦意导语');
check(text.some((l) => l.startsWith('体用断语：')), '文本含体用断语');
check(text.some((l) => l.includes('经文｜本卦 革')), '文本含经文本卦');
check(text.some((l) => l.includes('经文｜初九')), '文本含动爻爻辞');
check(text.some((l) => l.includes('经文｜之卦 咸')), '文本含之卦卦辞');

// ---- 4) only 过滤 ----
const onlyClassic = interpretPan(guanmei, deps, { only: ['classic'] });
check(onlyClassic.length === 1 && onlyClassic[0].id === 'classic', 'only 过滤生效');

// ---- 5) 插拔：注册→生效→注销 ----
const back = (pan, d) => ({ echoed: `${pan && pan.benGua ? pan.benGua.name : '?'}@${(d && d.tag) || '-'}` });
check(registerReader({ id: 'zz-demo', title: '演示', run: back }) > 0, 'register 返回长度');
check(listReaders().some((r) => r.id === 'zz-demo'), '注册后可见');
const rDemo = interpretPan(guanmei, { ...deps, tag: 'T' }, { only: ['zz-demo'] });
check(rDemo.length === 1 && rDemo[0].data.echoed === '革@T', '新 reader 即插即用');
registerTextFormatter('zz-demo', (d) => [`演示行：${d.echoed}`]);
check(readingsText(rDemo, guanmei).includes('演示行：革@T'), '新 reader 文本经 formatter 输出');
unregisterReader('zz-demo');
check(!listReaders().some((r) => r.id === 'zz-demo'), '注销后不可见');
check(interpretPan(guanmei, deps, { only: ['zz-demo'] }).length === 0, '注销后不再装配');

// ---- 6) 重复注册 / 抛错 reader ----
let dupThrows = false;
try { registerReader({ id: 'verdict', title: 'x', run: () => null }); } catch { dupThrows = true; }
check(dupThrows, '重复注册 → 抛错');

registerReader({ id: 'zz-boom', title: '抛错', run: () => { throw new Error('boom'); } });
const boom = interpretPan(guanmei, deps);
check(boom.some((r) => r.id === 'zz-boom' && r.error === 'boom'), 'reader 抛错 → 错误结果隔离，不影响其他模块');
check(readingsText(boom, guanmei).some((l) => l.includes('zz-boom') && l.includes('读取失败')), '错误在文本中以提示行呈现');
unregisterReader('zz-boom');

// ---- 7) 铜钱链放行（阶段四：复用现有 reader）----
const coinPan = castCoinLines(data, Array.from({ length: 6 }, (_, i) => ({ value: 1, moving: i === 0 })), { yangFace: '字' });
check(coinPan.kind === 'coin' && coinPan.dongYao === 1, '铜钱盘（乾初爻动）构造正确');
const coinDeps = { ...deps, najia: readJson('../data/najia.json'), trigrams: data.trigrams };
const coinRes = interpretPan(coinPan, coinDeps);
// v8：简档只出核心 ⇒ 铜钱盘默认只剩 classic（najia/liuyao 退链）。
// 本条锁的语义始终是「verdict 不装配（体用恒空）」，故改为在**两档**下分别验证：
//   简档 = classic；繁档 = classic,najia,liuyao（仍无 verdict）。
check(coinRes.map((r) => r.id).join(',') === 'classic', `铜钱盘简档只出 classic（实得 ${coinRes.map((r) => r.id).join(',')}）`);
{
  const fullIds = interpretPan(coinPan, coinDeps, { detail: 'full' }).map((r) => r.id);
  check(
    fullIds.join(',') === 'classic,najia,liuyao',
    `铜钱盘繁档 = classic,najia,liuyao（verdict 仍不装配；实得 ${fullIds.join(',')}）`
  );
}
check(interpretPan(coinPan, coinDeps, { only: ['verdict'] }).length === 0, '铜钱盘 verdict 不产出（even only）');
check(interpretPan(coinPan, coinDeps, { only: ['classic', 'najia'] }).length === 2, '铜钱盘 only:classic,najia 均产出');

// ---- 8) defaultOff（baihua）：不在默认链，only 显式点名仍可用 ----
const refDeps = { ref: { 49: { order: 49, name: '革', hexagram: { plain: { 译文: 'x' } } } } };
check(interpretPan(guanmei, refDeps).every((r) => r.id !== 'baihua'), 'defaultOff：baihua 不在默认链');
check(interpretPan(guanmei, refDeps, { only: ['baihua'] }).length === 1, 'defaultOff：only:baihua 仍可装配');

console.log(`注册表测试：${pass} 项通过，${fail} 项失败`);
if (fail) {
  console.log('失败项：');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('READINGS TESTS PASSED');
