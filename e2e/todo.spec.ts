import { expect, test } from '@playwright/test';
import dayjs from 'dayjs';
import {
  D,
  TODAY,
  RUN_START,
  createTodoViaUi,
  dayTitleOf,
  groupTitleOf,
  makeTodo,
  menuActions,
  menuLabels,
  methodName,
  monthTitleOf,
  openApp,
  openRowMenu,
  readPicks,
  readTodos,
  referenceOrder,
  rowByTitle,
  seedDatabase,
  selectDate,
} from './support/fixtures';

/**
 * Functional E2E cases 1–5 (design §9.2). Exactly five `test()` live here —
 * AC-03 asserts `6 passed`, so macOS additions are merged into these bodies
 * and no extra case is allowed (test plan §3.3 / D-3).
 */
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Pin the browser clock to the run start so node-side dates and the app agree.
  await page.clock.setFixedTime(RUN_START.toDate());
});

/* ------------------------------------------------------------------ case 1 */

test('1 · 应用加载: shell, 42-cell calendar and the empty day panel', async ({ page }) => {
  await seedDatabase(page, []);
  await openApp(page);

  // --- shell & navigation (FR-NAV-02 / AC-44)
  const main = page.locator('main.app-main');
  await expect(main).toHaveAttribute('data-module', 'calendar');
  const navItems = page.locator('.side-nav .nav-item');
  await expect(navItems).toHaveCount(3);
  await expect(navItems.locator('.nav-label')).toHaveText(['日历', '每日工作法', '全部待办']);
  await expect(page.locator('.nav-item.active')).toHaveAttribute('data-nav-id', 'calendar');
  await expect(page.locator('.side-nav')).not.toContainText('番茄钟');

  // --- 7 weekday headers from Sunday (AC-06)
  await expect(page.locator('.cal-card .weekday')).toHaveText(['日', '一', '二', '三', '四', '五', '六']);

  // --- 42 cells = 6 rows x 7 columns starting on Sunday (TC-010)
  const cells = page.locator('.cal-card .day-cell');
  await expect(cells).toHaveCount(42);
  const gridDates = await cells.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-date') ?? '')
  );
  expect(gridDates).toHaveLength(42);
  expect(new Set(gridDates).size).toBe(42);
  expect(gridDates.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))).toBe(true);
  // every cell is a real consecutive day
  gridDates.forEach((date, index) => {
    if (index === 0) return;
    expect(dayjs(date).diff(dayjs(gridDates[index - 1]), 'day')).toBe(1);
  });
  // first column is Sunday, each column steps by 7 days
  for (let col = 0; col < 7; col += 1) {
    expect(dayjs(gridDates[col]).day()).toBe(col);
    for (let row = 1; row < 6; row += 1) {
      expect(dayjs(gridDates[row * 7 + col]).diff(dayjs(gridDates[(row - 1) * 7 + col]), 'day')).toBe(7);
    }
  }

  // --- today cell (AC-06): `.today` + bold number, primary colour when not selected
  const todayCell = page.locator(`.day-cell[data-date="${TODAY}"]`);
  await expect(todayCell).toHaveClass(/today/);
  await expect(todayCell).toHaveClass(/selected/);
  await expect(todayCell.locator('.day-num')).toHaveText(String(dayjs(TODAY).date()));
  await expect(todayCell.locator('.day-num')).toHaveCSS('font-weight', '700');

  // --- outside filler cells exist and are visually weakened (AC-06)
  const outsideCells = page.locator('.day-cell[data-outside]');
  expect(await outsideCells.count()).toBeGreaterThan(0);
  expect(await outsideCells.first().evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(1);

  // --- the right column defaults to today with an empty panel (AC-10 / TC-020)
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(TODAY));
  await expect(page.locator('.todo-panel .today-badge')).toHaveText('今天');
  const stats = page.locator('.todo-panel .panel-stats');
  await expect(stats).toContainText('共 0 项');
  await expect(stats).toContainText('已完成 0 项');
  await expect(page.locator('.todo-panel .stat-rate')).toHaveCount(0);

  const empty = page.locator('.todo-panel .empty-state[data-empty="no-todos"]');
  await expect(empty.locator('.empty-title')).toHaveText('这一天还没有待办');
  await expect(empty.locator('.empty-action')).toHaveText('创建第一条待办');

  // the empty-state action opens the editor pre-filled with the selected day
  await empty.locator('.empty-action').click();
  const editor = page.locator('.editor[data-editor-mode="create"]');
  await expect(editor).toBeVisible();
  await expect(editor.locator('input[data-field="date"]')).toHaveValue(TODAY);
  await editor.locator('.editor-cancel').click();
  await expect(page.locator('.editor')).toHaveCount(0);

  // --- today's number turns primary+bold once another day is selected
  // "primary" is compared with the token-driven `.today-btn` colour instead of a hex literal
  const primaryColour = await page
    .locator('.cal-card .today-btn')
    .evaluate((el) => getComputedStyle(el).color);
  const sameMonthNeighbour = dayjs(TODAY).date() === 1 ? D(1) : D(-1);
  await selectDate(page, sameMonthNeighbour);
  await expect(todayCell.locator('.day-num')).toHaveCSS('color', primaryColour);
  await expect(todayCell.locator('.day-num')).toHaveCSS('font-weight', '700');
  await expect(page.locator('.todo-panel .today-badge')).toHaveCount(0);

  // --- outside cell selects exactly its own date; the month follows (TC-012 / FR-CAL-06)
  const outside = page.locator('.day-cell[data-outside]').first();
  const outsideDate = (await outside.getAttribute('data-date')) as string;
  await expect(outside.locator('.day-num')).toHaveText(String(dayjs(outsideDate).date()));
  await outside.click();
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(outsideDate));
  await expect(page.locator('.cal-card .month-title')).toHaveText(monthTitleOf(outsideDate));
  await expect(page.locator('.day-cell.selected')).toHaveCount(1);
  await expect(page.locator(`.day-cell[data-date="${outsideDate}"]`)).toHaveClass(/selected/);

  // --- flipping the month keeps the selected day (FR-CAL-02 / AC-45)
  await page.locator('.month-next').click();
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(outsideDate));

  // --- the "today" button restores both view and selection (AC-09 / TC-013)
  await page.locator('.today-btn').click();
  await expect(page.locator('.cal-card .month-title')).toHaveText(monthTitleOf(TODAY));
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(TODAY));
  await expect(page.locator(`.day-cell[data-date="${TODAY}"]`)).toHaveClass(/selected/);
});

/* ------------------------------------------------------------------ case 2 */

test('2 · 完整链路: create, dots, priority, completion rate, cross-month', async ({ page }) => {
  await seedDatabase(page, []);
  await openApp(page);

  const other = D(-3);
  await selectDate(page, other);

  const panel = page.locator('.todo-panel');
  const otherCell = page.locator(`.day-cell[data-date="${other}"]`);

  // three todos through the editor UI: 低 / 中 / 高
  await createTodoViaUi(page, { title: '链路-甲', priority: 0 });
  await createTodoViaUi(page, { title: '链路-乙', priority: 1 });
  await createTodoViaUi(page, { title: '链路-丙', priority: 2 });
  await expect(panel.locator('.todo-item')).toHaveCount(3);
  await expect(panel.locator('.panel-stats')).toContainText('共 3 项');
  await expect(panel.locator('.panel-stats')).toContainText('已完成 0 项');
  await expect(panel.locator('.stat-rate')).toHaveText('完成率 0%');

  // --- dot without `+` at 3 todos, `+` at 4, gone again at 3 (AC-07 / TC-011)
  await expect(otherCell.locator('.dot')).toHaveCount(1);
  await expect(otherCell.locator('.dot-count')).toHaveCount(0);
  await createTodoViaUi(page, { title: '链路-丁', priority: 1 });
  await expect(otherCell.locator('.dot-count')).toHaveCount(1);
  await expect(otherCell.locator('.dot-count')).toHaveText('+');

  await openRowMenu(page, rowByTitle(page, '.todo-panel', '链路-丁'));
  await page.locator('.ctx-menu .ctx-item[data-action="delete"]').click();
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  await expect(panel.locator('.todo-item')).toHaveCount(3);
  await expect(otherCell.locator('.dot-count')).toHaveCount(0);
  await expect(otherCell.locator('.dot')).toHaveCount(1);

  // --- priority tag cycles 低 → 中 → 高 → 低 with a matching colour change (AC-13)
  const tag = rowByTitle(page, '.todo-panel', '链路-甲').locator('.priority-tag');
  await expect(tag).toHaveText('低');
  const colours = new Set<string>([await tag.evaluate((el) => getComputedStyle(el).backgroundColor)]);
  const priorities: string[] = [];
  for (const [expectedLabel, expectedPriority] of [
    ['中', '1'],
    ['高', '2'],
    ['低', '0'],
  ] as const) {
    await tag.click();
    await expect(tag).toHaveText(expectedLabel);
    priorities.push(
      (await rowByTitle(page, '.todo-panel', '链路-甲').getAttribute('data-priority')) ?? ''
    );
    colours.add(await tag.evaluate((el) => getComputedStyle(el).backgroundColor));
    expect(priorities.at(-1)).toBe(expectedPriority);
  }
  expect(colours.size).toBe(3);

  // --- completion rate: 33% → 100% → 67% (AC-14 / TC-019)
  const check = (title: string) => rowByTitle(page, '.todo-panel', title).locator('.check');
  await check('链路-甲').click();
  await expect(panel.locator('.panel-stats')).toContainText('已完成 1 项');
  await expect(page.locator('.todo-panel .stat-rate')).toHaveText('完成率 33%');
  await check('链路-乙').click();
  await check('链路-丙').click();
  await expect(page.locator('.todo-panel .stat-rate')).toHaveText('完成率 100%');

  // --- "nothing matches this filter" empty state has no create button (AC-11 / TC-015)
  await page.locator('.todo-panel .filter-tab[data-filter="active"]').click();
  const noMatch = page.locator('.todo-panel .empty-state[data-empty="no-match"]');
  await expect(noMatch.locator('.empty-title')).toHaveText('没有符合筛选的待办');
  await expect(noMatch.locator('button')).toHaveCount(0);
  await expect(page.locator('.todo-panel .panel-stats')).toContainText('共 3 项');
  await expect(page.locator('.todo-panel .stat-rate')).toHaveText('完成率 100%');

  await page.locator('.todo-panel .filter-tab[data-filter="all"]').click();
  await check('链路-丙').click();
  await expect(page.locator('.todo-panel .stat-rate')).toHaveText('完成率 67%');

  // --- cross-month: click an outside cell → right column switches, month follows,
  //     that month's dots are really loaded (AC-08 / TC-012)
  const target = dayjs(other).add(1, 'month').startOf('month').format('YYYY-MM-DD');
  const outsideTarget = page.locator(`.day-cell[data-outside][data-date="${target}"]`);
  await expect(outsideTarget).toHaveCount(1);
  await outsideTarget.click();
  await expect(page.locator('.cal-card .month-title')).toHaveText(monthTitleOf(target));
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(target));

  await createTodoViaUi(page, { title: '下月首日', priority: 1 });
  await expect(page.locator(`.day-cell[data-date="${target}"] .dot`)).toHaveCount(1);

  // back to the previous month, then re-enter through the outside cell:
  // the dot must survive the month switch (data reloaded, not empty)
  await page.locator('.month-prev').click();
  const anchor = dayjs(other).startOf('month').date(10).format('YYYY-MM-DD');
  await page.locator(`.day-cell[data-date="${anchor}"]`).click();
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(anchor));
  await page.locator(`.day-cell[data-outside][data-date="${target}"]`).click();
  await expect(page.locator('.cal-card .month-title')).toHaveText(monthTitleOf(target));
  await expect(page.locator(`.day-cell[data-date="${target}"] .dot`)).toHaveCount(1);

  // flipping further does not reset the selected day
  await page.locator('.month-next').click();
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(target));

  // --- an empty day's empty-state action pre-fills that very date (TC-014)
  await page.locator('.today-btn').click();
  const emptyDay = D(5);
  await selectDate(page, emptyDay);
  const empty = page.locator('.todo-panel .empty-state[data-empty="no-todos"]');
  await expect(empty.locator('.empty-title')).toHaveText('这一天还没有待办');
  await empty.locator('.empty-action').click();
  const editor = page.locator('.editor[data-editor-mode="create"]');
  await expect(editor.locator('input[data-field="date"]')).toHaveValue(emptyDay);
  await editor.locator('.editor-cancel').click();
  await expect(page.locator('.editor')).toHaveCount(0);
});

/* ------------------------------------------------------------------ case 3 */

test('3 · 每日工作法: deterministic push, shuffle, history, library, scroll fade', async ({ page }) => {
  await seedDatabase(page, []);
  await openApp(page);
  await page.locator('.nav-item[data-nav-id="daily"]').click();
  const main = page.locator('main.app-main');
  await expect(main).toHaveAttribute('data-module', 'daily');
  const card = page.locator('.method-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-method-id', /./);

  // --- deterministic first push, verified against the reference algorithm (AC-21 / AC-24)
  const todayOrder = referenceOrder(TODAY);
  const name = page.locator('.mc-name');
  await expect(name).toHaveText(methodName(todayOrder[0]));
  await expect(page.locator('.mc-preview')).toHaveCount(1);
  await expect(page.locator('.mc-preview')).toHaveAttribute('data-state', 'today');
  await expect(page.locator('.mc-preview')).toHaveText('今日推送');

  // persisted immediately: one row, manual = false, method inside the library
  let picks = await readPicks(page);
  expect(picks).toHaveLength(1);
  expect(picks[0]).toMatchObject({ date: TODAY, method_id: todayOrder[0], manual: false });

  // --- "换一条" walks to the next candidate of the same date and flags manual (AC-23 / TC-031)
  await page.locator('.dm-shuffle').click();
  await expect(name).toHaveText(methodName(todayOrder[1]));
  await expect(page.locator('.mc-preview')).toHaveCount(1);
  await expect(page.locator('.mc-preview')).toHaveAttribute('data-state', 'manual');
  await expect(page.locator('.mc-preview')).toHaveText('已手动刷新');
  picks = await readPicks(page);
  expect(picks.find((row) => row.date === TODAY)).toMatchObject({
    method_id: todayOrder[1],
    manual: true,
  });

  // --- 7 history days, ascending, active row = current day, click switches the card (AC-25 / TC-033)
  const historyItems = page.locator('.history-item');
  await expect(historyItems).toHaveCount(7);
  const historyDates = await historyItems.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-date') ?? '')
  );
  expect([...historyDates].sort()).toEqual(historyDates);
  expect(historyDates.at(-1)).toBe(TODAY);
  expect(new Set(historyDates).size).toBe(7);
  await expect(page.locator('.history-item.active')).toHaveAttribute('data-date', TODAY);

  const thirdDate = historyDates[2];
  await historyItems.nth(2).click();
  await expect(page.locator('.dm-date-text')).toHaveAttribute('data-date', thirdDate);
  await expect(name).toHaveText(methodName(referenceOrder(thirdDate)[0]));
  // a past day that was never manually refreshed carries no badge (AC-51: exactly three states)
  await expect(page.locator('.mc-preview')).toHaveCount(0);
  await expect(page.locator('.history-item.active')).toHaveAttribute('data-date', thirdDate);

  await page.locator('.dm-today').click();
  await expect(page.locator('.dm-date-text')).toHaveAttribute('data-date', TODAY);
  await expect(name).toHaveText(methodName(todayOrder[1]));

  // --- library counts: 65 total, five categories (AC-26 / TC-034)
  await expect(page.locator('.library-count')).toHaveText('65 条');
  const filters = page.locator('.cf-btn');
  await expect(filters).toHaveCount(6);
  await expect(filters).toHaveText([
    '全部',
    '思维方法 17',
    '工作方法 17',
    '汇报方法 12',
    '沟通方法 7',
    '效率方法 12',
  ]);
  const expectedCounts: [string, number][] = [
    ['all', 65],
    ['thinking', 17],
    ['work', 17],
    ['report', 12],
    ['communication', 7],
    ['efficiency', 12],
  ];
  for (const [key, count] of expectedCounts) {
    await page.locator(`.cf-btn[data-filter="${key}"]`).click();
    await expect(page.locator('.library-list .lib-item')).toHaveCount(count);
    await expect(page.locator(`.cf-btn[data-filter="${key}"]`)).toHaveClass(/active/);
  }
  await page.locator('.cf-btn[data-filter="all"]').click();

  // --- library preview does not overwrite the stored push (AC-20 / TC-028)
  const previewItem = page.locator('.lib-item[data-method-id="5w2h"]');
  await previewItem.click();
  await expect(name).toHaveText('5W2H 分析法');
  await expect(page.locator('.mc-preview')).toHaveCount(1);
  await expect(page.locator('.mc-preview')).toHaveAttribute('data-state', 'preview');
  await expect(page.locator('.mc-preview')).toHaveText('方法库预览');
  expect((await readPicks(page)).find((row) => row.date === TODAY)?.method_id).toBe(todayOrder[1]);

  // clicking the same entry again leaves preview and returns to the stored push
  await previewItem.click();
  await expect(name).toHaveText(methodName(todayOrder[1]));
  await expect(page.locator('.mc-preview')).toHaveAttribute('data-state', 'manual');

  // --- geometry: single column, steps above the two boxes, boxes above the case (AC-28 / TC-037)
  await previewItem.click();
  await expect(name).toHaveText('5W2H 分析法');
  const stepsBox = (await page.locator('.mc-steps-block').boundingBox())!;
  const duoBox = (await page.locator('.mc-box').first().boundingBox())!;
  const caseBox = (await page.locator('.mc-case').boundingBox())!;
  expect(stepsBox.y + stepsBox.height).toBeLessThanOrEqual(duoBox.y + 1);
  expect(duoBox.y + duoBox.height).toBeLessThanOrEqual(caseBox.y + 1);
  expect(Math.abs(stepsBox.x - duoBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(stepsBox.x - caseBox.x)).toBeLessThanOrEqual(1);
  const contentWidth = (await page.locator('.dv-main').boundingBox())!.width;
  expect((await card.boundingBox())!.width).toBeLessThanOrEqual(contentWidth + 1);

  // --- 5w2h is the mandatory overflow fixture: inner scroll + fade hint (AC-29 / TC-038)
  const inner = page.locator('.mc-inner');
  const metrics = await inner.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await expect(page.locator('.mc-fade')).toBeVisible();
  await inner.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.locator('.mc-fade')).toBeHidden();
  expect(await inner.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const pageScroll = await page.evaluate(() => ({
    scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
    innerHeight: window.innerHeight,
  }));
  expect(pageScroll.scrollHeight).toBeLessThanOrEqual(pageScroll.innerHeight + 1);

  // --- rice-scoring is a conditional fixture: judge only when it really overflows (TC-039)
  await page.locator('.lib-item[data-method-id="rice-scoring"]').click();
  await expect(name).toHaveText('RICE 评分');
  const rice = await inner.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  if (rice.scrollHeight > rice.clientHeight) {
    await expect(page.locator('.mc-fade')).toBeVisible();
    await inner.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.locator('.mc-fade')).toBeHidden();
  } else {
    test.info().annotations.push({
      type: 'fixture-not-applicable',
      description: `rice-scoring does not overflow at 1280x800 (${rice.scrollHeight}=${rice.clientHeight}); TC-039 not judged`,
    });
  }

  // --- calendar mini card: title, refresh without leaving the module (AC-30 / TC-041)
  await page.locator('.nav-item[data-nav-id="calendar"]').click();
  await expect(main).toHaveAttribute('data-module', 'calendar');
  await expect(page.locator('.daily-module')).toBeHidden();
  const mini = page.locator('.mini-card');
  await expect(mini.locator('.mini-title')).toHaveText('今日工作法');
  await expect(mini.locator('.mini-name')).toHaveText(methodName(todayOrder[1]));
  await mini.locator('.mini-refresh').click();
  await expect(mini.locator('.mini-name')).toHaveText(methodName(todayOrder[2]));
  await expect(main).toHaveAttribute('data-module', 'calendar');
  await expect(page.locator('.cal-card')).toBeVisible();
  await expect(page.locator('.daily-module')).toBeHidden();
  expect((await readPicks(page)).find((row) => row.date === TODAY)?.method_id).toBe(todayOrder[2]);
});

/* ------------------------------------------------------------------ case 4 */

test('4 · 全部待办: cross-date groups, today marker, group progress, filters', async ({ page }) => {
  const yesterday = D(-1);
  await seedDatabase(page, [
    makeTodo(1, '昨日未完成', yesterday, 0, false),
    makeTodo(2, '今日已完成', TODAY, 1, true),
  ]);
  await openApp(page);
  await page.locator('.nav-item[data-nav-id="todos"]').click();
  const main = page.locator('main.app-main');
  await expect(main).toHaveAttribute('data-module', 'todos');
  const allView = page.locator('.all-view');
  await expect(allView).toBeVisible();
  await expect(allView.locator('.all-title')).toHaveText('全部待办');

  // --- two date groups, ascending, today flagged, per-group done/total (AC-31 / TC-042)
  const groups = allView.locator('.group');
  await expect(groups).toHaveCount(2);
  await expect(groups.locator('.group-title')).toHaveText([
    groupTitleOf(yesterday),
    groupTitleOf(TODAY),
  ]);
  await expect(
    allView.locator(`.group[data-group-date="${yesterday}"] .group-title`)
  ).not.toContainText('今天');
  await expect(
    allView.locator(`.group[data-group-date="${TODAY}"] .group-title`)
  ).toContainText(' · 今天');
  await expect(allView.locator(`.group[data-group-date="${TODAY}"] .group-count`)).toHaveText('1/1');
  await expect(allView.locator(`.group[data-group-date="${yesterday}"] .group-count`)).toHaveText(
    '0/1'
  );

  const stats = allView.locator('.panel-stats');
  await expect(stats).toContainText('共 2 项');
  await expect(stats).toContainText('已完成 1 项');
  await expect(allView.locator('.stat-rate')).toHaveText('完成率 50%');

  // --- the two filters are independent: day panel 「已完成」, all view stays 「全部」 (AC-33 / TC-044)
  await page.locator('.nav-item[data-nav-id="calendar"]').click();
  await selectDate(page, TODAY);
  await page.locator('.todo-panel .filter-tab[data-filter="done"]').click();
  await expect(page.locator('.todo-panel .todo-item')).toHaveCount(1);
  await expect(page.locator('.todo-panel .filter-tab.active')).toHaveAttribute('data-filter', 'done');

  // selecting another day resets the day-panel filter (AC-46 / FR-DAY-04)
  await selectDate(page, yesterday);
  await expect(page.locator('.todo-panel .filter-tab.active')).toHaveAttribute('data-filter', 'all');
  await selectDate(page, TODAY);
  await page.locator('.todo-panel .filter-tab[data-filter="done"]').click();

  await page.locator('.nav-item[data-nav-id="todos"]').click();
  await expect(allView.locator('.filter-tab.active')).toHaveAttribute('data-filter', 'all');
  await expect(allView.locator('.group')).toHaveCount(2);
  await page.locator('.nav-item[data-nav-id="calendar"]').click();
  await expect(page.locator('.todo-panel .filter-tab.active')).toHaveAttribute('data-filter', 'done');
  await page.locator('.nav-item[data-nav-id="todos"]').click();

  // --- 「未完成」 keeps only the yesterday group; 「已完成」 only today (AC-32 / TC-043)
  await allView.locator('.filter-tab[data-filter="active"]').click();
  await expect(allView.locator('.group')).toHaveCount(1);
  await expect(allView.locator('.group')).toHaveAttribute('data-group-date', yesterday);
  await expect(allView.locator('.group .group-count')).toHaveText('0/1');
  await expect(stats).toContainText('共 2 项');
  await expect(allView.locator('.stat-rate')).toHaveText('完成率 50%');

  await allView.locator('.filter-tab[data-filter="done"]').click();
  await expect(allView.locator('.group')).toHaveCount(1);
  await expect(allView.locator('.group')).toHaveAttribute('data-group-date', TODAY);
  await expect(allView.locator('.group .group-count')).toHaveText('1/1');
  await expect(allView.locator('.group-title')).toContainText(' · 今天');
  await expect(stats).toContainText('共 2 项');

  // --- empty database: neutral empty state with no buttons at all (AC-32 / AC-54, last)
  await allView.locator('.filter-tab[data-filter="all"]').click();
  await expect(allView.locator('.group')).toHaveCount(2);
  await page.evaluate(() => {
    localStorage.removeItem('todo_local_db');
  });
  await page.reload();
  await expect(page.locator('.cal-card')).toBeVisible();
  await page.locator('.nav-item[data-nav-id="todos"]').click();
  const empty = allView.locator('.empty-state[data-empty="no-todos"]');
  await expect(empty.locator('.empty-title')).toHaveText('暂无待办');
  await expect(empty.locator('button')).toHaveCount(0);
  await expect(allView.locator('.group')).toHaveCount(0);
  await expect(allView.locator('.panel-stats')).toContainText('共 0 项');
  await expect(allView.locator('.stat-rate')).toHaveCount(0);
});

/* ------------------------------------------------------------------ case 5 */

test('5 · 条目与编辑器: row anatomy, menu branches, closing, flip, editor', async ({ page }) => {
  const past = D(-3);
  const filler = Array.from({ length: 20 }, (_, index) =>
    makeTodo(3 + index, `填充 ${index + 1}`, past, 1, false)
  );
  await seedDatabase(page, [
    makeTodo(1, '今日条目', TODAY, 1, false),
    makeTodo(2, '往期条目', past, 2, false, '带备注'),
    ...filler,
  ]);
  await openApp(page);
  const panel = page.locator('.todo-panel');
  await selectDate(page, past);
  await expect(panel.locator('.todo-item')).toHaveCount(21);

  // --- row anatomy: exactly four interactive elements, no pencil / trash (AC-12 / TC-016)
  const pastRow = rowByTitle(page, '.todo-panel', '往期条目');
  await expect(pastRow.locator('button')).toHaveCount(4);
  for (const selector of ['.check', '.item-body', '.priority-tag', '.more-btn']) {
    await expect(pastRow.locator(selector)).toHaveCount(1);
  }
  await expect(pastRow.locator('.item-note')).toHaveText('带备注');
  await expect(pastRow.locator('.item-title')).toHaveText('往期条目');
  await expect(pastRow).toHaveAttribute('data-priority', '2');
  const rowLabels = await pastRow.locator('button').evaluateAll((els) =>
    els.map((el) => `${el.getAttribute('aria-label') ?? ''}${el.className}`)
  );
  expect(rowLabels.some((label) => /删除|垃圾桶|铅笔|trash|pencil/i.test(label))).toBe(false);

  // --- past entry: copy / move to today, edit, delete; no "move to tomorrow" (AC-15 / TC-021)
  await openRowMenu(page, pastRow, 'context');
  expect(await menuLabels(page)).toEqual(['复制到今日', '移动到今日', '编辑', '删除']);
  expect(await menuActions(page)).toEqual(['copy-today', 'move-today', 'edit', 'delete']);
  await expect(page.locator('.ctx-menu .ctx-sep')).toHaveCount(1);
  // visual contract #3: assert the active item instead of eyeballing the faint highlight
  await expect(page.locator('.ctx-menu .ctx-item.active')).toHaveCount(1);
  expect((await page.locator('.ctx-menu .ctx-item.active').innerText()).trim()).toBe('复制到今日');
  expect(
    await page.locator('.ctx-menu').evaluate((el) => el.parentElement?.tagName)
  ).toBe('BODY');

  // --- keyboard navigation: ↓ skips the separator, ↑ returns, Enter runs it (AC-48)
  await page.keyboard.press('Escape');
  await openRowMenu(page, pastRow);
  const activeText = async (): Promise<string> =>
    (await page.locator('.ctx-menu .ctx-item.active').innerText()).trim();
  await page.keyboard.press('ArrowDown');
  expect(await activeText()).toBe('移动到今日');
  await page.keyboard.press('ArrowDown');
  expect(await activeText()).toBe('编辑');
  await page.keyboard.press('ArrowDown');
  expect(await activeText()).toBe('删除');
  await page.keyboard.press('ArrowUp');
  expect(await activeText()).toBe('编辑');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  const editEditor = page.locator('.editor[data-editor-mode="edit"]');
  await expect(editEditor).toBeVisible();
  await expect(editEditor.locator('.editor-title')).toHaveText('编辑待办');
  await editEditor.locator('.editor-cancel').click();
  await expect(page.locator('.editor')).toHaveCount(0);

  // --- closing condition ①: click outside (AC-19 / BR-20)
  await page.locator('.cal-card .month-title').click();
  await expect(page.locator('.ctx-menu')).toHaveCount(0);

  // --- closing condition ②: Escape
  await openRowMenu(page, pastRow);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ctx-menu')).toHaveCount(0);

  // --- closing condition ⑤: page scroll (a real wheel over a scrollable list)
  await openRowMenu(page, pastRow);
  const list = page.locator('.todo-panel .todo-list');
  const listMetrics = await list.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);
  await list.hover();
  await page.mouse.wheel(0, 200);
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await list.evaluate((el) => {
    el.scrollTop = 0;
  });

  // --- today entry: move to tomorrow only (AC-16 / TC-023)
  await page.locator('.today-btn').click();
  const todayRow = rowByTitle(page, '.todo-panel', '今日条目');
  await openRowMenu(page, todayRow);
  expect(await menuLabels(page)).toEqual(['移动明日', '编辑', '删除']);
  expect(await menuActions(page)).toEqual(['move-tomorrow', 'edit', 'delete']);
  await page.keyboard.press('Escape');

  // --- copy to today: content copied, original kept, count +1, today's dot appears (AC-17 / TC-024)
  await selectDate(page, past);
  const beforeCopy = await readTodos(page);
  await openRowMenu(page, rowByTitle(page, '.todo-panel', '往期条目'));
  await page.locator('.ctx-menu .ctx-item[data-action="copy-today"]').click();
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  await expect(panel.locator('.todo-item')).toHaveCount(21);
  const afterCopy = await readTodos(page);
  expect(afterCopy).toHaveLength(beforeCopy.length + 1);
  const copied = afterCopy.find((row) => !beforeCopy.some((old) => old.id === row.id));
  expect(copied).toMatchObject({
    title: '往期条目',
    date: TODAY,
    priority: 2,
    note: '带备注',
    done: false,
  });
  expect(afterCopy.find((row) => row.id === 2)?.date).toBe(past);
  await page.locator('.today-btn').click();
  await expect(page.locator(`.day-cell[data-date="${TODAY}"] .dot`)).toHaveCount(1);
  await expect(panel.locator('.todo-item')).toHaveCount(2);

  // --- move to today / then to tomorrow: date changes, total count unchanged (AC-18 / TC-025)
  await selectDate(page, past);
  const beforeMove = await readTodos(page);
  await openRowMenu(page, rowByTitle(page, '.todo-panel', '填充 1'));
  await page.locator('.ctx-menu .ctx-item[data-action="move-today"]').click();
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  await expect
    .poll(async () => (await readTodos(page)).find((row) => row.id === 3)?.date)
    .toBe(TODAY);
  expect(await readTodos(page)).toHaveLength(beforeMove.length);
  await expect(panel.locator('.todo-item')).toHaveCount(20);

  await page.locator('.today-btn').click();
  await openRowMenu(page, rowByTitle(page, '.todo-panel', '填充 1'));
  expect(await menuLabels(page)).toEqual(['移动明日', '编辑', '删除']);
  await page.locator('.ctx-menu .ctx-item[data-action="move-tomorrow"]').click();
  await expect(page.locator('.ctx-menu')).toHaveCount(0);
  const afterMove = await readTodos(page);
  await expect.poll(async () => (await readTodos(page)).find((row) => row.id === 3)?.date).toBe(D(1));
  expect(afterMove).toHaveLength(beforeMove.length);
  // the calendar dot follows the moved entry (BR-09)
  const tomorrow = D(1);
  if (dayjs(tomorrow).isSame(dayjs(TODAY), 'month')) {
    await expect(page.locator(`.day-cell[data-date="${tomorrow}"] .dot`)).toHaveCount(1);
  } else {
    await page.locator('.month-next').click();
    await expect(page.locator(`.day-cell[data-date="${tomorrow}"] .dot`)).toHaveCount(1);
  }

  // --- flipping at the right edge: menu opens leftwards with an 8px pad (FR-MENU-09 / AC-48)
  await page.locator('.today-btn').click();
  const flipRow = rowByTitle(page, '.todo-panel', '今日条目');
  await flipRow.scrollIntoViewIfNeeded();
  await flipRow.hover();
  const moreBox = (await flipRow.locator('.more-btn').boundingBox())!;
  await flipRow.locator('.more-btn').click();
  await expect(page.locator('.ctx-menu')).toBeVisible();
  const menuRight = (await page.locator('.ctx-menu').boundingBox())!;
  expect(menuRight.x + menuRight.width).toBeLessThanOrEqual(moreBox.x + moreBox.width + 1);
  expect(menuRight.x).toBeGreaterThanOrEqual(8);
  expect(menuRight.x + menuRight.width).toBeLessThanOrEqual(1280 - 8);
  await page.keyboard.press('Escape');

  // --- flipping at the bottom edge: shrink the viewport, click a row in the lower half
  await page.setViewportSize({ width: 1280, height: 420 });
  await selectDate(page, past);
  const bottomList = page.locator('.todo-panel .todo-list');
  await bottomList.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const lastRow = panel.locator('.todo-item').last();
  await lastRow.scrollIntoViewIfNeeded();
  const lastBox = (await lastRow.boundingBox())!;
  const clickY = lastBox.y + lastBox.height / 2;
  expect(clickY).toBeGreaterThan(250);
  await lastRow.click({ button: 'right' });
  await expect(page.locator('.ctx-menu')).toBeVisible();
  const menuBottom = (await page.locator('.ctx-menu').boundingBox())!;
  expect(menuBottom.y + menuBottom.height).toBeLessThanOrEqual(clickY + 1);
  expect(menuBottom.y).toBeGreaterThanOrEqual(8);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });

  // --- editor: empty title disables save, Enter submits, create/edit button wording (AC-47)
  await page.locator('.today-btn').click();
  const beforeCreate = await panel.locator('.todo-item').count();
  await panel.locator('.new-btn').click();
  const editor = page.locator('.editor');
  await expect(editor).toHaveAttribute('data-editor-mode', 'create');
  await expect(editor.locator('.editor-title')).toHaveText('新建待办');
  await expect(editor.locator('footer button')).toHaveText(['取消', '创建']);
  await expect(editor.locator('.editor-save')).toBeDisabled();
  await expect(editor.locator('input[data-field="date"]')).toHaveValue(TODAY);
  await expect(editor.locator('input[data-field="title"]')).toHaveAttribute('maxlength', '100');
  await expect(editor.locator('textarea[data-field="note"]')).toHaveAttribute('maxlength', '500');
  const cardBox = (await editor.locator('.editor-card').boundingBox())!;
  expect(cardBox.width).toBeGreaterThanOrEqual(380);
  expect(cardBox.width).toBeLessThanOrEqual(420);

  const titleInput = editor.locator('input[data-field="title"]');
  await titleInput.fill('   ');
  await expect(editor.locator('.editor-save')).toBeDisabled();
  await titleInput.fill('回车创建的条目');
  await expect(editor.locator('.editor-save')).toBeEnabled();
  await titleInput.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(panel.locator('.todo-item')).toHaveCount(beforeCreate + 1);
  await expect(rowByTitle(page, '.todo-panel', '回车创建的条目')).toBeVisible();

  // edit mode: fields pre-filled, wording is 保存修改
  await rowByTitle(page, '.todo-panel', '回车创建的条目').locator('.item-body').click();
  await expect(editor).toHaveAttribute('data-editor-mode', 'edit');
  await expect(editor.locator('.editor-title')).toHaveText('编辑待办');
  await expect(editor.locator('footer button')).toHaveText(['取消', '保存修改']);
  await expect(editor.locator('input[data-field="title"]')).toHaveValue('回车创建的条目');
  await editor.locator('input[data-field="title"]').fill('回车创建并改名');
  await editor.locator('.editor-save').click();
  await expect(editor).toHaveCount(0);
  await expect(rowByTitle(page, '.todo-panel', '回车创建并改名')).toBeVisible();

  // cancel keeps the list unchanged
  const beforeCancel = await panel.locator('.todo-item').count();
  await panel.locator('.new-btn').click();
  await editor.locator('input[data-field="title"]').fill('不应被保存');
  await editor.locator('.editor-cancel').click();
  await expect(editor).toHaveCount(0);
  await expect(panel.locator('.todo-item')).toHaveCount(beforeCancel);
  await expect(page.locator('.todo-panel')).not.toContainText('不应被保存');
});
