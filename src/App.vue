<script setup lang="ts">
/**
 * S1 阶段的最小占位外壳。
 *
 * S2 会按设计 §6.1 重写为「模块路由 + 编辑器状态 + 日历页两栏」；
 * 本阶段只保证工程可编译、可构建、数据层与工具函数可用。
 */
import { onMounted, ref } from 'vue';
import { init as initTodos, todosState } from './stores/todo.ts';
import { librarySize, init as initDailyMethod } from './stores/dailyMethod.ts';

const ready = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    await Promise.all([initTodos(), initDailyMethod()]);
    ready.value = true;
  } catch (e) {
    error.value = String(e);
  }
});
</script>

<template>
  <div class="app-shell">
    <h1>日程待办</h1>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="!ready" class="hint">初始化中…</p>
    <p v-else class="hint">
      S1 工程基座已就绪 · 待办 {{ todosState.todos.length }} 条 · 方法库 {{ librarySize }} 条
    </p>
    <p class="note">界面模块（S2）尚未实现，当前为占位外壳。</p>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 24px;
}

h1 {
  font-size: 20px;
  font-weight: 600;
}

.hint {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.note {
  color: var(--color-text-muted);
  font-size: 12px;
}

.error {
  color: var(--color-danger);
  font-size: 13px;
}
</style>
