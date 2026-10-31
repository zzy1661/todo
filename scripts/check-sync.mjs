/**
 * 同步层本地 stub 回归（S10 必做项 8 / PRD FR-SYNC-15 / 测试计划 §5.8）。
 *
 * 五组路径逐条真跑，全部打在本机假云端（`scripts/mock-supabase.mjs`）上，
 * 数据走真实数据层（`src/db/database.ts` 的 localStorage 实现，语义与 SQLite 对齐）：
 *   ① 5 秒防抖 + 合并 + 只推变更条目 + 软删除 payload
 *   ② 启动拉取合并 / 登录成功后立即拉取
 *   ③ LWW（双向、同毫秒稳定序、6 小时时钟偏移）
 *   ④ 墓碑终结（远端删除不可被旧数据复活）+ 本地软删除行仍在库
 *   ⑤ 401 失效 → 刷新重试 → 刷新失败置未登录
 * 另加：⑥ 未配置时零请求（AC-57 的同步侧证据）
 * 以及：v3 迁移在真实 SQLite 上的结构证据（AC-64 / TC-076）
 *
 * **不覆盖**：真实 Supabase / 真实 GitHub OAuth / 真实 RLS —— 一律 NOT-VERIFIED。
 *
 * 用法：node scripts/check-sync.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMockSupabase } from './mock-supabase.mjs';

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
const section = (title) => console.log(`\n── ${title}`);

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
const ANON_KEY = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ role: 'anon' })
).toString('base64url')}.sig`;

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

/** 造一个引擎，并把「本地写 → 防抖推送」总线上线（与 store 层的接法一致） */
function buildEngine(stub, { sessionStore, oauth, onStatus = () => {} }) {
  const engine = new SyncEngine({
    config: config(stub.url),
    api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: 'stub-anon-key' }),
    sessionStore,
    local: {
      loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
      applyRemote: (rows) => db.applyRemoteTodos(rows),
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
}

/* ================================================================= 路径 ⑥ */

section('⑥ 未配置时零请求（AC-57）');
{
  resetLocal([makeTodo({ id: 1, uuid: nextUuid(), title: '未配置', updated_at_ms: 1000 })]);
  const stub = await createMockSupabase();
  const requests = [];
  const engine = new SyncEngine({
    config: { enabled: false, baseUrl: stub.url, anonKey: '', source: 'none' },
    api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: 'stub-anon-key' }),
    sessionStore: createMemorySessionStore(),
    local: {
      loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
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
}

/* ================================================================ 迁移证据 */

section('v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列）');
{
  const dbPath = path.join(os.tmpdir(), `todo_v3_check_${process.pid}_${Date.now()}.db`);
  const libSource = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
  const legacySql = [...libSource.matchAll(/sql:\s*"([\s\S]*?)",\s*kind:/g)].map((m) => m[1]);
  eq(legacySql.length, 2, 'lib.rs 中应只有 v1 / v2 两段字面量迁移 SQL（v3 走独立文件）');
  for (const statement of legacySql) {
    assert(!/\bDROP\b/i.test(statement), 'v1 / v2 不得出现 DROP');
    assert(!/\bALTER\b/i.test(statement), 'v1 / v2 不得出现 ALTER（v3 才允许 ADD COLUMN）');
  }

  const sqlite = (sql) =>
    execFileSync('sqlite3', [dbPath], { encoding: 'utf8', input: sql }).trim();
  sqlite('PRAGMA journal_mode = MEMORY;');
  for (const statement of legacySql) sqlite(statement);
  sqlite(
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
  sqlite(v3);

  const todoColumns = sqlite('PRAGMA table_info(todos);').split('\n');
  for (const required of ['uuid', 'updated_at_ms', 'deleted']) {
    assert(
      todoColumns.some((line) => line.split('|')[1] === required),
      `todos 应有 ${required} 列，实际 ${todoColumns.join(' / ')}`
    );
  }
  const pickColumns = sqlite('PRAGMA table_info(daily_picks);').split('\n');
  for (const forbidden of ['uuid', 'updated_at_ms', 'deleted']) {
    assert(
      !pickColumns.some((line) => line.split('|')[1] === forbidden),
      `daily_picks 不得新增 ${forbidden} 列（D-19）`
    );
  }

  eq(
    sqlite('SELECT count(*) FROM todos WHERE uuid IS NULL OR uuid = "";'),
    '0',
    '历史行 uuid 必须回填且非空'
  );
  eq(
    sqlite('SELECT count(DISTINCT uuid) FROM todos;'),
    sqlite('SELECT count(*) FROM todos;'),
    'uuid 必须唯一'
  );
  eq(sqlite('SELECT sum(deleted) FROM todos;'), '0', 'deleted 默认必须为 0');
  assert(
    Number(sqlite('SELECT min(updated_at_ms) FROM todos;')) > 0,
    'updated_at_ms 必须回填为正数毫秒'
  );
  const uuidBefore = sqlite('SELECT group_concat(uuid) FROM todos ORDER BY id;');

  // 幂等：重复执行回填语句不得重新生成 uuid
  sqlite(
    `UPDATE todos SET uuid = lower(hex(randomblob(4))) || '-' || substr(lower(hex(randomblob(2))), 1, 4) || '-4' ||
       substr(lower(hex(randomblob(2))), 2, 3) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) ||
       substr(lower(hex(randomblob(2))), 2, 3) || '-' || lower(hex(randomblob(6)))
     WHERE uuid IS NULL;`
  );
  eq(sqlite('SELECT group_concat(uuid) FROM todos ORDER BY id;'), uuidBefore, '二次执行回填不得改变已有 uuid（幂等）');

  // 软删除：行仍在库
  sqlite('UPDATE todos SET deleted = 1 WHERE id = 1;');
  eq(sqlite('SELECT count(*) FROM todos;'), '2', '软删除后行数不变（不是物理删除）');
  eq(sqlite('SELECT deleted FROM todos WHERE id = 1;'), '1', '软删除标记应落库');

  console.log(`   · PRAGMA table_info(todos) → ${todoColumns.join(' ; ')}`);
  console.log(`   · 回填 uuid → ${uuidBefore}`);
  console.log(`   · 软删除后 deleted → ${sqlite('SELECT group_concat(id || ":" || deleted) FROM todos;')}`);
  fs.rmSync(dbPath, { force: true });
}

/* ==================================================================== 收尾 */

console.log('');
if (failures.length > 0) {
  console.error(`✗ 同步自检失败 ${failures.length} / ${checks} 项：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✓ 同步自检 PASS：${checks} 项断言，六组路径 + v3 迁移结构证据全部通过`);
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

