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

// ---------------------------------------------------------------------------
// 落库与「换一条」规则（PRD 附录 A 第 3、4 条）
//
// 用真实的 store（ensurePick / refresh）跑一遍，校验：
// - 首次查看该日：落库的 method_id = permutation[0]，且 manual = false
// - 点「换一条」：落库的 method_id = permutation[1]，且 manual = true，
//   其在排列中的下标 = 首推下标 + 1（模 65）
// 这里必须打到真实的存储层，不能只算排列 —— 否则 ensurePick / refresh
// 的回归（例如 EX-06 回退时忘了复位 manual）不会被任何脚本发现。
// ---------------------------------------------------------------------------

/** 最小 localStorage 替身，供浏览器路径使用 */
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = { localStorage: globalThis.localStorage };

const { ensurePick, refresh } = await import('../src/stores/dailyMethod.ts');
const { fetchDailyPick, upsertDailyPick } = await import('../src/db/database.ts');

for (const date of SAMPLE_DATES) {
  const order = permutationFor(date);

  // 首次查看该日 → 落库首推
  const first = await ensurePick(date);
  if (first.method_id !== order[0]) {
    errors.push(`${date} 落库首推应为 ${order[0]}，实际 ${first.method_id}`);
  }
  if (first.manual !== false) {
    errors.push(`${date} 首推记录的 manual 应为 false，实际 ${first.manual}`);
  }
  const persisted = await fetchDailyPick(date);
  if (!persisted || persisted.method_id !== order[0]) {
    errors.push(`${date} 数据库中的 method_id 与首推不一致`);
  }
  if (persisted && persisted.manual !== false) {
    errors.push(`${date} 数据库中的 manual 应为 false，实际 ${persisted.manual}`);
  }

  // 再看一次同一天 → 内容不变
  const again = await ensurePick(date);
  if (again.method_id !== order[0]) {
    errors.push(`${date} 重复查看时内容发生了变化`);
  }

  // 点「换一条」→ 取排列中的下一条
  const next = await refresh(date);
  if (next.method_id !== order[1]) {
    errors.push(`${date} 「换一条」应为 ${order[1]}，实际 ${next.method_id}`);
  }
  if (next.manual !== true) {
    errors.push(`${date} 「换一条」后的 manual 应为 true，实际 ${next.manual}`);
  }
  const manualIndex = order.indexOf(next.method_id);
  const expectedIndex = (order.indexOf(order[0]) + 1) % order.length;
  if (manualIndex !== expectedIndex) {
    errors.push(
      `${date} 「换一条」下标应为 ${expectedIndex}，实际 ${manualIndex}`
    );
  }
  const persistedNext = await fetchDailyPick(date);
  if (!persistedNext || persistedNext.method_id !== order[1]) {
    errors.push(`${date} 数据库中的 method_id 未更新为「换一条」的结果`);
  }
  if (persistedNext && persistedNext.manual !== true) {
    errors.push(`${date} 数据库中的 manual 应为 true，实际 ${persistedNext.manual}`);
  }
}

// ---------------------------------------------------------------------------
// EX-06 回退：落库记录指向已不存在的条目时，回退为当日首推
//
// 两条边界必须覆盖：
// - 真的不存在的 id（如 'no-such-method'）
// - 继承自 Object.prototype 的键（如 'toString' / 'constructor'）：
//   METHOD_MAP 是普通对象，用真值判断会把这些键误判为「存在」，
//   于是回退不触发，界面拿到的是原型上的函数而不是方法。
// 回退后是「当日首推」，manual 必须复位为 false。
// ---------------------------------------------------------------------------

for (const bogusId of ['no-such-method', 'toString', 'constructor', '__proto__']) {
  const date = '2026-03-02';
  await upsertDailyPick({
    date,
    method_id: bogusId,
    manual: true,
    updated_at: 1,
  });

  const fixed = await ensurePick(date);
  const order = permutationFor(date);
  if (fixed.method_id !== order[0]) {
    errors.push(
      `EX-06 回退（${bogusId}）应回退为当日首推 ${order[0]}，实际 ${fixed.method_id}`
    );
  }
  if (fixed.manual !== false) {
    errors.push(
      `EX-06 回退（${bogusId}）后 manual 应复位为 false，实际 ${fixed.manual}`
    );
  }
  const stored = await fetchDailyPick(date);
  if (!stored || stored.method_id !== order[0] || stored.manual !== false) {
    errors.push(`EX-06 回退（${bogusId}）未正确写回数据库`);
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
