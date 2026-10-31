<script setup lang="ts">
/**
 * 每日工作法模块（P-03，FR-DM-01 ~ FR-DM-16）。
 *
 * 布局（PRD §6.4）：顶栏 C-08 + 左主卡片 C-09 + 右侧「往期回顾 C-10 / 方法库 C-11」。
 * 查看日期与日历页共用同一份状态（FR-DM-10）：本组件只接收 `date`，
 * 日期步进通过 `select-date` 事件交回 App，不自己持有第二份日期。
 */
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import MethodCard from './MethodCard.vue';
import { CATEGORY_COUNTS, CATEGORY_META, CATEGORY_ORDER, METHODS } from '../../data/methods.ts';
import {
  dailyMethodState,
  displayedMethod,
  ensurePick,
  isManual,
  peekMethod,
  recentDates,
  refresh,
  setCurrentDate,
  setPreview,
} from '../../stores/dailyMethod.ts';
import type { MethodCategory } from '../../types/index.ts';

const props = defineProps<{
  /** 查看日期 `YYYY-MM-DD`，与日历页选中日期是同一份状态（FR-DM-10） */
  date: string;
}>();

const emit = defineEmits<{
  (e: 'select-date', date: string): void;
  (e: 'error', message: string): void;
}>();

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const HISTORY_DAYS = 7;
const TOTAL = METHODS.length;

const today = dayjs().format('YYYY-MM-DD');
const loading = ref(true);
const loadError = ref('');
const shuffling = ref(false);

/** 方法库分类筛选（模块自己的界面态，BR-21） */
const filter = ref<MethodCategory | 'all'>('all');

const isToday = computed(() => props.date === today);

const dateText = computed(
  () => `${dayjs(props.date).format('M月D日')} 周${WEEK_CN[dayjs(props.date).day()]}`
);

/** 主卡片展示的方法：预览态优先，否则取该日推送（FR-DM-06） */
const shownMethod = computed(() => displayedMethod(props.date));

const manual = computed(() => isManual(props.date));

/** 是否正在预览方法库条目（预览态由 store 持有，模块级单例） */
const previewId = computed(() => dailyMethodState.previewId);

/** 往期回顾：含查看日在内的最近 7 天，由早到晚（FR-DM-04） */
const historyRows = computed(() =>
  recentDates(HISTORY_DAYS, props.date).map((date) => {
    // peekMethod 只读：往期列表展示不得为此写 daily_picks
    const method = peekMethod(date);
    return {
      date,
      dayText: dayjs(date).format('MM/DD'),
      weekText: `周${WEEK_CN[dayjs(date).day()]}`,
      name: method?.name ?? '',
      color: method ? CATEGORY_META[method.category].color : 'transparent',
    };
  })
);

/** 分类筛选按钮：`全部` 不带计数，五个分类带各自条数（FR-DM-05） */
const filterButtons = computed(() => [
  { key: 'all' as const, label: '全部', count: TOTAL, color: '', soft: '' },
  ...CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_META[key].label,
    count: CATEGORY_COUNTS[key],
    color: CATEGORY_META[key].color,
    soft: CATEGORY_META[key].soft,
  })),
]);

const libraryItems = computed(() =>
  filter.value === 'all' ? METHODS : METHODS.filter((m) => m.category === filter.value)
);

function filterStyle(button: (typeof filterButtons.value)[number]): Record<string, string> {
  return button.key === 'all'
    ? { '--cf': 'var(--color-primary)', '--cf-soft': 'var(--color-primary-soft)' }
    : { '--cf': button.color, '--cf-soft': button.soft };
}

/** 取该日推送：首次查看会自动落库（FR-DM-01 / AC-21） */
async function load(date: string): Promise<void> {
  loading.value = true;
  try {
    await ensurePick(date);
    setCurrentDate(date);
    loadError.value = '';
  } catch (e) {
    loadError.value = String(e);
    emit('error', `工作法加载失败：${String(e)}`);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.date,
  async (date, previous) => {
    // 切日期时退出预览态：徽章描述的是「当前查看日期」的推送状态
    if (previous !== undefined && previous !== date) setPreview(null);
    await load(date);
  },
  { immediate: true }
);

/** 日期步进 / 今天：改的是「查看日期」，与日历页同一份状态（FR-DM-10） */
function stepDay(delta: number): void {
  emit('select-date', dayjs(props.date).add(delta, 'day').format('YYYY-MM-DD'));
}

function goToday(): void {
  // 已停在今天时「今天」也承担「回到今日推送」：退出方法库预览
  setPreview(null);
  emit('select-date', today);
}

/** 「换一条」：下一条确定性候选并落库 manual = true（FR-DM-03 / AC-23） */
async function shuffle(): Promise<void> {
  if (shuffling.value) return;
  shuffling.value = true;
  try {
    setPreview(null);
    await refresh(props.date);
  } catch (e) {
    emit('error', `换一条失败：${String(e)}`);
  } finally {
    shuffling.value = false;
  }
}

/** 方法库点击：只切预览，不改变该日落库记录（FR-DM-06 / AC-20） */
function preview(methodId: string): void {
  // 再点一次当前预览项即退出预览，回到该日推送内容
  setPreview(previewId.value === methodId ? null : methodId);
}

function selectFilter(key: MethodCategory | 'all'): void {
  filter.value = key;
}
</script>

<template>
  <section class="dm-root">
    <header class="dm-topbar">
      <h1 class="dm-title">每日工作法</h1>

      <div class="dm-date">
        <button type="button" class="dm-step dm-prev" aria-label="前一天" @click="stepDay(-1)">‹</button>
        <span class="dm-date-text" :data-date="date">{{ dateText }}</span>
        <button type="button" class="dm-step dm-next" aria-label="后一天" @click="stepDay(1)">›</button>
      </div>

      <div class="dm-actions">
        <button type="button" class="dm-btn dm-today" @click="goToday">今天</button>
        <button
          type="button"
          class="dm-btn dm-primary dm-shuffle"
          :disabled="shuffling"
          @click="shuffle"
        >换一条</button>
      </div>
    </header>

    <div class="dv-body">
      <div class="dv-main">
        <MethodCard
          v-if="shownMethod"
          :method="shownMethod"
          :manual="manual"
          :is-preview="Boolean(previewId)"
          :is-today="isToday"
        />
        <div v-else class="dm-empty" role="status">
          <p class="dm-empty-title">{{ loading ? '加载中…' : '工作法加载失败' }}</p>
          <p v-if="loadError" class="dm-empty-text">{{ loadError }}</p>
        </div>
      </div>

      <aside class="dv-side">
        <section class="side-card history-card">
          <h2 class="side-title">往期回顾</h2>
          <ul class="history-list">
            <li
              v-for="row in historyRows"
              :key="row.date"
              class="history-item"
              :class="{ active: row.date === date }"
              :data-date="row.date"
              role="button"
              tabindex="0"
              @click="emit('select-date', row.date)"
              @keydown.enter="emit('select-date', row.date)"
              @keydown.space.prevent="emit('select-date', row.date)"
            >
              <span class="history-dot" :style="{ background: row.color }" aria-hidden="true"></span>
              <span class="history-date">{{ row.dayText }}</span>
              <span class="history-week">{{ row.weekText }}</span>
              <span class="history-name">{{ row.name }}</span>
            </li>
          </ul>
        </section>

        <section class="side-card library-card">
          <div class="library-head">
            <h2 class="side-title">方法库</h2>
            <span class="library-count">{{ TOTAL }} 条</span>
          </div>

          <div class="library-filters">
            <button
              v-for="button in filterButtons"
              :key="button.key"
              type="button"
              class="cf-btn"
              :class="{ active: filter === button.key }"
              :data-filter="button.key"
              :style="filterStyle(button)"
              @click="selectFilter(button.key)"
            >{{ button.key === 'all' ? button.label : `${button.label} ${button.count}` }}</button>
          </div>

          <ul class="library-list">
            <li
              v-for="method in libraryItems"
              :key="method.id"
              class="lib-item"
              :class="{ active: previewId === method.id }"
              :data-method-id="method.id"
              role="button"
              tabindex="0"
              @click="preview(method.id)"
              @keydown.enter="preview(method.id)"
              @keydown.space.prevent="preview(method.id)"
            >
              <span
                class="lib-dot"
                :style="{ background: CATEGORY_META[method.category].color }"
                aria-hidden="true"
              ></span>
              <span class="lib-name">{{ method.name }}</span>
              <span class="lib-source">{{ method.source }}</span>
            </li>
            <li v-if="libraryItems.length === 0" class="lib-empty">暂无待办</li>
          </ul>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.dm-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* ---------------------------------------------------------------- 顶栏 C-08 */

.dm-topbar {
  display: flex;
  flex: 0 0 auto;
  gap: 14px;
  align-items: center;
  height: 44px;
  margin-bottom: 14px;
}

.dm-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

.dm-date {
  display: flex;
  gap: 2px;
  align-items: center;
  margin-left: auto;
}

.dm-step {
  display: grid;
  width: 24px;
  height: 24px;
  font-size: 15px;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  place-items: center;
}

.dm-step:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.dm-date-text {
  min-width: 108px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
}

.dm-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dm-btn {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.dm-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.dm-primary {
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: transparent;
}

.dm-primary:hover {
  color: #ffffff;
  background: var(--color-primary);
}

.dm-primary:disabled {
  cursor: default;
  opacity: 0.6;
}

.dm-primary:disabled:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

/* ---------------------------------------------------------------- 两栏 */

.dv-body {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 16px;
  min-height: 0;
}

.dv-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.dv-side {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.side-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 12px 10px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.side-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* 侧栏列表内部滚动，卡片本身不撑破页面 */
.history-list,
.library-list {
  margin-top: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.history-list {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 2px;
}

.history-item {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: 6px;
}

.history-item:hover {
  background: var(--color-surface-2);
}

.history-item.active {
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.history-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.history-date {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.history-week {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.history-item.active .history-week {
  color: var(--color-primary);
}

.history-name {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------------------------------------------------------- 方法库 C-11 */

.library-card {
  overflow: hidden;
}

.library-head {
  display: flex;
  flex: 0 0 auto;
  align-items: baseline;
  justify-content: space-between;
}

.library-count {
  font-size: 11px;
  color: var(--color-text-muted);
}

.library-filters {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

/* 选中分类用该分类的淡底 + 分类色文字（FR-DM-05） */
.cf-btn {
  padding: 3px 7px;
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  border-radius: 6px;
}

.cf-btn:hover {
  color: var(--cf, var(--color-primary));
}

.cf-btn.active {
  font-weight: 600;
  color: var(--cf, var(--color-primary));
  background: var(--cf-soft, var(--color-primary-soft));
}

.library-list {
  flex: 1 1 auto;
  min-height: 0;
}

.lib-item {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
}

.lib-item:hover {
  background: var(--color-surface-2);
}

.lib-item.active {
  background: var(--color-primary-soft);
}

.lib-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.lib-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-source {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-empty {
  padding: 16px 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

/* ---------------------------------------------------------------- 空 / 错误态 */

.dm-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.dm-empty-title {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.dm-empty-text {
  max-width: 460px;
  font-size: 12px;
  color: var(--color-danger);
  word-break: break-all;
}
</style>
