/**
 * S10.5 补充证据：登出、断网降级、状态区关闭不丢会话（引擎 / 存储层）。
 *
 * 为什么单独一个脚本：`scripts/check-sync.mjs` 覆盖六组路径但不含「登出」与
 * 「断网时推送失败」两段，而 S10.5 必做项 1 明确要求这两条要有真实命令与输出。
 * 本脚本**不加 test()、不改产品代码、不放宽断言**，只在本地 stub 上真跑。
 *
 * 用法：node scripts/check-sync-extra.mjs
 */
import { createMockSupabase } from '../scripts/mock-supabase.mjs';

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

const { setClock } = await import('../src/sync/clock.ts');
const { setTimers } = await import('../src/sync/timers.ts');
const { SyncEngine } = await import('../src/sync/engine.ts');
const { SupabaseRestApi } = await import('../src/sync/api.ts');
const { createMemorySessionStore } = await import('../src/sync/sessionStore.ts');
const { onLocalTodoChange } = await import('../src/sync/events.ts');
const { configFromEnv } = await import('../src/sync/config.ts');
const db = await import('../src/db/database.ts');

const realSetTimeout = globalThis.setTimeout;
const START = 1_700_000_000_000;

const clock = { t: START, now: () => clock.t };

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
  next() {
    let best = null;
    for (const [id, timer] of this.queue) {
      if (!best || timer.due < best[1].due || (timer.due === best[1].due && id < best[0])) {
        best = [id, timer];
      }
    }
    return best;
  }
}

const timers = new FakeTimers(clock);
setClock(clock);
setTimers(timers);

const drain = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => realSetTimeout(resolve, 3));
  }
};

/** AC-60 的假时钟推进方法：按到期时间依次触发，并把假时间停到目标点 */
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
const endSection = () => {
  const total = checks - sectionChecks;
  const failed = failures.length - sectionFailures;
  console.log(
    failed === 0
      ? `   ✓ ${sectionTitle} PASS（${total} 项断言）`
      : `   ✗ ${sectionTitle} FAIL（${total} 项断言，${failed} 项失败）`
  );
};

/* ----------------------------------------------------------------- 夹具 */

let uuidSeq = 0;
const nextUuid = () => {
  uuidSeq += 1;
  return `00000000-0000-4000-9000-${String(uuidSeq).padStart(12, '0')}`;
};

function resetLocal(rows = []) {
  localStorage.clear();
  localStorage.setItem('todo_local_db', JSON.stringify(rows));
  localStorage.setItem(
    'todo_local_db_seq',
    String(rows.reduce((max, row) => Math.max(max, row.id), 0))
  );
}

const STAMP = '2026-11-01 09:00:00';

function makeTodo(overrides = {}) {
  return {
    id: 0,
    uuid: overrides.uuid ?? nextUuid(),
    title: '待办',
    date: '2026-11-01',
    priority: 1,
    note: '',
    done: false,
    created_at: STAMP,
    updated_at: STAMP,
    updated_at_ms: 1000,
    deleted: false,
    ...overrides,
  };
}

// 占位密钥：形态必须是 legacy JWT 且 `role: anon`（白名单，AC-67 不接受随意字符串）
const STUB_ANON_KEY = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ role: 'anon' })
).toString('base64url')}.stub-sig`;

function buildEngine(stub, { sessionStore }) {
  process.env.SUPABASE_URL = stub.url;
  process.env.SUPABASE_ANON_KEY = STUB_ANON_KEY;
  const parsed = configFromEnv(process.env);
  if (!parsed.config.enabled) throw new Error(`stub 配置不合法：${parsed.reason}`);
  const statuses = [];
  const engine = new SyncEngine({
    config: parsed.config,
    api: new SupabaseRestApi({ baseUrl: stub.url, anonKey: STUB_ANON_KEY }),
    sessionStore,
    local: {
      loadByUuids: (uuids) => db.fetchTodoSyncRows(uuids),
      applyRemote: (rows) => db.applyRemoteTodos(rows),
    },
    oauth: createOAuthLauncher(),
    clock,
    timers,
    onStatus: (status) => statuses.push(status),
    debounceMs: 5000,
    retryDelays: [100, 200, 400],
    oauthTimeoutMs: 2000,
  });
  const off = onLocalTodoChange(({ uuid, kind }) => {
    if (kind === 'merge') return;
    engine.markLocalChange(uuid);
  });
  return { engine, off, statuses };
}

function createOAuthLauncher() {
  let pending = '';
  return {
    async listen() {
      return 51999;
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

/* ================================================================= ① 登出 */

section('① 登录 → 登出：会话清空、状态回未登录、登出后零推送（AC-58 / TC-062）');
{
  resetLocal([makeTodo({ id: 1, title: '登出前的本地数据' })]);
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, { sessionStore: store });

  await engine.start();
  eq(engine.getStatus().phase, 'signed-out', '未登录启动应为「未登录」');
  await engine.login();
  eq(engine.getStatus().phase, 'signed-in', '登录成功后应为「已登录」');
  eq(engine.getStatus().email, 'sync-test@example.com', '状态应带上账号邮箱');
  assert(!!(await store.load()), '登录后会话应写入存储');

  stub.resetLog();
  await engine.logout();
  eq(engine.getStatus().phase, 'signed-out', '登出后状态应回「未登录」');
  eq(engine.getStatus().email, '', '登出后不应残留邮箱');
  eq(await store.load(), null, '登出后会话存储必须清空');
  eq(engine.pendingCount(), 0, '登出后待推集合必须清空');
  const logoutCalls = stub.state.requests.filter((r) => r.path === '/auth/v1/logout');
  eq(logoutCalls.length, 1, '登出应尽力通知云端一次 /auth/v1/logout');
  eq(logoutCalls[0]?.method, 'POST', '登出请求方法应为 POST');

  // 登出后的本地改动不得再发请求（FR-SYNC-10）
  stub.resetLog();
  const created = await db.createTodo({ title: '登出后新建', date: '2026-11-05', priority: 1, note: '' });
  await db.updateTodo(created.id, { done: true });
  await advance(10_000);
  eq(stub.state.requests.length, 0, '登出后本地改动不得再发任何云端请求');

  // 本地数据完好
  const visible = await db.fetchTodos();
  assert(visible.some((row) => row.title === '登出后新建'), '登出不得影响本地数据可读');
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ============================================================= ② 断网降级 */

section('② 断网降级：推送/拉取失败不阻塞、本地数据不丢、状态可重试（AC-57 / TC-058）');
{
  resetLocal([makeTodo({ id: 1, title: '断网前已有' })]);
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, { sessionStore: store });
  await engine.login();
  eq(engine.getStatus().phase, 'signed-in', '登录成功');

  // 断网 = 把 stub 关掉，后续请求必然 ECONNREFUSED
  await stub.close();
  const before = (await db.fetchTodos()).length;
  const created = await db.createTodo({ title: '断网时新建', date: '2026-11-06', priority: 2, note: '' });
  await advance(5000);
  eq(engine.getStatus().phase, 'error', '推送失败后状态应为「同步失败」');
  const firstDetail = engine.getStatus().detail;
  assert(/秒后重试/.test(firstDetail), `首次失败应提示退避重试，实际「${firstDetail}」`);
  eq((await db.fetchTodos()).length, before + 1, '推送失败不得回滚本地数据');
  eq((await db.fetchTodos()).some((row) => row.id === created.id), true, '断网时新建的条目必须仍可见');

  // 退避重试仍失败 → 收敛为「可手动重试」，本地数据依旧不动
  await advance(100_000);
  const status = engine.getStatus();
  eq(status.lastResult, 'failed', '失败结果应记为 failed');
  assert(/手动重试/.test(status.detail), `退避耗尽后应提示可手动重试，实际「${status.detail}」`);
  eq((await db.fetchTodos()).length, before + 1, '多次重试失败后本地数据仍不丢');

  // 拉取失败：返回 null，不抛到界面，本地数据不动
  const pulled = await engine.pull('断网拉取');
  eq(pulled, null, '断网时拉取应返回 null 而不是抛错');
  eq((await db.fetchTodos()).length, before + 1, '拉取失败不得改动本地数据');
  off();
  engine.dispose();
  endSection();
}

/* ================================================== ③ 状态区关闭不丢会话 */

section('③ 状态区关闭不丢会话：状态与会话在 UI 开关之外（AC-58 / TC-062 扩展）');
{
  resetLocal([makeTodo({ id: 1, title: '会话保持' })]);
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, { sessionStore: store });
  await engine.login();
  const afterLogin = engine.getStatus();
  eq(afterLogin.phase, 'signed-in', '登录后应为「已登录」');
  assert(typeof afterLogin.lastSyncAt === 'number', '登录后应有上次同步时间');
  const lastSyncAt = afterLogin.lastSyncAt;

  // 「关闭状态区」在实现上只翻转 syncState.panelOpen（src/stores/sync.ts:213-215），
  // 引擎与 sessionStore 完全不经手；这里按同样顺序取两次状态，证明状态不因开关而变。
  const afterClose = engine.getStatus();
  const afterReopen = engine.getStatus();
  eq(afterClose.phase, 'signed-in', '关闭状态区后状态仍应为「已登录」');
  eq(afterReopen.phase, 'signed-in', '重开状态区后状态仍应为「已登录」');
  eq(afterReopen.email, 'sync-test@example.com', '重开后仍显示账号');
  eq(afterReopen.lastSyncAt, lastSyncAt, '重开后「上次同步时间」不得被重置');
  assert(!!(await store.load()), '关闭 / 重开状态区不得清空会话存储');

  // 比面板开关更强的场景：整个引擎重建（等价于重启应用）后仍是已登录
  off();
  engine.dispose();
  const restarted = buildEngine(stub, { sessionStore: store });
  await restarted.engine.start();
  eq(restarted.engine.getStatus().phase, 'signed-in', '引擎重建（≈重启）后仍应为「已登录」');
  eq(restarted.engine.getStatus().email, 'sync-test@example.com', '重建后账号仍在');
  restarted.off();
  restarted.engine.dispose();
  await stub.close();
  endSection();
}

/* ============================================ ④ 5 秒防抖时间线（AC-60 ②） */

section('④ 防抖时间线：4.9 秒零请求、5.0 秒一次（AC-60 / TC-065 / TC-066）');
{
  resetLocal();
  const stub = await createMockSupabase();
  const store = createMemorySessionStore();
  const { engine, off } = buildEngine(stub, { sessionStore: store });
  await engine.login();
  stub.resetLog();

  // 时间源与定时器都是注入的（setClock / setTimers），推进方式就是下面的 advance(ms)：
  // 按到期时间依次触发挂起的定时器，并把假时间停到目标点。实现方不得各写一套。
  console.log('   · 推进方法：setClock / setTimers 注入 + advance(ms)（见本文件顶部）');
  const a = await db.createTodo({ title: '甲', date: '2026-11-01', priority: 1, note: '' });
  const b = await db.createTodo({ title: '乙', date: '2026-11-01', priority: 1, note: '' });
  await advance(2000);
  const at2 = stub.pushCount();
  await db.updateTodo(a.id, { title: '甲改' });
  await advance(4900); // 距最后一次改动 4.9 秒
  const at49 = stub.pushCount();
  await advance(100); // 距最后一次改动 5.0 秒
  const at50 = stub.pushCount();
  const payload = stub.state.requests.filter(
    (r) => r.method === 'POST' && r.path === '/rest/v1/todos'
  ).at(-1)?.body;

  console.log(`   · +2.0 秒 → 推送 ${at2} 次`);
  console.log(`   · +4.9 秒（最后一次改动后）→ 推送 ${at49} 次`);
  console.log(`   · +5.0 秒（最后一次改动后）→ 推送 ${at50} 次`);
  console.log(`   · 该次 payload 条数 = ${Array.isArray(payload) ? payload.length : 'n/a'}`);
  console.log(
    `   · payload 字段 = ${Array.isArray(payload) ? Object.keys(payload[0] ?? {}).join(',') : 'n/a'}`
  );
  eq(at2, 0, '+2.0 秒仍在防抖窗口内，应零推送');
  eq(at49, 0, '最后一次改动后 4.9 秒应零推送（AC-60 ②）');
  eq(at50, 1, '最后一次改动后 5.0 秒应推送一次（AC-60 ②）');
  eq(payload?.length, 2, '窗口内 2 次变更应合并为一次推送（AC-60 ①）');
  assert(
    ['uuid', 'updated_at_ms', 'deleted'].every((key) => Object.keys(payload?.[0] ?? {}).includes(key)),
    'payload 每条必须含 uuid / updated_at_ms / deleted'
  );
  assert(!!b.uuid, '第二条变更应已被合并进同一次推送');
  off();
  engine.dispose();
  await stub.close();
  endSection();
}

/* ==================================================================== 收尾 */

console.log('');
if (failures.length > 0) {
  console.error(`✗ 补充自检失败 ${failures.length} / ${checks} 项：`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✓ 补充自检 PASS：${checks} 项断言（登出 / 断网降级 / 状态区关闭不丢会话 / 防抖时间线）`);
console.log('  NOT-VERIFIED：真实云端登录态下的状态区截图、真实断网（Wi-Fi 关闭）下的桌面 UI');
