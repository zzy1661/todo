/**
 * 同步面板夹具（v0.3.7 新增）：挂载**真实的** `SyncPanel.vue`，只替换状态。
 *
 * **为什么需要它**：2026-11-25 的实机反馈是「远端 8 行、已是最新 8 条，
 * 但界面上一条都不显示」。引擎侧的断言（`check-sync.mjs` 第 ⑮ 组）能证明
 * 「合并结果是对的」，但**证明不了「界面上有没有把这件事说出来」**——
 * 用户能不能看见「有 8 条待办被标记为已删除」和「找回」按钮，是另一回事。
 *
 * **为什么夹具要独立成页**：浏览器环境下同步恒为未配置（AC-57 硬约束：
 * 未配置时零云端请求），整应用没法造出「已登录 + 云端有活数据」的局面。
 * 这里**只改测试夹具里的状态**，产品代码一行没动——
 * `initSync()` 只由 `App.vue` 调用，本页没挂 App，所以状态不会被覆盖。
 */
import { createApp, h } from 'vue';
import SyncPanel from '../../src/components/layout/SyncPanel.vue';
import { syncState } from '../../src/stores/sync.ts';
// 必须引应用的样式：不引的话面板没有任何布局，元素会跑到视口外，
// 点击时 Playwright 报「element is outside of the viewport」。
import '../../src/styles/main.css';

const params = new URLSearchParams(window.location.search);

/** 「可找回」的条数；0 表示不进入这个分支 */
const recoverable = Number(params.get('recoverable') ?? '8');
/** 界面正在查看的日期（用来验证「云端数据不在这一天」的分支） */
const viewDate = params.get('date') ?? '2026-11-26';

syncState.enabled = true;
syncState.panelOpen = true;
syncState.status = {
  ...syncState.status,
  phase: 'signed-in',
  detail: '已同步',
  lastResult: 'ok',
  lastSyncAt: Date.parse('2026-11-26T09:30:00+08:00'),
  recoverableCount: recoverable,
  // 云端还活着 8 条，日期落在过去（复现实机现场）
  remoteLiveCount: recoverable,
  remoteDateMin: '2026-10-15',
  remoteDateMax: '2026-11-16',
};

const Harness = {
  setup() {
    return () => h(SyncPanel, { viewDate });
  },
};

createApp(Harness).mount('#app');
