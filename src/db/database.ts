import Database from '@tauri-apps/plugin-sql';
import type { DailyPick, Todo, TodoDraft, TodoPatch } from '../types/index.ts';

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

/** SQLite 数据行的原始形态（done 为 0/1） */
interface TodoRow {
  id: number;
  title: string;
  date: string;
  priority: number;
  note: string;
  done: number;
  created_at: string;
  updated_at: string;
}

/** SQLite 推送行的原始形态（manual 为 0/1） */
interface DailyPickRow {
  date: string;
  method_id: string;
  manual: number;
  updated_at: number;
}

/** 与 SQLite `datetime('now','localtime')` 同格式的本地时间字符串 */
const localTimestamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
};

/** 月份前缀，`2026` + `11` → `2026-11` */
const monthPrefix = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

/** SQLite 行 → 领域对象 */
const toTodo = (row: TodoRow): Todo => ({
  id: row.id,
  title: row.title,
  date: row.date,
  priority: row.priority as Todo['priority'],
  note: row.note,
  done: row.done === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
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
  'id, title, date, priority, note, done, created_at, updated_at';

async function sqliteFetchTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS} FROM todos ORDER BY date ASC, priority DESC, id DESC`
  );
  return rows.map(toTodo);
}

async function sqliteFetchTodosByDate(date: string): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS} FROM todos WHERE date = ? ORDER BY priority DESC, id DESC`,
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
    `SELECT ${TODO_COLUMNS} FROM todos WHERE date LIKE ? ORDER BY date ASC, priority DESC, id DESC`,
    [`${monthPrefix(year, month)}%`]
  );
  return rows.map(toTodo);
}

async function sqliteCreateTodo(draft: TodoDraft): Promise<Todo> {
  const db = await getDb();
  const result = await db.execute(
    'INSERT INTO todos (title, date, priority, note) VALUES (?, ?, ?, ?)',
    [draft.title, draft.date, draft.priority, draft.note]
  );
  // 用 INSERT 返回的 lastInsertId 回查完整行：created_at / updated_at 由数据库默认值生成，
  // 前端拼不出来；不能用 last_insert_rowid()，它是连接级的，连接池下可能落在另一个连接上。
  const id = result.lastInsertId;
  if (id === undefined) throw new Error('创建待办后未取得自增 id');
  const rows = await db.select<TodoRow[]>(
    `SELECT ${TODO_COLUMNS} FROM todos WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) throw new Error('创建待办后回查失败');
  return toTodo(rows[0]);
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

  sets.push("updated_at = datetime('now','localtime')");
  values.push(id);

  await db.execute(`UPDATE todos SET ${sets.join(', ')} WHERE id = ?`, values);
}

async function sqliteDeleteTodo(id: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM todos WHERE id = ?', [id]);
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
  if (typeof localStorage === 'undefined') return fallback;
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
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
};

/** 读取待办列表（存储形态与领域对象一致，done 为布尔） */
const readLocalTodos = (): Todo[] => readJson<Todo[]>(LS_TODOS, []);

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
  return [...readLocalTodos()].sort(compareTodos);
}

async function localFetchTodosByDate(date: string): Promise<Todo[]> {
  return readLocalTodos()
    .filter((t) => t.date === date)
    .sort((a, b) => b.priority - a.priority || b.id - a.id);
}

async function localFetchTodosByMonth(
  year: number,
  month: number
): Promise<Todo[]> {
  const prefix = monthPrefix(year, month);
  return readLocalTodos()
    .filter((t) => t.date.startsWith(prefix))
    .sort(compareTodos);
}

async function localCreateTodo(draft: TodoDraft): Promise<Todo> {
  const todos = readLocalTodos();
  const now = localTimestamp();
  const todo: Todo = {
    id: nextLocalId(todos),
    title: draft.title,
    date: draft.date,
    priority: draft.priority,
    note: draft.note,
    done: false,
    created_at: now,
    updated_at: now,
  };
  todos.push(todo);
  writeLocalTodos(todos);
  return todo;
}

async function localUpdateTodo(id: number, patch: TodoPatch): Promise<void> {
  const todos = readLocalTodos();
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) return;
  const current = todos[index];
  // 部分更新语义：未传入的字段保持原值（与 SQLite 的动态 SET 等价）
  todos[index] = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.done !== undefined ? { done: patch.done } : {}),
    updated_at: localTimestamp(),
  };
  writeLocalTodos(todos);
}

async function localDeleteTodo(id: number): Promise<void> {
  const todos = readLocalTodos();
  writeLocalTodos(todos.filter((t) => t.id !== id));
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

/** 全部待办，按 date ASC → priority DESC → id DESC */
export function fetchTodos(): Promise<Todo[]> {
  return isTauriEnv() ? sqliteFetchTodos() : localFetchTodos();
}

/** 某一天的待办，按 priority DESC → id DESC */
export function fetchTodosByDate(date: string): Promise<Todo[]> {
  return isTauriEnv()
    ? sqliteFetchTodosByDate(date)
    : localFetchTodosByDate(date);
}

/** 某个月的待办（date LIKE 'YYYY-MM%'），按 date ASC → priority DESC → id DESC */
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

/** 删除待办 */
export function deleteTodo(id: number): Promise<void> {
  return isTauriEnv() ? sqliteDeleteTodo(id) : localDeleteTodo(id);
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
