<script setup lang="ts">
/**
 * 待办右键菜单（P-05 / C-15，FR-MENU-01 ~ FR-MENU-10）。
 *
 * - 菜单项**按条目日期动态生成**，不是「列出全部再置灰」（BR-11）；
 * - 五种关闭条件全开：点击外部 / Esc / 窗口失焦 / 窗口尺寸变化 / 页面滚动（BR-20）；
 * - 贴边自动翻转，四周留 8px 安全边距（FR-MENU-09）；
 * - 键盘 ↑ / ↓ 跳过分隔线循环，Enter 执行，Esc 关闭（FR-MENU-06）。
 *
 * 挂载点在 `TodoItem` 的 `<Teleport to="body">` 内，避免被列表容器裁切（FR-MENU-10）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { copyToDate, patch, remove } from '../../stores/todo.ts';
import type { Todo } from '../../types/index.ts';

const props = defineProps<{
  todo: Todo;
  /** 打开位置（视口坐标） */
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit', todo: Todo): void;
  (e: 'error', message: string): void;
}>();

/** 视口安全边距（FR-MENU-09） */
const PAD = 8;

interface MenuEntry {
  key: string;
  label: string;
  danger?: boolean;
  separator?: boolean;
}

const isToday = computed(() => props.todo.date === dayjs().format('YYYY-MM-DD'));

/** 菜单项：今日条目与往期条目的分支不同（FR-MENU-01） */
const entries = computed<MenuEntry[]>(() => [
  ...(isToday.value
    ? [{ key: 'tomorrow', label: '移动明日' }]
    : [
        { key: 'copy-today', label: '复制到今日' },
        { key: 'move-today', label: '移动到今日' },
      ]),
  { key: 'separator', label: '', separator: true },
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除', danger: true },
]);

/** 可执行项（跳过分隔线）的下标序列 */
const selectableIndexes = computed(() =>
  entries.value.reduce<number[]>((acc, entry, index) => {
    if (!entry.separator) acc.push(index);
    return acc;
  }, [])
);

const activeIndex = ref(0);
const menuEl = ref<HTMLElement | null>(null);
const position = ref({ left: props.x, top: props.y });
const busy = ref(false);

/** 贴边翻转：按实测尺寸与视口比较，超出则向反方向展开 */
function place(): void {
  const el = menuEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = props.x;
  let top = props.y;
  if (left + rect.width + PAD > vw) left = props.x - rect.width;
  if (top + rect.height + PAD > vh) top = props.y - rect.height;

  position.value = {
    left: Math.max(PAD, Math.min(left, vw - rect.width - PAD)),
    top: Math.max(PAD, Math.min(top, vh - rect.height - PAD)),
  };
}

async function run(key: string): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  const today = dayjs().format('YYYY-MM-DD');
  try {
    switch (key) {
      case 'copy-today':
        await copyToDate(props.todo, today);
        break;
      case 'move-today':
        await patch(props.todo.id, { date: today });
        break;
      case 'tomorrow':
        await patch(props.todo.id, { date: dayjs().add(1, 'day').format('YYYY-MM-DD') });
        break;
      case 'edit':
        emit('edit', props.todo);
        break;
      case 'delete':
        await remove(props.todo.id);
        break;
      default:
        break;
    }
    emit('close');
  } catch (e) {
    emit('error', `操作失败：${String(e)}`);
    emit('close');
  } finally {
    busy.value = false;
  }
}

/** 当前高亮项对应的条目下标 */
const activeEntryIndex = computed(
  () => selectableIndexes.value[activeIndex.value] ?? -1
);

function move(delta: number): void {
  const n = selectableIndexes.value.length;
  if (n === 0) return;
  activeIndex.value = (activeIndex.value + delta + n) % n;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    move(1);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(-1);
    return;
  }
  if (e.key === 'Enter') {
    const index = activeEntryIndex.value;
    const entry = index >= 0 ? entries.value[index] : undefined;
    if (entry) {
      e.preventDefault();
      void run(entry.key);
    }
  }
}

/** 点击菜单外关闭（捕获阶段，先于条目自身的 click） */
function onDocumentMousedown(e: MouseEvent): void {
  const el = menuEl.value;
  if (el && e.target instanceof Node && el.contains(e.target)) return;
  emit('close');
}

const onBlur = (): void => emit('close');
const onResize = (): void => emit('close');
const onScroll = (): void => emit('close');

onMounted(async () => {
  await nextTick();
  place();
  document.addEventListener('mousedown', onDocumentMousedown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown, true);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuEl"
      class="ctx-menu"
      role="menu"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    >
      <template v-for="(entry, index) in entries" :key="entry.key">
        <div v-if="entry.separator" class="ctx-sep" role="separator"></div>
        <button
          v-else
          type="button"
          class="ctx-item"
          :class="{ danger: entry.danger, active: index === activeEntryIndex }"
          role="menuitem"
          @mouseenter="activeIndex = selectableIndexes.indexOf(index)"
          @click="run(entry.key)"
        >
          {{ entry.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-menu {
  position: fixed;
  z-index: 200;
  min-width: 168px;
  padding: 5px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  animation: ctx-in 0.12s ease-out;
}

@keyframes ctx-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ctx-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--color-text);
  text-align: left;
  border-radius: 6px;
}

.ctx-item.active {
  background: var(--color-surface-2);
}

.ctx-item.danger {
  color: var(--color-danger);
}

.ctx-item.danger.active {
  background: rgba(255, 77, 79, 0.1);
}

.ctx-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--color-border);
}
</style>
