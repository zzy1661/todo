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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import dayjs from 'dayjs';
import {
  autoSyncText,
  closePanel,
  lastSyncText,
  login,
  logout,
  phaseLabel,
  pushAllLocal,
  recoverDeleted,
  retrySync,
  syncState,
  togglePanel,
} from '../../stores/sync.ts';
import { isRemoteOutsideView } from '../../sync/engine.ts';

const props = defineProps<{
  /** 当前界面正在查看的日期（`YYYY-MM-DD`）——用来判断云端数据「看不看得见」 */
  viewDate: string;
}>();

const emit = defineEmits<{
  (e: 'goto-todos'): void;
}>();

const status = computed(() => syncState.status);
const label = computed(() => phaseLabel(status.value));
const lastText = computed(() => lastSyncText(status.value));
const signedIn = computed(
  () => status.value.phase === 'signed-in' || status.value.phase === 'syncing'
);
const canLogin = computed(
  () => syncState.enabled && !signedIn.value && !syncState.actionBusy
);

/**
 * 用户**显式动作**的短暂反馈（引擎把结果写在 `status.notice` 里）。
 *
 * **为什么单独做一行**：面板收敛后日常只剩「状态 + 一行时间 + 一行云端摘要」，
 * 「点了『上传本机全部』/『找回』之后到底发生了什么」就没有出口了——
 * 按钮消失、提示消失，用户只能猜。反馈必须留着，但**不能常驻**：
 * 它显示几秒就自己退场，下一轮同步开始也会被引擎清掉。
 */
const NOTICE_LIFETIME_MS = 5000;
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => status.value.notice,
  (value) => {
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    if (!value) {
      notice.value = '';
      return;
    }
    notice.value = value;
    noticeTimer = setTimeout(() => {
      notice.value = '';
      noticeTimer = null;
    }, NOTICE_LIFETIME_MS);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
});

/** 最近一次拉取到的云端活跃待办条数 */
const remoteCount = computed(() => status.value.remoteLiveCount ?? 0);

/** 云端待办的日期范围文案（`10月15日~11月16日`） */
const remoteRangeText = computed(() => {
  const min = status.value.remoteDateMin ?? '';
  const max = status.value.remoteDateMax ?? '';
  if (!min) return '';
  const format = (day: string) => dayjs(day).format('M月D日');
  // 不加空格：这一行要塞进 232px 的面板，加了空格就会多折一行
  return min === max ? format(min) : `${format(min)}~${format(max)}`;
});

/**
 * 云端数据是否**不在**当前查看的这一天。
 *
 * **为什么要判断**：这是本次改动要解决的核心困惑——
 * 「同步说成功、界面却空空」。真实原因是数据落在了别的日期，
 * 而界面只显示当天。不说出来，用户只会认为同步没生效。
 */
const remoteOutsideView = computed(() =>
  isRemoteOutsideView(
    status.value.remoteDateMin ?? '',
    status.value.remoteDateMax ?? '',
    props.viewDate
  )
);

/** 切到「全部待办」：云端数据在那里按日期排好，一眼就能看全 */
function gotoAllTodos(): void {
  closePanel();
  emit('goto-todos');
}

/**
 * 当前查看的日期（`11月26日`），给「云端数据不在这一天」用。
 *
 * **为什么要格式化**：`props.viewDate` 是 `2026-11-26`，直接印在界面上
 * 是一串机器格式；转成「11月26日」才读得懂。
 */
const viewDateText = computed(() => {
  const value = props.viewDate;
  if (!value) return '';
  const day = dayjs(value);
  return day.isValid() ? day.format('M月D日') : value;
});

/**
 * 「立即重试」的悬停说明：把「多久自动同步一次」收进这里。
 *
 * **为什么要下沉**：周期是常驻不变的信息，而角落面板就那么大；
 * 悬停才出现的说明等于「想知道的人能看到，不想看的人看不见」。
 */
const retryTitle = computed(() => {
  const cadence = autoSyncText(status.value);
  return cadence ? `${cadence}；点此立即同步` : '点此立即同步';
});

/**
 * 「上传本机全部」的悬停说明。
 *
 * **为什么不能删掉这条知识**：用户容易以为「删掉的条目也会跟着搬上云」，
 * 于是把删除当成撤销手段。这句话原来常驻在面板里（占了三行），
 * 现在收进按钮的悬停说明——**知识不丢，但不占版面**。
 */
const pushAllTitle = '只上传还活着的待办；删除记录不会上传';

/**
 * 找回被本机删除记录挡住的条目。
 *
 * **为什么要二次确认**：这是**反删除**——本机记着「这些条目被删了」，
 * 墓碑终结（PRD BR-28 / OPEN-01）本来让它们永远回不来。这个出口撤销**本机**的
 * 删除记录（只影响这台机器，不广播），所以必须让用户明确知道自己在做什么。
 */
function onRecover(): void {
  const count = status.value.recoverableCount ?? 0;
  const confirmed = window.confirm(
    `找回 ${count} 条被删除的条目？\n\n` +
      `这些条目在这台机器上被标记为「已删除」，但云端还留着它们。\n` +
      `找回后它们会重新出现在这台机器上（只影响这台机器，不会改动别的设备）。`
  );
  if (!confirmed) return;
  void recoverDeleted();
}
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

      <!--
        面板只保留**三类常驻信息**（2026-11-27 收敛，需求方反馈「不需要显示这么多信息」）：
        ① 状态；② 一行时间；③ 一行云端摘要。
        其余一律**按需出现**（出错、要用户行动时才显示）——
        状态区是侧栏角落，不该常驻一大段说明文字。
        「多久自动同步一次」「删除记录不会上传」这类知识下沉到按钮悬停说明。
      -->
      <p class="sync-state" :data-phase="status.phase">{{ label }}</p>

      <!-- 上次同步时间：只到分钟；「成功 / 失败」由上面的状态行承担，不在这里重复 -->
      <p v-if="lastText" class="sync-last">{{ lastText }}</p>

      <!-- 用户显式动作（上传本机全部 / 找回）的短暂反馈：几秒后自动退场 -->
      <p v-if="notice" class="sync-notice" data-sync-notice>{{ notice }}</p>

      <!-- 出错时才给细节：正常状态不显示操作日志（那是排障用的，不是日常信息） -->
      <p v-if="status.phase === 'error' && status.detail" class="sync-hint">
        {{ status.detail }}
      </p>
      <p v-if="status.phase === 'error' && status.lastError" class="sync-hint sync-hint--soft">
        {{ status.lastError }}
      </p>

      <p v-if="status.phase === 'disabled'" class="sync-hint">
        未配置 Supabase：本地功能不受影响，也不会发起任何网络请求。填入
        <code>sync.config.json</code> 后可登录同步。
      </p>

      <!--
        **需要用户行动时才出现**的两条：
        ① 云端为空但本机有没上云的待办 → 点「上传本机全部」；
        ② 本机被标记为已删除、云端还活着 → 点「找回」。
        解释都压到一句话，细节交给按钮与二次确认弹窗。
      -->
      <p v-else-if="status.localNotUploaded" class="sync-hint">
        云端还没有你的数据，本机有 {{ status.localNotUploaded }} 条待办未上传。
      </p>
      <!--
        **可找回**：这些条目在本机被标记为「已删除」，但云端还活着。

        墓碑终结（PRD BR-28 / OPEN-01）规定「已删条目不因任何非删除记录复活」，
        于是它们**永远拉不回来**——界面上连「全部待办」都看不到。
        所以这里必须给一个**出口**：撤销**本机**的删除记录（只影响这台机器，
        不广播，别的设备上的删除依然有效），它们就能回来。
      -->
      <p v-else-if="status.recoverableCount" class="sync-hint" data-sync-recoverable>
        有 {{ status.recoverableCount }} 条被标记为已删除，点「找回」恢复（只影响这台机器）。
      </p>

      <!--
        云端摘要：一行说清「云端有多少、在哪几天」。
        「不在你正在看的这一天」另起一行——这一行只在**当前页是空的**时才有意义，
        挤在同一行会把 232px 的面板撑成两行，反而更难读。
      -->
      <p v-if="remoteCount > 0" class="sync-hint sync-hint--soft" data-sync-where>
        云端 {{ remoteCount }} 条 · <span class="sync-nowrap">{{ remoteRangeText }}</span>
        <template v-if="remoteOutsideView"><br />不在 {{ viewDateText }}</template>
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
          :title="retryTitle"
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
          :title="pushAllTitle"
          :disabled="!signedIn || syncState.actionBusy"
          @click="pushAllLocal"
        >
          上传本机全部
        </button>
        <!--
          「查看全部待办」：把「数据在哪」变成一次点击。
          全部待办按日期排好，云端那几条在哪一天一目了然。
        -->
        <button
          v-if="remoteCount > 0"
          type="button"
          class="sync-goto-all"
          data-sync-goto-all
          @click="gotoAllTodos"
        >
          查看全部待办
        </button>
        <!--
          「找回」：解除墓碑终结对本机造成的死锁。
          没有它，「本机已删、云端还活着」的条目永远回不来，
          用户看到的只是「已是最新 N 条」+ 空列表（2026-11-25 实机反馈）。
        -->
        <button
          v-if="status.recoverableCount"
          type="button"
          class="sync-recover"
          data-sync-recover
          :disabled="!signedIn || syncState.actionBusy"
          @click="onRecover"
        >
          找回 {{ status.recoverableCount }} 条被删除的条目
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

.sync-last {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/*
 * 动作反馈（上传本机全部 / 找回的结果）：短暂出现的一行。
 * 用主色把它和静态信息区分开——用户一眼能认出「这是刚发生的反馈」。
 */
.sync-notice {
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-primary);
}

/*
 * 不许在词中间断行。
 *
 * **为什么**：中文可以在任意字符间断行，于是「不在 11月26日」会被折成
 * 「… · 不」/「在 11月26日」——读起来像两句话。日期区间与「不在 X」
 * 各是一个整体，锁住不许拆开。
 */
.sync-nowrap {
  white-space: nowrap;
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

/* 常驻说明（不随状态出现/消失）：比提示更轻，避免喧宾夺主 */
.sync-hint--soft {
  padding: 4px 8px;
  color: var(--color-text-muted);
  background: transparent;
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

/* 「查看全部待办」：解决「数据在哪」的出口，样式与登录按钮同族 */
.sync-actions .sync-goto-all {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

/* 「找回」：解除墓碑死锁的出口，用主色描边与其它按钮区分 */
.sync-actions .sync-recover:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
  font-weight: 600;
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
