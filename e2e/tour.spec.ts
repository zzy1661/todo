import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  D,
  RUN_START,
  TODAY,
  makeTodo,
  openApp,
  rowByTitle,
  seedDatabase,
  selectDate,
} from './support/fixtures';

/**
 * Case 6 · guided tour (AC-05 / FR-QA-04).
 *
 * The spec is self-contained (test plan §3.3): it clears and seeds its own
 * localStorage, so `npx playwright test e2e/tour.spec.ts` regenerates the
 * evidence on its own. Screenshots and the recording are written OUTSIDE
 * `test-results/`, which Playwright wipes on every run.
 */
test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: 'on', size: { width: 1440, height: 900 } },
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(RUN_START.toDate());
});

const ROOT = process.cwd();
const SHOTS_DIR = path.join(ROOT, 'screenshots');
const VIDEOS_DIR = path.join(ROOT, 'videos');

interface Shot {
  /** `01` … `14`, keeps the numbering promised by AC-05 */
  index: string;
  /** suffix of the file name */
  name: string;
}

const TOUR: Shot[] = [
  { index: '01', name: 'calendar-default' },
  { index: '02', name: 'day-panel-todos' },
  { index: '03', name: 'day-panel-completion-rate' },
  { index: '04', name: 'day-panel-filter-done' },
  { index: '05', name: 'calendar-month-flipped' },
  { index: '06', name: 'daily-push-card' },
  { index: '07', name: 'daily-manual-refresh' },
  { index: '08', name: 'daily-history' },
  { index: '09', name: 'daily-library' },
  { index: '10', name: 'daily-library-preview' },
  { index: '11', name: 'all-todos-groups' },
  { index: '12', name: 'all-todos-filter' },
  { index: '13', name: 'context-menu-past' },
  { index: '14', name: 'editor-create' },
];

/** Drop stale shots from previous runs, but never touch desktop evidence 15+. */
function cleanStaleShots(): void {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const keep = new Set(TOUR.map((shot) => `${shot.index}-${shot.name}.png`));
  for (const entry of fs.readdirSync(SHOTS_DIR)) {
    if (!/^\d{2}-.*\.png$/.test(entry)) continue;
    const index = Number(entry.slice(0, 2));
    if (index <= 14 && !keep.has(entry)) fs.rmSync(path.join(SHOTS_DIR, entry));
  }
}

test('6 · 巡览: 14 screenshots + one continuous recording', async ({ page }) => {
  test.setTimeout(180_000);
  cleanStaleShots();

  const shot = async ({ index, name }: Shot): Promise<void> => {
    await page.screenshot({ path: path.join(SHOTS_DIR, `${index}-${name}.png`) });
  };

  await seedDatabase(page, [
    makeTodo(1, '整理本周复盘', TODAY, 2, false, '把三件事的结论写下来'),
    makeTodo(2, '写周报初稿', TODAY, 1, true),
    makeTodo(3, '准备明日会议', TODAY, 0, false),
    makeTodo(4, '归档设计稿', D(-1), 1, false),
    makeTodo(5, '清理下载目录', D(-1), 0, false),
    makeTodo(6, '补充会议纪要', D(-1), 2, false),
    makeTodo(7, '回顾上周目标', D(-2), 1, true),
  ]);

  // 01 · calendar default view, today selected
  await openApp(page);
  await expect(page.locator(`.day-cell[data-date="${TODAY}"] .dot`)).toHaveCount(1);
  await shot(TOUR[0]);

  // 02 · day panel with three todos and a 0% rate
  const yesterday = D(-1);
  await selectDate(page, yesterday);
  await expect(page.locator('.todo-panel .todo-item')).toHaveCount(3);
  await expect(page.locator('.todo-panel .stat-rate')).toHaveText('完成率 0%');
  await shot(TOUR[1]);

  // 03 · completion rate after checking one todo (AC-14)
  await rowByTitle(page, '.todo-panel', '归档设计稿').locator('.check').click();
  await expect(page.locator('.todo-panel .stat-rate')).toHaveText('完成率 33%');
  await shot(TOUR[2]);

  // 04 · filter tab 「已完成」
  await page.locator('.todo-panel .filter-tab[data-filter="done"]').click();
  await expect(page.locator('.todo-panel .todo-item')).toHaveCount(1);
  await shot(TOUR[3]);

  // 05 · click a filler cell of the next month → right column switches, month follows (AC-08)
  await page.locator('.todo-panel .filter-tab[data-filter="all"]').click();
  const outside = page.locator('.day-cell[data-outside]').last();
  await outside.click();
  await expect(page.locator('.day-cell.selected')).toHaveCount(1);
  await shot(TOUR[4]);

  // 06 · daily method push card
  await page.locator('.nav-item[data-nav-id="daily"]').click();
  await page.locator('.dm-today').click();
  await expect(page.locator('.method-card')).toBeVisible();
  await expect(page.locator('.mc-preview')).toHaveText('今日推送');
  await expect(page.locator('.dm-date-text')).toHaveAttribute('data-date', TODAY);
  await shot(TOUR[5]);

  // 07 · 「换一条」 → manual badge
  const beforeShuffle = (await page.locator('.mc-name').innerText()).trim();
  await page.locator('.dm-shuffle').click();
  await expect(page.locator('.mc-name')).not.toHaveText(beforeShuffle);
  await expect(page.locator('.mc-preview')).toHaveText('已手动刷新');
  await shot(TOUR[6]);

  // 08 · past 7 days; click the third row to show an earlier day
  await expect(page.locator('.history-item')).toHaveCount(7);
  await page.locator('.history-item').nth(2).click();
  await expect(page.locator('.history-item.active')).toHaveCount(1);
  await shot(TOUR[7]);

  // 09 · method library: 65 entries with category counts
  await page.locator('.dm-today').click();
  await page.locator('.cf-btn[data-filter="all"]').click();
  await expect(page.locator('.library-list .lib-item')).toHaveCount(65);
  await shot(TOUR[8]);

  // 10 · library preview state
  await page.locator('.lib-item[data-method-id="5w2h"]').click();
  await expect(page.locator('.mc-name')).toHaveText('5W2H 分析法');
  await expect(page.locator('.mc-preview')).toHaveText('方法库预览');
  await shot(TOUR[9]);

  // 11 · all todos: cross-date groups with today marker
  await page.locator('.nav-item[data-nav-id="todos"]').click();
  await expect(page.locator('.all-view .group')).toHaveCount(3);
  await shot(TOUR[10]);

  // 12 · all todos filtered to 「未完成」
  await page.locator('.all-view .filter-tab[data-filter="active"]').click();
  await expect(page.locator('.all-view .group')).toHaveCount(2);
  await shot(TOUR[11]);

  // 13 · context menu on a past entry (copy / move to today, edit, delete)
  await page.locator('.nav-item[data-nav-id="calendar"]').click();
  await selectDate(page, yesterday);
  const pastRow = rowByTitle(page, '.todo-panel', '归档设计稿');
  await pastRow.scrollIntoViewIfNeeded();
  await pastRow.click({ button: 'right' });
  await expect(page.locator('.ctx-menu')).toBeVisible();
  await expect(page.locator('.ctx-menu .ctx-item.active')).toHaveCount(1);
  // let the 120ms opening animation finish before capturing
  await page.waitForTimeout(200);
  await shot(TOUR[12]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ctx-menu')).toHaveCount(0);

  // 14 · editor (create) with the selected date pre-filled
  await page.locator('.todo-panel .new-btn').click();
  await expect(page.locator('.editor[data-editor-mode="create"]')).toBeVisible();
  await shot(TOUR[13]);
  await page.locator('.editor-cancel').click();

  // one continuous recording for the whole tour, written outside test-results/
  const video = page.video();
  expect(video, 'video recording must be enabled for the tour').not.toBeNull();
  await page.close();
  await video?.saveAs(path.join(VIDEOS_DIR, '日程待办-产品功能巡览.webm'));

  // final sanity: all 14 shots exist and the recording is non-empty
  for (const entry of TOUR) {
    const file = path.join(SHOTS_DIR, `${entry.index}-${entry.name}.png`);
    expect(fs.statSync(file).size, `${file} must not be empty`).toBeGreaterThan(0);
  }
  const videoFile = path.join(VIDEOS_DIR, '日程待办-产品功能巡览.webm');
  expect(fs.statSync(videoFile).size).toBeGreaterThan(0);
});
