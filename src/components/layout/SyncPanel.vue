<script setup lang="ts">
/**
 * C-16 同步状态与登录区（PRD FR-SYNC-02 / AC-58 / OPEN-04）。
 *
 * 三条硬性约束：
 * 1. **可选入口**：入口固定在侧栏底部（`<nav>` 之外，导航仍只有 3 项，AC-44）；
 *    不做首屏登录页、不做遮罩、不拦截启动。
 * 2. **关闭只是隐藏**：面板用 `v-show` 卸载而不是销毁，状态来自模块级 store，
 *    重新打开仍显示已登录 / 上次同步时间（FR-SYNC-02，S10.5 专测）。
 * 3. **无 key 时说明清楚**：显示「未配置」并给出填写方式，登录按钮禁用，
 *    全程零云端请求（FR-SYNC-10 / AC-57）。
 */
import { computed } from 'vue';
import {
  autoSyncText,
  closePanel,
  lastSyncText,
  login,
  logout,
  phaseLabel,
  pushAllLocal,
  retrySync,
  syncState,
  togglePanel,
} from '../../stores/sync.ts';

const status = computed(() => syncState.status);
const label = computed(() => phaseLabel(status.value));
const lastText = computed(() => lastSyncText(status.value));
const autoText = computed(() => autoSyncText(status.value));
const signedIn = computed(
  () => status.value.phase === 'signed-in' || status.value.phase === 'syncing'
);
const canLogin = computed(
  () => syncState.enabled && !signedIn.value && !syncState.actionBusy
);
</script>

<template>
  <section class="sync-area" data-region="C-16" aria-label="同步状态区">
    <button
      type="button"
      class="sync-entry"
      data-sync-entry
      :data-phase="status.phase"
      :aria-expanded="syncState.panelOpen ? 'true' : 'false'"
      @click="togglePanel"
    >
      <span class="sync-dot" :data-phase="status.phase" aria-hidden="true">●</span>
      <span class="sync-entry-text">同步 · {{ label }}</span>
    </button>

    <!-- v-show：关闭只是隐藏，重新打开仍保留会话与上次同步信息（FR-SYNC-02） -->
    <div v-show="syncState.panelOpen" class="sync-panel" role="group">
      <header class="sync-head">
        <span class="sync-title">同步</span>
        <button type="button" class="sync-close" aria-label="关闭同步状态区" @click="closePanel">
          ×
        </button>
      </header>

      <p class="sync-state" :data-phase="status.phase">{{ label }}</p>
      <p v-if="status.email" class="sync-account">{{ status.email }}</p>
      <p class="sync-detail">{{ status.detail }}</p>
      <p v-if="lastText" class="sync-last">{{ lastText }}</p>
      <p v-if="autoText" class="sync-auto" data-sync-auto>{{ autoText }}</p>
      <p v-if="status.phase === 'disabled'" class="sync-hint">
        未配置 Supabase：本地功能不受影响，也不会发起任何网络请求。填入
        <code>sync.config.json</code> 后可登录同步。
      </p>
      <p v-else-if="status.phase === 'error' && status.lastError" class="sync-hint">
        {{ status.lastError }}
      </p>
      <!--
        云端为空、但本机还有没上云的待办时，给出**下一步该做什么**。
        自动同步只推「变更驱动」的增量，**登录之前就存在的历史待办不在里面**，
        所以「云端 0 行」通常不是故障，而是「本地数据还没上传」。
        没有这条提示，用户只会看到「新增 0 条、更新 0 条」，无从判断。
      -->
      <p v-else-if="status.localNotUploaded" class="sync-hint">
        云端还没有你的数据：本机有 {{ status.localNotUploaded }} 条待办尚未上传
        （自动同步只推「登录后被改动过」的增量，登录前的历史待办不在里面）。
        点下面的「上传本机全部」即可同步到云端。
      </p>

      <footer class="sync-actions">
        <button
          type="button"
          class="sync-login"
          :disabled="!canLogin"
          @click="login"
        >
          GitHub 登录
        </button>
        <button
          v-if="signedIn"
          type="button"
          class="sync-logout"
          :disabled="syncState.actionBusy"
          @click="logout"
        >
          退出登录
        </button>
        <button
          type="button"
          class="sync-retry"
          :disabled="!syncState.enabled || syncState.actionBusy"
          @click="retrySync"
        >
          立即重试
        </button>
        <!--
          上传本机全部：自动同步只覆盖「变更驱动」的增量，
          配 key 之前就存在的历史待办不在增量里，需要这个入口才能上云。
          做成显式动作而不是自动行为 —— 本地待办不带账号归属标记，
          自动全量上传会在「换账号登录」时把旧数据带到新账号下。
        -->
        <button
          type="button"
          class="sync-push-all"
          :disabled="!signedIn || syncState.actionBusy"
          @click="pushAllLocal"
        >
          上传本机全部
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.sync-area {
  position: relative;
  padding: 0 4px 2px;
}

.sync-entry {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}

.sync-entry:hover {
  background: var(--color-bg);
  border-color: var(--color-border);
}

.sync-dot {
  font-size: 9px;
  line-height: 1;
  color: var(--color-text-secondary);
}

.sync-dot[data-phase='signed-in'],
.sync-dot[data-phase='syncing'] {
  color: var(--color-primary);
}

.sync-dot[data-phase='error'] {
  color: var(--color-danger);
}

.sync-panel {
  position: absolute;
  bottom: 34px;
  left: 4px;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 232px;
  padding: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
}

.sync-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sync-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.sync-close {
  padding: 0 4px;
  font-size: 14px;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
}

.sync-state {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.sync-state[data-phase='error'] {
  color: var(--color-danger);
}

.sync-account {
  font-size: 11px;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.sync-detail,
.sync-last,
.sync-auto {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.sync-hint {
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border-radius: var(--radius-sm);
}

.sync-hint code {
  font-size: 10px;
}

.sync-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.sync-actions button {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--color-text);
  cursor: pointer;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.sync-actions button:disabled {
  color: var(--color-text-secondary);
  cursor: not-allowed;
  opacity: 0.6;
}

/* 「上传本机全部」：与其它按钮同族，但用主色描边以示区别 */
.sync-actions .sync-push-all:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.sync-actions .sync-login {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.sync-actions .sync-login:disabled {
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}
</style>
