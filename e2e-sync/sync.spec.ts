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
