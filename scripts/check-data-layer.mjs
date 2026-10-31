/**
 * 数据层 localStorage 路径的行为自检（S1 阶段临时脚本，用于验证双实现语义对齐）。
 *
 * 用法：node scripts/check-data-layer.mjs
 */
// 极简 localStorage 替身（仅实现数据层用到的读写语义）
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

const {
  fetchTodos,
  fetchTodosByDate,
  fetchTodosByMonth,
  createTodo,
  updateTodo,
  deleteTodo,
  fetchDailyPick,
  fetchDailyPicks,
  upsertDailyPick,
} = await import('../src/db/database.ts');

const errors = [];
const check = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// 1. 新建：返回完整行（含 created_at / updated_at），id 从 1 开始
const t1 = await createTodo({ title: 'A', date: '2026-11-01', priority: 1, note: '' });
check(t1.id === 1, `首个待办 id 应为 1，实际 ${t1.id}`);
check(!!t1.created_at && !!t1.updated_at, 'createTodo 返回值缺 created_at / updated_at');
check(t1.done === false, '新建待办应为未完成');

// 2. 部分更新：未传字段保持原值
await updateTodo(t1.id, { title: 'A2' });
let all = await fetchTodos();
check(all[0].title === 'A2', 'title 未更新');
check(all[0].date === '2026-11-01', '未传字段 date 被错误改写');
check(all[0].priority === 1, '未传字段 priority 被错误改写');
check(all[0].note === '', '未传字段 note 被错误改写');
// updated_at 每次更新都会重算，格式与 SQLite datetime('now','localtime') 对齐（秒级）
check(
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(all[0].updated_at),
  `updated_at 格式与 SQLite 不对齐：${all[0].updated_at}`
);
check(
  all[0].updated_at >= t1.updated_at,
  `updated_at 未刷新：${all[0].updated_at} < ${t1.updated_at}`
);

// 3. done 布尔往返
await updateTodo(t1.id, { done: true });
all = await fetchTodos();
check(all[0].done === true, 'done 未落为 true');
await updateTodo(t1.id, { done: false });
all = await fetchTodos();
check(all[0].done === false, 'done 未落回 false');

// 4. 排序：date ASC → priority DESC → id DESC
const t2 = await createTodo({ title: 'B', date: '2026-11-02', priority: 2, note: '' });
const t3 = await createTodo({ title: 'C', date: '2026-11-01', priority: 2, note: '' });
const t4 = await createTodo({ title: 'D', date: '2026-11-01', priority: 0, note: '' });
all = await fetchTodos();
check(
  all.map((t) => t.title).join(',') === 'C,A2,D,B',
  `全量排序错误：${all.map((t) => t.title).join(',')}`
);
const byDate = await fetchTodosByDate('2026-11-01');
check(
  byDate.map((t) => t.title).join(',') === 'C,A2,D',
  `单日排序错误：${byDate.map((t) => t.title).join(',')}`
);
const byMonth = await fetchTodosByMonth(2026, 11);
check(byMonth.length === 4, `按月查询条数错误：${byMonth.length}`);
check(
  byMonth.map((t) => t.title).join(',') === 'C,A2,D,B',
  `按月排序错误：${byMonth.map((t) => t.title).join(',')}`
);
check((await fetchTodosByMonth(2026, 12)).length === 0, '跨月查询未隔离');

// 5. 删除
await deleteTodo(t4.id);
all = await fetchTodos();
check(all.length === 3, `删除后条数错误：${all.length}`);

// 6. id 单调递增且不复用（对齐 SQLite AUTOINCREMENT）
const t5 = await createTodo({ title: 'E', date: '2026-11-03', priority: 1, note: '' });
check(t5.id > t4.id, `删除最高 id 后新 id 未继续递增：${t5.id} <= ${t4.id}`);
const t6 = await createTodo({ title: 'F', date: '2026-11-03', priority: 1, note: '' });
check(t6.id > t5.id, '新 id 未继续递增');

// 7. 推送：一日一行，重复写入为覆盖
await upsertDailyPick({ date: '2026-11-01', method_id: 'gtd', manual: false, updated_at: 1 });
await upsertDailyPick({ date: '2026-11-01', method_id: '5w2h', manual: true, updated_at: 2 });
const picks = await fetchDailyPicks();
check(picks.length === 1, `推送记录未覆盖为一行：${picks.length}`);
const one = await fetchDailyPick('2026-11-01');
check(one.method_id === '5w2h', '推送覆盖后 method_id 未更新');
check(one.manual === true, '推送覆盖后 manual 未更新');
check((await fetchDailyPick('2026-11-02')) === null, '不存在的推送未返回 null');

// 8. 入参归一化：缺省 note / priority 时两条后端行为一致
const t7 = await createTodo({ title: 'G', date: '2026-11-04' });
check(t7.note === '', `缺省 note 应归一化为空串，实际 ${JSON.stringify(t7.note)}`);
check(t7.priority === 1, `缺省 priority 应归一化为 1，实际 ${t7.priority}`);
check(
  t7.done === false,
  '新建待办应为未完成（布尔），与 SQLite 的 0 语义等价'
);

// 9. 数据损坏时抛错而非静默回退为空集合（EX-01：不静默丢数据）
globalThis.localStorage.setItem('todo_local_db', '{ 坏掉的 JSON');
let threw = false;
try {
  await fetchTodos();
} catch {
  threw = true;
}
check(threw, 'localStorage 数据损坏时应抛错，不得静默回退为空集合');

if (errors.length > 0) {
  console.error(`失败 ${errors.length} 项：`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log('数据层 localStorage 路径自检 PASS（9 组断言）');
