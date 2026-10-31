import { reactive, computed } from 'vue';
import dayjs from 'dayjs';
import {
  createTodo,
  deleteTodo,
  fetchTodos,
  fetchTodosByMonth,
  updateTodo,
} from '../db/database.ts';
import type { Todo, TodoDraft, TodoPriority } from '../types/index.ts';

/**
 * 待办状态层。
 *
 * 只调用数据层导出的函数，不直接触碰底层存储与环境判定（BR-13）。
 */

/** 优先级元数据 */
export const PRIORITY_META: Record<
  TodoPriority,
  { label: string; color: string }
> = {
  0: { label: '低', color: '#52c41a' },
  1: { label: '中', color: '#faad14' },
  2: { label: '高', color: '#ff4d4f' },
};

/** 排序：date ASC → priority DESC → id DESC（BR-02） */
const compareTodos = (a: Todo, b: Todo): number => {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return b.id - a.id;
};

const state = reactive({
  /** 全部已加载待办 */
  todos: [] as Todo[],
  /** 当前月份键 `YYYY-MM` */
  monthKey: '',
  /** 是否已初始化 */
  initialized: false,
  /** 初始化中的 promise，避免多个组件同时挂载重复读库 */
  initPromise: null as Promise<void> | null,
  /** 最近一次错误，供界面提示（EX-02） */
  error: '',
});

/** 初始化：只执行一次 */
export function init(): Promise<void> {
  if (state.initPromise) return state.initPromise;
  state.initPromise = (async () => {
    try {
      state.todos = await fetchTodos();
      state.todos.sort(compareTodos);
      state.initialized = true;
      state.error = '';
    } catch (e) {
      state.error = String(e);
      throw e;
    }
  })();
  return state.initPromise;
}

/** 加载当月数据，与已有列表合并（非当月的保留），整体重排 */
export async function loadMonth(year: number, month: number): Promise<void> {
  const key = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format(
    'YYYY-MM'
  );
  const rows = await fetchTodosByMonth(year, month);
  const merged = new Map<number, Todo>();
  for (const t of state.todos) merged.set(t.id, t);
  for (const t of rows) merged.set(t.id, t);
  state.todos = [...merged.values()].sort(compareTodos);
  state.monthKey = key;
}

/** 按当前 monthKey 重查当月（改日期后必须调用，否则圆点与统计会不一致，BR-09） */
export async function refreshCurrentMonth(): Promise<void> {
  if (!state.monthKey) return;
  const [y, m] = state.monthKey.split('-').map((v) => Number(v));
  await loadMonth(y, m);
}

/** 新建待办 */
export async function add(draft: TodoDraft): Promise<Todo> {
  const created = await createTodo(draft);
  state.todos.push(created);
  state.todos.sort(compareTodos);
  return created;
}

/** 更新待办（只为显式传入的字段赋值） */
export async function patch(id: number, p: Partial<TodoDraft> & { done?: boolean }): Promise<void> {
  await updateTodo(id, p);
  const index = state.todos.findIndex((t) => t.id === id);
  if (index !== -1) {
    const current = state.todos[index];
    state.todos[index] = { ...current, ...p };
  }
  state.todos.sort(compareTodos);
  // 改了日期就必须重查当月（BR-09）
  if (p.date !== undefined) await refreshCurrentMonth();
}

/** 复制到目标日期：新建一条内容相同、完成态为未完成的待办，原条目保留 */
export async function copyToDate(todo: Todo, date: string): Promise<Todo> {
  const created = await add({
    title: todo.title,
    date,
    priority: todo.priority,
    note: todo.note,
  });
  await refreshCurrentMonth();
  return created;
}

/** 切换完成态 */
export async function toggle(todo: Todo): Promise<void> {
  await patch(todo.id, { done: !todo.done });
}

/** 删除待办 */
export async function remove(id: number): Promise<void> {
  await deleteTodo(id);
  state.todos = state.todos.filter((t) => t.id !== id);
}

/** 某一天的待办 */
export function byDate(date: string): Todo[] {
  return state.todos
    .filter((t) => t.date === date)
    .sort((a, b) => b.priority - a.priority || b.id - a.id);
}

/** 某一天的待办条数 */
export function countByDate(date: string): number {
  return state.todos.filter((t) => t.date === date).length;
}

/** 某月哪些日期有待办：日期 → 条数 */
export function markedDates(
  year: number,
  month: number
): Record<string, number> {
  const prefix = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format(
    'YYYY-MM'
  );
  const result: Record<string, number> = {};
  for (const t of state.todos) {
    if (!t.date.startsWith(prefix)) continue;
    result[t.date] = (result[t.date] ?? 0) + 1;
  }
  return result;
}

/** 全部待办（已排序） */
export const allTodos = computed(() => state.todos);

/** 状态读出口 */
export const todosState = state;
