// 白话导读（参考汇编）reader 测试：node tests/run-refguide-tests.js
// 覆盖：本卦/动爻/之卦 白话命中；无 ref 跳过；铜钱盘空置；AI 补写标记；文本输出；去掉“卦名卦：”前缀
import fs from 'node:fs';
import {
  cast,
  castCoinLines,
  interpretPan,
  listReaders,
  readingsText,
  refGuideReading,
  refGuideText,
} from '../src/core/index.js';

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));
const data = {
  trigrams: readJson('../data/trigrams.json').trigrams,
  hexagrams: readJson('../data/hexagrams.json').hexagrams,
  rules: readJson('../data/rules.json').rules,
};
const indexFile = readJson('../data/ref-corpus/index.json');

function refFor(orders) {
  const map = {};
  for (const o of orders) {
    const it = indexFile.find((x) => x.order === o);
    if (!it) continue;
    map[o] = readJson(`../data/ref-corpus/${it.file}`);
  }
  return map;
}

// 手工构造盘：按语料某卦的爻题序列生成 yao[]（position/title），movingPositions 用 movingYao
function mkPan(order, name, movingPositions) {
  const entry = refFor([order])[order];
  const yao = entry.yaos.map((y, i) => ({ index: i, position: i + 1, title: y.wei, value: 1 }));
  return {
    kind: undefined,
    benGua: { order, name },
    zhiGua: null,
    yao,
    movingYao: movingPositions,
    lines: yao.map(() => 1),
    warnings: [],
  };
}

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(msg); }
}

// ---- 0) baihua 已注册但退出默认链（阶段四：defaultOff，仅 only:['baihua'] 可调用）----
check(listReaders().some((r) => r.id === 'baihua'), 'baihua reader 仍注册（代码保留）');

// ---- 1) 观梅盘（49 革之 31 咸，初爻动）----
const guanmei = cast(data, { ruleId: 'time', values: { yearBranch: 5, month: 12, day: 17, hourBranch: 9 } });
const refGm = refFor([49, 31]);
const rGm = refGuideReading(guanmei, refGm);
check(rGm && rGm.ben.order === 49 && rGm.ben.name === '革', '本卦命中 49 革');
check(rGm.ben.译文.length > 0 && !rGm.ben.译文.startsWith('革卦：'), '卦辞白话非空且已去“革卦：”前缀');
check(rGm.dong.length === 1 && rGm.dong[0].title === '初九', '动爻白话命中初九');
check(rGm.zhi && rGm.zhi.order === 31 && rGm.zhi.name === '咸', '之卦白话命中 31 咸');
check(rGm.ben.voices.length > 0, '本卦附可引用“名家”键清单');

// ---- 2) 经注册表装配与文本 ----
const res = interpretPan(guanmei, { ref: refGm }, { only: ['baihua'] });
check(res.length === 1 && res[0].id === 'baihua', 'only baihua 装配（显式点名仍可用）');
check(interpretPan(guanmei, { ref: refGm }).every((r) => r.id !== 'baihua'), 'baihua 不在默认链（defaultOff，阶段四退链）');
const lines = readingsText(res, guanmei);
check(lines.some((l) => l.includes('白话导读｜本卦 革')), '文本含本卦白话行');
check(lines.some((l) => l.includes('白话导读｜动爻 初九')), '文本含动爻白话行');
check(lines.some((l) => l.includes('参考汇编')) && lines.some((l) => l.includes('AI 补写')), '文本含来源/AI 提示行');
check(refGuideText(rGm).length >= 3, 'refGuideText 直接输出行数');

// ---- 3) 无 ref → 跳过；之卦不在 map → zhi null ----
check(interpretPan(guanmei, {}, { only: ['baihua'] }).length === 0, '无 deps.ref → baihua 跳过');
check(refGuideReading(guanmei, null) === null, 'null refMap → 返回 null');
const rNoZhi = refGuideReading(guanmei, refFor([49]));
check(rNoZhi && rNoZhi.zhi === null && rNoZhi.ben !== null, '之卦不在 map → zhi=null、本卦照给');

// ---- 4) 静卦 / 乾（7 爻含用九）----
const rQian = refGuideReading(mkPan(1, '乾', []), refFor([1]));
check(rQian && rQian.ben.name === '乾' && rQian.dong.length === 0, '乾静卦 → 仅卦辞白话');

// ---- 5) 铜钱盘解卦空置（kind:coin）----
const coin = castCoinLines(data, [1, 1, 1, 1, 1, 1].map((v, i) => ({ value: v, moving: i === 0 })), { yangFace: '字' });
check(interpretPan(coin, { ref: refFor([1, 44]) }, { only: ['baihua'] }).length === 0, '铜钱盘 baihua 空置（与解卦口径一致）');

// ---- 6) AI 补写标记：04-蒙 九二:哲学含义、63-既济 卦辞:哲学含义 ----
const rMeng = refGuideReading(mkPan(4, '蒙', [2]), refFor([4]));
check(rMeng && rMeng.dong.length === 1 && rMeng.dong[0].title === '九二', '蒙九二动爻命中');
check(rMeng.dong[0].aiFill === true && rMeng.ben.aiFill === false, '蒙九二 philosophy 为 AI 补写 → dong.aiFill=true');
const rJi = refGuideReading(mkPan(63, '既济', []), refFor([63]));
check(rJi && rJi.ben.aiFill === true, '既济卦辞 philosophy 为 AI 补写 → ben.aiFill=true');

console.log(`\n白话导读测试：${pass} 项通过，${fail} 项失败`);
if (fail > 0) {
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('REFGUIDE TESTS PASSED');
