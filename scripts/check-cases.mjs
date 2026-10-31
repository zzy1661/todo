/**
 * 内容库校验脚本（CFL-07 口径）。
 *
 * 断言项：
 * - 方法总数 65
 * - 分类分布 thinking 17 / work 17 / report 12 / communication 7 / efficiency 12
 * - `case.type` 仅 practice / story，分布 18 / 47
 * - 案例正文长度 126–240 字
 * - id 唯一
 * - 必填字段齐全
 * - `steps.length >= 2`（CFL-07 口径：真实分布 3–7，4 条超「2–4」写作建议的条目判为**合规**）
 *
 * 任一违规以非零退出码结束；同时打印真实的 steps 分布。
 *
 * 用法：node scripts/check-cases.mjs
 */
import {
  METHODS,
  METHOD_MAP,
  CATEGORY_COUNTS,
  CATEGORY_META,
  CATEGORY_ORDER,
} from '../src/data/methods.ts';

const EXPECTED_TOTAL = 65;
const EXPECTED_CATEGORY = {
  thinking: 17,
  work: 17,
  report: 12,
  communication: 7,
  efficiency: 12,
};
const EXPECTED_CASE_TYPE = { practice: 18, story: 47 };
const CASE_CONTENT_MIN = 126;
const CASE_CONTENT_MAX = 240;
const STEPS_MIN = 2;

const REQUIRED_FIELDS = [
  'id',
  'name',
  'category',
  'source',
  'summary',
  'steps',
  'when',
  'action',
];

const errors = [];
const fail = (msg) => errors.push(msg);

// --- 总数 ---
if (METHODS.length !== EXPECTED_TOTAL) {
  fail(`方法总数应为 ${EXPECTED_TOTAL}，实际 ${METHODS.length}`);
}

// --- 分类分布（内容库自身统计） ---
for (const [key, expected] of Object.entries(EXPECTED_CATEGORY)) {
  const actual = METHODS.filter((m) => m.category === key).length;
  if (actual !== expected) {
    fail(`分类 ${key} 应为 ${expected} 条，实际 ${actual} 条`);
  }
  if (CATEGORY_COUNTS[key] !== expected) {
    fail(
      `CATEGORY_COUNTS.${key} 应为 ${expected}，实际 ${CATEGORY_COUNTS[key]}`
    );
  }
  if (!CATEGORY_META[key]) {
    fail(`CATEGORY_META 缺少分类 ${key}`);
  }
}
for (const key of Object.keys(CATEGORY_COUNTS)) {
  if (!(key in EXPECTED_CATEGORY)) {
    fail(`CATEGORY_COUNTS 出现未知分类 ${key}`);
  }
}
if (CATEGORY_ORDER.length !== Object.keys(EXPECTED_CATEGORY).length) {
  fail(
    `CATEGORY_ORDER 长度应为 ${Object.keys(EXPECTED_CATEGORY).length}，实际 ${CATEGORY_ORDER.length}`
  );
}

// --- 逐条校验 ---
const ids = new Set();
const stepDistribution = new Map();
const caseTypeCounts = { practice: 0, story: 0, none: 0 };
const caseContentLengths = [];
const overLimitSteps = [];

for (const m of METHODS) {
  // id 唯一
  if (ids.has(m.id)) fail(`id 重复：${m.id}`);
  ids.add(m.id);

  // 必填字段
  for (const field of REQUIRED_FIELDS) {
    const value = m[field];
    if (value === undefined || value === null || value === '') {
      fail(`${m.id} 缺少必填字段 ${field}`);
    }
  }

  // 分类取值
  if (!(m.category in EXPECTED_CATEGORY)) {
    fail(`${m.id} 分类非法：${m.category}`);
  }

  // steps：CFL-07 口径，只断言「每条 ≥ 2」
  if (!Array.isArray(m.steps)) {
    fail(`${m.id} steps 不是数组`);
  } else {
    stepDistribution.set(m.steps.length, (stepDistribution.get(m.steps.length) ?? 0) + 1);
    if (m.steps.length < STEPS_MIN) {
      fail(`${m.id} steps 只有 ${m.steps.length} 项，少于 ${STEPS_MIN} 项`);
    }
    if (m.steps.length > 4) {
      // 已知且合规：不得判失败，只统计
      overLimitSteps.push(`${m.id}(${m.steps.length})`);
    }
    for (const [i, step] of m.steps.entries()) {
      if (typeof step !== 'string' || step.trim() === '') {
        fail(`${m.id} steps[${i}] 不是非空字符串`);
      }
    }
  }

  // case：可选字段，但取值必须合法；正文长度必须在区间内
  if (m.case === undefined || m.case === null) {
    caseTypeCounts.none += 1;
  } else {
    const type = m.case.type;
    if (type !== 'practice' && type !== 'story') {
      fail(`${m.id} case.type 非法：${type}`);
    } else {
      caseTypeCounts[type] += 1;
    }
    if (typeof m.case.title !== 'string' || m.case.title.trim() === '') {
      fail(`${m.id} case.title 缺失`);
    }
    const len = typeof m.case.content === 'string' ? m.case.content.length : -1;
    if (len < CASE_CONTENT_MIN || len > CASE_CONTENT_MAX) {
      fail(
        `${m.id} 案例正文长度 ${len} 不在 ${CASE_CONTENT_MIN}–${CASE_CONTENT_MAX} 区间`
      );
    } else {
      caseContentLengths.push(len);
    }
  }
}

// --- case 类型分布 ---
for (const [type, expected] of Object.entries(EXPECTED_CASE_TYPE)) {
  if (caseTypeCounts[type] !== expected) {
    fail(`case.type ${type} 应为 ${expected} 条，实际 ${caseTypeCounts[type]} 条`);
  }
}
if (caseTypeCounts.none !== 0) {
  fail(`当前内容库不应存在缺失 case 的条目，实际 ${caseTypeCounts.none} 条`);
}

// --- METHOD_MAP 索引完整性 ---
if (METHOD_MAP.size !== undefined) {
  if (METHOD_MAP.size !== EXPECTED_TOTAL) {
    fail(`METHOD_MAP 索引条数应为 ${EXPECTED_TOTAL}，实际 ${METHOD_MAP.size}`);
  }
} else if (Object.keys(METHOD_MAP).length !== EXPECTED_TOTAL) {
  fail(
    `METHOD_MAP 索引条数应为 ${EXPECTED_TOTAL}，实际 ${Object.keys(METHOD_MAP).length}`
  );
}
for (const m of METHODS) {
  if (METHOD_MAP[m.id] !== m) {
    fail(`METHOD_MAP 索引与内容库不一致：${m.id}`);
  }
}

// --- 报告 ---
const sortedSteps = [...stepDistribution.entries()].sort((a, b) => a[0] - b[0]);
const stepLine = sortedSteps
  .map(([len, count]) => `${len} 条 × ${count}`)
  .join(' / ');
const lenAvg = caseContentLengths.length
  ? (
      caseContentLengths.reduce((a, b) => a + b, 0) / caseContentLengths.length
    ).toFixed(1)
  : 'n/a';

console.log('内容库校验（scripts/check-cases.mjs）');
console.log(`  方法总数        ${METHODS.length}（期望 ${EXPECTED_TOTAL}）`);
console.log(
  `  分类分布        ${Object.entries(EXPECTED_CATEGORY)
    .map(([k, v]) => `${k} ${v}`)
    .join(' / ')}`
);
console.log(
  `  case 分布       practice ${caseTypeCounts.practice} / story ${caseTypeCounts.story} / 缺失 ${caseTypeCounts.none}`
);
console.log(
  `  案例正文长度    ${Math.min(...caseContentLengths)}–${Math.max(
    ...caseContentLengths
  )}，均值 ${lenAvg}（期望 ${CASE_CONTENT_MIN}–${CASE_CONTENT_MAX}）`
);
console.log(`  id 唯一         ${ids.size}/${METHODS.length}`);
console.log(`  steps 真实分布  ${stepLine}（观测区间 ${sortedSteps[0][0]}–${sortedSteps[sortedSteps.length - 1][0]}）`);
console.log(
  `  steps > 4 条目  ${overLimitSteps.length > 0 ? overLimitSteps.join(', ') : '无'}（CFL-07 判定合规，不判失败）`
);

if (errors.length > 0) {
  console.error('');
  console.error(`校验失败，共 ${errors.length} 项：`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('');
console.log('PASS');
