<script setup lang="ts">
/**
 * 月历（P-02 / C-05）。
 *
 * 固定 42 格（6 行 × 7 列）、一周从周日起始（FR-CAL-01）。
 * 月历视图（`currentMonth`）与选中日期（`selectedDate`）是两份状态：
 * 翻月只改视图，**不重置选中日**（FR-CAL-02 / AC-45 / OP-12）；
 * 反过来，选中日跨到其他月份时视图跟随（FR-CAL-06）。
 *
 * 每个日期格都带 `data-date="YYYY-MM-DD"`，补位格额外带 `data-outside`，
 * 让 E2E 能按日期精确定位、避免 strict mode 命中同名补位格（BR-19 / Q-T-02）。
 */
import { computed, ref, watch } from 'vue';
import dayjs, { type Dayjs } from 'dayjs';
import { loadMonth, markedDates } from '../../stores/todo.ts';

const props = defineProps<{
  /** 选中日期 `YYYY-MM-DD` */
  selectedDate: string;
}>();

const emit = defineEmits<{
  (e: 'select', date: string): void;
}>();

/** 星期头固定从周日开始（FR-CAL-01） */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** 月历视图所在的月份（1 号 00:00） */
const currentMonth = ref<Dayjs>(dayjs(props.selectedDate).startOf('month'));

/**
 * 「今天」在组件生命周期内取一次。
 * 产品语义上的今天由系统时钟决定，跨零点后刷新页面即恢复一致；
 * 这里不为跨零点轮询，避免无谓定时器。
 */
const today = dayjs().format('YYYY-MM-DD');

/** 42 格的起点：当月 1 号所在周的周日 */
const gridStart = computed<Dayjs>(() => {
  const first = currentMonth.value;
  // 用 `day()`（0 = 周日）自行回退，不依赖 dayjs locale 的 startOf('week')，
  // 保证任何 locale 下都是周日起始。
  return first.subtract(first.day(), 'day');
});

/** 当前月每天的有待办条数 */
const counts = computed<Record<string, number>>(() =>
  markedDates(currentMonth.value.year(), currentMonth.value.month() + 1)
);

interface DayCell {
  /** `YYYY-MM-DD` */
  date: string;
  /** 日期数字 */
  day: number;
  /** 是否非本月补位格 */
  outside: boolean;
  isToday: boolean;
  selected: boolean;
  /** 该日待办条数 */
  count: number;
}

/** 42 个日期格 */
const cells = computed<DayCell[]>(() => {
  const start = gridStart.value;
  const month = currentMonth.value.month();
  return Array.from({ length: 42 }, (_, i) => {
    const d = start.add(i, 'day');
    const date = d.format('YYYY-MM-DD');
    return {
      date,
      day: d.date(),
      outside: d.month() !== month,
      isToday: date === today,
      selected: date === props.selectedDate,
      count: counts.value[date] ?? 0,
    };
  });
});

/** 拉取当前月数据（圆点与统计依赖它，BR-09 / BR-10） */
async function loadCurrentMonth(): Promise<void> {
  const month = currentMonth.value;
  await loadMonth(month.year(), month.month() + 1);
}

/** 翻月：只改视图，选中日保持不变（FR-CAL-02 / AC-45） */
function shiftMonth(delta: number): void {
  currentMonth.value = currentMonth.value.add(delta, 'month');
}

/** 「今天」：月历视图与选中日期同时回到当天（FR-CAL-08 / AC-09） */
function goToday(): void {
  currentMonth.value = dayjs().startOf('month');
  emit('select', today);
}

/**
 * 选中日跨月时视图跟随（FR-CAL-06）。
 * 点击补位格、或在别处改了选中日期，都会走到这里。
 */
watch(
  () => props.selectedDate,
  (date) => {
    const month = dayjs(date).startOf('month');
    if (!month.isSame(currentMonth.value, 'month')) {
      currentMonth.value = month;
    }
  }
);

watch(
  currentMonth,
  () => {
    void loadCurrentMonth().catch((e: unknown) => {
      // 读库失败不打断界面：圆点缺失但页面仍可用（EX-02 口径：不破坏既有数据）
      console.error('[calendar] 加载当月待办失败', e);
    });
  },
  { immediate: true }
);
</script>

<template>
  <section class="cal-card" aria-label="月历">
    <header class="cal-head">
      <h2 class="month-title">{{ currentMonth.format('YYYY年M月') }}</h2>
      <div class="cal-actions">
        <button type="button" class="today-btn" @click="goToday">今天</button>
        <button type="button" class="month-btn month-prev" aria-label="上一月" @click="shiftMonth(-1)">
          ‹
        </button>
        <button type="button" class="month-btn month-next" aria-label="下一月" @click="shiftMonth(1)">
          ›
        </button>
      </div>
    </header>

    <div class="weekday-head" aria-hidden="true">
      <span v-for="w in WEEKDAYS" :key="w" class="weekday">{{ w }}</span>
    </div>

    <div class="day-grid">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="day-cell"
        :class="{
          'out-month': cell.outside,
          today: cell.isToday,
          selected: cell.selected,
          'has-todos': cell.count > 0,
        }"
        :data-date="cell.date"
        :data-outside="cell.outside ? '' : null"
        :aria-pressed="cell.selected"
        @click="emit('select', cell.date)"
      >
        <span class="day-num">{{ cell.day }}</span>
        <span v-if="cell.count > 0" class="day-dots" aria-hidden="true">
          <span class="dot"></span>
          <span v-if="cell.count > 3" class="dot-count">+</span>
        </span>
      </button>
    </div>

    <footer class="legend">
      <span class="legend-item">
        <span class="legend-glyph legend-dot">●</span>
        有待办
      </span>
      <span class="legend-item">
        <span class="legend-glyph legend-today">▢</span>
        今天
      </span>
      <span class="legend-item">
        <span class="legend-glyph legend-selected">■</span>
        已选中
      </span>
    </footer>
  </section>
</template>

<style scoped>
.cal-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 18px 12px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
}

.month-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.cal-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.today-btn {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 999px;
  transition: background-color 0.15s ease;
}

.today-btn:hover {
  background: #dfe8ff;
}

.month-btn {
  display: grid;
  width: 24px;
  height: 24px;
  padding-bottom: 2px;
  font-size: 15px;
  line-height: 1;
  color: var(--color-text-secondary);
  border-radius: 6px;
  place-items: center;
}

.month-btn:hover {
  color: var(--color-primary);
  background: var(--color-surface-2);
}

.weekday-head,
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekday-head {
  padding-bottom: 6px;
}

.weekday {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
}

.day-grid {
  flex: 1;
  gap: 4px;
  min-height: 0;
}

.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 4px 2px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.day-cell:hover {
  background: var(--color-primary-soft);
}

.day-num {
  font-size: 13px;
  line-height: 1.2;
  color: var(--color-text);
}

/* ① 非本月补位格：文字弱化 + 整体降透明度（FR-CAL-03） */
.day-cell.out-month {
  opacity: 0.45;
}

.day-cell.out-month .day-num {
  color: var(--color-text-muted);
}

/* ② 今天：日期数字主色加粗 */
.day-cell.today .day-num {
  font-weight: 700;
  color: var(--color-primary);
}

/* ③ 已选中：整格主色填充，数字转白，圆点转半透明白 */
.day-cell.selected {
  background: var(--color-primary);
}

.day-cell.selected:hover {
  background: var(--color-primary);
}

.day-cell.selected .day-num {
  font-weight: 600;
  color: #ffffff;
}

/* 今天与选中同时成立：保持加粗（FR-CAL-03 ②的「加粗」在选中态不得丢失） */
.day-cell.selected.today .day-num {
  font-weight: 700;
}

/* ④ 有待办：圆点；> 3 条时追加 `+`（FR-CAL-04） */
.day-dots {
  display: flex;
  gap: 1px;
  align-items: center;
  height: 8px;
}

.dot {
  width: 5px;
  height: 5px;
  background: var(--color-primary);
  border-radius: 50%;
}

.dot-count {
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: var(--color-primary);
}

.day-cell.selected .dot {
  background: rgba(255, 255, 255, 0.9);
}

.day-cell.selected .dot-count {
  color: rgba(255, 255, 255, 0.9);
}

/* 底部图例固定三项（FR-CAL-07） */
.legend {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding-top: 10px;
  font-size: 11px;
  color: var(--color-text-secondary);
  border-top: 1px solid var(--color-border);
}

.legend-item {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}

.legend-glyph {
  font-size: 10px;
  line-height: 1;
}

.legend-dot {
  color: var(--color-primary);
}

.legend-today {
  color: var(--color-text-secondary);
}

.legend-selected {
  color: var(--color-primary);
}
</style>
