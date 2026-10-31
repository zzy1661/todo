import Database from '@tauri-apps/plugin-sql';
import type { DailyPick, Todo, TodoDraft, TodoPatch } from '../types/index.ts';
import { localTimestamp, nowMs } from '../sync/clock.ts';
import { emitLocalTodoChange } from '../sync/events.ts';
import type { LocalTodoRow, MergeStats, RemoteTodo } from '../sync/types.ts';
import { decideMerge } from '../sync/merge.ts';

/**
 * 数据访问层：SQLite（桌面版）与 localStorage（浏览器 / E2E）双实现。
 *
 * 上层 store 与组件只调用本文件导出的函数，不感知底层差异（FR-DB-01 / BR-13）。
 * 两条实现必须语义等价（FR-DB-04）：相同的操作序列产生相同的可见结果。
 *
 * 四条易错点（设计 §5.2）：
 * 1. `updateTodo` 只为显式传入的字段拼 SET —— SQLite 侧动态拼 SET，localStorage 侧做同样的部分更新。
 * 2. `done` 布尔 —— SQLite 侧存 0/1，localStorage 侧存 true/false，接口层统一互转为布尔。
 * 3. `createTodo` 返回完整行 —— SQLite 侧 INSERT 后按 last_insert_rowid() 回查，不返回前端拼的对象。
 * 4. `upsertDailyPick` —— 一日一行，重复写入为覆盖（BR-06）。
 *
 * S10 起新增（PRD §16 / FR-SYNC-12 / FR-SYNC-13）：
 * - 每个待办有跨设备稳定主键 `uuid`、LWW 依据 `updated_at_ms`、软删除标记 `deleted`；
 * - **所有读取路径都带 `deleted = 0`**（SQL 侧逐条写死，localStorage 侧收敛到
 *   `readLiveTodos()`）；唯一例外是同步网关需要的「含墓碑」读取，用 `-- sync-all-rows`
 *   标记，`scripts/check-deleted-filter.mjs` 只放行带标记的语句；
 * - 删除是**软删除**：只写 `deleted = 1`，不删行（NEG-03），跨设备才能传播删除。
 */

/** 环境判定：只在「运行于 Tauri 容器内」时为真，判定结果不得持久化（FR-DB-03） */
export const isTauriEnv = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** localStorage 键名（不得改名、不得合并，设计 §5.4） */
const LS_TODOS = 'todo_local_db';
const LS_DAILY = 'todo_local_daily_db';
/**
 * 自增序列游标：SQLite 侧由 `AUTOINCREMENT` 保证 id 单调递增且不复用，
 * 浏览器侧需要在删除最高 id 后也不复用，故单独持久化游标。
 */
const LS_SEQ = 'todo_local_db_seq';

/** SQLite 数据行的原始形态（done / deleted 为 0/1） */
interface TodoRow {
  id: number;
  uuid: string;
  title: string;
  date: string;
  priority: number;
  note: string;
  done: number;
  created_at: string;
  updated_at: string;
  updated_at_ms: number;
  deleted: number;
}

/** SQLite 推送行的原始形态（manual 为 0/1） */
interface DailyPickRow {
  date: string;
  method_id: string;
  manual: number;
  updated_at: number;
}

/** 月份前缀，`2026` + `11` → `2026-11` */
const monthPrefix = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

/**
 * UUID v4 生成（PRD FR-SYNC-12 要求「唯一非空」）。
 *
 * 优先用 `crypto.randomUUID`（WKWebView / Chromium / Node 19+ 都有）；
 * 缺失时用随机字节手拼 v4，**绝不回退成 id 或时间戳**——那会让跨设备合并错乱（NEG-06）。
 */
let uuidFallbackCounter = 0;

export function generateUuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // 极端兜底：无 WebCrypto 的环境（本应用不会出现），仍保持唯一性
  uuidFallbackCounter += 1;
  return `00000000-0000-4000-8000-${String(nowMs()).padStart(12, '0').slice(-12)}${String(
    uuidFallbackCounter
  ).padStart(4, '0').slice(-4)}`;
}

/** 本地时间字符串 → 毫秒（用于老数据回填 `updated_at_ms`） */
function stampToMs(stamp: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(stamp ?? '');
  if (!match) return 0;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  ).getTime();
}

/** SQLite 行 → 领域对象 */
const toTodo = (row: TodoRow): Todo => ({
  id: row.id,
  uuid: row.uuid,
  title: row.title,
  date: row.date,
  priority: row.priority as Todo['priority'],
  note: row.note,
  done: row.done === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
  updated_at_ms: row.updated_at_ms ?? stampToMs(row.updated_at),
  deleted: row.deleted === 1,
});

/** SQLite 行 → 同步行 */
const toSyncRow = (row: TodoRow): LocalTodoRow => ({
  id: row.id,
  uuid: row.uuid,
  title: row.title,
  date: row.date,
  priority: row.priority,
  note: row.note,
  done: row.done === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
  updated_at_ms: row.updated_at_ms ?? stampToMs(row.updated_at),
  deleted: row.deleted === 1,
});

/** SQLite 行 → 领域对象 */
const toDailyPick = (row: DailyPickRow): DailyPick => ({
  date: row.date,
  method_id: row.method_id,
  manual: row.manual === 1,
  updated_at: row.updated_at,
});

/** 排序：date ASC → priority DESC → id DESC（BR-02） */
const compareTodos = (a: Todo, b: Todo): number => {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return b.id - a.id;
};

// ---------------------------------------------------------------------------
// SQLite 实现
// ---------------------------------------------------------------------------

let dbPromise: Promise<Database> | null = null;

const getDb = (): Promise<Database> => {
  if (!dbPromise) dbPromise = Database.load('sqlite:todo.db');
  return dbPromise;
};

const TODO_COLUMNS =
  'id, uuid, title, date, priority, note, done, created_at, updated_at, updated_at_ms, deleted';

/**
 * 活跃行读取的唯一入口（FR-SYNC-13）。
 *
 * `deleted = 0` 写在这一行里：任何新增的读取路径只要从这里拼 SQL，
 * 就不会漏过滤。`scripts/check-deleted-filter.mjs` 逐行检索 `FROM todos`，
 * 不带 `deleted = 0` 且不带 `-- sync-all-rows` 标记即非零退出。
 */
const TODOS_LIVE = `SELECT ${TODO_COLUMNS} FROM todos WHERE deleted = 0`;

/** 同步网关专用：含墓碑的全量读取（**仅供 applyRemote / loadByUuids 使用**） */
const TODOS_ALL = `SELECT ${TODO_COLUMNS} FROM todos -- sync-all-rows`;

async function sqliteFetchTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `${TODOS_LIVE} ORDER BY date ASC, priority DESC, id DESC`
  );
  return rows.map(toTodo);
}

async function sqliteFetchTodosByDate(date: string): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `${TODOS_LIVE} AND date = ? ORDER BY priority DESC, id DESC`,
    [date]
  );
  return rows.map(toTodo);
}

async function sqliteFetchTodosByMonth(
  year: number,
  month: number
): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `${TODOS_LIVE} AND date LIKE ? ORDER BY date ASC, priority DESC, id DESC`,
    [`${monthPrefix(year, month)}%`]
  );
  return rows.map(toTodo);
}

async function sqliteCreateTodo(draft: TodoDraft): Promise<Todo> {
  const db = await getDb();
  // uuid 与 updated_at_ms 在这里生成：时间戳走注入时钟，与同步层判定同一时刻
  const uuid = generateUuid();
  const now = nowMs();
  const result = await db.execute(
    `INSERT INTO todos (uuid, title, date, priority, note, updated_at, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid, draft.title, draft.date, draft.priority, draft.note, localTimestamp(now), now]
  );
  // 用 INSERT 返回的 lastInsertId 回查完整行：created_at / updated_at 由数据库默认值生成，
  // 前端拼不出来；不能用 last_insert_rowid()，它是连接级的，连接池下可能落在另一个连接上。
  const id = result.lastInsertId;
  if (id === undefined) throw new Error('创建待办后未取得自增 id');
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS} FROM todos WHERE id = ? -- sync-all-rows`,
    [id]
  );
  if (rows.length === 0) throw new Error('创建待办后回查失败');
  const created = toTodo(rows[0]);
  emitLocalTodoChange({ uuid: created.uuid, kind: 'create' });
  return created;
}

async function sqliteUpdateTodo(id: number, patch: TodoPatch): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.date !== undefined) {
    sets.push('date = ?');
    values.push(patch.date);
  }
  if (patch.priority !== undefined) {
    sets.push('priority = ?');
    values.push(patch.priority);
  }
  if (patch.note !== undefined) {
    sets.push('note = ?');
    values.push(patch.note);
  }
  if (patch.done !== undefined) {
    sets.push('done = ?');
    values.push(patch.done ? 1 : 0);
  }

  const now = nowMs();
  sets.push('updated_at = ?');
  values.push(localTimestamp(now));
  sets.push('updated_at_ms = ?');
  values.push(now);

  values.push(id);
  const result = await db.execute(
    `UPDATE todos SET ${sets.join(', ')} WHERE id = ? AND deleted = 0`,
    values
  );
  // 没改到任何行（不存在或已软删）就不广播：否则同步层会去推一条其实没变的记录
  if (result.rowsAffected === 0) return;
  const rows = await db.select<{ uuid: string }[]>(
    `SELECT uuid FROM todos WHERE id = ? -- sync-all-rows`,
    [id]
  );
  if (rows.length > 0) emitLocalTodoChange({ uuid: rows[0].uuid, kind: 'update' });
}

async function sqliteDeleteTodo(id: number): Promise<void> {
  const db = await getDb();
  // 软删除：行必须留在库里（FR-SYNC-08 / NEG-03）
  const now = nowMs();
  const result = await db.execute(
    `UPDATE todos SET deleted = 1, updated_at = ?, updated_at_ms = ? WHERE id = ? AND deleted = 0`,
    [localTimestamp(now), now, id]
  );
  // 已经是墓碑（重复删除）时不再广播
  if (result.rowsAffected === 0) return;
  const rows = await db.select<{ uuid: string }[]>(
    `SELECT uuid FROM todos WHERE id = ? -- sync-all-rows`,
    [id]
  );
  if (rows.length > 0) emitLocalTodoChange({ uuid: rows[0].uuid, kind: 'delete' });
}

async function sqliteLoadSyncRows(uuids: string[] | null): Promise<LocalTodoRow[]> {
  const db = await getDb();
  if (uuids) {
    if (uuids.length === 0) return [];
    const placeholders = uuids.map(() => '?').join(', ');
    const rows = await db.select<TodoRow[]>(
      `${TODOS_ALL} WHERE uuid IN (${placeholders})`,
      uuids
    );
    return rows.map(toSyncRow);
  }
  const rows = await db.select<TodoRow[]>(TODOS_ALL);
  return rows.map(toSyncRow);
}

async function sqliteApplyRemoteTodos(rows: RemoteTodo[]): Promise<MergeStats> {
  const db = await getDb();
  const stats: MergeStats = { inserted: 0, updated: 0, skipped: 0 };
  for (const remote of rows) {
    const existing = await db.select<TodoRow[]>(`${TODOS_ALL} WHERE uuid = ?`, [remote.uuid]);
    const local = existing.length > 0 ? toSyncRow(existing[0]) : null;
    const decision = decideMerge(local, remote);
    if (decision.action === 'keep') {
      stats.skipped += 1;
      continue;
    }
    if (decision.action === 'insert') {
      await db.execute(
        `INSERT INTO todos (uuid, title, date, priority, note, done, created_at, updated_at, updated_at_ms, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          remote.uuid,
          remote.title,
          remote.date,
          remote.priority,
          remote.note,
          remote.done ? 1 : 0,
          remote.created_at || localTimestamp(nowMs()),
          remote.updated_at || localTimestamp(nowMs()),
          remote.updated_at_ms,
          remote.deleted ? 1 : 0,
        ]
      );
      stats.inserted += 1;
    } else {
      await db.execute(
        `UPDATE todos SET title = ?, date = ?, priority = ?, note = ?, done = ?,
           updated_at = ?, updated_at_ms = ?, deleted = ? WHERE uuid = ?`,
        [
          remote.title,
          remote.date,
          remote.priority,
          remote.note,
          remote.done ? 1 : 0,
          remote.updated_at || localTimestamp(nowMs()),
          remote.updated_at_ms,
          remote.deleted ? 1 : 0,
          remote.uuid,
        ]
      );
      stats.updated += 1;
    }
    emitLocalTodoChange({ uuid: remote.uuid, kind: 'merge' });
  }
  return stats;
}

async function sqliteFetchDailyPicks(): Promise<DailyPick[]> {
  const db = await getDb();
  const rows = await db.select<DailyPickRow[]>(
    'SELECT date, method_id, manual, updated_at FROM daily_picks ORDER BY date ASC'
  );
  return rows.map(toDailyPick);
}

async function sqliteFetchDailyPick(date: string): Promise<DailyPick | null> {
  const db = await getDb();
  const rows = await db.select<DailyPickRow[]>(
    'SELECT date, method_id, manual, updated_at FROM daily_picks WHERE date = ?',
    [date]
  );
  return rows.length > 0 ? toDailyPick(rows[0]) : null;
}

async function sqliteUpsertDailyPick(pick: DailyPick): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO daily_picks (date, method_id, manual, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       method_id = excluded.method_id,
       manual = excluded.manual,
       updated_at = excluded.updated_at`,
    [pick.date, pick.method_id, pick.manual ? 1 : 0, pick.updated_at]
  );
}

// ---------------------------------------------------------------------------
// localStorage 实现
// ---------------------------------------------------------------------------

/**
 * 读取并解析 localStorage 中的 JSON 值。
 *
 * 解析失败时**抛错**而不是回退到空集合：回退会让界面显示「没有待办」，
 * 等于静默丢数据（EX-01）。抛错由上层阻断并提示，原文留在 localStorage 里不覆盖。
 */
const readJson = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch (e) {
    throw new Error(`localStorage 键 ${key} 数据损坏，无法解析：${String(e)}`);
  }
};

const writeJson = (key: string, value: unknown): void => {
  // localStorage 不可用时必须报错而不是静默跳过写入：
  // 静默跳过会让「新建待办」看起来成功，实际什么也没存，等于丢数据（EX-02）。
  if (typeof localStorage === 'undefined') {
    throw new Error('localStorage 不可用，无法写入数据');
  }
  localStorage.setItem(key, JSON.stringify(value));
};

/**
 * 老数据归一化：v3 之前写入的行没有 uuid / updated_at_ms / deleted。
 *
 * 与 v3 迁移的回填口径一致（uuid 生成一次并存库、时间戳由 updated_at 推导、
 * deleted 默认 0），保证浏览器路径与桌面路径升级后语义一致。
 */
function normalizeLocalTodo(raw: Todo & Partial<Pick<Todo, 'uuid' | 'updated_at_ms' | 'deleted'>>): {
  todo: Todo;
  changed: boolean;
} {
  const uuid = typeof raw.uuid === 'string' && raw.uuid ? raw.uuid : generateUuid();
  const updatedAtMs =
    typeof raw.updated_at_ms === 'number' && Number.isFinite(raw.updated_at_ms)
      ? raw.updated_at_ms
      : stampToMs(raw.updated_at);
  const deleted = raw.deleted === true;
  const changed =
    uuid !== raw.uuid ||
    updatedAtMs !== raw.updated_at_ms ||
    deleted !== raw.deleted;
  return { todo: { ...raw, uuid, updated_at_ms: updatedAtMs, deleted }, changed };
}

/** 含墓碑的全部行（**仅同步网关使用**） */
function readAllLocalTodos(): Todo[] {
  const stored = readJson<Todo[]>(LS_TODOS, []);
  let changed = false;
  const rows = stored.map((raw) => {
    const result = normalizeLocalTodo(raw);
    if (result.changed) changed = true;
    return result.todo;
  });
  if (changed) writeJson(LS_TODOS, rows);
  return rows;
}

/** 活跃行（`deleted = 0`）：所有本地读取路径的唯一入口（FR-SYNC-13） */
const readLiveTodos = (): Todo[] => readAllLocalTodos().filter((t) => !t.deleted);

/** 读取自增游标，取历史最大值与已存游标的较大者，保证 id 不复用 */
const nextLocalId = (todos: Todo[]): number => {
  const stored = readJson<number>(LS_SEQ, 0);
  const maxId = todos.reduce((max, t) => Math.max(max, t.id), 0);
  const next = Math.max(stored, maxId) + 1;
  writeJson(LS_SEQ, next);
  return next;
};

const writeLocalTodos = (todos: Todo[]): void => {
  writeJson(LS_TODOS, todos);
};

async function localFetchTodos(): Promise<Todo[]> {
  return [...readLiveTodos()].sort(compareTodos);
}

async function localFetchTodosByDate(date: string): Promise<Todo[]> {
  return readLiveTodos()
    .filter((t) => t.date === date)
    .sort((a, b) => b.priority - a.priority || b.id - a.id);
}

async function localFetchTodosByMonth(
  year: number,
  month: number
): Promise<Todo[]> {
  const prefix = monthPrefix(year, month);
  return readLiveTodos()
    .filter((t) => t.date.startsWith(prefix))
    .sort(compareTodos);
}

async function localCreateTodo(draft: TodoDraft): Promise<Todo> {
  const todos = readAllLocalTodos();
  const now = nowMs();
  const todo: Todo = {
    id: nextLocalId(todos),
    uuid: generateUuid(),
    title: draft.title,
    date: draft.date,
    priority: draft.priority,
    note: draft.note,
    done: false,
    created_at: localTimestamp(now),
    updated_at: localTimestamp(now),
    updated_at_ms: now,
    deleted: false,
  };
  todos.push(todo);
  writeLocalTodos(todos);
  emitLocalTodoChange({ uuid: todo.uuid, kind: 'create' });
  return todo;
}

async function localUpdateTodo(id: number, patch: TodoPatch): Promise<void> {
  const todos = readAllLocalTodos();
  const index = todos.findIndex((t) => t.id === id);
  // 已删条目不再接受编辑：墓碑终结（OPEN-01），更新不得复活
  if (index === -1 || todos[index].deleted) return;
  const current = todos[index];
  const now = nowMs();
  // 部分更新语义：未传入的字段保持原值（与 SQLite 的动态 SET 等价）
  todos[index] = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.done !== undefined ? { done: patch.done } : {}),
    updated_at: localTimestamp(now),
    updated_at_ms: now,
  };
  writeLocalTodos(todos);
  emitLocalTodoChange({ uuid: current.uuid, kind: 'update' });
}

async function localDeleteTodo(id: number): Promise<void> {
  const todos = readAllLocalTodos();
  const target = todos.find((t) => t.id === id);
  if (!target || target.deleted) return;
  const now = nowMs();
  // 软删除：行保留在数组里，仅置 deleted = true（FR-SYNC-08 / NEG-03）
  const next = todos.map((t) =>
    t.id === id
      ? { ...t, deleted: true, updated_at: localTimestamp(now), updated_at_ms: now }
      : t
  );
  writeLocalTodos(next);
  emitLocalTodoChange({ uuid: target.uuid, kind: 'delete' });
}

async function localLoadSyncRows(uuids: string[] | null): Promise<LocalTodoRow[]> {
  const rows = readAllLocalTodos();
  const filtered = uuids ? rows.filter((t) => uuids.includes(t.uuid)) : rows;
  return filtered.map((t) => ({ ...t }));
}

async function localApplyRemoteTodos(rows: RemoteTodo[]): Promise<MergeStats> {
  const todos = readAllLocalTodos();
  const stats: MergeStats = { inserted: 0, updated: 0, skipped: 0 };
  let seq = readJson<number>(LS_SEQ, 0);
  for (const remote of rows) {
    const index = todos.findIndex((t) => t.uuid === remote.uuid);
    const local = index === -1 ? null : todos[index];
    const decision = decideMerge(local, remote);
    if (decision.action === 'keep') {
      stats.skipped += 1;
      continue;
    }
    if (decision.action === 'insert') {
      if (!remote.title) {
        // 云端行缺必填字段：跳过而不是写一条空行，避免污染本地列表
        stats.skipped += 1;
        continue;
      }
      const maxId = todos.reduce((max, t) => Math.max(max, t.id), 0);
      seq = Math.max(seq, maxId) + 1;
      todos.push({
        id: seq,
        uuid: remote.uuid,
        title: remote.title,
        date: remote.date,
        priority: remote.priority as Todo['priority'],
        note: remote.note,
        done: remote.done,
        created_at: remote.created_at || localTimestamp(nowMs()),
        updated_at: remote.updated_at || localTimestamp(nowMs()),
        updated_at_ms: remote.updated_at_ms,
        deleted: remote.deleted,
      });
      stats.inserted += 1;
    } else {
      const localTodo = todos[index];
      todos[index] = {
        ...localTodo,
        title: remote.title,
        date: remote.date,
        priority: remote.priority as Todo['priority'],
        note: remote.note,
        done: remote.done,
        updated_at: remote.updated_at || localTodo.updated_at,
        updated_at_ms: remote.updated_at_ms,
        deleted: remote.deleted,
      };
      stats.updated += 1;
    }
    emitLocalTodoChange({ uuid: remote.uuid, kind: 'merge' });
  }
  writeLocalTodos(todos);
  if (seq > 0) writeJson(LS_SEQ, seq);
  return stats;
}

async function localFetchDailyPicks(): Promise<DailyPick[]> {
  return [...readJson<DailyPick[]>(LS_DAILY, [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
}

async function localFetchDailyPick(date: string): Promise<DailyPick | null> {
  const picks = readJson<DailyPick[]>(LS_DAILY, []);
  return picks.find((p) => p.date === date) ?? null;
}

async function localUpsertDailyPick(pick: DailyPick): Promise<void> {
  const picks = readJson<DailyPick[]>(LS_DAILY, []);
  const index = picks.findIndex((p) => p.date === pick.date);
  // 一日一行，重复写入为覆盖
  if (index === -1) picks.push({ ...pick });
  else picks[index] = { ...pick };
  writeJson(LS_DAILY, picks);
}

// ---------------------------------------------------------------------------
// 对外接口（两条实现的语义在此收敛）
// ---------------------------------------------------------------------------

/** 全部待办（`deleted = 0`），按 date ASC → priority DESC → id DESC */
export function fetchTodos(): Promise<Todo[]> {
  return isTauriEnv() ? sqliteFetchTodos() : localFetchTodos();
}

/** 某一天的待办（`deleted = 0`），按 priority DESC → id DESC */
export function fetchTodosByDate(date: string): Promise<Todo[]> {
  return isTauriEnv()
    ? sqliteFetchTodosByDate(date)
    : localFetchTodosByDate(date);
}

/** 某个月的待办（`deleted = 0`，date LIKE 'YYYY-MM%'），按 date ASC → priority DESC → id DESC */
export function fetchTodosByMonth(
  year: number,
  month: number
): Promise<Todo[]> {
  return isTauriEnv()
    ? sqliteFetchTodosByMonth(year, month)
    : localFetchTodosByMonth(year, month);
}

/** 新建待办，返回落库后的完整行 */
export function createTodo(draft: TodoDraft): Promise<Todo> {
  // 在分叉之前归一化入参：两条后端拿到完全相同的字段，
  // 避免 SQLite 因 NOT NULL 约束报错、而 localStorage 却存下 undefined 的分歧。
  const normalized: TodoDraft = {
    title: draft.title,
    date: draft.date,
    // 新建默认中优先级（BR-03），与表结构的 DEFAULT 1 一致
    priority: draft.priority ?? 1,
    note: draft.note ?? '',
  };
  return isTauriEnv()
    ? sqliteCreateTodo(normalized)
    : localCreateTodo(normalized);
}

/** 更新待办：只为显式传入的字段赋值，并自动刷新更新时间 */
export function updateTodo(id: number, patch: TodoPatch): Promise<void> {
  return isTauriEnv() ? sqliteUpdateTodo(id, patch) : localUpdateTodo(id, patch);
}

/** 删除待办（软删除：只写 `deleted = 1`，行保留） */
export function deleteTodo(id: number): Promise<void> {
  return isTauriEnv() ? sqliteDeleteTodo(id) : localDeleteTodo(id);
}

/**
 * 同步网关：按 uuid 读取本地行（**含墓碑**）。
 * `uuids` 传 null 表示全表；仅供 `src/sync` 使用，界面路径不得调用（FR-SYNC-13）。
 */
export function fetchTodoSyncRows(uuids: string[] | null): Promise<LocalTodoRow[]> {
  return isTauriEnv() ? sqliteLoadSyncRows(uuids) : localLoadSyncRows(uuids);
}

/** 同步网关：应用远端记录（LWW + 墓碑终结，规则见 `src/sync/merge.ts`） */
export function applyRemoteTodos(rows: RemoteTodo[]): Promise<MergeStats> {
  return isTauriEnv() ? sqliteApplyRemoteTodos(rows) : localApplyRemoteTodos(rows);
}

/** 全部每日推送记录，按日期升序 */
export function fetchDailyPicks(): Promise<DailyPick[]> {
  return isTauriEnv() ? sqliteFetchDailyPicks() : localFetchDailyPicks();
}

/** 某一天的推送记录，不存在时返回 null */
export function fetchDailyPick(date: string): Promise<DailyPick | null> {
  return isTauriEnv() ? sqliteFetchDailyPick(date) : localFetchDailyPick(date);
}

/** 写入（或覆盖）某一天的推送记录 */
export function upsertDailyPick(pick: DailyPick): Promise<void> {
  return isTauriEnv()
    ? sqliteUpsertDailyPick(pick)
    : localUpsertDailyPick(pick);
}
