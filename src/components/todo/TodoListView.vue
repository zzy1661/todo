<script setup lang="ts">
/**
 * 当日待办面板（P-02 / C-07，FR-DAY-01 ~ FR-DAY-08）。
 *
 * 头部 `M月D日 周X` + 今天徽章 + `+ 新建待办`；统计口径的**分母是当日总条数**，
 * 不随筛选页签变化（BR-04）；切换日期时筛选重置为「全部」（FR-DAY-04），
 * 但切换模块不重置（BR-21）——因此 `filter` 是组件局部状态。
 */
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { byDate } from '../../stores/todo.ts';
import type { Todo, TodoFilter } from '../../types/index.ts';
import TodoFilterTabs from './TodoFilterTabs.vue';
import TodoItem from './TodoItem.vue';
import TodoStats from './TodoStats.vue';

const props = defineProps<{
  /** 选中日期 `YYYY-MM-DD` */
  date: string;
}>();

const emit = defineEmits<{
  (e: 'create', date: string): void;
  (e: 'edit', todo: Todo): void;
  (e: 'error', message: string): void;
}>();

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

const today = dayjs().format('YYYY-MM-DD');

const filter = ref<TodoFilter>('all');
const actionError = ref('');

/** 当日全部待办（已按 BR-02 排序） */
const todos = computed<Todo[]>(() => byDate(props.date));
const total = computed(() => todos.value.length);
const doneCount = computed(() => todos.value.filter((t) => t.done).length);

/** 当前筛选命中的条目 */
const visible = computed<Todo[]>(() => {
  if (filter.value === 'active') return todos.value.filter((t) => !t.done);
  if (filter.value === 'done') return todos.value.filter((t) => t.done);
  return todos.value;
});

const isToday = computed(() => props.date === today);

const title = computed(
  () => `${dayjs(props.date).format('M月D日')} 周${WEEK_CN[dayjs(props.date).day()]}`
);

/** 切换日期：筛选重置为「全部」（FR-DAY-04 / AC-46） */
watch(
  () => props.date,
  () => {
    filter.value = 'all';
    actionError.value = '';
  }
);

function onError(message: string): void {
  actionError.value = message;
  emit('error', message);
}
</script>

<template>
  <section class="todo-panel" aria-label="当日待办">
    <header class="panel-head">
      <div class="panel-title">
        <span class="day-title">{{ title }}</span>
        <span v-if="isToday" class="today-badge">今天</span>
      </div>
      <button type="button" class="new-btn" @click="emit('create', date)">+ 新建待办</button>
    </header>

    <TodoStats :total="total" :done="doneCount" />

    <TodoFilterTabs v-model="filter" />

    <p v-if="actionError" class="panel-error">{{ actionError }}</p>

    <div class="todo-list">
      <ul v-if="visible.length" class="todo-items">
        <TodoItem
          v-for="todo in visible"
          :key="todo.id"
          :todo="todo"
          @edit="emit('edit', $event)"
          @error="onError"
        />
      </ul>

      <!-- ES-01：该日一条都没有 -->
      <div v-else-if="total === 0" class="empty-state" data-empty="no-todos">
        <svg class="empty-art" viewBox="0 0 96 72" fill="none" aria-hidden="true">
          <rect x="14" y="16" width="68" height="46" rx="8" fill="#eef2fb" />
          <rect x="26" y="27" width="44" height="5" rx="2.5" fill="#c9d6f2" />
          <rect x="26" y="40" width="30" height="5" rx="2.5" fill="#dde5f6" />
          <circle cx="72" cy="18" r="9" fill="#ffffff" stroke="#c9d6f2" stroke-width="2" />
          <path d="M72 13v5l3 2" stroke="#2f6bff" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <p class="empty-title">这一天还没有待办</p>
        <button type="button" class="empty-action" @click="emit('create', date)">
          创建第一条待办
        </button>
      </div>

      <!-- ES-02：有数据但当前筛选无结果 -->
      <div v-else class="empty-state" data-empty="no-match">
        <svg class="empty-art" viewBox="0 0 96 72" fill="none" aria-hidden="true">
          <rect x="14" y="16" width="68" height="46" rx="8" fill="#eef2fb" />
          <rect x="26" y="27" width="30" height="5" rx="2.5" fill="#dde5f6" />
          <rect x="26" y="40" width="40" height="5" rx="2.5" fill="#dde5f6" />
          <path d="M60 48l10 10M70 48l-10 10" stroke="#c9d6f2" stroke-width="2.4" stroke-linecap="round" />
        </svg>
        <p class="empty-title">没有符合筛选的待办</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.todo-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.panel-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.panel-title {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.day-title {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.today-badge {
  flex: 0 0 auto;
  padding: 1px 7px;
  font-size: 10px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 999px;
}

.new-btn {
  flex: 0 0 auto;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 999px;
  transition: background-color 0.15s ease;
}

.new-btn:hover {
  background: #dfe8ff;
}

.panel-error {
  margin: 0 16px 8px;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--color-danger);
  background: rgba(255, 77, 79, 0.08);
  border-radius: var(--radius-sm);
}

.todo-list {
  flex: 1;
  min-height: 0;
  padding: 0 10px 10px;
  overflow-y: auto;
}

.todo-items {
  display: flex;
  flex-direction: column;
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

.empty-art {
  width: 96px;
  height: 72px;
}

.empty-title {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.empty-action {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 999px;
}

.empty-action:hover {
  background: #dfe8ff;
}
</style>
