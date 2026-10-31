<script setup lang="ts">
/**
 * 左侧边导航（P-01 / C-02、C-03）。
 *
 * 结构自上而下固定：品牌区 → 导航项 → 底部「● 数据本地存储」（FR-NAV-02）。
 * 图标按模块 id 分支渲染，未知 id 回退默认时钟图标（FR-NAV-04）。
 * 底部标识是静态文本，不提供跳转、不提供设置入口（FR-NAV-07）。
 */
import { NAV_ITEMS } from './navItems.ts';

defineProps<{
  /** 当前模块 id */
  current: string;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
}>();

/** 已知模块的图标；未命中时走 `clockIcon`（FR-NAV-04 的未知 id 回退） */
const ICONS: Record<string, string[]> = {
  // 日历：外框 + 两根装订柱 + 一条分隔线
  calendar: [
    'M4 7h16v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5Z',
    'M4 10.5h16',
    'M8 3.5v3M16 3.5v3',
  ],
  // 每日工作法：书页 + 书签
  daily: [
    'M5 4.5h11.5A1.5 1.5 0 0 1 18 6v14H6.5A1.5 1.5 0 0 1 5 18.5Z',
    'M18 6v14',
    'M9 8.5h5',
  ],
  // 全部待办：清单 + 两个勾选点
  todos: [
    'M4 6.5h2M4 12h2M4 17.5h2',
    'M9 6.5h11M9 12h11M9 17.5h11',
  ],
};

/** 未知模块 id 的默认图标：时钟 */
const CLOCK_ICON = ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7.5V12l3 2'];

const pathsFor = (id: string): string[] => ICONS[id] ?? CLOCK_ICON;
</script>

<template>
  <aside class="side-nav">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12A2.5 2.5 0 0 1 18 20.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Z"
            stroke="currentColor"
            stroke-width="1.6"
          />
          <path d="M8 3.5v3M16 3.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path d="M3.5 9.5h17" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 13.5h4M8 16.5h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </div>
      <div class="brand-text">
        <strong class="brand-name">日程待办</strong>
        <span class="brand-sub">Schedule Todo</span>
      </div>
    </div>

    <nav class="nav-list" aria-label="模块导航">
      <button
        v-for="item in NAV_ITEMS"
        :key="item.id"
        type="button"
        class="nav-item"
        :class="{ active: item.id === current }"
        :data-nav-id="item.id"
        :aria-current="item.id === current ? 'page' : undefined"
        @click="emit('select', item.id)"
      >
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              v-for="(d, i) in pathsFor(item.id)"
              :key="i"
              :d="d"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </nav>

    <div class="nav-local">
      <span class="nav-local-dot" aria-hidden="true">●</span>
      <span class="nav-local-text">数据本地存储</span>
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  display: flex;
  flex: 0 0 200px;
  flex-direction: column;
  width: 200px;
  height: 100%;
  padding: 18px 12px 14px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 2px 8px 18px;
}

.brand-mark {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 10px;
}

.brand-mark svg {
  width: 22px;
  height: 22px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.brand-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.brand-sub {
  font-size: 11px;
  color: var(--color-text-muted);
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 9px 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.nav-item:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.nav-item.active {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.nav-icon {
  display: grid;
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  place-items: center;
}

.nav-icon svg {
  width: 18px;
  height: 18px;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-local {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: auto;
  padding: 10px 10px 2px;
  font-size: 11px;
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-border);
}

.nav-local-dot {
  font-size: 8px;
  color: var(--color-success);
}
</style>
