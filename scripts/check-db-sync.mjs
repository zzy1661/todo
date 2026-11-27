/**
 * 同步网关 · **SQLite 路径**自检（v0.3.9 新增）。
 *
 * ## 为什么必须有这条脚本
 *
 * 2026-11-26 实机故障：**桌面端（Windows / macOS 桌面版）的每一次拉取都在
 * 第一条云端记录上抛 `column index out of range`**，数据**从来没有进过本机库**，
 * 于是界面上一条都不显示——而状态区还能报出「远端 8 行」。
 *
 * 根因：`TODOS_ALL` 常量里的 `-- sync-all-rows` 是**行注释**，会吞掉该行剩下的
 * 全部内容。它作为**前缀**被拼上 `WHERE uuid = ?` 之后，WHERE 整段落进注释，
 * **语句没有占位符，却还要绑一个值** ⇒ SQLite 报 column index out of range。
 *
 * **为什么所有测试都没抓到**：同步层的断言全部跑在 **localStorage 实现**上
 * （浏览器路径不拼 SQL），`check-db-parity.mjs` 的操作序列里又**没有 applyRemote /
 * loadByUuids 这两步**。**桌面路径上最要命的两个函数，从未被任何断言执行过。**
 *
 * ## 这条脚本做什么
 *
 * 1. 用 `node:sqlite` 接管 Tauri 的 invoke 通道，跑**真实的 `src/db/database.ts`
 *    的 SQLite 实现**（与 Windows 桌面版同一条代码路径）；
 * 2. 把**同步网关的三个函数**（`fetchTodoSyncRows` / `applyRemoteTodos` /
 *    `reviveTombstones`）连同本地增删改一起**逐条真跑**；
 * 3. 对**每一条真正发出去的 SQL**做机械校验：**语句里（去掉注释与字符串后）的
 *    `?` 个数必须等于绑定的值个数**——这一条能挡住「注释吞占位符」这一整类缺陷。
 *
 * 用法：node scripts/check-db-sync.mjs   （违规即以非零码退出）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// 断言器
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`   ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? `：${detail}` : ''}`);
    console.log(`   ✗ ${name}${detail ? `：${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 接管 Tauri 的 invoke 通道 → node:sqlite（与 check-db-parity.mjs 同一套）
// ---------------------------------------------------------------------------
let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
  new DatabaseSync(':memory:').close();
} catch (error) {
  console.log(
    '⊘ 跳过 SQLite 同步网关自检：本平台没有 node:sqlite（Windows 不支持该内置模块）。\n' +
      '  这不是「通过」，而是「本平台不具备跑这个对比的技术条件」。'
  );
  process.exit(0);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);
CREATE TABLE IF NOT EXISTS daily_picks (
  date TEXT PRIMARY KEY,
  method_id TEXT NOT NULL,
  manual INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
`;
const SYNC_COLUMNS_SQL = fs.readFileSync(
  path.join(ROOT, 'src-tauri', 'migrations', '0003_sync_columns.sql'),
  'utf8'
);

const pools = new Map();
const connect = (p) => {
  if (!pools.has(p)) pools.set(p, new DatabaseSync(':memory:'));
  return pools.get(p);
};
const rowsFrom = (rows) =>
  rows.map((row) => {
    const out = {};
    for (const key of Object.keys(row)) out[key] = row[key];
    return out;
  });

/** 发出去的每一条 SQL 都被记账：语句 + 绑定值 */
const issuedSql = [];

/** 去掉注释与字符串字面量，只留下 SQL 的「骨架」 */
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'") {
      i += 1;
      while (i < sql.length && sql[i] !== "'") {
        if (sql[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * 数一条 SQL 里**真正生效**的 `?` 占位符个数。
 *
 * 必须去掉注释与字符串字面量后再数——否则 `--` 注释里的 `?` 会被算进去，
 * 而它**根本不是占位符**（这正是本次故障的形态）。
 */
function countPlaceholders(sql) {
  return (stripSqlComments(sql).match(/\?/g) ?? []).length;
}

globalThis.window = {
  __TAURI_INTERNALS__: {
    async invoke(cmd, args) {
      const db = connect(args.db);
      if (cmd === 'plugin:sql|select' || cmd === 'plugin:sql|execute') {
        const values = args.values ?? [];
        issuedSql.push({ sql: args.query, values });
      }
      switch (cmd) {
        case 'plugin:sql|load':
          return args.db;
        case 'plugin:sql|select': {
          const stmt = db.prepare(args.query);
          return rowsFrom(stmt.all(...(args.values ?? [])));
        }
        case 'plugin:sql|execute': {
          const stmt = db.prepare(args.query);
          const info = stmt.run(...(args.values ?? []));
          return [Number(info.changes), Number(info.lastInsertRowid)];
        }
        case 'plugin:sql|close':
          return true;
        default:
          throw new Error(`未处理的命令：${cmd}`);
      }
    },
  },
};
connect('sqlite:todo.db').exec(SCHEMA);
connect('sqlite:todo.db').exec(SYNC_COLUMNS_SQL);

const db = await import('../src/db/database.ts');

// ---------------------------------------------------------------------------
// 造数据：一条活的、一条墓碑
// ---------------------------------------------------------------------------
console.log('\n▶ SQLite 同步网关自检（真实 src/db/database.ts 的 SQLite 实现）');

// 整个流程包在 try 里：**抛异常也算一条失败**（而不是让脚本崩掉）。
// 本次的真实故障就是抛 `column index out of range` —— 崩栈很难一眼看出是哪条 SQL。
let fatal = null;
try {
  await runAll();
} catch (error) {
  fatal = error;
}

if (fatal) {
  const message = fatal instanceof Error ? fatal.message : String(fatal);
  check(
    '同步网关在 SQLite 路径上真跑通（没有抛异常）',
    false,
    `${message} —— 这多半是 SQL 拼错了：检查语句里的占位符是不是被注释吞掉了`
  );
}

console.log('\n----------------------------------------');
console.log(`断言通过 ${passed} 条，失败 ${failures.length} 条`);
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\nFAIL');
  process.exit(1);
}
console.log('PASS（SQLite 路径的同步网关真跑通：拉取 / 合并 / 复活 / 前端可见性）');

/** 全部断言流程 */
async function runAll() {
  const live = await db.createTodo({
    title: '活着的待办',
    date: '2026-11-16',
    priority: 1,
    note: '',
  });
  const doomed = await db.createTodo({
    title: '被删除的待办',
    date: '2026-11-16',
    priority: 2,
    note: '备注',
  });
  await db.deleteTodo(doomed.id);

  const syncRows = await db.fetchTodoSyncRows(null);
  const doomedRow = syncRows.find((r) => r.uuid === doomed.uuid);
  check('fetchTodoSyncRows(null) 能读到含墓碑的全量行', syncRows.length === 2, `实际 ${syncRows.length} 行`);
  check('墓碑行 deleted = true', doomedRow?.deleted === true, `实际 ${doomedRow?.deleted}`);

  console.log('\n▶ 同步网关的三个函数（这三个在 localStorage 路径上被测过，SQLite 路径上从未被测过）');

  // ① loadByUuids：带 WHERE 条件的那条查询
  const byUuid = await db.fetchTodoSyncRows([doomed.uuid]);
  check('fetchTodoSyncRows([uuid]) 能按 uuid 取到墓碑行', byUuid.length === 1 && byUuid[0].deleted === true,
    `实际 ${byUuid.length} 行，deleted=${byUuid[0]?.deleted}`);

  // ② applyRemote：远端来一条**活的**同 uuid 记录
  //    本机是墓碑 ⇒ 墓碑终结 ⇒ 保持本地不变，但**必须报出「可找回」**
  const remoteLive = {
    uuid: doomed.uuid,
    title: '被删除的待办',
    date: '2026-11-16',
    priority: 2,
    note: '备注',
    done: false,
    created_at: '2026-11-16 10:00:00',
    updated_at: '2026-11-16 10:00:00',
    updated_at_ms: 2_000_000_000_000,
    deleted: 0,
  };
  const statsTomb = await db.applyRemoteTodos([remoteLive]);
  check('本机是墓碑 + 云端是活的 ⇒ 保持本地不变（墓碑终结）', statsTomb.skipped === 1 && statsTomb.updated === 0,
    `skipped=${statsTomb.skipped} updated=${statsTomb.updated}`);
  check('并且报出「可找回」的 uuid', (statsTomb.recoverableUuids ?? []).includes(doomed.uuid),
    JSON.stringify(statsTomb.recoverableUuids));

  // ③ applyRemote：远端来一条**新** uuid ⇒ 应当插入
  const freshUuid = '11111111-2222-3333-4444-555555555555';
  const statsFresh = await db.applyRemoteTodos([
    {
      uuid: freshUuid,
      title: '云端新增的待办',
      date: '2026-11-17',
      priority: 1,
      note: '',
      done: false,
      created_at: '2026-11-17 10:00:00',
      updated_at: '2026-11-17 10:00:00',
      updated_at_ms: 2_000_000_001_000,
      deleted: 0,
    },
  ]);
  check('远端新 uuid ⇒ 插入一条', statsFresh.inserted === 1, `inserted=${statsFresh.inserted}`);

  // ④ 前端读的那张表（fetchTodos = deleted = 0）里能看到新插入的那条
  const visible = await db.fetchTodos();
  check('前端读的那张表里能看到云端新增的待办', visible.some((t) => t.uuid === freshUuid),
    `可见 ${visible.length} 条：${visible.map((t) => t.title).join('、')}`);
  check('墓碑仍然不可见（软删除过滤生效）', !visible.some((t) => t.uuid === doomed.uuid));

  // ⑤ revive：复活墓碑 ⇒ 前端立刻能看到
  const revived = await db.reviveTombstones([doomed.uuid]);
  check('reviveTombstones 复活 1 条', revived === 1, `实际 ${revived}`);
  const afterRevive = await db.fetchTodos();
  check('复活后前端读的那张表里能看到它', afterRevive.some((t) => t.uuid === doomed.uuid),
    `可见 ${afterRevive.length} 条`);

  // -------------------------------------------------------------------------
  // 机械校验：每一条发出去的 SQL，占位符数 == 绑定值数
  // -------------------------------------------------------------------------
  console.log('\n▶ SQL 占位符与绑定值的配平（挡住「注释吞占位符」这一整类缺陷）');
  let mismatched = 0;
  for (const item of issuedSql) {
    const expected = countPlaceholders(item.sql);
    if (expected !== item.values.length) {
      mismatched += 1;
      console.log(
        `   ✗ 占位符 ${expected} 个但绑定了 ${item.values.length} 个值：${item.sql.replace(/\s+/g, ' ').slice(0, 120)}`
      );
    }
  }
  check(
    '所有发出去的 SQL，占位符数与绑定值数一致',
    mismatched === 0,
    `${mismatched} 条不匹配（共 ${issuedSql.length} 条）`
  );
  check('确实跑到了带 WHERE 条件的那条查询',
    issuedSql.some((i) => /WHERE\s+uuid/i.test(stripSqlComments(i.sql))),
    `${issuedSql.length} 条 SQL`);
}
