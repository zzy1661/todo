/**
 * AC-57 的「日志无错误堆栈」证据（浏览器侧，独立于 e2e/ 主套件与 e2e-sync/）。
 *
 * 主套件与同步套件都没有控制台断言，而 AC-57 的判据含「日志无错误堆栈」。
 * 本脚本用 Playwright 真开一个 Chromium 页面：走三模块 + 开关同步状态区 + 重载，
 * 全过程收 `console`（error 级）与 `pageerror`，并同时统计 `rest/v1` / `auth/v1` 请求。
 *
 * **不新增 test()、不改断言**：这是独立验证脚本，不进任何 playwright 配置的 testDir。
 *
 * 用法：node scripts/check-sync-console.mjs
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:1420';

const reachable = async () => {
  try {
    const response = await fetch(BASE);
    return response.ok;
  } catch {
    return false;
  }
};

let server = null;
if (!(await reachable())) {
  server = spawn('npm', ['run', 'dev'], { stdio: 'ignore', detached: false });
  const deadline = Date.now() + 60_000;
  while (!(await reachable())) {
    if (Date.now() > deadline) {
      server.kill();
      throw new Error('dev server 60 秒内未就绪');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const errors = [];
const cloudRequests = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('request', (request) => {
    const url = request.url();
    if (/\/rest\/v1\/|\/auth\/v1\//.test(url)) cloudRequests.push(url);
  });

  await page.addInitScript(() => {
    localStorage.setItem('todo_local_db', '[]');
    localStorage.setItem('todo_local_db_seq', '0');
    localStorage.setItem('todo_local_daily_db', '[]');
  });

  await page.goto(`${BASE}/`);
  await page.locator('.cal-card').first().waitFor({ state: 'visible', timeout: 20_000 });

  // 三模块各走一遍
  for (const id of ['daily', 'todos', 'calendar']) {
    await page.locator(`.nav-item[data-nav-id="${id}"]`).click();
    await page.waitForTimeout(150);
  }
  // 状态区：开 → 关 → 再开 → 关
  for (let i = 0; i < 2; i += 1) {
    await page.locator('[data-sync-entry]').click();
    await page.locator('.sync-panel').waitFor({ state: 'visible' });
    await page.locator('.sync-close').click();
    await page.locator('.sync-panel').waitFor({ state: 'hidden' });
  }
  // 刷新一次，覆盖「重启拉取」的浏览器路径（未配置 → 零请求）
  await page.reload();
  await page.locator('.cal-card').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);

  // v-show 语义：关闭后节点仍在 DOM（1 个），但不可见；重开时不重建、状态不丢
  const panelDomNodes = await page.locator('.sync-panel').count();
  const panelVisible = await page.locator('.sync-panel').isVisible();
  const phase = await page.locator('[data-sync-entry]').getAttribute('data-phase');
  const initError = await page.locator('.init-error').count();
  await page.close();

  let failures = 0;
  if (errors.length > 0) failures += 1;
  if (cloudRequests.length > 0) failures += 1;
  if (phase !== 'disabled') failures += 1;
  if (initError !== 0) failures += 1;
  if (panelDomNodes !== 1) failures += 1; // v-show 保留节点
  if (panelVisible) failures += 1; // 但必须不可见
  console.log(`PROBE sync.panel.dom-nodes-after-close = ${panelDomNodes}（v-show 保留节点）`);
  console.log(`PROBE sync.panel.visible-after-close = ${panelVisible}`);
  console.log(`PROBE sync.entry.data-phase = ${phase}`);
  console.log(`PROBE init-error nodes = ${initError}`);
  for (const [label, count, list] of [
    ['控制台错误（console.error + pageerror）', errors.length, errors],
    ['云端请求（rest/v1 + auth/v1）', cloudRequests.length, cloudRequests],
  ]) {
    console.log(`${count === 0 ? '✓' : '✗'} ${label} = ${count}`);
    for (const item of list.slice(0, 5)) console.log(`    ${item}`);
  }
  console.log(
    failures === 0
      ? '\nAC-57 日志证据 PASS：三模块 + 状态区开关 + 重载全过程零控制台错误、零云端请求'
      : `\nAC-57 日志证据 FAIL：${failures} 项不达标`
  );
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
