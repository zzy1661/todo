<script setup lang="ts">
/**
 * 待办统计行（当日面板 P-02 与全部待办 P-04 共用，BR-04 同一口径）。
 *
 * 完成率的分母永远是**当前视图的总条数**，不随筛选页签变化；
 * 总数为 0 时整段完成率不渲染（不显示 0%，ES-06）。
 */
import { computed } from 'vue';

const props = defineProps<{
  /** 当前视图总条数 */
  total: number;
  /** 当前视图已完成条数 */
  done: number;
}>();

/** round(已完成 / 总数 × 100)% */
const rate = computed(() => Math.round((props.done / props.total) * 100));
</script>

<template>
  <div class="panel-stats">
    <span class="stat">共 {{ total }} 项</span>
    <span class="stat">已完成 {{ done }} 项</span>
    <span v-if="total > 0" class="stat stat-rate">完成率 {{ rate }}%</span>
  </div>
</template>

<style scoped>
/* 类名沿用 S2 已固化的 `.panel-stats` / `.stat-rate`，不因抽取组件而改名 */
.panel-stats {
  display: flex;
  gap: 12px;
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stat-rate {
  color: var(--color-success);
}
</style>
