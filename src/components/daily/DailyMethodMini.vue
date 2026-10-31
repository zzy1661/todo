<script setup lang="ts">
/**
 * 日历页内嵌的「每日工作法」小卡片（P-02 / C-06，FR-DM-12 ~ FR-DM-14）。
 *
 * 跟随日历选中日期：今天的标题是「今日工作法」，其他日期是「M月D日 工作法」。
 * 右上角刷新圆钮只刷新该日推送，不触发卡片跳转（FR-DM-13）；
 * 点击其余区域进入每日工作法模块并定位到该日期（FR-DM-14）。
 */
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { CATEGORY_META } from '../../data/methods.ts';
import {
  ensurePick,
  methodOf,
  refresh,
} from '../../stores/dailyMethod.ts';
import type { WorkMethod } from '../../types/index.ts';

const props = defineProps<{
  /** 选中日期 `YYYY-MM-DD` */
  date: string;
}>();

const emit = defineEmits<{
  (e: 'open', date: string): void;
  (e: 'error', message: string): void;
}>();

const today = dayjs().format('YYYY-MM-DD');

const method = ref<WorkMethod | null>(null);
const refreshing = ref(false);

const title = computed(() =>
  props.date === today
    ? '今日工作法'
    : `${dayjs(props.date).format('M月D日')} 工作法`
);

const category = computed(() =>
  method.value ? CATEGORY_META[method.value.category] : null
);

/** 分类色通过 CSS 变量注入，避免每个分类写一份样式 */
const themeStyle = computed(() =>
  category.value
    ? { '--cat': category.value.color, '--cat-soft': category.value.soft }
    : {}
);

/** 取该日推送并展示（首次查看会自动落库，FR-DM-01） */
async function load(): Promise<void> {
  try {
    await ensurePick(props.date);
    method.value = methodOf(props.date);
  } catch (e) {
    emit('error', `工作法加载失败：${String(e)}`);
  }
}

/** 「换一条」：只刷新该日推送，不跳转模块 */
async function onRefresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await refresh(props.date);
    method.value = methodOf(props.date);
  } catch (e) {
    emit('error', `换一条失败：${String(e)}`);
  } finally {
    refreshing.value = false;
  }
}

watch(() => props.date, () => void load(), { immediate: true });
</script>

<template>
  <article
    class="mini-card"
    :style="themeStyle"
    role="button"
    tabindex="0"
    @click="emit('open', date)"
    @keydown.enter="emit('open', date)"
    @keydown.space.prevent="emit('open', date)"
  >
    <span class="mini-bar" aria-hidden="true"></span>

    <div class="mini-body">
      <div class="mini-head">
        <span class="mini-title">{{ title }}</span>
        <span v-if="category" class="mini-cat">{{ category.label }}</span>
      </div>
      <p class="mini-name">{{ method?.name ?? '' }}</p>
      <p class="mini-summary">{{ method?.summary ?? '' }}</p>
    </div>

    <button
      type="button"
      class="mini-refresh"
      aria-label="换一条"
      :disabled="refreshing"
      @click.stop="onRefresh"
    >
      ↻
    </button>
  </article>
</template>

<style scoped>
.mini-card {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  padding: 12px 14px 12px 16px;
  overflow: hidden;
  cursor: pointer;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.15s ease;
}

.mini-card:hover {
  box-shadow: var(--shadow-md);
}

/* 左侧 4px 分类色竖条（FR-DM-12） */
.mini-bar {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 4px;
  background: var(--cat, var(--color-primary));
  border-radius: 0 4px 4px 0;
}

.mini-body {
  min-width: 0;
  padding-right: 26px;
}

.mini-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.mini-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.mini-cat {
  padding: 1px 7px;
  font-size: 10px;
  color: var(--cat, var(--color-primary));
  background: var(--cat-soft, var(--color-primary-soft));
  border-radius: 999px;
}

.mini-name {
  margin-top: 4px;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-summary {
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-secondary);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.mini-refresh {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  width: 20px;
  height: 20px;
  padding-bottom: 1px;
  font-size: 13px;
  color: var(--color-text-muted);
  border-radius: 50%;
  place-items: center;
  transition: color 0.15s ease, background-color 0.15s ease, transform 0.2s ease;
}

.mini-refresh:hover {
  color: #ffffff;
  background: var(--cat, var(--color-primary));
  transform: rotate(-90deg);
}

.mini-refresh:disabled {
  cursor: default;
  opacity: 0.6;
  transform: none;
}
</style>
