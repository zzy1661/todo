/**
 * 同步 E2E 套件的公共夹具（S10 · 独立于 `e2e/` 主套件，BR-33 / FR-SYNC-16）。
 *
 * 与主套件的区别：这里的每个用例都额外挂网络记账，
 * 断言「未配置同步时不得发起任何 rest/v1 与 auth/v1 请求」（AC-57 / FR-SYNC-10）。
 */
import { expect, type Page } from '@playwright/test';
import dayjs from 'dayjs';

/** 运行起点，可用 `E2E_NOW` 覆盖以证明日期无关（BR-19） */
export const RUN_START = process.env.E2E_NOW ? dayjs(process.env.E2E_NOW) : dayjs();
export const TODAY = RUN_START.format('YYYY-MM-DD');

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;
export const dayTitleOf = (date: string): string =>
  `${dayjs(date).format('M月D日')} 周${WEEK_CN[dayjs(date).day()]}`;

export interface SeedTodo {
  id: number;
  title: string;
  date: string;
  priority: 0 | 1 | 2;
  note: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

const STAMP = `${new Date(0).toISOString().slice(0, 10)} 00:00:00`;

export const makeTodo = (
  id: number,
  title: string,
  date: string,
  priority: 0 | 1 | 2,
  done = false,
  note = ''
): SeedTodo => ({
  id,
  title,
  date,
  priority,
  note,
  done,
  created_at: STAMP,
  updated_at: STAMP,
});

/** 只写固定的 localStorage 键（BR-14：浏览器路径不碰 SQLite） */
export async function seedDatabase(page: Page, todos: SeedTodo[]): Promise<void> {
  await page.addInitScript((rows: SeedTodo[]) => {
    if (sessionStorage.getItem('__e2e_sync_seeded') === '1') return;
    sessionStorage.setItem('__e2e_sync_seeded', '1');
    localStorage.setItem('todo_local_db', JSON.stringify(rows));
    localStorage.setItem(
      'todo_local_db_seq',
      String(rows.reduce((max, row) => Math.max(max, row.id), 0))
    );
    localStorage.setItem('todo_local_daily_db', JSON.stringify([]));
  }, todos);
}

export const readTodos = (page: Page): Promise<Record<string, unknown>[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('todo_local_db') ?? '[]'));

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.cal-card')).toBeVisible();
}

export async function createTodoViaUi(
  page: Page,
  title: string,
  priority: 0 | 1 | 2 = 1
): Promise<void> {
  const editor = page.locator('.editor');
  await page.locator('.todo-panel .new-btn').click();
  await expect(editor).toBeVisible();
  await editor.locator('input[data-field="title"]').fill(title);
  await editor.locator(`.priority-option[data-priority="${priority}"]`).click();
  await editor.locator('.editor-save').click();
  await expect(editor).toHaveCount(0);
}

/** 云端请求记账：命中即计数并中断（本地不该有这些请求） */
export interface CloudTraffic {
  rest: number;
  auth: number;
  urls: string[];
}

export async function countCloudTraffic(page: Page): Promise<CloudTraffic> {
  const traffic: CloudTraffic = { rest: 0, auth: 0, urls: [] };
  await page.route('**/rest/v1/**', async (route) => {
    traffic.rest += 1;
    traffic.urls.push(route.request().url());
    await route.abort();
  });
  await page.route('**/auth/v1/**', async (route) => {
    traffic.auth += 1;
    traffic.urls.push(route.request().url());
    await route.abort();
  });
  return traffic;
}

/** 同步状态区入口（C-16，位于侧栏底部、`<nav>` 之外） */
export const syncEntry = (page: Page) => page.locator('[data-sync-entry]');
export const syncPanel = (page: Page) => page.locator('.sync-panel');

export { expect };
