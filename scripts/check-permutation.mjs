/**
 * 推送确定性比对脚本。
 *
 * 口径（PRD 附录 A）：
 * 1. 从内容库取出 65 个 id，保持内容库数组原始顺序作为输入；
 * 2. 对抽样日期 d 计算 permutationFor(d, ids)；
 * 3. 同一日期重复计算 3 次结果一致。
 *
 * 本脚本内置一份**独立实现**的参考算法（逐字照抄 PRD 附录 A），
 * 与 `src/stores/dailyMethod.ts` 的实现逐一比对，任一不一致即非零退出。
 *
 * 用法：node scripts/check-permutation.mjs
 */
import {
  permutationFor,
  hashCode,
  mulberry32,
  METHOD_IDS,
} from '../src/stores/dailyMethod.ts';
import { METHODS } from '../src/data/methods.ts';

// ---------------------------------------------------------------------------
// 参考实现（PRD 附录 A，逐字等价）
// ---------------------------------------------------------------------------

function refHashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function refMulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function refPermutationFor(date, ids) {
  const out = [...ids];
  const rand = refMulberry32(refHashCode(date));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

/** 抽样日期：覆盖月初、月中、月末、跨年 */
const SAMPLE_DATES = [
  '2026-01-01',
  '2026-03-15',
  '2026-06-30',
  '2026-11-01',
  '2026-11-15',
  '2026-12-31',
  '2027-02-28',
];

const errors = [];

// 输入 id 序列必须是内容库数组原始顺序
const sourceIds = METHODS.map((m) => m.id);
if (sourceIds.length !== 65) {
  errors.push(`内容库 id 数量应为 65，实际 ${sourceIds.length}`);
}
if (METHOD_IDS.join('|') !== sourceIds.join('|')) {
  errors.push('METHOD_IDS 与内容库数组原始顺序不一致');
}

// 哈希与伪随机函数本身与参考实现一致
for (const date of SAMPLE_DATES) {
  if (hashCode(date) !== refHashCode(date)) {
    errors.push(`${date} hashCode 与参考实现不一致`);
  }
}
{
  const a = mulberry32(12345);
  const b = refMulberry32(12345);
  for (let i = 0; i < 100; i++) {
    if (a() !== b()) {
      errors.push('mulberry32 序列与参考实现不一致');
      break;
    }
  }
}

// 逐个抽样日期比对
let matched = 0;
for (const date of SAMPLE_DATES) {
  const expected = refPermutationFor(date, sourceIds);
  const actual = permutationFor(date);

  if (actual.length !== expected.length) {
    errors.push(`${date} 排列长度不一致：${actual.length} vs ${expected.length}`);
    continue;
  }
  if (actual.join('|') !== expected.join('|')) {
    errors.push(`${date} 排列与参考实现不一致`);
    continue;
  }

  // 同一日期重复计算 3 次结果一致
  const repeats = [0, 1, 2].map(() => permutationFor(date).join('|'));
  if (!repeats.every((r) => r === repeats[0])) {
    errors.push(`${date} 重复计算结果不一致`);
    continue;
  }

  // 排列必须是 65 条 id 的一个置换（无重复、无遗漏）
  if (new Set(actual).size !== expected.length) {
    errors.push(`${date} 排列存在重复 id`);
    continue;
  }

  matched += 1;
  console.log(
    `MATCH ${date}  首推=${actual[0]}  次推=${actual[1]}  长度=${actual.length}`
  );
}

// 换一条的取下标规则：manual=1 的 method_id 下标 = 首推下标 + 1（模 65）
for (const date of SAMPLE_DATES) {
  const order = permutationFor(date);
  const manualIndex = order.indexOf(order[0]);
  const nextIndex = (manualIndex + 1) % order.length;
  if (nextIndex !== 1) {
    errors.push(`${date} 「换一条」下标计算异常：${nextIndex}`);
  }
}

console.log('');
console.log(`抽样日期比对：${matched}/${SAMPLE_DATES.length} 一致`);

if (errors.length > 0) {
  console.error('');
  console.error(`校验失败，共 ${errors.length} 项：`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('PASS');
