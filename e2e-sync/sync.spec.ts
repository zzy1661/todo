/**
 * 同步套件（S10 自测，AC-57 / AC-58 的浏览器侧证据）。
 *
 * **独立于主套件**：`playwright.sync.config.ts` + `e2e-sync/`（FR-SYNC-16 / BR-33），
 * 因此 `npx playwright test` 仍只跑基线的 6 个用例（AC-03 回归红线）。
 *
 * 无 key 期间能证明的只有「本地优先不被同步破坏」这一段：
 * 零云端请求、无登录拦截、状态区可开可关且不丢状态。
 * 真实登录与云端读写一律 NOT-VERIFIED（等 key 后由 S10.5 补跑）。
 */
import { test, expect } from '@playwright/test';
import dayjs from 'dayjs';
import {
  RUN_START,
  TODAY,
  countCloudTraffic,
  createTodoViaUi,
  dayTitleOf,
  makeTodo,
  openApp,
  readTodos,
  seedDatabase,
  syncEntry,
  syncPanel,
} from './support/fixtures.ts';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(RUN_START.toDate());
});

test('S1 · 未配置 key：全程零 rest/v1 与 auth/v1 请求（AC-57 / TC-057 / TC-060）', async ({
  page,
}) => {
  const traffic = await countCloudTraffic(page);
  await seedDatabase(page, [makeTodo(1, '同步基线', TODAY, 1)]);
  await openApp(page);

  // 走一遍三个模块的真实操作：新建 / 勾选 / 切模块 / 换一条 / 筛选
  await createTodoViaUi(page, '同步用例-甲', 2);
  await expect(page.locator('.todo-panel .todo-item')).toHaveCount(2);
  await page.locator('.todo-panel .todo-item').first().locator('.check').click();
  await page.locator('.nav-item[data-nav-id="daily"]').click();
  await expect(page.locator('.daily-module')).toBeVisible();
  await page.locator('.dm-shuffle').click();
  await page.locator('.nav-item[data-nav-id="todos"]').click();
  await expect(page.locator('.todos-module')).toBeVisible();
  await page.locator('.todos-module .filter-tab[data-filter="active"]').click();
  await page.locator('.nav-item[data-nav-id="calendar"]').click();
  await expect(page.locator('.cal-card')).toBeVisible();

  // 打开再关闭状态区（不配置 key 时也必须是零请求）
  await syncEntry(page).click();
  await expect(syncPanel(page)).toBeVisible();
  await page.locator('.sync-close').click();
  await expect(syncPanel(page)).toBeHidden();

  expect(traffic.urls, `出现了云端请求：${traffic.urls.join(' | ')}`).toEqual([]);
  expect(traffic.rest).toBe(0);
  expect(traffic.auth).toBe(0);
  // 本地功能与基线一致，且没有同步错误提示
  await expect(page.locator('.init-error')).toHaveCount(0);
  await expect(page.locator('.app-notice')).toHaveCount(0);
});

test('S2 · 网络整体不可用：本地三模块照常可用（AC-57 / TC-058）', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    // 只放行本地开发服务器，其余一律中断
    if (url.startsWith('http://localhost:1420')) return route.continue();
    return route.abort();
  });
  await seedDatabase(page, []);
  await openApp(page);

  await createTodoViaUi(page, '断网-甲', 0);
  await expect(page.locator('.todo-panel .todo-item')).toHaveCount(1);
  await page.locator('.nav-item[data-nav-id="todos"]').click();
  await expect(page.locator('.todos-module')).toContainText('断网-甲');
  await expect(page.locator('.app-notice')).toHaveCount(0);
});

test('S3 · 首屏无登录页 / 无遮罩 / 直接进日历（AC-58 / TC-061）', async ({ page }) => {
  await seedDatabase(page, [makeTodo(1, '首屏', TODAY, 1)]);
  await openApp(page);

  await expect(page.locator('main.app-main')).toHaveAttribute('data-module', 'calendar');
  await expect(page.locator('.cal-card')).toBeVisible();
  await expect(page.locator('.login-page, .login-mask, .auth-overlay')).toHaveCount(0);
  // 没有全屏遮罩层：编辑器未打开
  await expect(page.locator('.editor')).toHaveCount(0);
  // C-16 默认折叠：入口在，面板不可见
  await expect(syncEntry(page)).toBeVisible();
  await expect(syncPanel(page)).toBeHidden();
  // 导航区域仍然只有 3 项，没有账号 / 登录入口（AC-44 / TC-056）
  const navItems = page.locator('.side-nav nav .nav-item');
  await expect(navItems).toHaveCount(3);
  await expect(page.locator('.side-nav nav')).not.toContainText('登录');
  await expect(page.locator('.side-nav nav')).not.toContainText('同步');
});

test('S4 · 状态区：未配置说明、登录入口存在但禁用、关闭后不丢状态（AC-58 / TC-062）', async ({
  page,
}) => {
  await seedDatabase(page, []);
  await openApp(page);

  await syncEntry(page).click();
  await expect(syncPanel(page)).toBeVisible();
  await expect(syncPanel(page).locator('.sync-state')).toHaveText('未配置');
  await expect(syncPanel(page).locator('.sync-hint')).toContainText('sync.config.json');
  const login = syncPanel(page).locator('.sync-login');
  await expect(login).toHaveText('GitHub 登录');
  await expect(login).toBeDisabled();

  // 关闭只是隐藏：重新打开仍是「未配置」，没有重置成空面板
  await page.locator('.sync-close').click();
  await expect(syncPanel(page)).toBeHidden();
  await syncEntry(page).click();
  await expect(syncPanel(page)).toBeVisible();
  await expect(syncPanel(page).locator('.sync-state')).toHaveText('未配置');
  await expect(syncEntry(page)).toHaveAttribute('data-phase', 'disabled');

  // 状态区不阻塞主流程：面板打开时仍能正常新建待办
  await createTodoViaUi(page, '面板打开时新建', 1);
  await expect(page.locator('.todo-panel .todo-item')).toHaveCount(1);
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(TODAY));

  // 状态区文案不是一次性容器：关闭后再次打开仍有入口与状态节点
  await page.locator('.sync-close').click();
  const stored = await readTodos(page);
  expect(stored).toHaveLength(1);
  expect(dayjs(TODAY).isValid()).toBe(true);
});

/**
 * S5 · 墓碑死锁：状态区必须说清「数据被本机的删除记录挡住了」，并给出出口。
 *
 * **为什么要有这条**：2026-11-25 实机反馈「远端 8 行、已是最新 8 条，
 * 但界面上一条都不显示」。引擎侧的断言能证明**合并结果正确**，
 * 证明不了**界面上有没有把这件事说出来**——
 * 用户能不能看见「8 条待办被标记为已删除」与「找回」按钮，是另一回事。
 *
 * 这条用例只验证**界面表达与交互**（复活逻辑由 `check-sync.mjs` 第 ⑮ 组断言）。
 */
test('S5 · 墓碑死锁：状态区说清「被标记为已删除」并给出「找回」出口（v0.3.7）', async ({
  page,
}) => {
  await page.goto('/e2e-sync/support/panel-harness.html?recoverable=8');
  await expect(syncPanel(page)).toBeVisible();

  // ① 「可找回」必须**说出来**，且说清是「这台机器上」的删除记录
  const hint = syncPanel(page).locator('[data-sync-recoverable]');
  await expect(hint).toContainText('8 条待办在这台机器上被标记为「已删除」');
  await expect(hint).toContainText('只影响这台机器');

  // ② 「找回」按钮必须在，条数要对
  const recover = syncPanel(page).locator('[data-sync-recover]');
  await expect(recover).toBeVisible();
  await expect(recover).toHaveText('找回 8 条被删除的条目');

  // ③ 「上传本机全部」的解释必须写清**删除记录不会上传**
  //    （否则用户以为删掉的条目也会跟着搬上云）
  await expect(syncPanel(page)).toContainText('删除记录不会上传');

  // ④ 这是**反删除**，必须二次确认，且确认语要说清影响范围
  let dialogText = '';
  page.on('dialog', async (dialog) => {
    dialogText = dialog.message();
    await dialog.accept();
  });
  await recover.click();
  await expect.poll(() => dialogText).toContain('找回 8 条被删除的条目');
  expect(dialogText).toContain('只影响这台机器');
});

/**
 * S6 · 没有可找回的条目时**不得出现**「找回」出口。
 *
 * **为什么**：按钮若在「其实找不回」时也出现，就是**无效承诺**——
 * 用户点了没反应，只会更困惑。
 */
test('S6 · 无可找回条目时不出现「找回」按钮与提示（v0.3.7）', async ({ page }) => {
  await page.goto('/e2e-sync/support/panel-harness.html?recoverable=0');
  await expect(syncPanel(page)).toBeVisible();

  await expect(syncPanel(page).locator('[data-sync-recoverable]')).toHaveCount(0);
  await expect(syncPanel(page).locator('[data-sync-recover]')).toHaveCount(0);
});
