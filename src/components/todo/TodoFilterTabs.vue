<script setup lang="ts">
/**
 * 待办筛选页签（当日面板与全部待办共用）。
 *
 * 选中值由父组件持有：两个视图各持一份**互相独立**的状态（BR-21 / AC-33），
 * 本组件不缓存任何状态，仅做受控渲染。
 */
import type { TodoFilter } from '../../types/index.ts';

const props = defineProps<{
  modelValue: TodoFilter;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: TodoFilter): void;
}>();

const FILTERS: { value: TodoFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '未完成' },
  { value: 'done', label: '已完成' },
];
</script>

<template>
  <div class="filter-tabs" role="tablist">
    <button
      v-for="item in FILTERS"
      :key="item.value"
      type="button"
      class="filter-tab"
      :class="{ active: props.modelValue === item.value }"
      :data-filter="item.value"
      role="tab"
      :aria-selected="props.modelValue === item.value"
      @click="emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.filter-tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px 8px;
}

.filter-tab {
  padding: 4px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  border-radius: 999px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.filter-tab:hover {
  color: var(--color-primary);
}

.filter-tab.active {
  color: var(--color-primary);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}
</style>
