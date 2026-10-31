<script setup lang="ts">
/**
 * 待办条目（P-02 / P-04 共用行，FR-ITEM-01 ~ FR-ITEM-06）。
 *
 * 行内只有四个元素：完成圆圈、标题（含备注）、优先级标签、`⋯`。
 * **没有行内铅笔与垃圾桶**：编辑与删除分别走「点击标题区」与右键菜单。
 *
 * 当日面板与全部待办复用本组件（FR-ALL-06），行为改动只改这里一处。
 */
import { computed, ref } from 'vue';
import { PRIORITY_META, patch, toggle } from '../../stores/todo.ts';
import type { Todo, TodoPriority } from '../../types/index.ts';
import TodoContextMenu from './TodoContextMenu.vue';

const props = defineProps<{
  todo: Todo;
}>();

const emit = defineEmits<{
  (e: 'edit', todo: Todo): void;
  (e: 'error', message: string): void;
}>();

const menuOpen = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const moreBtn = ref<HTMLButtonElement | null>(null);
const busy = ref(false);

const meta = computed(() => PRIORITY_META[props.todo.priority]);

/** 优先级标签：低 → 中 → 高 → 低（FR-ITEM-03） */
const tagStyle = computed(() => ({
  color: meta.value.color,
  backgroundColor: `${meta.value.color}1a`,
}));

async function onToggle(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    await toggle(props.todo);
  } catch (e) {
    emit('error', `更新完成态失败：${String(e)}`);
  } finally {
    busy.value = false;
  }
}

async function onCyclePriority(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const next = ((props.todo.priority + 1) % 3) as TodoPriority;
    await patch(props.todo.id, { priority: next });
  } catch (e) {
    emit('error', `更新优先级失败：${String(e)}`);
  } finally {
    busy.value = false;
  }
}

/** `⋯`：菜单对齐到按钮下方 */
function openFromButton(): void {
  const rect = moreBtn.value?.getBoundingClientRect();
  if (!rect) return;
  menuX.value = rect.left;
  menuY.value = rect.bottom + 4;
  menuOpen.value = true;
}

/** 右键 / Control + 点击：阻止系统默认菜单，在同一位置打开（FR-ITEM-06） */
function openFromContext(e: MouseEvent): void {
  e.preventDefault();
  menuX.value = e.clientX;
  menuY.value = e.clientY;
  menuOpen.value = true;
}

function closeMenu(): void {
  menuOpen.value = false;
}
</script>

<template>
  <li
    class="todo-item"
    :class="{ done: todo.done }"
    :data-todo-id="todo.id"
    @contextmenu="openFromContext"
  >
    <button
      type="button"
      class="check"
      :class="{ checked: todo.done }"
      :aria-label="todo.done ? '标记为未完成' : '标记为已完成'"
      :aria-pressed="todo.done"
      @click.stop="onToggle"
    >
      <svg v-if="todo.done" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M3.5 8.5 6.5 11.5 12.5 5"
          stroke="#ffffff"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button type="button" class="item-body" @click="emit('edit', todo)">
      <span class="item-title">{{ todo.title }}</span>
      <span v-if="todo.note" class="item-note">{{ todo.note }}</span>
    </button>

    <button
      type="button"
      class="priority-tag"
      :style="tagStyle"
      :aria-label="`优先级：${meta.label}，点击切换`"
      @click.stop="onCyclePriority"
    >
      {{ meta.label }}
    </button>

    <button
      ref="moreBtn"
      type="button"
      class="more-btn"
      aria-label="更多操作"
      @click.stop="openFromButton"
    >
      ⋯
    </button>

    <TodoContextMenu
      v-if="menuOpen"
      :todo="todo"
      :x="menuX"
      :y="menuY"
      @close="closeMenu"
      @edit="emit('edit', $event)"
      @error="emit('error', $event)"
    />
  </li>
</template>

<style scoped>
.todo-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 6px 8px 4px;
  border-radius: var(--radius-sm);
  transition: background-color 0.15s ease;
}

.todo-item:hover {
  background: var(--color-surface-2);
}

.check {
  display: grid;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  place-items: center;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.check:hover {
  border-color: var(--color-success);
}

.check.checked {
  background: var(--color-success);
  border-color: var(--color-success);
}

.check svg {
  width: 12px;
  height: 12px;
}

.item-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.item-title {
  overflow: hidden;
  font-size: 13px;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-item.done .item-title {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.item-note {
  overflow: hidden;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.priority-tag {
  flex: 0 0 auto;
  padding: 1px 7px;
  font-size: 11px;
  border-radius: 999px;
}

.more-btn {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  font-size: 14px;
  line-height: 1;
  color: var(--color-text-muted);
  border-radius: 6px;
  opacity: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.todo-item:hover .more-btn,
.more-btn:focus-visible {
  opacity: 1;
}

.more-btn:hover {
  background: var(--color-border);
}
</style>
