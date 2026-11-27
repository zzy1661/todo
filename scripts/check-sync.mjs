/**
 * 同步层本地 stub 回归（S10 必做项 8 / PRD FR-SYNC-15 / 测试计划 §5.8）。
 *
 * 九组路径逐条真跑，全部打在本机假云端（`scripts/mock-supabase.mjs`）上，
 * 数据走真实数据层（`src/db/database.ts` 的 localStorage 实现，语义与 SQLite 对齐）：
 *   ① 5 秒防抖 + 合并 + 只推变更条目 + 软删除 payload
 *   ② 启动拉取合并 / 登录成功后立即拉取
 *   ③ LWW（双向、同毫秒稳定序、6 小时时钟偏移）
 *   ④ 墓碑终结（远端删除不可被旧数据复活）+ 本地软删除行仍在库
 *   ⑤ 401 失效 → 刷新重试 → 刷新失败置未登录
 *   ⑥ 未配置时零请求（AC-57 的同步侧证据）
 *   ⑦ 登录可信性：GoTrue 托管 state、防伪靠 PKCE verifier（S7.8 回归）
 *   ⑧ 云端表缺失（PGRST205）：提示建表、不空转重试
 *   ⑨ 每 2 天自动同步：假时钟推进 2 天 → 真跑一轮拉取（FR-SYNC-17）
 * 以及：v3 迁移在真实 SQLite 上的结构证据（AC-64 / TC-076）
 *  以及：⑬ SQLite 执行后端的跨平台等价（命令行 vs Python 标准库）
 *
 * **不覆盖**：真实 Supabase / 真实 GitHub OAuth / 真实 RLS —— 一律 NOT-VERIFIED。
 *
 * 用法：node scripts/check-sync.mjs
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMockSupabase } from './mock-supabase.mjs';
import {
  detectCliBackend,
  detectPythonBackend,
  detectSqliteBackend,
} from './sqlite-backend.mjs';

/* ------------------------------------------------------------ 浏览器环境替身 */

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = { localStorage: globalThis.localStorage };

/* ------------------------------------------------------------------ 被测模块 */

const { setClock } = await import('../src/sync/clock.ts');
const { setTimers } = await import('../src/sync/timers.ts');
const { SyncEngine } = await import('../src/sync/engine.ts');
const { SupabaseRestApi } = await import('../src/sync/api.ts');
const { createMemorySessionStore } = await import('../src/sync/sessionStore.ts');
const { createMemoryStateStore } = await import('../src/sync/stateStore.ts');
const { onLocalTodoChange } = await import('../src/sync/events.ts');
const { contentKey } = await import('../src/sync/merge.ts');
const { configFromEnv, parseSyncConfig } = await import('../src/sync/config.ts');
const db = await import('../src/db/database.ts');

/* -------------------------------------------------------------- 时钟与定时器 */

const realSetTimeout = globalThis.setTimeout;
const START = 1_700_000_000_000; // 固定起点，保证可复跑

const clock = {
  t: START,
  now() {
    return this.t;
  },
};

class FakeTimers {
  constructor(clockRef) {
    this.clock = clockRef;
    this.queue = new Map();
    this.seq = 0;
  }
  setTimeout(fn, ms) {
    this.seq += 1;
    this.queue.set(this.seq, { due: this.clock.now() + ms, fn });
    return this.seq;
  }
  clearTimeout(id) {
    this.queue.delete(id);
  }
  /** 取下一个到期定时器（按到期时间、再按登记顺序） */
  next() {
    let best = null;
    for (const [id, timer] of this.queue) {
      if (!best || timer.due < best[1].due || (timer.due === best[1].due && id < best[0])) {
        best = [id, timer];
      }
    }
    return best;
  }
  reset() {
    this.queue.clear();
  }
}

const timers = new FakeTimers(clock);
setClock(clock);
setTimers(timers);

/** 让所有待完成的 Promise / 网络回调跑完 */
const drain = async () => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => realSetTimeout(resolve, 3));
  }
};

/** 推进假时间：按到期顺序触发定时器，并等异步回调落地 */
async function advance(ms) {
  const target = clock.t + ms;
  for (;;) {
    const entry = timers.next();
    if (!entry || entry[1].due > target) break;
    timers.queue.delete(entry[0]);
    clock.t = entry[1].due;
    entry[1].fn();
    await drain();
  }
  clock.t = target;
  await drain();
}

/* ------------------------------------------------------------------- 断言 */

const failures = [];
let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};
const eq = (actual, expected, message) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`
  );
let sectionTitle = '';
let sectionChecks = 0;
let sectionFailures = 0;
const section = (title) => {
  sectionTitle = title;
  sectionChecks = checks;
  sectionFailures = failures.length;
  console.log(`\n── ${title}`);
};
/** 每组末尾打印逐条 PASS：验收要求「5 条路径逐条 PASS」，不能只有一句总结 */
const endSection = () => {
  const total = checks - sectionChecks;
  const failed = failures.length - sectionFailures;
  console.log(
    failed === 0
      ? `   ✓ ${sectionTitle} PASS（${total} 项断言）`
      : `   ✗ ${sectionTitle} FAIL（${total} 项断言，${failed} 项失败）`
  );
};

/* ----------------------------------------------------------------- 测试数据 */

let uuidSeq = 0;
const nextUuid = () => {
  uuidSeq += 1;
  return `00000000-0000-4000-8000-${String(uuidSeq).padStart(12, '0')}`;
};

function makeTodo(overrides = {}) {
  const uuid = overrides.uuid ?? nextUuid();
  return {
    id: 0,
    uuid,
    title: `待办 ${uuid.slice(-4)}`,
    date: '2026-11-01',
    priority: 1,
    note: '',
    done: false,
    created_at: '2026-11-01 09:00:00',
    updated_at: '2026-11-01 09:00:00',
    updated_at_ms: 1000,
    deleted: false,
    ...overrides,
  };
}

/** 直接写入 localStorage（模拟「另一台设备 / 历史数据」） */
function seedLocal(rows) {
  localStorage.setItem('todo_local_db', JSON.stringify(rows));
  localStorage.setItem(
    'todo_local_db_seq',
    String(rows.reduce((max, row) => Math.max(max, row.id), 0))
  );
}

function resetLocal(rows = []) {
  localStorage.clear();
  seedLocal(rows);
}

const syncRows = async (uuids = null) => db.fetchTodoSyncRows(uuids);

/**
 * stub 配置：走环境变量这条注入路径（与「桌面端读 sync.config.json」并列的另一条来源），
 * 同时验证 base URL / anon key 确实可注入（FR-SYNC-15）。
 */
// 占位串（JWT 形态 + role: anon，白名单 AC-67 不接受随意字符串）；仓库里没有真实密钥
const ANON_KEY = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.stub-sig`;

const config = (url) => {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  const parsed = configFromEnv(process.env);
  if (!parsed.config.enabled) throw new Error(`stub 配置不合法：${parsed.reason}`);
  return parsed.config;
};

// 反向校验：非 anon 角色的密钥必须被拒绝（AC-67 的运行期兜底，deny-by-default）
const ADMIN_ROLE_KEY = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ role: 'supabase_admin' })
).toString('base64url')}.sig`;
if (
  parseSyncConfig({ supabaseUrl: 'https://example.supabase.co', anonKey: ADMIN_ROLE_KEY })
    .config.enabled
) {
  throw new Error('配置校验未拒绝非 anon 角色的密钥（AC-67）');
}

// 反向校验：新版 `sb_secret_…`（非 JWT、无角色声明）必须被拒绝——
// 黑名单写法「读不出角色就放行」会在这里静默通过（S1 / AC-67）
const SECRET_KEY = 'sb_secret_stub_should_never_reach_the_client';
const secretResult = parseSyncConfig({
  supabaseUrl: 'https://example.supabase.co',
  anonKey: SECRET_KEY,
});
assert(secretResult.config.enabled === false, '非 JWT 的 sb_secret_ 密钥必须被拒绝（AC-67）');
assert(secretResult.reason !== '', '拒绝 sb_secret_ 时必须给出原因，不能静默失败（AC-67）');

// 正向校验：白名单的另一半必须真的放行，否则等于「全拒」而不是「白名单」
const publishable = parseSyncConfig({
  supabaseUrl: 'https://example.supabase.co',
  anonKey: `sb_publishable_${'stub'}`,
});
assert(publishable.config.enabled === true, 'sb_publishable_ 前缀的密钥必须被接受（AC-67）');

/** 造一个引擎，并把「本地写 → 防抖推送」总线上线（与 store 层的接法一致） */
function buildEngine(
  stub,
  { sessionStore, oauth, onStatus = () => {}, stateStore, autoSyncDays } = {}
) {
  const cfg = config(stub.url);
  const engine = new SyncEngine({
    config: { ...cfg, ...(autoSyncDays === undefined ? {} : { autoSyncDays }) },
    api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: ANON_KEY }),
    sessionStore,
    ...(stateStore ? { stateStore } : {}),
    local: {
      loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
      loadAll: () => db.fetchTodoSyncRows(null),
      applyRemote: (rows) => db.applyRemoteTodos(rows),
      reviveTombstones: (uuids) => db.reviveTombstones(uuids),
    },
    oauth,
    clock,
    timers,
    onStatus,
    debounceMs: 5000,
    retryDelays: [100, 200, 400],
    oauthTimeoutMs: 2000,
  });
  const off = onLocalTodoChange(({ uuid, kind }) => {
    if (kind === 'merge') return; // 拉取结果不回写云端（NEG-04）
    engine.markLocalChange(uuid);
  });
  return { engine, off };
}

/** 假 OAuth 启动器：真打 stub 的 /auth/v1/authorize，读 302 的 Location */
function createOAuthLauncher() {
  let pending = '';
  return {
    /** 回调 query 原文（断言 state 长度用；不含 verifier） */
    get lastCallback() {
      return pending;
    },
    async listen() {
      return 51999; // 只用于拼 redirect_uri；真实回环监听在 Rust 侧
    },
    async open(url) {
      const response = await fetch(url, { redirect: 'manual' });
      const location = response.headers.get('location') ?? '';
      if (!location) throw new Error('stub 未返回授权重定向');
      pending = new URL(location).search.replace(/^\?/, '');
    },
    async wait() {
      if (!pending) throw new Error('没有待处理的回调');
      return pending;
    },
  };
}

/** 假 OAuth 启动器：固定返回一段回调 query（模拟失败回跳 / 缺 code 回跳） */
function createFixedCallbackLauncher(query) {
  return {
    async listen() {
      return 51999;
    },
    async open() {
      /* 不真打浏览器 */
    },
    async wait() {
      return query;
    },
  };
}

const lastPushPayload = (stub) => {
  const pushes = stub.state.requests.filter(
    (r) => r.method === 'POST' && r.path === '/rest/v1/todos'
  );
  return pushes.length > 0 ? pushes[pushes.length - 1].body : null;
};

/* ================================================================= 路径 ① */

section('① 5 秒防抖推送（TC-065 / TC-066 / TC-067）');
{
  resetLocal();
  const stub = await createMockSupabase();
  const sessionStore = createMemorySessionStore();
  const statuses = [];
  const { engine, off } = buildEngine(stub, {
    sessionStore,
    oauth: createOAuthLauncher(),
    onStatus: (status) => statuses.push(status),
  });

  await engine.start();
  assert(stub.state.requests.length === 0, '未登录启动时不应发出任何云端请求');
  eq(engine.getStatus().phase, 'signed-out', '未登录时状态应为「未登录」');

  await engine.login();
  eq(stub.state.authorizeRequests.length, 1, '登录应发起一次授权请求');
  const authorize = stub.state.authorizeRequests[0];
  eq(authorize.codeChallengeMethod, 's256', '授权请求必须带 code_challenge_method=s256');
  assert(
    authorize.redirectTo.startsWith('http://127.0.0.1:'),
    `回调必须是 127.0.0.1 回环，实际 ${authorize.redirectTo}`
  );
  eq(stub.pullCount(), 1, '登录成功后应立即拉取一次（FR-SYNC-06）');
  eq(engine.getStatus().phase, 'signed-in', '登录成功后状态应为「已登录」');

  const token = (await sessionStore.load())?.accessToken;
  assert(!!token, '会话应写入注入的会话存储（桌面端为钥匙串）');
  assert(
    !localStorage.getItem('todo_local_db')?.includes(token),
    'token 不得出现在 localStorage 明文字段'
  );

  stub.resetLog();
  const a = await db.createTodo({ title: '甲', date: '2026-11-01', priority: 1, note: '' });
  const b = await db.createTodo({ title: '乙', date: '2026-11-01', priority: 1, note: '' });
  await db.createTodo({ title: '丙', date: '2026-11-01', priority: 1, note: '' });
  await advance(2000);
  eq(stub.pushCount(), 0, '2 秒内仍在防抖窗口，不应推送');
  await db.updateTodo(a.id, { title: '甲改' });
  await advance(4900);
  eq(stub.pushCount(), 0, '最后一改后 4.9 秒内不应推送（AC-60 ②）');
  await advance(100);
  eq(stub.pushCount(), 1, '第 5.0 秒应推送一次（AC-60 ②）');
  const merged = lastPushPayload(stub);
  eq(merged?.length, 3, '窗口内 3 次变更应合并为 1 次推送且 payload 含 3 条（AC-60 ①）');
  const changedUuids = merged.map((row) => row.uuid).sort();
  eq(
    changedUuids,
    [a.uuid, b.uuid, ...(await syncRows()).filter((r) => r.title === '丙').map((r) => r.uuid)].sort(),
    'payload 只应包含本次变更的条目'
  );
  for (const row of merged) {
    assert(
      typeof row.uuid === 'string' &&
        typeof row.updated_at_ms === 'number' &&
        typeof row.deleted === 'number',
      `payload 每条都必须含 uuid / updated_at_ms / deleted：${JSON.stringify(row)}`
    );
  }

  // TC-067：删除 → 软删除 payload + 本地行仍在库
  stub.resetLog();
  await db.deleteTodo(b.id);
  await advance(5000);
  eq(stub.pushCount(), 1, '删除后第 5 秒应推送一次');
  const tombstonePayload = lastPushPayload(stub);
  eq(tombstonePayload?.[0]?.uuid, b.uuid, '推送的应是被删条目');
  eq(tombstonePayload?.[0]?.deleted, 1, '推送必须带 deleted = 1，而不是物理删除');
  const stored = await syncRows([b.uuid]);
  eq(stored.length, 1, '软删除后本地行必须仍在库里');
  eq(stored[0].deleted, true, '本地行的 deleted 应为 1');
  const visible = await db.fetchTodos();
  assert(!visible.some((row) => row.uuid === b.uuid), '已删条目不得出现在读取结果里');
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================= 路径 ② */

section('② 启动拉取合并 / 登录后立即拉取（TC-068 / TC-069）');
{
  const localRow = makeTodo({ id: 1, title: '本地原有', updated_at_ms: 100 });
  resetLocal([localRow]);
  const stub = await createMockSupabase();
  const remoteA = makeTodo({ title: '远端甲', updated_at_ms: 200 });
  const remoteB = makeTodo({ title: '远端乙', updated_at_ms: 300 });
  stub.seed({ ...remoteA, done: 0, deleted: 0 });
  stub.seed({ ...remoteB, done: 0, deleted: 0 });

  // 用一次真实登录拿到会话，随后换一个全新引擎模拟「重启」
  const store = createMemorySessionStore();
  const first = buildEngine(stub, { sessionStore: store, oauth: createOAuthLauncher() });
  await first.engine.login();
  first.off();
  first.engine.dispose();
  const session = await store.load();
  assert(!!session, '登录后会话应可读取（模拟重启）');

  resetLocal([localRow]);
  const restarted = buildEngine(stub, { sessionStore: store, oauth: createOAuthLauncher() });
  stub.resetLog();
  await restarted.engine.start();
  eq(stub.pullCount(), 1, '启动时应拉取一次（FR-SYNC-05）');
  eq(stub.pushCount(), 0, '拉取结果不得回写云端（NEG-04）');
  const titles = (await db.fetchTodos()).map((row) => row.title).sort();
  eq(titles, ['远端乙', '远端甲', '本地原有'].sort(), '合并后应有本地原有 + 远端 2 条');
  restarted.off();
  restarted.engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================= 路径 ③ */

section('③ LWW 与同毫秒稳定序（TC-070 / TC-071 / TC-072）');
{
  const uuid = nextUuid();

  // (a) 本地 100 / 远端 200 → 远端胜
  resetLocal([makeTodo({ id: 1, uuid, title: '本地旧', updated_at_ms: 100 })]);
  let stats = await db.applyRemoteTodos([
    { ...makeTodo({ uuid, title: '远端新' }), updated_at_ms: 200, done: false, deleted: false },
  ]);
  let row = (await syncRows([uuid]))[0];
  eq(row.title, '远端新', '本地 100 / 远端 200：远端应胜');
  eq(stats.updated, 1, '远端胜时应记为一次更新');

  // (b) 本地 200 / 远端 100 → 本地胜，且不产生推送
  resetLocal([makeTodo({ id: 1, uuid, title: '本地新', updated_at_ms: 200 })]);
  stats = await db.applyRemoteTodos([
    { ...makeTodo({ uuid, title: '远端旧' }), updated_at_ms: 100, done: false, deleted: false },
  ]);
  row = (await syncRows([uuid]))[0];
  eq(row.title, '本地新', '本地 200 / 远端 100：本地应胜');
  eq(stats.skipped, 1, '本地胜时远端记录应被丢弃（不回灌）');

  // (c) 同毫秒两条内容不同：两种到达顺序结果逐字节相同
  const sameMs = 500;
  const variantA = { ...makeTodo({ uuid, title: '内容 A' }), updated_at_ms: sameMs, done: false, deleted: false };
  const variantB = { ...makeTodo({ uuid, title: '内容 B' }), updated_at_ms: sameMs, done: false, deleted: false };
  resetLocal([]);
  await db.applyRemoteTodos([variantA]);
  await db.applyRemoteTodos([variantB]);
  const forward = contentKey((await syncRows([uuid]))[0]);
  resetLocal([]);
  await db.applyRemoteTodos([variantB]);
  await db.applyRemoteTodos([variantA]);
  const backward = contentKey((await syncRows([uuid]))[0]);
  assert(forward === backward, `同毫秒两种到达顺序应收敛（forward ≠ backward：${forward} / ${backward}）`);
  assert(
    ['内容 A', '内容 B'].includes((await syncRows([uuid]))[0].title),
    '同毫秒合并应落到其中一条，不得产生混合行'
  );

  // (d) 同毫秒、不同 uuid 的两条记录：两种到达顺序得到的库状态逐字节相同
  const uuidLow = '00000000-0000-4000-8000-000000000001';
  const uuidHigh = '00000000-0000-4000-8000-0000000000ff';
  const recordLow = { ...makeTodo({ uuid: uuidLow, title: '低' }), updated_at_ms: 700, done: false, deleted: false };
  const recordHigh = { ...makeTodo({ uuid: uuidHigh, title: '高' }), updated_at_ms: 700, done: false, deleted: false };
  resetLocal([]);
  await db.applyRemoteTodos([recordLow, recordHigh]);
  const orderOne = (await syncRows()).map((r) => contentKey(r)).sort().join('\n');
  resetLocal([]);
  await db.applyRemoteTodos([recordHigh, recordLow]);
  const orderTwo = (await syncRows()).map((r) => contentKey(r)).sort().join('\n');
  eq(orderTwo, orderOne, '同毫秒不同 uuid 的记录合并结果必须与到达顺序无关');

  // (e) 6 小时时钟偏移（R-T-13）：规则不改，远端胜，如实登记风险
  resetLocal([makeTodo({ id: 1, uuid: nextUuid(), title: '本机', updated_at_ms: 1000 })]);
  const skewedUuid = (await syncRows())[0].uuid;
  await db.applyRemoteTodos([
    {
      ...makeTodo({ uuid: skewedUuid, title: '时钟快 6 小时的设备' }),
      updated_at_ms: 1000 + 6 * 3600 * 1000,
      done: false,
      deleted: false,
    },
  ]);
  eq(
    (await syncRows([skewedUuid]))[0].title,
    '时钟快 6 小时的设备',
    '时钟偏移场景按 LWW 判定（远端胜），规则不因风险改动'
  );
  console.log('   · R-T-13 已登记：updated_at_ms 取客户端时钟，快 6 小时的设备会一直胜出');
  endSection();
}

/* ================================================================= 路径 ④ */

section('④ 墓碑终结与软删除（TC-073 / TC-074 / TC-075）');
{
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const liveUuid = nextUuid();
  resetLocal([
    makeTodo({ id: 1, uuid: liveUuid, title: '会被删', date: '2026-11-01', updated_at_ms: 1000 }),
  ]);
  const session = await stubLogin(stub, store);
  const { engine, off } = buildEngine(stub, { sessionStore: store, oauth: createOAuthLauncher() });
  await engine.start();
  eq(engine.getStatus().phase, 'signed-in', '预置会话时启动应已登录');

  // ① 拉取远端墓碑
  stub.seed({
    ...makeTodo({ uuid: liveUuid, title: '会被删', date: '2026-11-01' }),
    updated_at_ms: 2000,
    done: 0,
    deleted: 1,
  });
  await engine.pull('远端墓碑');
  const afterTombstone = (await syncRows([liveUuid]))[0];
  eq(afterTombstone.deleted, true, '远端 deleted = 1 应落到本地');
  const visibleAfter = await db.fetchTodos();
  assert(!visibleAfter.some((r) => r.uuid === liveUuid), '已删条目在三模块读取路径中不可见');
  eq((await db.fetchTodosByDate('2026-11-01')).length, 0, '当日面板读取不得返回已删条目');
  eq((await db.fetchTodosByMonth(2026, 11)).length, 0, '月历圆点读取不得返回已删条目');

  // ② 更旧的非删除记录到达：不复活
  stub.seed({
    ...makeTodo({ uuid: liveUuid, title: '想复活', date: '2026-11-01' }),
    updated_at_ms: 1500,
    done: 0,
    deleted: 0,
  });
  await engine.pull('旧数据到达');
  eq((await syncRows([liveUuid]))[0].deleted, true, '更旧的非删除记录不得复活已删条目（OPEN-01）');

  // ③ 更新的非删除记录到达：同样不复活（墓碑终结）
  stub.seed({
    ...makeTodo({ uuid: liveUuid, title: '更新的编辑', date: '2026-11-01' }),
    updated_at_ms: 9000,
    done: 0,
    deleted: 0,
  });
  await engine.pull('更新的编辑到达');
  eq(
    (await syncRows([liveUuid]))[0].deleted,
    true,
    '即使 updated_at_ms 更大，非删除记录也不复活已删条目（墓碑终结）'
  );

  // ④ 本地删除：推送 deleted = 1，行仍在库
  stub.resetLog();
  const created = await db.createTodo({ title: '本地删除', date: '2026-11-02', priority: 1, note: '' });
  await advance(5000);
  stub.resetLog();
  await db.deleteTodo(created.id);
  await advance(5000);
  const payload = lastPushPayload(stub);
  eq(payload?.[0]?.deleted, 1, '本地删除应以 deleted = 1 推送');
  eq((await syncRows([created.uuid]))[0]?.deleted, true, '本地删除后行仍在库且 deleted = 1');
  off();
  engine.dispose();
  await stub.close();
  void session;
  endSection();
}

/* ================================================================= 路径 ⑤ */

section('⑤ 401 失效 → 刷新重试 / 刷新失败重登（AC-58 会话语义）');
{
  resetLocal([makeTodo({ id: 1, uuid: nextUuid(), title: '401 用例', updated_at_ms: 1000 })]);
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  await stubLogin(stub, store);
  const { engine, off } = buildEngine(stub, { sessionStore: store, oauth: createOAuthLauncher() });
  await engine.start();

  // (a) access token 失效，refresh 仍有效 → 刷新后重试成功
  stub.resetLog();
  stub.expireAccessTokens();
  const stats = await engine.pull('401 重试');
  const paths = stub.state.requests.map((r) => `${r.method} ${r.path}${r.query}`);
  assert(
    paths[0].startsWith('GET /rest/v1/todos'),
    `第一次请求应是被拒的拉取，实际 ${paths[0]}`
  );
  assert(
    paths.some((p) => p.includes('/auth/v1/token?grant_type=refresh_token')),
    `401 后应尝试刷新令牌，实际请求：${paths.join(' | ')}`
  );
  assert(
    paths.filter((p) => p.startsWith('GET /rest/v1/todos')).length >= 2,
    '刷新成功后应重试原请求'
  );
  eq(stats?.inserted ?? 0, 0, '重试成功后应正常返回合并结果');
  eq(engine.getStatus().phase, 'signed-in', '刷新成功后状态应保持「已登录」');

  // (b) 刷新也失败 → 清会话、置未登录、不再重试
  stub.resetLog();
  stub.expireAccessTokens();
  stub.state.rejectRefresh = true;
  const result = await engine.pull('会话彻底失效');
  eq(result, null, '刷新失败时拉取应返回 null');
  eq(engine.getStatus().phase, 'signed-out', '刷新失败后状态应为「未登录」');
  eq(await store.load(), null, '刷新失败后会话存储应被清空');
  const afterFailure = stub.state.requests.length;
  await advance(10_000);
  eq(stub.state.requests.length, afterFailure, '置未登录后不得继续重试请求');
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================= 路径 ⑥ */

section('⑥ 未配置时零请求（AC-57）');
{
  resetLocal([makeTodo({ id: 1, uuid: nextUuid(), title: '未配置', updated_at_ms: 1000 })]);
  const stub = await createMockSupabase();
  const requests = [];
  const engine = new SyncEngine({
    config: { enabled: false, baseUrl: stub.url, anonKey: '', source: 'none' },
    api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: ANON_KEY }),
    sessionStore: createMemorySessionStore(),
    local: {
      loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
      loadAll: () => db.fetchTodoSyncRows(null),
      applyRemote: (rows) => db.applyRemoteTodos(rows),
    },
    oauth: createOAuthLauncher(),
    clock,
    timers,
    onStatus: (status) => requests.push(status),
  });
  const off = onLocalTodoChange(({ uuid, kind }) => {
    if (kind !== 'merge') engine.markLocalChange(uuid);
  });
  await engine.start();
  const created = await db.createTodo({ title: '未配置下新建', date: '2026-11-03', priority: 1, note: '' });
  await db.updateTodo(created.id, { done: true });
  await db.deleteTodo(created.id);
  await advance(10_000);
  await engine.login();
  await engine.retry();
  eq(stub.state.requests.length, 0, '未配置时 rest/v1 与 auth/v1 都必须零请求（FR-SYNC-10）');
  eq(engine.getStatus().phase, 'disabled', '未配置时状态应为「未配置」');
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================= 路径 ⑦ */

section('⑦ 登录可信性：GoTrue 托管 state，防伪靠 PKCE verifier（S7.8）');
{
  // ── ① 正常路径：客户端照发 43 字符 state，但回调回来的是 GoTrue 的 36 字符 UUID
  resetLocal();
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const launcher = createOAuthLauncher();
  const { engine, off } = buildEngine(stub, { sessionStore: store, oauth: launcher });
  await engine.login();

  const authorize = stub.state.authorizeRequests[0];
  eq(authorize.state.length, 43, '客户端仍照发 43 字符 state（保留可观测性）');
  const callback = new URLSearchParams(launcher.lastCallback);
  const callbackState = callback.get('state') ?? '';
  eq(callbackState.length, 36, '回调 state 是 GoTrue 自己的 36 字符 flow UUID');
  assert(callbackState !== authorize.state, '回调 state 与客户端 state 必然不同（旧实现据此必失败）');
  eq(engine.getStatus().phase, 'signed-in', 'state 不等也必须登录成功：可信性由 PKCE verifier 绑定');
  assert(!!(await store.load()), '登录成功后会话应落库');

  const token = (await store.load())?.accessToken ?? '';
  assert(
    !engine.getStatus().detail.includes(token) && !engine.getStatus().lastError.includes(token),
    '状态详情不得包含 access token'
  );
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ② 正确 code + 错误 verifier（该 code 属于别人的 PKCE 会话）→ 必须登录失败
  resetLocal();
  const stub = await createMockSupabase();
  // 攻击者用自己的 verifier 算出 challenge，服务端把 code 绑到它上面
  stub.state.challengeOverride = createHash('sha256')
    .update('attacker-verifier-that-we-never-hold')
    .digest('base64url');
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
  });
  await engine.login();

  const status = engine.getStatus();
  eq(status.phase, 'signed-out', 'verifier 不符必须拒绝登录');
  eq(await store.load(), null, 'verifier 不符时不得写入会话');
  const exchange = stub.state.requests.filter(
    (r) => r.method === 'POST' && r.path === '/auth/v1/token'
  );
  eq(exchange.length, 1, '仍应尝试一次 code 交换（而不是靠 state 提前放弃）');
  assert(
    status.detail.includes('回调 state 长度 36 / 期望 43'),
    `失败详情应带非敏感的 state 长度排障信息，实际：${status.detail}`
  );
  assert(
    !status.detail.includes('attacker-verifier') &&
      !/[A-Za-z0-9_-]{43,}/.test(status.detail) &&
      !/[A-Za-z0-9_-]{43,}/.test(status.lastError),
    `失败详情不得泄露 verifier / code 的值，实际：${status.detail}`
  );
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ③ 回调带 error：优先按错误处理，不再尝试换 token；error_description 透出
  resetLocal();
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, {
    sessionStore: store,
    oauth: createFixedCallbackLauncher(
      'error=bad_oauth_state&error_description=OAuth+state+parameter+is+invalid&state=9b28ae17-cc1f-437d-bf8c-843f0890d4f5'
    ),
  });
  await engine.login();
  const status = engine.getStatus();
  eq(status.phase, 'signed-out', '回调带 error 时必须保持未登录');
  assert(
    status.detail.includes('bad_oauth_state') &&
      status.detail.includes('OAuth state parameter is invalid'),
    `error 与 error_description 都必须透出，实际：${status.detail}`
  );
  const exchanges = stub.state.requests.filter((r) => r.path === '/auth/v1/token');
  eq(exchanges.length, 0, '回调带 error 时不得再尝试 code 交换');
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ④ 既无 code 也无 error：文案明确「请回应用重试」
  resetLocal();
  const stub = await createMockSupabase();
  const { engine, off } = buildEngine(stub, {
    sessionStore: createMemorySessionStore(),
    oauth: createFixedCallbackLauncher('state=9b28ae17-cc1f-437d-bf8c-843f0890d4f5'),
  });
  await engine.login();
  assert(
    engine.getStatus().detail.includes('回调缺少授权码，请回应用重试'),
    `缺 code 时应给出可操作的提示，实际：${engine.getStatus().detail}`
  );
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================= 路径 ⑧ */

section('⑧ 云端表缺失（PGRST205）：报可执行的补救步骤，且不空转重试');
{
  resetLocal();
  const stub = await createMockSupabase();
  stub.state.missingTable = true;
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
  });

  await engine.login();
  const status = engine.getStatus();
  eq(status.phase, 'error', '登录成功但云端表缺失时，同步应报错而不是静默');
  assert(status.detail.includes('supabase/schema.sql'), 'detail 必须给出可执行的补救步骤');
  assert(status.detail.includes('PGRST205'), 'detail 应带上错误码便于对号入座');
  assert(!!(await store.load()), '表缺失不得清掉已建立的登录会话');

  const countRest = () =>
    stub.state.requests.filter((r) => r.path === '/rest/v1/todos').length;
  const before = countRest();
  await db.createTodo({ title: '表缺失时新建', date: '2026-11-07', priority: 2, note: '' });
  await advance(60_000);
  eq(countRest() - before, 1, '表缺失时推送只尝试一次，不进 1s/2s/4s/8s/16s 退避');
  assert(engine.pendingCount() > 0, '未推送成功的改动必须留在待推集合里，等表建好再推');

  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================ 路径 ⑨ */

/** 2 天的毫秒数（FR-SYNC-17 的默认周期） */
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

section('⑨ 每 2 天自动同步：假时钟推进 2 天 → 真跑一轮拉取（FR-SYNC-17）');
{
  // ── ① 登录后推进 2 天：定时器到点，自己发起一次拉取
  resetLocal();
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const stateStore = createMemoryStateStore();
  const { engine, off } = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
    stateStore,
  });

  eq(engine.isAutoSyncEnabled(), true, '默认应启用定时同步（每 2 天）');
  eq(engine.autoSyncInterval(), TWO_DAYS_MS, '默认周期应为 2 天');

  await engine.login();
  eq(stub.pullCount(), 1, '登录后立即拉取一次（FR-SYNC-06）');
  const nextDue = engine.nextAutoSyncAt();
  assert(typeof nextDue === 'number', '登录后应排期下一轮定时同步');
  eq(nextDue, clock.now() + TWO_DAYS_MS, '下一轮应排在 2 天后');

  // 推进到 1 天：还没到期，不应有任何定时同步请求
  stub.resetLog();
  await advance(TWO_DAYS_MS - 1000);
  eq(stub.pullCount(), 0, '未到 2 天时不得发起定时拉取');

  // 推进到 2 天：定时器到点，应自动拉取一次
  await advance(1000);
  eq(stub.pullCount(), 1, '满 2 天应自动拉取一次（FR-SYNC-17）');
  eq(stub.pushCount(), 0, '没有本地改动时不应推送');
  assert(
    engine.getStatus().detail.includes('定时同步'),
    `定时同步应体现在状态区，实际「${engine.getStatus().detail}」`
  );

  // 锚点已推进：下一轮应重新排在 2 天后
  const nextDue2 = engine.nextAutoSyncAt();
  eq(nextDue2, clock.now() + TWO_DAYS_MS, '一轮成功后应重新排期到 2 天后');
  const saved = await stateStore.load();
  eq(saved?.autoSyncAnchorAt, clock.now(), '成功后锚点应落盘');

  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ② 锚点跨重启延续：重启后仍按原锚点排期，不会被重置
  resetLocal();
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  // 锚点在 1 天前：周期尚未走完，重启后不应立刻补做
  const stateStore = createMemoryStateStore({
    autoSyncAnchorAt: clock.now() - 24 * 60 * 60 * 1000,
  });
  const first = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
    stateStore,
  });
  await first.engine.login();
  const dueBefore = first.engine.nextAutoSyncAt();
  eq(dueBefore, clock.now() - 24 * 60 * 60 * 1000 + TWO_DAYS_MS, '重启后应按原锚点排期');
  first.off();
  first.engine.dispose();

  const second = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
    stateStore,
  });
  stub.resetLog();
  await second.engine.start();
  eq(stub.pullCount(), 1, '重启后仍按 FR-SYNC-05 拉取一次');
  eq(
    second.engine.nextAutoSyncAt(),
    clock.now() - 24 * 60 * 60 * 1000 + TWO_DAYS_MS,
    '重启不得把周期重置成「从现在起 2 天」'
  );
  second.off();
  second.engine.dispose();
  await stub.close();
}

{
  // ── ③ 锚点过期：应用关了很久 → 下次启动补做一轮
  resetLocal();
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();

  // 先用一个「干净的」状态建立登录会话（模拟之前正常用着）
  const warmup = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
    stateStore: createMemoryStateStore(),
  });
  await warmup.engine.login();
  warmup.off();
  warmup.engine.dispose();

  // 锚点停在 5 天前：应用关着的时间早已超过一个周期
  const stateStore = createMemoryStateStore({
    autoSyncAnchorAt: clock.now() - 5 * 24 * 60 * 60 * 1000,
  });
  const { engine, off } = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
    stateStore,
  });
  stub.resetLog();
  await engine.start();
  eq(stub.pullCount(), 1, '锚点过期时启动应补做一轮（只拉一次，不重复打云端）');
  assert(
    engine.getStatus().detail.includes('补做'),
    `补做应体现在状态区，实际「${engine.getStatus().detail}」`
  );
  const saved = await stateStore.load();
  eq(saved?.autoSyncAnchorAt, clock.now(), '补做成功后锚点应推进到当下');
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ④ 未登录时零请求：定时器不得存在（FR-SYNC-10）
  resetLocal();
  const stub = await createMockSupabase();
  const stateStore = createMemoryStateStore();
  const { engine, off } = buildEngine(stub, {
    sessionStore: createMemorySessionStore(),
    oauth: createOAuthLauncher(),
    stateStore,
  });
  await engine.start();
  eq(engine.nextAutoSyncAt(), null, '未登录时不得排期');
  stub.resetLog();
  await advance(TWO_DAYS_MS * 2);
  eq(stub.state.requests.length, 0, '未登录时推进 4 天也不得有任何云端请求（FR-SYNC-10）');
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ⑤ 登出后停掉定时器：不得再有定时请求
  resetLocal();
  const stub = await createMockSupabase();
  const { engine, off } = buildEngine(stub, {
    sessionStore: createMemorySessionStore(),
    oauth: createOAuthLauncher(),
    stateStore: createMemoryStateStore(),
  });
  await engine.login();
  await engine.logout();
  eq(engine.nextAutoSyncAt(), null, '登出后应取消排期');
  stub.resetLog();
  await advance(TWO_DAYS_MS * 2);
  eq(stub.state.requests.length, 0, '登出后推进 4 天也不得有任何云端请求');
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ⑥ 周期可配置：autoSyncDays = 0 → 关闭定时同步
  resetLocal();
  const stub = await createMockSupabase();
  const { engine, off } = buildEngine(stub, {
    sessionStore: createMemorySessionStore(),
    oauth: createOAuthLauncher(),
    stateStore: createMemoryStateStore(),
    autoSyncDays: 0,
  });
  eq(engine.isAutoSyncEnabled(), false, 'autoSyncDays = 0 应关闭定时同步');
  await engine.login();
  eq(engine.nextAutoSyncAt(), null, '关闭后不得排期');
  stub.resetLog();
  await advance(TWO_DAYS_MS * 2);
  eq(stub.pullCount(), 0, '关闭定时同步后不得有定时拉取');
  off();
  engine.dispose();
  await stub.close();
}

{
  // ── ⑥' 未配置同步时整个同步层短路：不得显示「每 2 天自动同步」
  resetLocal();
  const stub = await createMockSupabase();
  const engine = new SyncEngine({
    config: { enabled: false, baseUrl: stub.url, anonKey: '', source: 'none' },
    api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: ANON_KEY }),
    sessionStore: createMemorySessionStore(),
    local: {
      loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
      loadAll: () => db.fetchTodoSyncRows(null),
      applyRemote: (rows) => db.applyRemoteTodos(rows),
    },
    oauth: createOAuthLauncher(),
    clock,
    timers,
    onStatus: () => {},
  });
  eq(engine.isAutoSyncEnabled(), false, '未配置同步时定时同步不算启用');
  eq(engine.autoSyncInterval(), 0, '未配置同步时周期应为 0');
  eq(engine.getStatus().autoSyncEnabled, false, '未配置时状态区不得声称定时同步已启用');
  await engine.start();
  stub.resetLog();
  await advance(TWO_DAYS_MS * 2);
  eq(stub.state.requests.length, 0, '未配置时推进 4 天也不得有任何云端请求');
  engine.dispose();
  await stub.close();
}

{
  // ── ⑥'' 周期天数的归一化：非法值回落到默认、超限夹到 24、0 表示关闭
  const withDays = (days) =>
    parseSyncConfig(
      {
        supabaseUrl: 'https://example.supabase.co',
        anonKey: ANON_KEY,
        ...(days === undefined ? {} : { autoSyncDays: days }),
      }
    ).config.autoSyncDays;
  eq(withDays(undefined), 2, '缺省周期应为 2 天');
  eq(withDays(0), 0, '周期 0 表示关闭');
  eq(withDays('abc'), 2, '非法周期应回落到默认 2 天而不是静默关闭');
  eq(withDays(999), 24, '超上限周期应夹到 24 天（setTimeout 延时上限约 24.85 天）');
  eq(withDays(1), 1, '合法周期应原样保留');
}

{
  // ── ⑦ 定时轮次也推送本地改动（不止拉取）
  resetLocal();
  const stub = await createMockSupabase();
  const { engine, off } = buildEngine(stub, {
    sessionStore: createMemorySessionStore(),
    oauth: createOAuthLauncher(),
    stateStore: createMemoryStateStore(),
  });
  await engine.login();
  // 本地改动先被防抖推送掉，不留待推集合
  await db.createTodo({ title: '定时前建', date: '2026-11-08', priority: 1, note: '' });
  await advance(5000);
  stub.resetLog();
  await advance(TWO_DAYS_MS);
  eq(stub.pullCount(), 1, '2 天后应拉取一次');
  eq(stub.pushCount(), 0, '本地改动已推过，定时轮次不应重复推送');
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ================================================================ 迁移证据 */

/**
 * v3 迁移 SQL 必须**与平台无关**。
 *
 * 背景（2026-11-23 实机故障「启动报错·数据对不上·部分数据已经执行过了」）：
 * sqlx 用 `SHA-384(SQL 的字节)` 给迁移记账，对不上就报
 * 「migration 3 was previously applied but has been modified」→ 迁移被拒 → 应用起不来。
 * 而 `include_str!` 是**原样嵌入文件字节**（CRLF 就是 CRLF），Rust 的内联字面量
 * 却会被编译器归一化成 LF —— 于是 v1 / v2 各平台一致，**唯独 v3 会随换行符变**。
 *
 * v0.3.0 之前没有 `.gitattributes`，Windows 检出是 CRLF → 旧 Windows 安装包内嵌
 * CRLF 版 v3 SQL、库里记的是 CRLF 版 checksum；新包是 LF 版 → 对不上。
 *
 * 这些断言是**源码级**的，所以在任何平台都咬得住
 * （运行期的「SQL 不含 CR」断言在本来就只有 LF 的 macOS 上是恒真的）。
 */
section('v3 迁移 SQL 必须与平台无关（checksum 不能随换行符变）');
{
  const libSource = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
  const buildSource = fs.readFileSync('src-tauri/build.rs', 'utf8');

  assert(
    /include_str!\(\s*concat!\(\s*env!\("OUT_DIR"\)\s*,\s*"\/0003_sync_columns\.sql"\s*\)\s*\)/.test(
      libSource
    ),
    'lib.rs 的 v3 迁移必须取 include_str!(concat!(env!("OUT_DIR"), "/0003_sync_columns.sql")) —— 那是 build.rs 归一化后的产物'
  );
  assert(
    !/include_str!\("\.\.\/migrations\//.test(libSource),
    'lib.rs 不得直接 include_str! 源迁移文件：换行符会原样嵌入，checksum 随平台变'
  );
  assert(
    /replace\("\\r\\n",\s*"\\n"\)/.test(buildSource),
    'build.rs 必须把迁移 SQL 的 CRLF 归一化成 LF'
  );

  const v3File = fs.readFileSync('src-tauri/migrations/0003_sync_columns.sql', 'utf8');
  assert(
    !v3File.includes('\r'),
    '仓库里的 0003_sync_columns.sql 必须是 LF（由 .gitattributes 保证）'
  );

  endSection();
}

section('v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列）');
migrationEvidence: {
  const dbPath = path.join(os.tmpdir(), `todo_v3_check_${process.pid}_${Date.now()}.db`);
  const libSource = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
  const legacySql = [...libSource.matchAll(/sql:\s*"([\s\S]*?)",\s*kind:/g)].map((m) => m[1]);
  eq(legacySql.length, 2, 'lib.rs 中应只有 v1 / v2 两段字面量迁移 SQL（v3 走独立文件）');
  for (const statement of legacySql) {
    assert(!/\bDROP\b/i.test(statement), 'v1 / v2 不得出现 DROP');
    assert(!/\bALTER\b/i.test(statement), 'v1 / v2 不得出现 ALTER（v3 才允许 ADD COLUMN）');
  }

  /**
   * SQLite 执行后端：**命令行优先，其次 Python 标准库**。
   *
   * 为什么不能直接 `execFileSync('sqlite3', ...)`：macOS 自带 sqlite3，但
   * **windows-latest 的 runner 镜像里没有 sqlite3.exe**（镜像清单的 Database Systems
   * 一节只有 PostgreSQL 与 MongoDB）→ Windows 上抛 ENOENT → 整个脚本失败。
   * 两个后端都不可用时**明确跳过**，措辞上区分「跳过（不具备技术条件）」与「通过」。
   */
  const backend = detectSqliteBackend();
  if (!backend) {
    console.log('⊘ 跳过 v3 迁移结构证据：本平台既没有 sqlite3 命令行，也没有可用的 Python。');
    console.log('  这不是「迁移证据通过」，而是「本平台不具备跑这个证据的技术条件」。');
    break migrationEvidence;
  }
  console.log(`   · SQLite 后端：${backend.label}`);

  /** 只执行（DDL / DML），可含多条语句 */
  const runSql = (sql) => backend.run(dbPath, sql);
  /** 取结果（单条 SELECT / PRAGMA） */
  const querySql = (sql) => backend.query(dbPath, sql);

  runSql('PRAGMA journal_mode = MEMORY;');
  for (const statement of legacySql) runSql(statement);
  runSql(
    "INSERT INTO todos (title, date, priority) VALUES ('迁移前甲', '2026-11-01', 1), ('迁移前乙', '2026-11-02', 2);"
  );

  const v3 = fs.readFileSync('src-tauri/migrations/0003_sync_columns.sql', 'utf8');
  // 去掉注释再判破坏性语句：注释里可以出现「绝不 DROP」这类说明文字
  const v3Statements = v3
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert(!/\bDROP\b/i.test(v3Statements), 'v3 迁移不得出现 DROP');
  assert(
    !/ALTER\s+TABLE\s+daily_picks/i.test(v3Statements),
    'v3 不得改动 daily_picks（D-19）'
  );
  runSql(v3);

  const todoColumns = querySql('PRAGMA table_info(todos);').split('\n');
  for (const required of ['uuid', 'updated_at_ms', 'deleted']) {
    assert(
      todoColumns.some((line) => line.split('|')[1] === required),
      `todos 应有 ${required} 列，实际 ${todoColumns.join(' / ')}`
    );
  }
  const pickColumns = querySql('PRAGMA table_info(daily_picks);').split('\n');
  for (const forbidden of ['uuid', 'updated_at_ms', 'deleted']) {
    assert(
      !pickColumns.some((line) => line.split('|')[1] === forbidden),
      `daily_picks 不得新增 ${forbidden} 列（D-19）`
    );
  }

  eq(
    querySql('SELECT count(*) FROM todos WHERE uuid IS NULL OR uuid = "";'),
    '0',
    '历史行 uuid 必须回填且非空'
  );
  eq(
    querySql('SELECT count(DISTINCT uuid) FROM todos;'),
    querySql('SELECT count(*) FROM todos;'),
    'uuid 必须唯一'
  );
  eq(querySql('SELECT sum(deleted) FROM todos;'), '0', 'deleted 默认必须为 0');
  assert(
    Number(querySql('SELECT min(updated_at_ms) FROM todos;')) > 0,
    'updated_at_ms 必须回填为正数毫秒'
  );
  const uuidBefore = querySql('SELECT group_concat(uuid) FROM todos ORDER BY id;');

  // 幂等：重复执行回填语句不得重新生成 uuid
  runSql(
    `UPDATE todos SET uuid = lower(hex(randomblob(4))) || '-' || substr(lower(hex(randomblob(2))), 1, 4) || '-4' ||
       substr(lower(hex(randomblob(2))), 2, 3) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) ||
       substr(lower(hex(randomblob(2))), 2, 3) || '-' || lower(hex(randomblob(6)))
     WHERE uuid IS NULL;`
  );
  eq(querySql('SELECT group_concat(uuid) FROM todos ORDER BY id;'), uuidBefore, '二次执行回填不得改变已有 uuid（幂等）');

  // 软删除：行仍在库
  runSql('UPDATE todos SET deleted = 1 WHERE id = 1;');
  eq(querySql('SELECT count(*) FROM todos;'), '2', '软删除后行数不变（不是物理删除）');
  eq(querySql('SELECT deleted FROM todos WHERE id = 1;'), '1', '软删除标记应落库');

  console.log(`   · PRAGMA table_info(todos) → ${todoColumns.join(' ; ')}`);
  console.log(`   · 回填 uuid → ${uuidBefore}`);
  console.log(`   · 软删除后 deleted → ${querySql('SELECT group_concat(id || ":" || deleted) FROM todos;')}`);
  fs.rmSync(dbPath, { force: true });
  endSection();
}

/* ================================================ ⑬ SQLite 执行后端等价（跨平台） */

/**
 * ⑬：SQLite 执行后端的**跨平台等价**。
 *
 * 背景：Windows 上没有 sqlite3 命令行，退路是 Python 标准库自带的 sqlite3。
 * 两条路如果行为不一致，就会出现「macOS 上迁移证据通过、Windows 上同一批 SQL
 * 结果不同」——而这**只有 CI 的另一端能暴露**。
 *
 * 所以：**两个后端都在时，同一套迁移在两个临时库上各跑一遍，逐字节比结果**。
 * - macOS：命令行 vs Python 对拍（证明「退路 ≡ 正路」）；
 * - Windows：只有 Python，仍然完整跑一遍迁移证据（证明「退路自己是对的」）。
 *
 * 只有一个后端时**明确跳过对拍**（不判失败）：本平台不具备对拍的技术条件，
 * 措辞上要与「通过」区分开。
 */
section('⑬ SQLite 后端等价：命令行与 Python 必须给出相同结果');
{
  const cli = detectCliBackend();
  const python = detectPythonBackend();

  if (!cli || !python) {
    const missing = !cli ? ' sqlite3 命令行' : '可用的 Python';
    const used = detectSqliteBackend();
    console.log(`   ⊘ 跳过后端对拍：本平台没有${missing}，无法同时跑两个后端。`);
    console.log('     这不是「等价已验证」，而是「本平台不具备对拍的技术条件」。');
    console.log(`     · 本平台实际使用的后端：${used ? used.label : '无（迁移证据也会一并跳过）'}`);
  } else {
    const stamp = `${process.pid}_${Date.now()}`;
    const dbCli = path.join(os.tmpdir(), `todo_backend_cli_${stamp}.db`);
    const dbPy = path.join(os.tmpdir(), `todo_backend_py_${stamp}.db`);

    const libSource = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
    const legacySql = [...libSource.matchAll(/sql:\s*"([\s\S]*?)",\s*kind:/g)].map((m) => m[1]);
    const v3 = fs.readFileSync('src-tauri/migrations/0003_sync_columns.sql', 'utf8');

    for (const backend of [cli, python]) {
      const db = backend.kind === 'cli' ? dbCli : dbPy;
      backend.run(db, 'PRAGMA journal_mode = MEMORY;');
      for (const statement of legacySql) backend.run(db, statement);
      backend.run(db, v3);
      backend.run(
        db,
        "INSERT INTO todos (title, date, priority) VALUES ('等价甲', '2026-11-01', 1);"
      );
    }

    // 比的都是**确定性输出**：表结构、条数、缺失计数、表清单。
    // uuid 由 randomblob() 生成，两边必然不同 —— 那是**正常**的，不该拿来比。
    const probes = [
      'PRAGMA table_info(todos);',
      'PRAGMA table_info(daily_picks);',
      'SELECT count(*) FROM todos;',
      'SELECT count(*) FROM todos WHERE uuid IS NULL;',
      "SELECT group_concat(name) FROM sqlite_master WHERE type='table' ORDER BY name;",
      // **必须含非 ASCII**：Windows 上 Python 的 stdin/stdout 默认用系统 ANSI 代码页，
      // 而非 UTF-8。中文一进来就被解码成乱码 / 孤立代理字符，
      // 然后 SQLite 往里编码时抛 `UnicodeEncodeError`。
      // （2026-11-23：CI 在 Windows 上真跑出来了 —— macOS 的 locale 恰好是 UTF-8。）
      'SELECT title FROM todos ORDER BY id;',
    ];
    for (const probe of probes) {
      const outCli = cli.query(dbCli, probe);
      const outPy = python.query(dbPy, probe);
      eq(outPy, outCli, `两个后端对「${probe}」的输出必须逐字节一致`);
    }

    console.log(`   · 对拍后端：${cli.label} vs ${python.label}`);
    fs.rmSync(dbCli, { force: true });
    fs.rmSync(dbPy, { force: true });
    endSection();
  }
}

/* ==================================================================== 收尾 */

/* --------------------------------------------------------- ⑩ 请求超时（跨平台一致） */

// section('⑩ 请求超时：fetch 挂住必须被中止，不能永远 pending')
//
// 为什么要有这条：`fetch` **默认永不超时**。网络被防火墙拦、代理挂起、
// 或服务端 accept 了连接却不响应时，请求会永远 pending ——
// 表现是同步状态永远停在「同步中」，也不会走到失败重试。
// 这条断言保证「超时 → 抛网络错误 → 引擎进入退避重试」这条链路是通的。
{
  section('⑩ 请求超时：fetch 挂住必须被中止（FR-SYNC-11 / 跨平台一致）');
  const { SyncNetworkError } = await import('../src/sync/api.ts');

  // 一个「连上了但不响应」的 fetch：**必须响应 abort 信号**，
  // 否则它就不是在模拟真实 fetch——真实的 fetch 收到 abort 会 reject。
  const hangingFetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'));
      });
    });

  const api = new SupabaseRestApi({
    baseUrl: 'https://stub.invalid',
    anonKey: ANON_KEY,
    fetchImpl: hangingFetch,
    requestTimeoutMs: 25, // 覆盖成很小的窗口，让断言不必真等 30 秒
  });

  // 超时窗口取得很小，让断言跑得快（真等 30s 不现实）
  let threw = null;
  const started = Date.now();
  try {
    await api.pull('fake-token');
  } catch (error) {
    threw = error;
  }
  const elapsed = Date.now() - started;

  assert(threw instanceof SyncNetworkError, '挂住的请求必须抛 SyncNetworkError');
  assert(
    threw instanceof SyncNetworkError && threw.timedOut,
    '超时错误必须带 timedOut 标记（与「连接被拒」区分开）',
  );
  assert(
    threw instanceof Error && threw.message.includes('超时'),
    `错误信息要说清是超时而不是别的：${threw && threw.message}`,
  );
  assert(elapsed < 5000, `超时必须在窗口内触发（实际 ${elapsed} ms，不能一直 pending）`);
  endSection();
}

/* ------------------------------------------- ⑪ 推送链路：登录后补推 / 全量上传 */

// section('⑪ 推送链路：登录后补推 + 全量上传')
//
// 背景：实机反馈「Windows 上登录了，但没有同步到数据」。查出来的根因是**推送链路的
// 三个承诺没有兑现**：
//   1. `markLocalChange` 注释写着「未登录：不发请求，等登录后一并处理」——但
//      `enterSession` 只 pull 不推，pending 里的变更**一直没人推**；
//   2. `markLocalChange` 第一行 `if (!config.enabled) return;` 让「先在本地用、
//      后来才配 key」的变更**从未入队**；
//   3. 没有「把本机全部上传」的入口，配 key 之前就存在的历史待办永远上不了云。
//
// 这三条属于**逻辑正确性**（不是平台差异），只能靠断言守护。

{
  section('⑪ 推送链路：登录后补推 + 全量上传');

  // ── ① 未登录时的变更必须入队（否则「登录后一并处理」无从谈起）
  {
    const stub = await createMockSupabase();
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
    });
    const uuid = nextUuid();
    engine.markLocalChange(uuid);
    assert(
      engine.pendingCount() === 1,
      `未登录时的本地变更必须入队（实际 ${engine.pendingCount()}）`,
    );
    off();
    engine.dispose();
    await stub.close();
  }

  // ── ①' **同步未配置**时，变更也必须入队
  //      （用户可能是「先在本地用着、后来才配 key」；原来这里直接 return，
  //        变更从未入队，于是永远推不上去）
  {
    const stub = await createMockSupabase();
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
    });
    // 构造一个「未配置」的引擎：enabled = false
    const disabled = new SyncEngine({
      config: { ...config(stub.url), enabled: false },
      api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: ANON_KEY }),
      sessionStore: createMemorySessionStore(),
      stateStore: createMemorySessionStore(),
      local: {
        loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
        loadAll: () => db.fetchTodoSyncRows(null),
        applyRemote: (rows) => db.applyRemoteTodos(rows),
      },
      oauth: createOAuthLauncher(),
      clock,
      timers,
      onStatus: () => {},
      debounceMs: 5000,
    });
    disabled.markLocalChange(nextUuid());
    assert(
      disabled.pendingCount() === 1,
      `未配置同步时变更也必须入队（实际 ${disabled.pendingCount()}）`,
    );
    disabled.dispose();
    off();
    engine.dispose();
    await stub.close();
  }

  // ── ② 登录成功后必须补推 pending（enterSession 里 pull 之后要 flush）
  {
    const stub = await createMockSupabase();
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
    });
    await engine.login();
    const uuid = nextUuid();
    engine.markLocalChange(uuid);
    assert(engine.pendingCount() === 1, '变更应入队');
    // 走「进入会话」这条路径：pull 之后必须补推
    await engine.enterSession('自检');
    assert(
      engine.pendingCount() === 0,
      `登录后必须补推 pending（实际还剩 ${engine.pendingCount()} 条）`,
    );
    off();
    engine.dispose();
    await stub.close();
  }

  // ── ③ 「上传本机全部」：本机待办必须能一次性推上去
  {
    const stub = await createMockSupabase();
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
    });
    await engine.login();
    await db.createTodo({
      title: '待上传的本地待办',
      date: '2026-11-22',
      priority: 1,
      note: '',
    });
    await engine.pushAllLocal();
    const payload = JSON.stringify(lastPushPayload(stub));
    assert(
      payload.includes('待上传的本地待办'),
      '「上传本机全部」必须把本机待办推上去',
    );
    off();
    engine.dispose();
    await stub.close();
  }

  endSection();
}

/* ---------------------------------------------- ⑫ 双端回路：A 写 → 云端 → B 收到 */

// section('⑫ 双端回路：两个独立本机 + 同一个云端')
//
// **为什么要有这一组**：之前所有验证都是**单端**的——
//   - 编译通过（cargo xwin check / CI 出包）
//   - 脚本断言通过（十组路径，但都在测单端行为）
//   - E2E 6 passed（跑在浏览器里，**根本没有同步引擎**）
// 它们能证明「代码按我写的样子跑」，**证明不了「两个设备之间数据真的能对上」**。
//
// 2026-11-22 的实机反馈「Windows 登录了，但没有同步到数据」正是这个缺口：
// 推送链路的三个承诺在注释里写了、代码里一件都没实现，而**任何已有断言都抓不到它**。
//
// 这一组测的是**回路**：客户端 A 写数据 → 同步 → 客户端 B 拉到同一批数据。
// 任何一环断了就红。
{
  section('⑫ 双端回路：A 写 → 云端 → B 收到');

  /** 造一个独立的「本机」：内存数组当本地库（两台设备互不可见） */
  const makeLocal = (rows) => ({
    async loadByUuids(uuids) {
      return rows.filter((row) => uuids.includes(row.uuid));
    },
    async loadAll() {
      return [...rows];
    },
    async applyRemote(remote) {
      let inserted = 0;
      let updated = 0;
      for (const row of remote) {
        const index = rows.findIndex((x) => x.uuid === row.uuid);
        if (index >= 0) {
          rows[index] = { ...rows[index], ...row };
          updated += 1;
        } else {
          rows.push({ ...row });
          inserted += 1;
        }
      }
      return { inserted, updated, skipped: 0 };
    },
    async reviveTombstones(uuids) {
      let revived = 0;
      for (const row of rows) {
        if (row.deleted && uuids.includes(row.uuid)) {
          row.deleted = false;
          revived += 1;
        }
      }
      return revived;
    },
  });

  const makeRow = (uuid, title) => ({
    id: 1,
    uuid,
    title,
    date: '2026-11-22',
    priority: 1,
    note: '',
    done: false,
    created_at: '2026-11-22 10:00:00',
    updated_at: '2026-11-22 10:00:00',
    updated_at_ms: 1,
    deleted: 0,
  });

  const makeEngine = (stub, rows, onStatus = () => {}) =>
    new SyncEngine({
      config: { ...config(stub.url), autoSyncDays: 2 },
      api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: ANON_KEY }),
      sessionStore: createMemorySessionStore(),
      stateStore: createMemoryStateStore(),
      local: makeLocal(rows),
      oauth: createOAuthLauncher(),
      clock,
      timers,
      onStatus,
      debounceMs: 0,
    });

  // ── 场景 1：A 登录后新增 → B 登录后应拉到
  {
    const stub = await createMockSupabase();
    const rowsA = [];
    const rowsB = [];
    const statusA = { value: null };
    const engineA = makeEngine(stub, rowsA, (s) => {
      statusA.value = s;
    });
    const engineB = makeEngine(stub, rowsB);

    await engineA.login();
    assert(
      statusA.value?.phase === 'signed-in',
      `场景 1：A 必须真的登录成功（实际 ${statusA.value?.phase}：${statusA.value?.detail ?? ''}）`,
    );

    const uuid = nextUuid();
    rowsA.push(makeRow(uuid, '场景一的待办'));
    engineA.markLocalChange(uuid);
    await engineA.flush();

    await engineB.login();
    assert(
      rowsB.some((row) => row.uuid === uuid),
      `场景 1：B 端必须收到 A 的待办（实际 B 有 ${rowsB.length} 条：${rowsB.map((r) => r.title).join(',') || '空'}）`,
    );

    engineA.dispose();
    engineB.dispose();
    await stub.close();
  }

  // ── 场景 2：A 登录**前**就有的待办 → 登录后应上云 → B 应收到
  {
    const stub = await createMockSupabase();
    const rowsA = [];
    const rowsB = [];
    const engineA = makeEngine(stub, rowsA);
    const engineB = makeEngine(stub, rowsB);

    const uuid = nextUuid();
    rowsA.push(makeRow(uuid, '场景二的待办'));
    engineA.markLocalChange(uuid); // 未登录 → 只入队，不发请求

    await engineA.login(); // 登录后必须补推

    await engineB.login();
    assert(
      rowsB.some((row) => row.uuid === uuid),
      `场景 2：B 端必须收到 A 登录前就有的待办（实际 B 有 ${rowsB.length} 条：${rowsB.map((r) => r.title).join(',') || '空'}）`,
    );

    engineA.dispose();
    engineB.dispose();
    await stub.close();
  }

  // ── 场景 3：B 新增 → A 应拉到（反向回路）
  {
    const stub = await createMockSupabase();
    const rowsA = [];
    const rowsB = [];
    const engineA = makeEngine(stub, rowsA);
    const engineB = makeEngine(stub, rowsB);

    await engineA.login();
    await engineB.login();

    const uuid = nextUuid();
    rowsB.push(makeRow(uuid, '场景三的待办'));
    engineB.markLocalChange(uuid);
    await engineB.flush();

    await engineA.enterSession('自检');
    assert(
      rowsA.some((row) => row.uuid === uuid),
      `场景 3：A 端必须收到 B 的待办（实际 A 有 ${rowsA.length} 条）`,
    );

    engineA.dispose();
    engineB.dispose();
    await stub.close();
  }

  endSection();
}

/* ================================================ ⑭ 「拉取结果」必须说清楚 */

/**
 * 拉取结果必须区分「远端 0 行」与「远端 N 行但本地已是最新」。
 *
 * 背景（2026-11-23 实机反馈「Windows 同步一条都没拉到」）：
 * 合并有三种结果 —— 新增 / 覆盖本地 / **保持本地不变**（记在 `stats.skipped` 里）。
 * 原实现只报「新增 X 条、更新 Y 条」，于是
 * 「云端返回 0 行」与「云端返回 5 行但本地已是最新」显示成**一模一样**的
 * 「新增 0 条、更新 0 条」——用户分不出「云端没有我的数据」和「早就同步过了」。
 *
 * 实测那次：云端 schema 完全正常（与 `supabase/schema.sql` 一致），
 * 但**从来没有该用户的行**——本机 8 条待办的修改时间全部早于登录锚点，
 * 从未进入推送队列（自动同步只推「变更驱动」的增量）。
 * 所以「0 条」不是故障，是**本地数据还没上传**，界面必须把这件事说出来。
 */
section('⑭ 拉取结果说清「远端 N 行」，云端为空时给出上传指引');
{
  const { describePull, summarizeRemoteRows } = await import('../src/sync/engine.ts');

  // ── 文案语义
  const emptyText = describePull('登录', 0, { inserted: 0, updated: 0, skipped: 0 });
  assert(
    emptyText.includes('云端暂无你的数据'),
    `远端 0 行必须明说「云端暂无你的数据」，实际：${emptyText}`
  );

  const someText = describePull('登录', 5, { inserted: 1, updated: 2, skipped: 2 });
  assert(someText.includes('远端 5 行'), `必须报出远端行数，实际：${someText}`);
  assert(
    someText.includes('新增 1 条') && someText.includes('更新 2 条'),
    `必须报出新增/更新数，实际：${someText}`
  );
  assert(
    someText.includes('跳过 2 条'),
    `被跳过的条数必须说出来（否则与「0 条」混淆），实际：${someText}`
  );

  // 有细分计数时，必须说出**原因**（用户要靠它判断「数据去哪了」）
  const tombstoneText = describePull('登录', 8, {
    inserted: 0,
    updated: 0,
    skipped: 8,
    skippedEqual: 0,
    skippedLocalNewer: 0,
    skippedTombstone: 8,
    skippedInvalid: 0,
  });
  assert(
    tombstoneText.includes('本地已删除 8 条'),
    `本机是墓碑的情况必须明说（否则用户看到空列表会想不通），实际：${tombstoneText}`
  );

  const equalText = describePull('登录', 8, {
    inserted: 0,
    updated: 0,
    skipped: 8,
    skippedEqual: 8,
    skippedLocalNewer: 0,
    skippedTombstone: 0,
    skippedInvalid: 0,
  });
  assert(
    equalText.includes('已是最新 8 条'),
    `两边一样时要说明白，实际：${equalText}`
  );

  const noSkip = describePull('登录', 3, { inserted: 3, updated: 0, skipped: 0 });
  assert(
    !noSkip.includes('跳过'),
    `skipped 为 0 时不该出现「跳过」，实际：${noSkip}`
  );

  // ── 云端数据的**日期范围**（界面要靠它说明「数据在哪一天」）
  //
  // 背景（2026-11-25 实机反馈「Windows 上界面没显示出远端的数据」）：
  // 云端 8 行、本机也已入库 8 行、合并结果是「已是最新」——**数据早就到了**。
  // 但那 8 条的日期是 2026-10-15 ~ 11-16，而界面默认只看**今天**，
  // 于是「同步成功」与「列表空空」同时成立，用户完全想不通。
  // 所以引擎必须把「云端有多少条、日期在哪个区间」带出去。
  {
    const summary = summarizeRemoteRows([
      makeTodo({ uuid: 'a', date: '2026-11-16' }),
      makeTodo({ uuid: 'b', date: '2026-10-15' }),
      makeTodo({ uuid: 'c', date: '2026-11-01' }),
      makeTodo({ uuid: 'd', date: '2026-11-02', deleted: true }),
    ]);
    eq(summary.liveCount, 3, '云端活跃条数必须排除墓碑（墓碑不会出现在列表里）');
    eq(summary.dateMin, '2026-10-15', '日期范围起点必须是最早的活跃待办');
    eq(summary.dateMax, '2026-11-16', '日期范围终点必须是最晚的活跃待办');

    const empty = summarizeRemoteRows([]);
    eq(empty.liveCount, 0, '云端空时活跃条数必须是 0');
    eq(empty.dateMin, '', '云端空时日期范围必须是空串（界面据此不显示提示）');
    eq(empty.dateMax, '', '云端空时日期范围必须是空串（界面据此不显示提示）');

    const allTombstone = summarizeRemoteRows([
      makeTodo({ uuid: 'e', deleted: true }),
    ]);
    eq(
      allTombstone.liveCount,
      0,
      '全是墓碑时活跃条数必须是 0（否则界面会说「云端有 N 条」却一条都看不到）'
    );
  }

  // ── 「不在当前查看的这一天」的判断（界面要靠它解释「列表为什么空着」）
  {
    const { isRemoteOutsideView } = await import('../src/sync/engine.ts');
    eq(
      isRemoteOutsideView('2026-10-15', '2026-11-16', '2026-11-26'),
      true,
      '云端日期区间在查看日之前时，必须判定为「不在这一天」'
    );
    eq(
      isRemoteOutsideView('2026-10-15', '2026-11-16', '2026-11-01'),
      false,
      '查看日落在云端区间内时，不得判定为「不在这一天」'
    );
    eq(
      isRemoteOutsideView('2026-10-15', '2026-11-16', '2026-11-16'),
      false,
      '查看日正好是区间终点时，不得判定为「不在这一天」（那天就有待办）'
    );
    eq(
      isRemoteOutsideView('', '', '2026-11-26'),
      false,
      '云端没有日期范围时不得下判断（界面不该说「不在这一天」）'
    );
  }

  // ── 运行期：云端为空 → localNotUploaded = 本机待办数
  {
    resetLocal([
      makeTodo({ id: 1, uuid: 'local-a', updated_at_ms: 1000 }),
      makeTodo({ id: 2, uuid: 'local-b', updated_at_ms: 1000 }),
    ]);
    const stub = await createMockSupabase();
    const statuses = [];
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
      onStatus: (status) => statuses.push(status),
    });
    await engine.login();
    await engine.pull('登录');

    const after = statuses[statuses.length - 1];
    eq(after.localNotUploaded, 2, '云端为空时必须报出本机有多少条待办尚未上传');
    assert(
      after.detail.includes('云端暂无你的数据'),
      `状态文案必须说「云端暂无你的数据」，实际：${after.detail}`
    );

    // ── 上传本机全部后，提示必须撤掉
    await engine.pushAllLocal();
    const pushed = statuses[statuses.length - 1];
    eq(pushed.localNotUploaded, 0, '上传本机全部后「尚未上传」的提示必须撤掉');
    // 面板收敛后（2026-11-27）常驻文字只剩「状态 + 一行时间 + 一行摘要」，
    // 所以「点了按钮之后发生了什么」必须由 notice 这一行承担。
    assert(
      pushed.notice.includes('已上传本机全部 2 条待办'),
      `上传本机全部后必须给出结果反馈（notice），实际：${pushed.notice}`
    );

    // ── 云端已有数据时，不再提示「尚未上传」
    await engine.pull('手动重试');
    const refetched = statuses[statuses.length - 1];
    eq(refetched.localNotUploaded, 0, '云端已有数据时不应再提示「尚未上传」');
    // notice 必须**清空**：它是「刚刚发生」的反馈，不是常驻状态
    eq(
      refetched.notice,
      '',
      '新一轮同步开始后，上一条动作反馈必须清空（不许变成常驻文字）'
    );
    assert(
      refetched.detail.includes('远端 2 行'),
      `云端已有数据时必须报出远端行数，实际：${refetched.detail}`
    );
    // 云端数据的条数与日期范围：界面靠它说明「数据在哪一天」
    eq(
      refetched.remoteLiveCount,
      2,
      '拉取后必须报出云端活跃待办条数（界面要说明数据落在哪一天）'
    );
    eq(
      refetched.remoteDateMin,
      '2026-11-01',
      '拉取后必须报出云端待办的日期范围起点'
    );
    eq(
      refetched.remoteDateMax,
      '2026-11-01',
      '拉取后必须报出云端待办的日期范围终点'
    );

    // ── 登出后提示必须清掉（那时的「上传本机全部」按钮是禁用的）
    await engine.logout();
    const loggedOut = statuses[statuses.length - 1];
    eq(loggedOut.localNotUploaded, 0, '登出后「尚未上传」的提示必须清掉');
    eq(
      loggedOut.remoteLiveCount,
      0,
      '登出后「云端有 N 条」的提示必须清掉（会话没了，再说云端有数据是误导）'
    );

    off();
    engine.dispose();
    await stub.close();
  }

  // ── 运行期：本地是墓碑 → 界面必须能解释「为什么列表是空的」
  {
    resetLocal([
      makeTodo({ id: 1, uuid: 'tomb-1', deleted: true, updated_at_ms: 1000 }),
    ]);
    const stub = await createMockSupabase();
    stub.seed({
      uuid: 'tomb-1',
      title: '本机已删除',
      date: '2026-11-01',
      priority: 1,
      note: '',
      done: 0,
      created_at: '2026-11-01 09:00:00',
      updated_at: '2026-11-01 09:00:00',
      updated_at_ms: 1000,
      deleted: 1,
    });
    const statuses = [];
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
      onStatus: (status) => statuses.push(status),
    });
    await engine.login();
    await engine.pull('登录');

    const after = statuses[statuses.length - 1];
    eq(after.localTombstone, 1, '本机是墓碑的条数必须被记下来（界面要解释「为什么列表是空的」）');
    assert(
      after.detail.includes('本地已删除 1 条'),
      `状态文案必须说明是墓碑，实际：${after.detail}`
    );

    off();
    engine.dispose();
    await stub.close();
  }

  endSection();
}

/* ================================================ ⑮ 墓碑死锁与「找回」出口 */

/**
 * 「本机已删、云端还活着」的条目，必须有出路。
 *
 * 背景（2026-11-25 实机反馈「Windows 同步后，全部待办里也看不到数据」）：
 * 实测就是这个局面——本机 8 行**全是墓碑**，云端同 uuid 的 8 行**还活着**，
 * 合并结果全是 `tombstone-terminal`（保持本地不变），
 * 于是「远端 8 行、已是最新 8 条」与「列表全空」同时成立。
 *
 * 墓碑终结（OPEN-01）规定「已删条目不因任何非删除记录复活」，
 * 所以这类条目**永远拉不回来**——产品必须给出口：
 * ① **「上传本机全部」不带墓碑**（否则墓碑上云后会反删别的设备的活数据）；
 * ② **「找回」**：撤销**本机**的删除记录（只影响这台机器，不广播），再重新拉取。
 */
section('⑮ 墓碑死锁：「上传不带墓碑」+「找回」出口');
{
  // ── ① 数据层：只把「本机是墓碑且云端还活着」的条目算作可找回
  {
    resetLocal([
      makeTodo({ id: 1, uuid: 'tomb-live', deleted: true, updated_at_ms: 1000 }),
      makeTodo({ id: 2, uuid: 'tomb-dead', deleted: true, updated_at_ms: 1000 }),
      makeTodo({ id: 3, uuid: 'plain', deleted: false, updated_at_ms: 1000 }),
    ]);
    const stats = await db.applyRemoteTodos([
      { ...makeTodo({ uuid: 'tomb-live' }), deleted: false, updated_at_ms: 2000 },
      { ...makeTodo({ uuid: 'tomb-dead' }), deleted: true, updated_at_ms: 2000 },
      { ...makeTodo({ uuid: 'plain' }), deleted: false, updated_at_ms: 2000 },
    ]);
    eq(
      stats.recoverableUuids?.length,
      1,
      '只有「本机是墓碑、且云端同 uuid 还活着」的条目才可找回'
    );
    eq(stats.recoverableUuids?.[0], 'tomb-live', '可找回的 uuid 必须报对');
    eq(stats.skippedTombstone, 2, '本机是墓碑的条目都要记进 skippedTombstone');
  }

  // ── ② 运行期：本机是墓碑 + 云端还活着 → 状态里要给出「可找回」的条数
  {
    resetLocal([
      makeTodo({ id: 1, uuid: 'blocked-1', deleted: true, updated_at_ms: 1000 }),
      makeTodo({ id: 2, uuid: 'blocked-2', deleted: true, updated_at_ms: 1000 }),
    ]);
    const stub = await createMockSupabase();
    for (const uuid of ['blocked-1', 'blocked-2']) {
      stub.seed({
        uuid,
        title: `云端还活着 ${uuid}`,
        date: '2026-11-01',
        priority: 1,
        note: '',
        done: 0,
        created_at: '2026-11-01 09:00:00',
        updated_at: '2026-11-01 09:00:00',
        updated_at_ms: 2000,
        deleted: 0, // 云端版本**活着**
      });
    }
    const statuses = [];
    const { engine, off } = buildEngine(stub, {
      sessionStore: createMemorySessionStore(),
      oauth: createOAuthLauncher(),
      onStatus: (status) => statuses.push(status),
    });
    await engine.login();
    await engine.pull('登录');

    const after = statuses[statuses.length - 1];
    eq(
      after.recoverableCount,
      2,
      '「本机是墓碑、云端还活着」的条目数必须被记下来（界面要给「找回」出口）'
    );
    eq(after.localTombstone, 2, '本机是墓碑的条数也要照记');

    // 拉取之后：这 2 条**仍然看不见**（墓碑终结）——这就是「死锁」
    const visibleBefore = await db.fetchTodos();
    eq(
      visibleBefore.length,
      0,
      '墓碑终结下这批条目本来就不可见（所以必须有「找回」出口，而不是只报「已是最新」）'
    );

    // ── ③ 「找回」：撤销本机的删除记录 → 重新拉取 → 条目回来
    await engine.recoverDeleted();
    const visibleAfter = await db.fetchTodos();
    eq(
      visibleAfter.length,
      2,
      '「找回」之后这批条目必须重新可见（否则用户永远卡在「已是最新 N 条」+ 空列表）'
    );
    assert(
      visibleAfter.every((t) => t.deleted !== true),
      '找回后不该还有墓碑留在可见列表里',
    );
    eq(
      statuses[statuses.length - 1].recoverableCount,
      0,
      '找回完成后「可找回」的条数必须归零（不然会反复提示）'
    );
    // 「找回」完成后按钮会消失，面板收敛后也没有常驻说明段了——
    // 没有 notice，用户会以为「点了没反应」。
    assert(
      statuses[statuses.length - 1].notice.includes('已找回 2 条'),
      `「找回」完成后必须给出结果反馈（notice），实际：${statuses[statuses.length - 1].notice}`
    );

    // ── ④「上传本机全部」**不推墓碑**
    //   把本机重新做成「一条活的 + 一条墓碑」，看推到云端的 payload 里有没有墓碑
    resetLocal([
      makeTodo({ id: 1, uuid: 'alive-1', deleted: false, updated_at_ms: 3000 }),
      makeTodo({ id: 2, uuid: 'dead-1', deleted: true, updated_at_ms: 3000 }),
    ]);
    await engine.pushAllLocal();
    const payload = lastPushPayload(stub);
    assert(payload !== null, '「上传本机全部」应当发出一次推送');
    const pushedUuids = (payload ?? []).map((row) => row.uuid);
    assert(
      pushedUuids.includes('alive-1'),
      `活着的待办必须上传，实际：${pushedUuids.join('、')}`
    );
    assert(
      !pushedUuids.includes('dead-1'),
      `**删除记录不得跟着「上传本机全部」上云**——墓碑上云后会反删别的设备的活数据，` +
        `实际推了：${pushedUuids.join('、')}`
    );
    assert(
      !(payload ?? []).some((row) => row.deleted === 1 || row.deleted === true),
      '推送 payload 里不得出现 deleted = 1 的行',
    );

    off();
    engine.dispose();
    await stub.close();
  }

  endSection();
}

console.log('');
if (failures.length > 0) {
  console.error(`✗ 同步自检失败 ${failures.length} / ${checks} 项：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✓ 同步自检 PASS：${checks} 项断言，十五组路径 + v3 迁移结构证据 + 平台无关性全部通过`);
console.log('  NOT-VERIFIED：真实 Supabase 读写、真实 GitHub OAuth 往返、云侧 RLS 越权不可见');

/* ------------------------------------------------------------------ 辅助 */

/** 走一次真实登录，把会话存进给定的 store（用于「已登录启动」场景） */
async function stubLogin(stub, store) {
  const { engine, off } = buildEngine(stub, {
    sessionStore: store,
    oauth: createOAuthLauncher(),
  });
  await engine.login();
  const session = await store.load();
  off();
  engine.dispose();
  return session;
}

