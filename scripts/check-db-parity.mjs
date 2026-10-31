/**
 * 双后端等价性对拍（FR-DB-04）。
 *
 * 同一个操作序列分别跑在两条实现上，逐条比对可见结果：
 * - 浏览器路径：src/db/database.ts 的 localStorage 实现
 * - 桌面路径：同一份 src/db/database.ts 的 SQLite 实现
 *
 * 桌面路径通过接管 Tauri 的 invoke 通道（window.__TAURI_INTERNALS__.invoke）
 * 把 plugin:sql|load / select / execute 映射到 node 内置的 node:sqlite。
 * 这样跑的是**插件真实的 JS 代码 + 应用真实的 SQL**，
 * 绑定语义也完全一致（插件按数组顺序绑定 `?` 占位符）。
 *
 * 两条路径在**独立子进程**里跑：isTauriEnv() 读的是运行时全局量，
 * 同进程内先后切换会互相污染（后一条路径会写进前一条的存储）。
 *
 * 用法：node scripts/check-db-parity.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SELF = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------
// 操作序列（两条后端执行完全相同的一串操作）
// ---------------------------------------------------------------------------

const OP_SEQUENCE = [
  ['create', { title: '甲', date: '2026-11-01', priority: 1, note: '备注甲' }],
  ['create', { title: '乙', date: '2026-11-02', priority: 2, note: '' }],
  ['create', { title: '丙', date: '2026-11-01', priority: 2, note: '备注丙' }],
  ['create', { title: '丁', date: '2026-11-01', priority: 0, note: '' }],
  ['create', { title: '戊', date: '2026-12-25', priority: 1, note: '' }],
  ['update', 2, { title: '乙改' }],
  ['update', 3, { done: true }],
  ['update', 4, { note: '丁的备注', priority: 2 }],
  ['update', 2, { date: '2026-11-03' }],
  ['delete', 1],
  ['pick', '2026-11-01', 'gtd', false],
  ['pick', '2026-11-01', '5w2h', true],
  ['pick', '2026-11-02', 'issue-tree', false],
];

/** 去掉与后端实现相关、时间相关的字段，只比对「可见结果」 */
const visible = (todo) => ({
  id: todo.id,
  title: todo.title,
  date: todo.date,
  priority: todo.priority,
  note: todo.note,
  done: todo.done,
});

/** 采集一条后端的可见结果 */
async function collect(db) {
  const all = await db.fetchTodos();
  const raw = await db.fetchTodoSyncRows(null);
  return {
    /** 软删除：墓碑行仍在库、但对界面不可见（FR-SYNC-08 / FR-SYNC-13） */
    tombstones: raw.filter((row) => row.deleted).length,
    rawTotal: raw.length,
    uuidUnique: raw.every((row) => typeof row.uuid === 'string' && row.uuid.length > 0) &&
      new Set(raw.map((row) => row.uuid)).size === raw.length,
    all: all.map(visible),
    byDate: (await db.fetchTodosByDate('2026-11-01')).map(visible),
    byMonth: (await db.fetchTodosByMonth(2026, 11)).map(visible),
    otherMonth: (await db.fetchTodosByMonth(2026, 12)).map(visible),
    picks: await db.fetchDailyPicks(),
    onePick: await db.fetchDailyPick('2026-11-01'),
    missingPick: await db.fetchDailyPick('2026-01-01'),
  };
}

async function runSequence(db) {
  for (const op of OP_SEQUENCE) {
    if (op[0] === 'create') await db.createTodo(op[1]);
    else if (op[0] === 'update') await db.updateTodo(op[1], op[2]);
    else if (op[0] === 'delete') await db.deleteTodo(op[1]);
    else if (op[0] === 'pick') {
      await db.upsertDailyPick({
        date: op[1],
        method_id: op[2],
        manual: op[3],
        updated_at: 1,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 子进程模式：跑一条后端，把结果以 JSON 输出到 stdout
// ---------------------------------------------------------------------------

/** 极简 localStorage 替身 */
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

/** 建表 SQL 与 src-tauri/src/lib.rs 的迁移逐字一致 */
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

/**
 * v3 迁移：直接读 `src-tauri/migrations/0003_sync_columns.sql`（与 Rust 侧 include_str! 同一份），
 * 避免脚本里再抄一份加列语句。v1 / v2 仍逐字照抄 lib.rs。
 */
const SYNC_COLUMNS_SQL = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'migrations', '0003_sync_columns.sql'),
  'utf8'
);

/** 把 node:sqlite 的行对象转成普通对象（与插件返回的结构一致） */
const rowsFrom = (rows) =>
  rows.map((row) => {
    const out = {};
    for (const key of Object.keys(row)) out[key] = row[key];
    return out;
  });

/**
 * 接管 Tauri 的 invoke 通道，把 plugin:sql|* 映射到 node:sqlite。
 * 不替换 @tauri-apps/plugin-sql 模块本身，跑的是插件真实的 JS 代码。
 */
function installSqliteTransport() {
  const pools = new Map();
  const connect = (path) => {
    if (!pools.has(path)) pools.set(path, new DatabaseSync(':memory:'));
    return pools.get(path);
  };

  globalThis.window = {
    __TAURI_INTERNALS__: {
      async invoke(cmd, args) {
        const db = connect(args.db);
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

  return { connect };
}

async function runBackend(mode) {
  if (mode === 'sqlite') {
    const transport = installSqliteTransport();
    transport.connect('sqlite:todo.db').exec(SCHEMA);
    transport.connect('sqlite:todo.db').exec(SYNC_COLUMNS_SQL);
  } else {
    globalThis.window = { localStorage: new MemoryStorage() };
    globalThis.localStorage = globalThis.window.localStorage;
  }

  const db = await import('../src/db/database.ts');
  await runSequence(db);
  return collect(db);
}

// ---------------------------------------------------------------------------
// 驱动模式：起两个子进程跑两条后端，再比对
// ---------------------------------------------------------------------------

function runChild(mode) {
  const res = spawnSync(process.execPath, [SELF, '--mode', mode], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(`子进程 ${mode} 退出码 ${res.status}`);
    console.error(res.stderr);
    process.exit(1);
  }
  // 子进程可能输出实验性警告，取最后一行 JSON
  const lines = res.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

const modeArg = process.argv.indexOf('--mode');
if (modeArg !== -1) {
  const mode = process.argv[modeArg + 1];
  const result = await runBackend(mode);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  const localResult = runChild('local');
  const sqliteResult = runChild('sqlite');

  const errors = [];

  /** 逐维度比对两个结果对象 */
  const compare = (label, a, b) => {
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    if (ja !== jb) {
      errors.push(`${label} 不一致：\n    localStorage: ${ja}\n    SQLite      : ${jb}`);
    }
  };

  compare('fetchTodos()', localResult.all, sqliteResult.all);
  compare('fetchTodosByDate(2026-11-01)', localResult.byDate, sqliteResult.byDate);
  compare('fetchTodosByMonth(2026, 11)', localResult.byMonth, sqliteResult.byMonth);
  compare('fetchTodosByMonth(2026, 12)', localResult.otherMonth, sqliteResult.otherMonth);
  compare('fetchDailyPicks()', localResult.picks, sqliteResult.picks);
  compare('fetchDailyPick(2026-11-01)', localResult.onePick, sqliteResult.onePick);
  compare('fetchDailyPick(2026-01-01) 不存在', localResult.missingPick, sqliteResult.missingPick);
  compare('软删除墓碑数', localResult.tombstones, sqliteResult.tombstones);
  compare('含墓碑的总行数', localResult.rawTotal, sqliteResult.rawTotal);
  compare('uuid 唯一且非空', localResult.uuidUnique, sqliteResult.uuidUnique);

  console.log('双后端等价性对拍（scripts/check-db-parity.mjs）');
  console.log(`  操作序列        ${OP_SEQUENCE.length} 步`);
  console.log(`  全部待办        ${sqliteResult.all.length} 条`);
  console.log(`  排序            ${sqliteResult.all.map((t) => t.title).join(' → ')}`);
  console.log(
    `  推送记录        ${sqliteResult.picks
      .map((p) => `${p.date}=${p.method_id}(manual=${p.manual})`)
      .join(', ')}`
  );
  console.log('  已比对维度      fetchTodos / ByDate / ByMonth×2 / DailyPicks / DailyPick×2');

  if (errors.length > 0) {
    console.error('');
    console.error(`对拍失败，共 ${errors.length} 项：`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log('');
  console.log('PASS：两条后端在相同操作序列下产生完全一致的可见结果');
}
