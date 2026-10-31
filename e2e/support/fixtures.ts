/**
 * Shared helpers for the Playwright E2E suite (S5 / T-14).
 *
 * Conventions:
 * - every date is derived from `RUN_START`, never a literal (BR-19 / AC-04);
 * - the browser clock is pinned to `RUN_START` in each spec's `beforeEach`,
 *   so the node-side expectations and the app's `dayjs()` agree;
 * - fixtures are written through the fixed localStorage keys only
 *   (`todo_local_db` / `todo_local_daily_db`), never through `todo.db` (BR-14).
 */
import { expect, type Page } from '@playwright/test';
import dayjs from 'dayjs';
import { METHODS } from '../../src/data/methods';

/** Run start, overridable with `E2E_NOW=YYYY-MM-DD` to prove date independence. */
export const RUN_START = process.env.E2E_NOW ? dayjs(process.env.E2E_NOW) : dayjs();

export const TODAY = RUN_START.format('YYYY-MM-DD');

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** `D(0)` = today, `D(-3)` = three days ago, … */
export const D = (offset = 0): string => RUN_START.add(offset, 'day').format('YYYY-MM-DD');

/** Day panel title: `M月D日 周X` (FR-DAY-01). */
export const dayTitleOf = (date: string): string =>
  `${dayjs(date).format('M月D日')} 周${WEEK_CN[dayjs(date).day()]}`;

/** Calendar title: `YYYY年M月` (FR-CAL-05). */
export const monthTitleOf = (date: string): string => dayjs(date).format('YYYY年M月');

/** All-todos group title: `YYYY年M月D日 周X`，今天追加 ` · 今天` (FR-ALL-03). */
export const groupTitleOf = (date: string): string =>
  `${dayjs(date).format('YYYY年M月D日')} 周${WEEK_CN[dayjs(date).day()]}` +
  (date === TODAY ? ' · 今天' : '');

/* ------------------------------------------------------------------ fixtures */

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

/** Fixed timestamp for fixtures; built at runtime so `e2e/` holds no literal date (TC-007). */
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

/**
 * Seed the browser database once per context (survives reloads until the test
 * explicitly clears it, which the empty-state assertion relies on).
 */
export async function seedDatabase(page: Page, todos: SeedTodo[]): Promise<void> {
  await page.addInitScript((rows: SeedTodo[]) => {
    if (sessionStorage.getItem('__e2e_seeded') === '1') return;
    sessionStorage.setItem('__e2e_seeded', '1');
    localStorage.setItem('todo_local_db', JSON.stringify(rows));
    localStorage.setItem(
      'todo_local_db_seq',
      String(rows.reduce((max, row) => Math.max(max, row.id), 0))
    );
    localStorage.setItem('todo_local_daily_db', JSON.stringify([]));
  }, todos);
}

export const readTodos = (page: Page): Promise<SeedTodo[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('todo_local_db') ?? '[]'));

interface DailyPickRow {
  date: string;
  method_id: string;
  manual: boolean;
  updated_at: number;
}

export const readPicks = (page: Page): Promise<DailyPickRow[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('todo_local_daily_db') ?? '[]'));

/* --------------------------------------------------- reference push algorithm */

/**
 * Independent reference implementation of PRD appendix A (same code as
 * `scripts/check-permutation.mjs`); the app's own `permutationFor` is never
 * imported, so a bug there cannot make the expectation agree with itself.
 */
const refHashCode = (input: string): number => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const refMulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Content library ids in library order — the input sequence of the algorithm. */
const METHOD_IDS: string[] = METHODS.map((method) => method.id);

export const referenceOrder = (date: string): string[] => {
  const out = [...METHOD_IDS];
  const rand = refMulberry32(refHashCode(date));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const methodName = (id: string): string =>
  METHODS.find((method) => method.id === id)?.name ?? `missing:${id}`;

/* ----------------------------------------------------------------- UI helpers */

/** Open the app and wait until the shell has finished loading its stores. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.cal-card')).toBeVisible();
}

/** Month currently rendered by the calendar, derived from the title. */
export async function viewMonth(page: Page) {
  const title = await page.locator('.cal-card .month-title').innerText();
  return dayjs(`${title.replace('年', '-').replace('月', '')}-01`);
}

/**
 * Select a calendar day by exact `data-date`.
 *
 * The 42-cell grid only contains the target when its month is displayed, so
 * the view is stepped first. Required because a grid that starts on the 1st
 * (e.g. a month beginning on Sunday) has no filler cells of the previous month.
 */
export async function selectDate(page: Page, date: string): Promise<void> {
  const cell = page.locator(`.day-cell[data-date="${date}"]`);
  let steps = dayjs(date).startOf('month').diff((await viewMonth(page)).startOf('month'), 'month');
  while (steps !== 0) {
    await page.locator(steps > 0 ? '.month-next' : '.month-prev').click();
    steps += steps > 0 ? -1 : 1;
  }
  await expect(page.locator('.cal-card .month-title')).toHaveText(monthTitleOf(date));
  await expect(cell).toHaveCount(1);
  await cell.click();
  await expect(page.locator('.todo-panel .day-title')).toHaveText(dayTitleOf(date));
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Row locator by exact title (anchored so "填充 1" never matches "填充 10"). */
export const rowByTitle = (page: Page, container: string, title: string) =>
  page.locator(`${container} .todo-item`).filter({
    has: page.locator('.item-title', { hasText: new RegExp(`^${escapeRegExp(title)}$`) }),
  });

/**
 * Create one todo through the editor UI: the given priority is clicked, the
 * date comes from the currently selected day (FR-EDT-06).
 */
export async function createTodoViaUi(
  page: Page,
  todo: { title: string; priority: 0 | 1 | 2; note?: string }
): Promise<void> {
  const editor = page.locator('.editor');
  await page.locator('.todo-panel .new-btn').click();
  await expect(editor).toBeVisible();
  await editor.locator('input[data-field="title"]').fill(todo.title);
  await editor.locator(`.priority-option[data-priority="${todo.priority}"]`).click();
  if (todo.note) await editor.locator('textarea[data-field="note"]').fill(todo.note);
  await editor.locator('.editor-save').click();
  await expect(editor).toHaveCount(0);
}

/** Open the row context menu by its `⋯` button (or a real right click). */
export async function openRowMenu(
  page: Page,
  row: ReturnType<typeof rowByTitle>,
  via: 'more' | 'context' = 'more'
): Promise<void> {
  await row.scrollIntoViewIfNeeded();
  if (via === 'more') {
    await row.hover();
    await row.locator('.more-btn').click();
  } else {
    await row.click({ button: 'right' });
  }
  await expect(page.locator('.ctx-menu')).toBeVisible();
}

export const menuLabels = (page: Page) =>
  page.locator('.ctx-menu .ctx-item').allInnerTexts().then((items) => items.map((s) => s.trim()));

export const menuActions = (page: Page) =>
  page.locator('.ctx-menu .ctx-item').evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.action ?? '')
  );
