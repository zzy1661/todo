import { defineConfig } from '@playwright/test';

/**
 * E2E baseline (design ADP-07 / T-14).
 *
 * - no `channel`: uses Playwright's bundled Chromium (OP-06, macOS has no Edge);
 * - `fullyParallel: false` + `workers: 1`: the suite drives one shared
 *   localStorage-backed app, so cases must not interleave;
 * - `video: 'on'` for every case, `trace: 'retain-on-failure'` only on failures;
 * - `screenshots/` and `videos/` are written by the tour spec outside
 *   `test-results/`, which Playwright wipes on every run.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/support/**'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:1420',
    video: 'on',
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
