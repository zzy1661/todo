/**
 * S4 阶段验收自证脚本（全部待办 / 待办条目与右键菜单 / 编辑器，T-11 ~ T-13）。
 *
 * 这不是 E2E 套件（S5 / T-14 才建 `e2e/` + `playwright.config.ts`），
 * 只是本阶段的真实浏览器验证：直接驱动运行中的开发服务器，用真实点击、真实右键
 * 与真实 localStorage 断言 FR-ALL / FR-ITEM / FR-MENU / FR-EDT 的可观察结果，
 * 截图落 `docs/evidence/s4/`。
 *
 * 覆盖：跨日期分组与 ` · 今天`（AC-31）、组内 `已完成/总数`、三页签筛选、
 * 与当日面板筛选互相独立（AC-33）、行内四元素（AC-12）、菜单按日期分支（AC-15 / AC-16）、
 * 复制到今日（AC-17）、移动到今日 / 移动明日（AC-18）、五种关闭条件（AC-19 / BR-20）、
 * 贴边翻转（FR-MENU-09）、粘贴板防裁切（FR-MENU-10）、编辑器两种模式与空标题禁用保存（AC-47）。
 *
 * 用法：
 *   npm run dev            # 另开一个终端
 *   node scripts/check-s4-ui.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import dayjs from 'dayjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:1420';
const OUT = 'docs/evidence/s4';
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
/** WebView 内容区按设计 §6.2：1100×720 窗口的内容区 ≈ 1100×692 */
const VIEW = { width: 1100, height: 692 };

const today = dayjs().format('YYYY-MM-DD');
const DATE = (offset) => dayjs().add(offset, 'day').format('YYYY-MM-DD');
const WEEK_OF = (date) => `周${WEEK_CN[dayjs(date).day()]}`;
/** 组标题口径：`YYYY年M月D日 周X`，今天追加 ` · 今天`（FR-ALL-03） */
const groupTitle = (date) =>
  `${dayjs(date).format('YYYY年M月D日')} ${WEEK_OF(date)}${date === today ? ' · 今天' : ''}`;

const failures = [];
let passed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` → ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` → ${detail}` : ''}`);
  }
}

const text = async (locator) => (await locator.innerText()).trim();
const texts = async (locator) => (await locator.allInnerTexts()).map((s) => s.trim());

/* ---------------------------------------------------------------- 夹具（BR-14：只写 localStorage） */

const STAMP = '2026-01-01 09:00:00';
const todo = (id, title, date, priority, done, note = '') => ({
  id,
  title,
  date,
  priority,
  note,
  done,
  created_at: STAMP,
  updated_at: STAMP,
});

/** -2 天 5 条（2 条完成）· 昨天 1 条 · 今天 2 条（1 条完成）· 明天 12 条（1 条完成） */
const FIXTURE = [
  todo(1, '复盘上周目标', DATE(-2), 2, true),
  todo(2, '整理会议纪要', DATE(-2), 1, true),
  todo(3, '归档设计稿', DATE(-2), 0, false),
  todo(4, '清理下载目录', DATE(-2), 1, false),
  todo(5, '补充周报数据', DATE(-2), 0, false),
  todo(6, '整理昨日复盘', DATE(-1), 0, false, '带备注的条目'),
  todo(7, '写 S4 验收脚本', DATE(0), 1, false),
  todo(8, '校对全部待办分组', DATE(0), 1, true),
  ...Array.from({ length: 12 }, (_, i) =>
    todo(9 + i, `明日安排 ${i + 1}`, DATE(1), i % 3, i === 0)
  ),
];

const FIXTURE_TOTAL = FIXTURE.length; // 20
const FIXTURE_DONE = FIXTURE.filter((t) => t.done).length; // 4

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

const readTodos = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('todo_local_db') ?? '[]'));

await page.goto(BASE);
await page.evaluate((rows) => {
  localStorage.clear();
  localStorage.setItem('todo_local_db', JSON.stringify(rows));
  localStorage.setItem('todo_local_db_seq', JSON.stringify(rows.length));
}, FIXTURE);
await page.reload();
await page.waitForSelector('.day-cell[data-date]');

/* ---------------------------------------------------------------- 1. 全部待办：分组与统计 */

console.log('\n[1] 全部待办：跨日期分组 / ` · 今天` / 组内统计（FR-ALL-01 ~ 05 / AC-31）');

await page.click('.nav-item[data-nav-id="todos"]');
await page.waitForSelector('.all-view .group');
check('切换到全部待办模块', (await page.getAttribute('main', 'data-module')) === 'todos');
check('页标题为「全部待办」', (await text(page.locator('.all-title'))) === '全部待办');

const groups = page.locator('.all-view .group');
check('按日期分为 4 组', (await groups.count()) === 4, `实际 ${await groups.count()}`);

const groupDates = await groups.evaluateAll((els) => els.map((el) => el.dataset.groupDate));
check(
  '组之间日期升序',
  groupDates.join('|') === [DATE(-2), DATE(-1), DATE(0), DATE(1)].join('|'),
  groupDates.join('|')
);

const groupOf = (date) => page.locator(`.all-view .group[data-group-date="${date}"]`);
check(
  '今天组标题以「 · 今天」结尾',
  (await text(groupOf(today).locator('.group-title'))) === `${groupTitle(today)}`,
  await text(groupOf(today).locator('.group-title'))
);
check(
  '今天组标题格式为 `YYYY年M月D日 周X · 今天`',
  /^\d{4}年\d{1,2}月\d{1,2}日 周[日一二三四五六] · 今天$/.test(
    await text(groupOf(today).locator('.group-title'))
  )
);
check(
  '非今天组标题不带「 · 今天」',
  !(await text(groupOf(DATE(-1)).locator('.group-title'))).includes('今天'),
  await text(groupOf(DATE(-1)).locator('.group-title'))
);
check(
  '非今天组标题逐字为 `YYYY年M月D日 周X`',
  (await text(groupOf(DATE(-1)).locator('.group-title'))) === groupTitle(DATE(-1))
);

const groupCounts = {};
for (const date of [DATE(-2), DATE(-1), DATE(0), DATE(1)]) {
  groupCounts[date] = await text(groupOf(date).locator('.group-count'));
}
check('今天组统计为 1/2', groupCounts[today] === '1/2', groupCounts[today]);
check('昨天组统计为 0/1', groupCounts[DATE(-1)] === '0/1', groupCounts[DATE(-1)]);
check('前日组统计为 2/5', groupCounts[DATE(-2)] === '2/5', groupCounts[DATE(-2)]);
check('明天组统计为 1/12', groupCounts[DATE(1)] === '1/12', groupCounts[DATE(1)]);

const stats = await text(page.locator('.all-view .panel-stats'));
check('统计行含 共 20 项', stats.includes(`共 ${FIXTURE_TOTAL} 项`), stats);
check('统计行含 已完成 4 项', stats.includes(`已完成 ${FIXTURE_DONE} 项`), stats);
check('统计行含 完成率 20%', stats.includes('完成率 20%'), stats);
check(
  '全部待办条目总数 20',
  (await page.locator('.all-view .todo-item').count()) === FIXTURE_TOTAL,
  `${await page.locator('.all-view .todo-item').count()}`
);

// 组内排序：priority DESC → id DESC（BR-02 / FR-ALL-05）
check(
  '今天组内：同优先级下新建者在前',
  (await texts(groupOf(today).locator('.item-title'))).join('|') ===
    '校对全部待办分组|写 S4 验收脚本',
  (await texts(groupOf(today).locator('.item-title'))).join('|')
);
check(
  '前日组内：高优先级在前、同优先级新建者在前',
  (await texts(groupOf(DATE(-2)).locator('.item-title'))).join('|') ===
    '复盘上周目标|清理下载目录|整理会议纪要|补充周报数据|归档设计稿',
  (await texts(groupOf(DATE(-2)).locator('.item-title'))).join('|')
);

await page.screenshot({ path: `${OUT}/01-all-view-groups.png` });

/* ---------------------------------------------------------------- 2. 条目行内元素 */

console.log('\n[2] 条目行内四元素与 `⋯` 淡入（FR-ITEM-01 / 05 / AC-12）');

const rowToday = page.locator(`.all-view .todo-item[data-todo-id="7"]`);
const rowButtons = await rowToday.evaluate((el) =>
  [...el.querySelectorAll('button')].map((b) => b.className.split(' ')[0]).sort()
);
check(
  '行内按钮只有 check / item-body / priority-tag / more-btn',
  rowButtons.join(',') === 'check,item-body,more-btn,priority-tag',
  rowButtons.join(',')
);
check('行内无铅笔 / 垃圾桶按钮', !(await rowToday.innerHTML()).includes('trash'));
check('行首为完成圆圈', (await rowToday.locator('.check').count()) === 1);
check('标题区含备注时展示备注', (await page.locator('.all-view .todo-item[data-todo-id="6"] .item-note').count()) === 1);

const moreOpacityBefore = await rowToday
  .locator('.more-btn')
  .evaluate((el) => getComputedStyle(el).opacity);
await rowToday.hover();
await page.waitForTimeout(220);
const moreOpacityAfter = await rowToday
  .locator('.more-btn')
  .evaluate((el) => getComputedStyle(el).opacity);
check('`⋯` 默认透明', moreOpacityBefore === '0', moreOpacityBefore);
check('悬停后 `⋯` 淡入', moreOpacityAfter === '1', moreOpacityAfter);
check('条目带 data-done / data-priority', (await rowToday.getAttribute('data-done')) === 'false');
check('已完成条目标记 data-done=true', (await page.locator('.all-view .todo-item[data-todo-id="8"]').getAttribute('data-done')) === 'true');

await page.screenshot({ path: `${OUT}/02-item-row.png`, clip: await rowToday.boundingBox() });

/* ---------------------------------------------------------------- 3. 筛选与状态互不污染 */

console.log('\n[3] 三页签筛选 / 与当日面板互相独立（FR-ALL-02 / AC-32 / AC-33 / BR-21）');

const allTab = page.locator('.all-view .filter-tab[data-filter="done"]');
check('筛选页签文案为 全部 / 未完成 / 已完成', (await texts(page.locator('.all-view .filter-tab'))).join('|') === '全部|未完成|已完成');

await allTab.click();
await page.waitForFunction(
  () => document.querySelectorAll('.all-view .group').length === 3
);
check('筛「已完成」只剩有已完成条目的 3 组', (await page.locator('.all-view .group').count()) === 3);
check('筛「已完成」只剩 4 条', (await page.locator('.all-view .todo-item').count()) === FIXTURE_DONE);
check('筛「已完成」今天组仍在', (await groupOf(today).count()) === 1);
check('筛选后组内统计分母不变（仍为 1/2）', (await text(groupOf(today).locator('.group-count'))) === '1/2');
check(
  '筛选不改变统计分母（仍为 共 20 项 / 完成率 20%）',
  (await text(page.locator('.all-view .panel-stats'))).includes('共 20 项') &&
    (await text(page.locator('.all-view .panel-stats'))).includes('完成率 20%')
);
check('页签选中态跟随', (await text(page.locator('.all-view .filter-tab.active'))) === '已完成');
await page.screenshot({ path: `${OUT}/03-all-view-filter-done.png` });

// 当日面板此刻仍是「全部」
await page.click('.nav-item[data-nav-id="calendar"]');
await page.waitForSelector('.todo-panel');
check(
  '切到日历后当日面板筛选仍为「全部」（未被全部待办影响）',
  (await text(page.locator('.todo-panel .filter-tab.active'))) === '全部',
  await text(page.locator('.todo-panel .filter-tab.active'))
);

await page.locator('.todo-panel .filter-tab[data-filter="active"]').click();
await page.waitForFunction(
  () => document.querySelector('.todo-panel .filter-tab.active')?.textContent?.trim() === '未完成'
);
await page.click('.nav-item[data-nav-id="todos"]');
await page.waitForSelector('.all-view .group');
check(
  '切回全部待办后仍是「已完成」（未被当日面板影响）',
  (await text(page.locator('.all-view .filter-tab.active'))) === '已完成',
  await text(page.locator('.all-view .filter-tab.active'))
);
await page.screenshot({ path: `${OUT}/04-filter-independent-all.png` });

await page.click('.nav-item[data-nav-id="calendar"]');
check(
  '再切回日历后当日面板仍为「未完成」',
  (await text(page.locator('.todo-panel .filter-tab.active'))) === '未完成'
);
await page.screenshot({ path: `${OUT}/05-filter-independent-day.png` });

// 复原：两个视图各自回到「全部」
await page.locator('.todo-panel .filter-tab[data-filter="all"]').click();
await page.click('.nav-item[data-nav-id="todos"]');
await page.locator('.all-view .filter-tab[data-filter="all"]').click();
await page.waitForFunction(() => document.querySelectorAll('.all-view .group').length === 4);

/* ---------------------------------------------------------------- 4. 菜单按日期分支 */

console.log('\n[4] 右键菜单按日期分支，不出现自操作项（FR-MENU-01 ~ 05 / AC-15 / AC-16 / BR-11）');

/** 打开菜单并返回菜单项文案与 data-action */
async function openMenu(itemId, via = 'more') {
  const row = page.locator(`.all-view .todo-item[data-todo-id="${itemId}"]`);
  await row.scrollIntoViewIfNeeded();
  if (via === 'more') {
    await row.hover();
    await row.locator('.more-btn').click();
  } else {
    await row.click({ button: 'right' });
  }
  await page.waitForSelector('.ctx-menu');
  return {
    labels: await texts(page.locator('.ctx-menu .ctx-item')),
    actions: await page.locator('.ctx-menu .ctx-item').evaluateAll((els) =>
      els.map((el) => el.dataset.action)
    ),
  };
}

const todayMenu = await openMenu(7, 'more');
check(
  '今日条目菜单为 移动明日 / 编辑 / 删除',
  todayMenu.labels.join('|') === '移动明日|编辑|删除',
  todayMenu.labels.join('|')
);
check(
  '今日条目菜单不出现「复制到今日」「移动到今日」',
  !todayMenu.actions.includes('copy-today') && !todayMenu.actions.includes('move-today')
);
check(
  '菜单项带 data-action',
  todayMenu.actions.join('|') === 'move-tomorrow|edit|delete',
  todayMenu.actions.join('|')
);
check('菜单首项高亮（FR-MENU-07）', (await text(page.locator('.ctx-menu .ctx-item.active'))) === '移动明日');
check(
  '菜单 Teleport 到 body，不被列表裁切（FR-MENU-10）',
  (await page.locator('.ctx-menu').evaluate((el) => el.parentElement?.tagName)) === 'BODY'
);
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/06-menu-today.png` });
await page.keyboard.press('Escape');
await page.waitForSelector('.ctx-menu', { state: 'detached' });

const pastMenu = await openMenu(6, 'right');
check(
  '非今日条目菜单为 复制到今日 / 移动到今日 / 编辑 / 删除',
  pastMenu.labels.join('|') === '复制到今日|移动到今日|编辑|删除',
  pastMenu.labels.join('|')
);
check(
  '非今日条目菜单不出现「移动明日」',
  !pastMenu.actions.includes('move-tomorrow'),
  pastMenu.actions.join('|')
);
check('非今日条目菜单首项高亮', (await text(page.locator('.ctx-menu .ctx-item.active'))) === '复制到今日');
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/07-menu-past.png` });

/* ---------------------------------------------------------------- 5. 复制到今日 / 移动到今日 / 移动明日 */

console.log('\n[5] 复制到今日 / 移动到今日 / 移动明日（FR-MENU-02 / 03 / AC-17 / AC-18）');

const beforeCopy = await readTodos();
await page.locator('.ctx-menu .ctx-item[data-action="copy-today"]').click();
await page.waitForSelector('.ctx-menu', { state: 'detached' });
await page.waitForFunction(
  (n) => document.querySelectorAll('.all-view .todo-item').length === n,
  FIXTURE_TOTAL + 1
);

const afterCopy = await readTodos();
check('复制后总条数 +1', afterCopy.length === beforeCopy.length + 1, `${beforeCopy.length} → ${afterCopy.length}`);
const copied = afterCopy.find((t) => !beforeCopy.some((b) => b.id === t.id));
check('复制出的条目标题为「整理昨日复盘」', copied?.title === '整理昨日复盘', copied?.title);
check('复制出的条目日期为今天', copied?.date === today, copied?.date);
check('复制出的条目完成态为未完成', copied?.done === false);
check('复制出的条目优先级与备注一致', copied?.priority === 0 && copied?.note === '带备注的条目');
check('原条目仍在昨天', afterCopy.find((t) => t.id === 6)?.date === DATE(-1));
check('今天组统计变为 1/3', (await text(groupOf(today).locator('.group-count'))) === '1/3');

// 移动到今日：原条目日期改写、总条数不变
const beforeMove = await readTodos();
const moveMenu = await openMenu(6, 'right');
check('移动前菜单仍为往期分支', moveMenu.labels[0] === '复制到今日');
await page.locator('.ctx-menu .ctx-item[data-action="move-today"]').click();
await page.waitForSelector('.ctx-menu', { state: 'detached' });
await page.waitForFunction(
  (date) =>
    JSON.parse(localStorage.getItem('todo_local_db') ?? '[]').find((t) => t.id === 6)?.date === date,
  today
);
const afterMove = await readTodos();
check('移动后总条数不变', afterMove.length === beforeMove.length);
check('移动到今日后原条目仍在库中', afterMove.some((t) => t.id === 6));
check('移动后昨天的组消失', (await groupOf(DATE(-1)).count()) === 0);

// 移动明日：同一原条目（现在在今天的组里）再移动
const tomorrowMenu = await openMenu(6, 'more');
check('移动到今日后菜单切到今日分支', tomorrowMenu.labels.join('|') === '移动明日|编辑|删除');
await page.locator('.ctx-menu .ctx-item[data-action="move-tomorrow"]').click();
await page.waitForSelector('.ctx-menu', { state: 'detached' });
await page.waitForFunction(
  (date) =>
    JSON.parse(localStorage.getItem('todo_local_db') ?? '[]').find((t) => t.id === 6)?.date === date,
  DATE(1)
);
const afterTomorrow = await readTodos();
check('移动到明日总条数不变', afterTomorrow.length === afterMove.length);
check('移动到明日日期为明天', afterTomorrow.find((t) => t.id === 6)?.date === DATE(1));
check('移动到明日不改完成态', afterTomorrow.find((t) => t.id === 6)?.done === false);
check('明天组统计变为 1/13', (await text(groupOf(DATE(1)).locator('.group-count'))) === '1/13', await text(groupOf(DATE(1)).locator('.group-count')));

/* ---------------------------------------------------------------- 6. 五种关闭条件 */

console.log('\n[6] 五种关闭条件（FR-MENU-08 / AC-19 / BR-20）');

async function menuCount() {
  return page.locator('.ctx-menu').count();
}

// ① 点击菜单外
await openMenu(7, 'more');
await page.locator('.all-title').click();
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('① 点击菜单外关闭', (await menuCount()) === 0);

// ② Esc
await openMenu(7, 'more');
await page.keyboard.press('Escape');
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('② Esc 关闭', (await menuCount()) === 0);

// ③ 窗口失焦
await openMenu(7, 'more');
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('③ 窗口失焦关闭', (await menuCount()) === 0);

// ④ 窗口尺寸变化
await openMenu(7, 'more');
await page.setViewportSize({ width: 1040, height: 680 });
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('④ 窗口尺寸变化关闭', (await menuCount()) === 0);
await page.setViewportSize(VIEW);

// ⑤ 页面滚动
const listScroll = await page.locator('.all-list').evaluate((el) => ({
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
}));
check('全部待办列表可滚动（滚动关闭条件可复现）', listScroll.scrollHeight > listScroll.clientHeight, JSON.stringify(listScroll));
await openMenu(7, 'more');
await page.locator('.all-list').hover();
await page.mouse.wheel(0, 160);
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('⑤ 页面滚动关闭', (await menuCount()) === 0);
check(
  '⑤ 列表确实发生了滚动',
  (await page.locator('.all-list').evaluate((el) => el.scrollTop)) > 0
);

/* ---------------------------------------------------------------- 7. 贴边翻转 + 键盘导航 */

console.log('\n[7] 贴边翻转 pad 8 / 键盘导航（FR-MENU-06 / 09 / AC-48）');

await page.locator('.all-list').evaluate((el) => {
  el.scrollTop = 0;
});

// 贴右：`⋯` 在列表右缘，菜单向左展开
const flipRow = page.locator('.all-view .todo-item[data-todo-id="7"]');
await flipRow.scrollIntoViewIfNeeded();
const moreBox = await flipRow.locator('.more-btn').boundingBox();
await flipRow.hover();
await flipRow.locator('.more-btn').click();
await page.waitForSelector('.ctx-menu');
await page.waitForTimeout(160);
const menuRight = await page.locator('.ctx-menu').boundingBox();
check(
  '贴右自动向左翻转',
  (menuRight?.x ?? 0) + (menuRight?.width ?? 0) <= (moreBox?.x ?? 0) + (moreBox?.width ?? 0) + 1,
  `menu right=${(menuRight?.x ?? 0) + (menuRight?.width ?? 0)} more right=${(moreBox?.x ?? 0) + (moreBox?.width ?? 0)}`
);
check('翻转后仍留 8px 安全边距', (menuRight?.x ?? 0) >= 8 && (menuRight?.x ?? 0) + (menuRight?.width ?? 0) <= VIEW.width - 8);
check(
  '翻转后不越出视口',
  (menuRight?.y ?? 0) >= 0 && (menuRight?.y ?? 0) + (menuRight?.height ?? 0) <= VIEW.height
);
await page.screenshot({ path: `${OUT}/08-menu-flip-right.png` });

// 键盘：↓ 跳过分隔线、↑ 回退、Enter 执行
await page.keyboard.press('ArrowDown');
const afterDown = await text(page.locator('.ctx-menu .ctx-item.active'));
await page.keyboard.press('ArrowDown');
const afterDown2 = await text(page.locator('.ctx-menu .ctx-item.active'));
await page.keyboard.press('ArrowUp');
const afterUp = await text(page.locator('.ctx-menu .ctx-item.active'));
check('↓ 从首项移到下一可选项（跳过分隔线）', afterDown === '编辑', afterDown);
check('↓ 继续移到「删除」', afterDown2 === '删除', afterDown2);
check('↑ 回到「编辑」', afterUp === '编辑', afterUp);
await page.keyboard.press('Escape');
await page.waitForSelector('.ctx-menu', { state: 'detached' });

// Enter 执行当前高亮项：在「写 S4 验收脚本」上按 Enter = 打开编辑器
await openMenu(7, 'more');
await page.keyboard.press('ArrowDown'); // → 编辑
await page.keyboard.press('Enter');
await page.waitForSelector('.editor');
check('Enter 执行高亮项（编辑）', (await text(page.locator('.editor-title'))) === '编辑待办');
check('菜单随执行关闭', (await menuCount()) === 0);
await page.click('.editor-cancel');
await page.waitForSelector('.editor', { state: 'detached' });

// 贴底：把视口压矮，让条目落在下半屏，菜单向上展开
await page.setViewportSize({ width: 1100, height: 420 });
const bottomRow = page.locator('.all-view .group').last().locator('.todo-item').last();
await bottomRow.scrollIntoViewIfNeeded();
const bottomBox = await bottomRow.boundingBox();
await bottomRow.click({ button: 'right' });
await page.waitForSelector('.ctx-menu');
await page.waitForTimeout(160);
const menuBottom = await page.locator('.ctx-menu').boundingBox();
const clickY = (bottomBox?.y ?? 0) + (bottomBox?.height ?? 0) / 2;
check('触发点位于视口下半部', clickY > 210, `${clickY}`);
check(
  '贴底自动向上翻转',
  (menuBottom?.y ?? 0) + (menuBottom?.height ?? 0) <= clickY + 1,
  `menu bottom=${(menuBottom?.y ?? 0) + (menuBottom?.height ?? 0)} clickY=${clickY}`
);
check('上翻后仍留 8px 安全边距', (menuBottom?.y ?? 0) >= 8);
await page.screenshot({ path: `${OUT}/09-menu-flip-bottom.png` });
await page.keyboard.press('Escape');
await page.setViewportSize(VIEW);
await page.waitForTimeout(120);

/* ---------------------------------------------------------------- 8. 编辑器 */

console.log('\n[8] 编辑器：两种模式 / 空标题禁用 / 回车提交 / 回填 / 联动（FR-EDT-01 ~ 09 / AC-47）');

await page.click('.nav-item[data-nav-id="calendar"]');
await page.waitForSelector('.todo-panel');
const dayCountBefore = await page.locator('.todo-panel .todo-item').count();

await page.click('.new-btn');
await page.waitForSelector('.editor');
check('新建态 data-editor-mode=create', (await page.getAttribute('.editor', 'data-editor-mode')) === 'create');
check('新建态按钮文案为 取消 / 创建', (await texts(page.locator('.editor footer button'))).join('|') === '取消|创建');
check('标题为空时保存按钮禁用', await page.locator('.editor-save').isDisabled());
await page.screenshot({ path: `${OUT}/10-editor-create-empty.png` });

const cardBox = await page.locator('.editor-card').boundingBox();
check(
  '卡片宽度约 400px',
  (cardBox?.width ?? 0) >= 380 && (cardBox?.width ?? 0) <= 420,
  `${cardBox?.width}`
);
check(
  '卡片水平居中',
  Math.abs((cardBox?.x ?? 0) + (cardBox?.width ?? 0) / 2 - VIEW.width / 2) <= 2,
  `${(cardBox?.x ?? 0) + (cardBox?.width ?? 0) / 2}`
);
const blurStyle = await page.locator('.editor').evaluate((el) => {
  const s = getComputedStyle(el);
  return { standard: s.backdropFilter || s.getPropertyValue('backdrop-filter') };
});
check('遮罩带 backdrop-filter 模糊', (blurStyle.standard ?? 'none').includes('blur'), JSON.stringify(blurStyle));

/**
 * `-webkit-backdrop-filter` 在 Chromium 里既进不了计算样式、也进不了 CSSOM
 * （浏览器只保留自己认识的声明），因此这条 macOS 兼容契约只能对样式源码断言。
 * 断言对象是「作者原文」，不是渲染结果——渲染结果由上面那条计算样式负责。
 */
const blurBlock =
  readFileSync('src/styles/main.css', 'utf8').match(/\.backdrop-blur\s*\{([^}]*)\}/)?.[1] ?? '';
check(
  '遮罩同时写 -webkit- 前缀（Safari 17）',
  /backdrop-filter:\s*blur/.test(blurBlock) && /-webkit-backdrop-filter:\s*blur/.test(blurBlock),
  blurBlock.trim() || '(main.css 中找不到 .backdrop-blur)'
);
check('标题上限 100 字（BR-16）', (await page.getAttribute('.editor input[type="text"]', 'maxlength')) === '100');
check('备注上限 500 字（BR-16）', (await page.getAttribute('.editor textarea', 'maxlength')) === '500');
check('日期字段默认取传入日期（今天）', (await page.inputValue('.editor input[type="date"]')) === today);
check('优先级默认「中」', (await text(page.locator('.priority-option.active'))) === '中');

await page.fill('.editor input[type="text"]', 'S4 编辑器新建');
check('输入标题后保存按钮可用', !(await page.locator('.editor-save').isDisabled()));
await page.press('.editor input[type="text"]', 'Enter');
await page.waitForSelector('.editor', { state: 'detached' });
await page.waitForFunction(
  (n) => document.querySelectorAll('.todo-panel .todo-item').length === n,
  dayCountBefore + 1
);
check('标题框回车即保存', (await page.locator('.todo-panel .todo-item').count()) === dayCountBefore + 1);
check('保存后当日统计立刻更新', (await text(page.locator('.todo-panel .panel-stats'))).includes('共 4 项'));

// 编辑态：点标题区打开、回填、改日期后全部分组同步
await page.click('.nav-item[data-nav-id="todos"]');
await page.waitForSelector('.all-view .group');
const editRow = page.locator('.all-view .todo-item[data-todo-id="6"]');
await editRow.scrollIntoViewIfNeeded();
await editRow.locator('.item-body').click();
await page.waitForSelector('.editor');
check('编辑态 data-editor-mode=edit', (await page.getAttribute('.editor', 'data-editor-mode')) === 'edit');
check('编辑态按钮文案为 取消 / 保存修改', (await texts(page.locator('.editor footer button'))).join('|') === '取消|保存修改');
check('编辑态回填标题', (await page.inputValue('.editor input[type="text"]')) === '整理昨日复盘');
check('编辑态回填日期', (await page.inputValue('.editor input[type="date"]')) === DATE(1));
check('编辑态回填优先级（低）', (await text(page.locator('.priority-option.active'))) === '低');
check('编辑态回填备注', (await page.inputValue('.editor textarea')) === '带备注的条目');
check('编辑态标题非空时保存可用', !(await page.locator('.editor-save').isDisabled()));
await page.screenshot({ path: `${OUT}/11-editor-edit.png` });

await page.fill('.editor input[type="text"]', '整理昨日复盘（已改日期）');
await page.fill('.editor input[type="date"]', DATE(3));
const lengthBeforeEdit = (await readTodos()).length;
await page.click('.editor-save');
await page.waitForSelector('.editor', { state: 'detached' });
await page.waitForSelector(`.all-view .group[data-group-date="${DATE(3)}"]`);
const afterEdit = await readTodos();
check('保存修改后标题落库', afterEdit.find((t) => t.id === 6)?.title === '整理昨日复盘（已改日期）');
check('保存修改后日期落库', afterEdit.find((t) => t.id === 6)?.date === DATE(3));
check('改日期后新分组出现', (await groupOf(DATE(3)).count()) === 1);
check('改日期后原分组少一条', (await text(groupOf(DATE(1)).locator('.group-count'))) === '1/12');
check('改日期后总条数不变', afterEdit.length === lengthBeforeEdit, `${afterEdit.length} vs ${lengthBeforeEdit}`);

/* ---------------------------------------------------------------- 9. 空态 */

console.log('\n[9] 空态（ES-03）');

await page.evaluate(() => {
  localStorage.setItem('todo_local_db', JSON.stringify([]));
});
await page.reload();
await page.waitForSelector('.day-cell[data-date]');
await page.click('.nav-item[data-nav-id="todos"]');
await page.waitForSelector('.all-view .empty-state');
check('全库 0 条时显示「暂无待办」', (await text(page.locator('.all-view .empty-title'))) === '暂无待办');
check('空态标记 data-empty=no-todos', (await page.getAttribute('.all-view .empty-state', 'data-empty')) === 'no-todos');
check('空态不提供按钮', (await page.locator('.all-view .empty-state button').count()) === 0);
check('0 条时不显示完成率', (await page.locator('.all-view .stat-rate').count()) === 0);
await page.waitForTimeout(250); // 等导航选中态的 150ms 过渡结束，避免拍到半透明的旧高亮
await page.screenshot({ path: `${OUT}/12-all-view-empty.png` });

/* ---------------------------------------------------------------- 10. 结果 */

await page.evaluate(() => localStorage.clear());
check('运行期无 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
await browser.close();

console.log('\n----------------------------------------');
console.log(`断言通过 ${passed} 条，失败 ${failures.length} 条`);
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS（截图：${OUT}/01 ~ 12）`);
