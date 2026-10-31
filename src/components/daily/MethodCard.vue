<script setup lang="ts">
/**
 * 每日工作法主卡片（C-09，FR-DM-07 / FR-DM-08 / FR-DM-09 / FR-DM-11 / FR-DM-16）。
 *
 * 七个区块自上而下**单栏平铺**：分类徽章 + 来源 + 状态徽章 → 方法名 → 一句话说明 →
 * 核心步骤（整宽）→ 适用场景 / 今日一练（同一行两栏）→ 案例块（整宽、可缺省）。
 *
 * 高度策略：卡片 `flex: 0 1 auto`（随内容自适应、不撑满整列），内容超出可用高度时
 * 由 `.mc-inner` 内部滚动，底部 `.mc-fade` 渐隐提示；滚动到底渐隐消失（阈值 8）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CATEGORY_META } from '../../data/methods.ts';
import type { WorkMethod } from '../../types/index.ts';

const props = defineProps<{
  method: WorkMethod;
  /** 该日记录是否由「换一条」产生 */
  manual: boolean;
  /** 是否正在预览方法库条目 */
  isPreview: boolean;
  /** 查看日期是否为今天 */
  isToday: boolean;
}>();

const FADE_THRESHOLD = 8;
/** 切换方法后等排版完成再量高度（FR-DM-16），与设计 §6.3 的 260ms 一致 */
const REFLOW_DELAY = 260;

const category = computed(() => CATEGORY_META[props.method.category]);

/** 分类色通过 CSS 变量注入，避免每个分类写一份样式 */
const themeStyle = computed(() => ({
  '--cat': category.value.color,
  '--cat-soft': category.value.soft,
}));

/** 案例区块标题由数据的 case.type 决定（FR-DM-11） */
const caseLabel = computed(() =>
  props.method.case?.type === 'practice' ? '实践案例' : '作者故事'
);

/**
 * 状态徽章三选一互斥（FR-DM-08 / AC-51），文案逐字来自 PRD BR-22：
 * 方法库预览（灰底）> 已手动刷新（橙字橙底）> 今日推送（主色字淡主色底）。
 * 往期日期且未手动刷新时三种条件都不成立，不渲染徽章（PRD 未定义第四态，不自创文案）。
 */
const badge = computed<{ label: string; tone: 'preview' | 'manual' | 'today' } | null>(() => {
  if (props.isPreview) return { label: '方法库预览', tone: 'preview' };
  if (props.manual) return { label: '已手动刷新', tone: 'manual' };
  if (props.isToday) return { label: '今日推送', tone: 'today' };
  return null;
});

const innerEl = ref<HTMLElement | null>(null);
const showFade = ref(false);

let fadeTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;

/** 是否还有未展示内容（阈值 8，PRD FR-DM-09 / 设计 §6.3） */
function measure(): void {
  const el = innerEl.value;
  if (!el) {
    showFade.value = false;
    return;
  }
  showFade.value = el.scrollHeight - el.scrollTop - el.clientHeight > FADE_THRESHOLD;
}

function scheduleMeasure(): void {
  if (fadeTimer) clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    fadeTimer = null;
    measure();
  }, REFLOW_DELAY);
}

watch(
  () => props.method.id,
  async () => {
    // 换方法后回到顶部，避免新内容沿用上一条的滚动位置
    if (innerEl.value) innerEl.value.scrollTop = 0;
    showFade.value = false;
    await nextTick();
    measure();
    scheduleMeasure();
  }
);

onMounted(() => {
  measure();
  scheduleMeasure();
  // 窗口尺寸变化会改变可用高度（900×600 最小窗口），需要重新判定渐隐
  if (innerEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(innerEl.value);
  }
});

onBeforeUnmount(() => {
  if (fadeTimer) clearTimeout(fadeTimer);
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <article
    class="method-card"
    :class="{ 'has-more': showFade, 'is-preview': isPreview }"
    :style="themeStyle"
    :data-method-id="method.id"
  >
    <div ref="innerEl" class="mc-inner" @scroll="measure">
      <header class="mc-head">
        <span class="mc-cat">{{ category.label }}</span>
        <span class="mc-source">{{ method.source }}</span>
        <span
          v-if="badge"
          class="mc-preview"
          :class="`mc-preview--${badge.tone}`"
          :data-state="badge.tone"
          role="status"
        >{{ badge.label }}</span>
      </header>

      <h2 class="mc-name">{{ method.name }}</h2>
      <p class="mc-summary">{{ method.summary }}</p>

      <section class="mc-steps-block">
        <h3 class="mc-label">核心步骤</h3>
        <ol class="mc-steps">
          <li v-for="(step, index) in method.steps" :key="index" class="mc-step">
            <span class="mc-step-num" aria-hidden="true">{{ index + 1 }}</span>
            <span class="mc-step-text">{{ step }}</span>
          </li>
        </ol>
      </section>

      <div class="mc-duo">
        <section class="mc-box">
          <h3 class="mc-label">适用场景</h3>
          <p class="mc-text">{{ method.when }}</p>
        </section>
        <section class="mc-box">
          <h3 class="mc-label">今日一练</h3>
          <p class="mc-text">{{ method.action }}</p>
        </section>
      </div>

      <!-- 案例为可选字段：无 case 时不渲染该区块（FR-DM-11 / AC-52） -->
      <section v-if="method.case" class="mc-case">
        <h3 class="mc-label mc-case-label">{{ caseLabel }}</h3>
        <p class="case-title">{{ method.case.title }}</p>
        <p class="case-content">{{ method.case.content }}</p>
      </section>
    </div>

    <!-- 底部渐隐提示：class .mc-fade 是 AC-29 的判定依据，用 v-show 控制显隐 -->
    <div v-show="showFade" class="mc-fade" aria-hidden="true"></div>
  </article>
</template>

<style scoped>
.method-card {
  position: relative;
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

/* 内容超出时内部滚动，不撑破页面（FR-DM-09） */
.mc-inner {
  flex: 1 1 auto;
  min-height: 0;
  padding: 20px 24px 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mc-head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mc-cat {
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cat);
  white-space: nowrap;
  background: var(--cat-soft);
  border-radius: 999px;
}

.mc-source {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc-preview {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 9px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  border-radius: 999px;
}

.mc-preview--preview {
  color: var(--color-text-secondary);
  background: var(--color-surface-2);
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.mc-preview--manual {
  color: #d48806;
  background: #fff7e6;
}

.mc-preview--today {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.mc-name {
  margin-top: 12px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--color-text);
}

.mc-summary {
  margin-top: 6px;
  padding-bottom: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  border-bottom: 1px dashed var(--color-border);
}

.mc-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  letter-spacing: 0.02em;
}

.mc-steps-block {
  margin-top: 16px;
}

.mc-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 每条步骤 = 圆形序号 + 步骤文本的浅底卡片 */
.mc-step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 12px;
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
}

.mc-step-num {
  display: grid;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 50%;
  place-items: center;
}

.mc-step-text {
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text);
}

/* 适用场景 / 今日一练：同一行两栏 */
.mc-duo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 18px;
}

.mc-box {
  padding: 12px 14px;
  background: var(--color-surface-2);
  border-left: 3px solid var(--cat, var(--color-primary));
  border-radius: var(--radius-sm);
}

.mc-box .mc-label {
  color: var(--cat, var(--color-primary));
}

.mc-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}

.mc-case {
  margin-top: 18px;
  padding: 12px 14px;
  background: var(--cat-soft);
  border-radius: var(--radius-sm);
}

.mc-case-label {
  margin-bottom: 6px;
  color: var(--cat, var(--color-primary));
}

.case-title {
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.case-content {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

/* 底部渐隐遮罩：覆盖在滚动容器下沿，滚动到底后由 v-show 移除 */
.mc-fade {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 34px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0), var(--color-surface) 85%);
}
</style>
