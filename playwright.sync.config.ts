import { defineConfig } from '@playwright/test';

/**
 * 同步套件配置（S10 · PRD FR-SYNC-16 / BR-33）。
 *
 * **与主套件物理隔离**：`testDir: './e2e-sync'`，不在 `./e2e` 之内。
 * 主套件的 `npx playwright test` 因此仍然是 6 个用例（AC-03 回归红线），
 * 同步侧断言只在这里新增，不碰既有断言。
 *
 * 与主套件保持同一套浏览器基线（OP-06：无 `channel`、串行、workers 1），
 * 但视频关闭、产物落 `test-results-sync/`，避免覆盖主套件的取证目录。
 */
export default defineConfig({
  testDir: './e2e-sync',
  testIgnore: ['**/support/**'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  outputDir: 'test-results-sync',
  use: {
    baseURL: 'http://localhost:1420',
    video: 'off',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
