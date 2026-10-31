<script setup lang="ts">
/**
 * 全部待办模块（P-04 / C-12，FR-ALL-01 ~ FR-ALL-07）。
 *
 * - 跨日期分组：组间日期升序，组标题 `YYYY年M月D日 周X`，该组日期是今天时追加 ` · 今天`；
 * - 每组右上角 `已完成数/总数`，分子分母都取该组全量条目，不随筛选页签变化（BR-04 同口径）；
 * - 组内沿用 store 的全量排序（date ASC → priority DESC → id DESC，BR-02 / FR-ALL-05）；
 * - 筛选状态是本组件局部状态，与当日面板各自独立（BR-21 / AC-33）；
 * - 条目与右键菜单复用 `TodoItem` / `TodoContextMenu`，同一处行为改动不会只改一边（FR-ALL-06）；
 * - 本模块只读列表 + 编辑入口，没有「新建待办」按钮，也没有跨日期拖拽（FR-ALL-07）。
 */
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import { allTodos } from '../../stores/todo.ts';
import type { Todo, TodoFilter } from '../../types/index.ts';
import TodoFilterTabs from './TodoFilterTabs.vue';
import TodoItem from './TodoItem.vue';
import TodoStats from './TodoStats.vue';

const emit = defineEmits<{
  (e: 'edit', todo: Todo): void;
  (e: 'error', message: string): void;
}>();

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

const today = dayjs().format('YYYY-MM-DD');

/** 与当日面板互不影响：本模块自己的筛选页签（BR-21 / AC-33） */
const filter = ref<TodoFilter>('all');
const actionError = ref('');

/** 统计口径的分子分母都取全库，不随筛选变化（BR-04 / FR-ALL-01） */
const total = computed(() => allTodos.value.length);
const doneCount = computed(() => allTodos.value.filter((t) => t.done).length);

interface TodoGroup {
  /** `YYYY-MM-DD`，同时作为 `data-group-date` */
  date: string;
  /** `YYYY年M月D日 周X`（今天追加 ` · 今天`） */
  title: string;
  /** 组内全量条数（完成率与组内统计的分母） */
  total: number;
  /** 组内已完成条数 */
  done: number;
  /** 当前筛选命中的条目（组内排序保持 store 的 BR-02 顺序） */
  items: Todo[];
}

/**
 * 分组结果。
 *
 * `allTodos` 已按 BR-02 排序，按插入顺序分桶即可同时得到「组间日期升序」与
 * 「组内 priority DESC → id DESC」，不需要二次排序。
 */
const groups = computed<TodoGroup[]>(() => {
  const buckets = new Map<string, Todo[]>();
  for (const todo of allTodos.value) {
    const bucket = buckets.get(todo.date);
    if (bucket) bucket.push(todo);
    else buckets.set(todo.date, [todo]);
  }

  const result: TodoGroup[] = [];
  for (const date of [...buckets.keys()].sort()) {
    const bucket = buckets.get(date) as Todo[];
    const items = bucket.filter((t) =>
      filter.value === 'all' ? true : filter.value === 'done' ? t.done : !t.done
    );
    // 筛选后为空的组整组隐藏（AC-32：筛「已完成」只剩有已完成条目的组）
    if (items.length === 0) continue;
    result.push({
      date,
      title:
        `${dayjs(date).format('YYYY年M月D日')} 周${WEEK_CN[dayjs(date).day()]}` +
        (date === today ? ' · 今天' : ''),
      total: bucket.length,
      done: bucket.filter((t) => t.done).length,
      items,
    });
  }
  return result;
});

function onError(message: string): void {
  actionError.value = message;
  emit('error', message);
}
</script>

<template>
  <section class="all-view" aria-label="全部待办">
    <header class="all-head">
      <h2 class="all-title">全部待办</h2>
    </header>

    <TodoStats :total="total" :done="doneCount" />
    <TodoFilterTabs v-model="filter" />

    <p v-if="actionError" class="panel-error">{{ actionError }}</p>

    <div class="all-list">
      <template v-if="groups.length">
        <section
          v-for="group in groups"
          :key="group.date"
          class="group"
          :data-group-date="group.date"
        >
          <header class="group-head">
            <span class="group-title">{{ group.title }}</span>
            <span class="group-count">{{ group.done }}/{{ group.total }}</span>
          </header>
          <ul class="group-items">
            <TodoItem
              v-for="todo in group.items"
              :key="todo.id"
              :todo="todo"
              @edit="emit('edit', $event)"
              @error="onError"
            />
          </ul>
        </section>
      </template>

      <!-- ES-03：全库 0 条 → 中性空态，不提供按钮 -->
      <div v-else-if="total === 0" class="empty-state" data-empty="no-todos">
        <p class="empty-title">暂无待办</p>
      </div>

      <!-- 有数据但当前筛选无命中：沿用当日面板的同一文案，不新增说辞（BR-22） -->
      <div v-else class="empty-state" data-empty="no-match">
        <p class="empty-title">没有符合筛选的待办</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.all-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.all-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}

.all-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.panel-error {
  margin: 0 16px 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--color-danger);
  background: rgba(255, 77, 79, 0.08);
  border-radius: var(--radius-sm);
}

.all-list {
  flex: 1;
  min-height: 0;
  padding: 0 10px 10px;
  overflow-y: auto;
}

.group + .group {
  margin-top: 10px;
}

.group-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 6px 4px;
  border-bottom: 1px solid var(--color-border);
}

.group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.group-count {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.group-items {
  display: flex;
  flex-direction: column;
  padding-top: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 160px;
  padding: 16px;
  text-align: center;
}

.empty-title {
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
