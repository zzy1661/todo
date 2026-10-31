/**
 * S2 阶段验收自证脚本（外壳 · 日历 · 当日待办面板）。
 *
 * 这不是 E2E 套件（T-14 / S5 才建 `e2e/` + `playwright.config.ts`），
 * 只是本阶段的真实浏览器快照验证：直接驱动运行中的开发服务器，
 * 用真实点击与真实 localStorage 断言 AC-06 / AC-07 / AC-08 / AC-09 / AC-10 /
 * AC-11 / AC-14 / AC-45 / AC-46 的可观察结果，并把截图落到 `screenshots/s2/`。
 *
 * 用法：
 *   npm run dev            # 另开一个终端
 *   node scripts/check-s2-ui.mjs
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import dayjs from 'dayjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:1420';
const OUT = 'docs/evidence/s2';
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

const today = dayjs().format('YYYY-MM-DD');
const TODAY_TEXT = `${dayjs(today).format('M月D日')} 周${WEEK_CN[dayjs(today).day()]}`;

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

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

await page.goto(BASE);
await page.waitForSelector('.day-cell[data-date]');

/* ---------------------------------------------------------------- 外壳与导航 */

console.log('\n[1] 外壳与导航（FR-NAV-01 ~ FR-NAV-07）');

const navItems = page.locator('.nav-item');
check('默认进入日历模块', (await page.getAttribute('main', 'data-module')) === 'calendar');
check('导航项 3 个', (await navItems.count()) === 3, `实际 ${await navItems.count()}`);
check(
  '导航项文案与顺序',
  (await navItems.allInnerTexts()).map((s) => s.trim()).join('|') === '日历|每日工作法|全部待办',
  (await navItems.allInnerTexts()).join('|')
);
check('第一个导航项为选中态', (await page.locator('.nav-item.active').count()) === 1);
check('导航无「番茄钟」', !(await page.locator('.side-nav').innerText()).includes('番茄钟'));
check(
  '底部「数据本地存储」静态标识',
  (await text(page.locator('.nav-local'))).replace(/\s+/g, ' ') === '● 数据本地存储',
  (await text(page.locator('.nav-local'))).replace(/\s+/g, ' ')
);
check('品牌区含中英名', (await text(page.locator('.brand'))).includes('日程待办') &&
  (await text(page.locator('.brand'))).includes('Schedule Todo'));

await page.screenshot({ path: `${OUT}/01-shell-calendar.png` });

/* ---------------------------------------------------------------- 月历结构 */

console.log('\n[2] 月历结构（FR-CAL-01 / FR-CAL-03 / FR-CAL-07 / AC-06）');

const cells = page.locator('.day-cell');
const cellCount = await cells.count();
check('42 个日期格', cellCount === 42, `实际 ${cellCount}`);

const dates = await cells.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-date')));
check('每个日期格都有 data-date', dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')));
check('共有 6 行 × 7 列（每行 7 格）', dates.length === 42 && dates.slice(0, 7).length === 7);
check(
  '首列 6 格互差 7 天（周日起始）',
  dates.filter((_, i) => i % 7 === 0).every((d, i) => dayjs(d).diff(dayjs(dates[0]), 'day') === i * 7),
  dates.filter((_, i) => i % 7 === 0).join(',')
);
check('首格为周日', dayjs(dates[0]).day() === 0, dates[0]);

const columns = await page.locator('.day-grid').evaluate(
  (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length
);
check('grid 为 7 列', columns === 7, `实际 ${columns}`);

const weekdays = (await page.locator('.weekday').allInnerTexts()).map((s) => s.trim());
check('星期头 日→六', weekdays.join('') === '日一二三四五六', weekdays.join(''));

const outside = page.locator('.day-cell[data-outside]');
check('存在非本月补位格且带 data-outside', (await outside.count()) > 0);
check('补位格同时带 .out-month', (await page.locator('.day-cell.out-month[data-outside]').count()) === (await outside.count()));

const todayCell = page.locator(`.day-cell[data-date="${today}"]`);
check('今天所在格带 .today', (await todayCell.count()) === 1 && (await todayCell.getAttribute('class')).includes('today'));
// 今天与选中可能同时成立：选中态的整格主色填充优先级更高，此时数字为白色但必须加粗
const todayWeight = await todayCell.locator('.day-num').evaluate((el) => getComputedStyle(el).fontWeight);
check('今天日期数字加粗', Number(todayWeight) >= 700, todayWeight);
check('今天所在格默认选中', (await todayCell.getAttribute('class')).includes('selected'));

const legend = (await text(page.locator('.legend'))).replace(/\s+/g, ' ');
check('图例三项逐字一致', legend === '● 有待办 ▢ 今天 ■ 已选中', legend);

/* ---------------------------------------------------------------- 当日面板 */

console.log('\n[3] 当日待办面板（FR-DAY-01 / FR-DAY-02 / FR-DAY-05 / AC-10 / AC-14）');

check('头部日期文案', (await text(page.locator('.day-title'))) === TODAY_TEXT, await text(page.locator('.day-title')));
check('今天徽章', (await text(page.locator('.today-badge'))) === '今天');
check('新建按钮文案', (await text(page.locator('.new-btn'))) === '+ 新建待办');
check('统计：共 0 项', (await text(page.locator('.todo-panel .panel-stats'))).includes('共 0 项'));
check('统计：已完成 0 项', (await text(page.locator('.todo-panel .panel-stats'))).includes('已完成 0 项'));
check('N = 0 时不显示完成率', (await page.locator('.todo-panel .stat-rate').count()) === 0);
check('空态文案 ES-01', (await text(page.locator('.todo-panel .empty-title'))) === '这一天还没有待办');
check('空态按钮「创建第一条待办」', (await text(page.locator('.todo-panel .empty-action'))) === '创建第一条待办');
check('空态标记 data-empty=no-todos', (await page.getAttribute('.todo-panel .empty-state', 'data-empty')) === 'no-todos');

/* ---------------------------------------------------------------- 增删勾选 */

console.log('\n[4] 新建 / 勾选 / 优先级 / 删除（FR-DAY-01 / FR-EDT-02 ~ 07 / BR-10）');

async function createTodo(title) {
  await page.click('.new-btn');
  await page.waitForSelector('.editor');
  await page.fill('.editor input[type="text"]', title);
  await page.click('.editor-save');
  await page.waitForSelector('.editor', { state: 'detached' });
}

check('新建前编辑器不可见', (await page.locator('.editor').count()) === 0);
await createTodo('写 S2 验收脚本');
await createTodo('校对日历四态');
await createTodo('补齐空态插画');
await createTodo('整理稳定选择器');

check('列表 4 条', (await page.locator('.todo-panel .todo-item').count()) === 4, `实际 ${await page.locator('.todo-panel .todo-item').count()}`);
check('共 4 项', (await text(page.locator('.todo-panel .panel-stats'))).includes('共 4 项'));
check('4 条时显示完成率 0%', (await text(page.locator('.todo-panel .stat-rate'))) === '完成率 0%');
check('4 条时圆点 + `+`', (await todayCell.locator('.dot-count').count()) === 1);
check('`+` 文本为 +', (await text(todayCell.locator('.dot-count'))) === '+');

// 新建后日历圆点立即出现、且无需刷新（BR-10）
check('新建后今天格出现圆点', (await todayCell.locator('.dot').count()) === 1);

// 行内只有四个元素（FR-ITEM-01）
const firstRow = page.locator('.todo-panel .todo-item').first();
const rowClasses = await firstRow.evaluate((el) =>
  [...el.querySelectorAll('button')].map((b) => b.className.split(' ')[0])
);
check(
  '行内元素为 check / item-body / priority-tag / more-btn',
  rowClasses.sort().join(',') === 'check,item-body,more-btn,priority-tag',
  rowClasses.join(',')
);
check('行内无铅笔 / 垃圾桶按钮', !(await firstRow.innerHTML()).includes('trash'));

// 勾选 1 条 → 完成率 25%（AC-14 的口径验证：分母为总条数）
await firstRow.locator('.check').click();
await page.waitForFunction(() => document.querySelector('.todo-panel .panel-stats')?.textContent?.includes('已完成 1 项'));
check('勾选后 已完成 1 项', (await text(page.locator('.todo-panel .panel-stats'))).includes('已完成 1 项'));
check('勾选后完成率 25%', (await text(page.locator('.todo-panel .stat-rate'))) === '完成率 25%');

// 优先级循环 低 → 中 → 高 → 低（FR-ITEM-03）
// 改优先级会改变排序位置，因此按条目的 data-todo-id 定位，不依赖「第一行」
const todoId = await firstRow.getAttribute('data-todo-id');
const tagOfTodo = (id) => page.locator(`.todo-panel .todo-item[data-todo-id="${id}"] .priority-tag`);
const seen = [await text(tagOfTodo(todoId))];
for (const expected of ['高', '低', '中']) {
  await tagOfTodo(todoId).click();
  await page.waitForFunction(
    ({ id, value }) =>
      document
        .querySelector(`.todo-panel .todo-item[data-todo-id="${id}"] .priority-tag`)
        ?.textContent?.trim() === value,
    { id: todoId, value: expected }
  );
  seen.push(await text(tagOfTodo(todoId)));
}
check('优先级循环 中→高→低→中', seen.join('') === '中高低中', seen.join('→'));

// 排序：同优先级新建者在前，高优先级排到最前（BR-02 / FR-DAY-06）
const titleOrder = (await page.locator('.todo-panel .todo-item .item-title').allInnerTexts()).map((s) => s.trim());
check(
  '同优先级下新建者在前',
  titleOrder.join('|') === '整理稳定选择器|补齐空态插画|校对日历四态|写 S2 验收脚本',
  titleOrder.join('|')
);
const lastTodoId = await page.locator('.todo-panel .todo-item').last().getAttribute('data-todo-id');
await page.locator(`.todo-panel .todo-item[data-todo-id="${lastTodoId}"] .priority-tag`).click();
await page.waitForFunction(
  (id) => document.querySelector('.todo-panel .todo-item')?.getAttribute('data-todo-id') === id,
  lastTodoId
);
check('高优先级条目排到最前', (await page.locator('.todo-panel .todo-item').first().getAttribute('data-todo-id')) === lastTodoId);

await page.screenshot({ path: `${OUT}/02-day-panel-4-todos.png` });

/* ---------------------------------------------------------------- 筛选 */

console.log('\n[5] 三页签筛选与两种空态（FR-DAY-03 / FR-DAY-05 / FR-DAY-08 / AC-11）');

const tabLabels = (await page.locator('.todo-panel .filter-tab').allInnerTexts()).map((s) => s.trim());
check('页签 全部 / 未完成 / 已完成', tabLabels.join('|') === '全部|未完成|已完成', tabLabels.join('|'));

await page.click('.todo-panel .filter-tab[data-filter="done"]');
check('已完成页签只剩 1 条', (await page.locator('.todo-panel .todo-item').count()) === 1);
check('筛选不改变统计分母', (await text(page.locator('.todo-panel .panel-stats'))).includes('共 4 项'));
check('筛选中完成率仍为 25%', (await text(page.locator('.todo-panel .stat-rate'))) === '完成率 25%');

await page.click('.todo-panel .filter-tab[data-filter="active"]');
check('未完成页签 3 条', (await page.locator('.todo-panel .todo-item').count()) === 3);

// 模块切换不重置本模块的筛选状态（BR-21 / FR-NAV-03）
await page.click('.nav-item[data-nav-id="daily"]');
check('切到每日工作法模块', (await page.getAttribute('main', 'data-module')) === 'daily');
check('日历模块随切换隐藏', !(await page.locator('.calendar-module').isVisible()));
check('导航选中态跟随切换', (await page.locator('.nav-item.active').getAttribute('data-nav-id')) === 'daily');
await page.click('.nav-item[data-nav-id="calendar"]');
check('切回日历后日历可见', await page.locator('.calendar-module').isVisible());
check('切回日历后筛选仍为「未完成」', (await text(page.locator('.todo-panel .filter-tab.active'))) === '未完成');

await page.screenshot({ path: `${OUT}/03-filter-active.png` });

// 造一条全完成的日期，验证 ES-02
await page.click('.todo-panel .filter-tab[data-filter="all"]');

/* ---------------------------------------------------------------- 切换日期：筛选重置 + 空态 */

console.log('\n[6] 切换日期（FR-DAY-04 / FR-CAL-05 / AC-46）');

const otherCell = page
  .locator('.day-cell:not(.out-month):not(.today)')
  .filter({ hasNot: page.locator('.day-dots') })
  .first();
const otherDate = await otherCell.getAttribute('data-date');
await otherCell.click();

check('右栏切换到所点日期', (await text(page.locator('.day-title'))) ===
  `${dayjs(otherDate).format('M月D日')} 周${WEEK_CN[dayjs(otherDate).day()]}`);
check('切换日期后筛选重置为「全部」', (await text(page.locator('.todo-panel .filter-tab.active'))) === '全部');
check('空日期显示 ES-01 空态', (await text(page.locator('.todo-panel .empty-title'))) === '这一天还没有待办');
check('空日期不显示今天徽章', (await page.locator('.today-badge').count()) === 0);
check('所选日期格高亮', (await page.locator(`.day-cell[data-date="${otherDate}"]`).getAttribute('class')).includes('selected'));
// 非选中态下，今天数字必须是主色加粗（FR-CAL-03 ②）
const todayColorIdle = await page.locator(`.day-cell[data-date="${today}"] .day-num`).evaluate(
  (el) => getComputedStyle(el).color
);
check('今天数字为主色 #2f6bff（非选中时）', todayColorIdle === 'rgb(47, 107, 255)', todayColorIdle);

// ES-02：该日有数据但当前筛选命中 0 条（无创建按钮）
await createTodo('只在这一天的一条');
check('新日期下新增 1 条', (await page.locator('.todo-panel .todo-item').count()) === 1);
await page.click('.todo-panel .filter-tab[data-filter="done"]');
check('筛选无结果文案 ES-02', (await text(page.locator('.todo-panel .empty-title'))) === '没有符合筛选的待办');
check('ES-02 不显示创建按钮', (await page.locator('.todo-panel .empty-action').count()) === 0);
check('ES-02 标记 data-empty=no-match', (await page.getAttribute('.todo-panel .empty-state', 'data-empty')) === 'no-match');

// 切回今天：筛选必须重置为「全部」（FR-DAY-04 / AC-46）
await todayCell.click();
check('切回今天后筛选回到「全部」', (await text(page.locator('.todo-panel .filter-tab.active'))) === '全部');
check('今天仍是 4 条', (await page.locator('.todo-panel .todo-item').count()) === 4);

/* ---------------------------------------------------------------- 翻月与今天 */

console.log('\n[7] 翻月 / 今天 / 跨月跟随（FR-CAL-02 / FR-CAL-06 / FR-CAL-08 / AC-08 / AC-09 / AC-45）');

const monthBefore = await text(page.locator('.month-title'));
const dayBefore = await text(page.locator('.day-title'));
await page.click('.month-next');
await page.waitForFunction(
  (before) => document.querySelector('.month-title')?.textContent?.trim() !== before,
  monthBefore
);
check('翻月改变月历标题', (await text(page.locator('.month-title'))) !== monthBefore);
check('翻月不重置选中日（AC-45）', (await text(page.locator('.day-title'))) === dayBefore);
await page.screenshot({ path: `${OUT}/04-month-shifted.png` });

await page.click('.today-btn');
await page.waitForFunction(
  (expected) => document.querySelector('.month-title')?.textContent?.trim() === expected,
  dayjs(today).format('YYYY年M月')
);
check('「今天」按钮回到本月', (await text(page.locator('.month-title'))) === dayjs(today).format('YYYY年M月'));
check('「今天」按钮回到今天', (await text(page.locator('.day-title'))) === TODAY_TEXT);
check('今天格重新选中', (await todayCell.getAttribute('class')).includes('selected'));

// 点击下月补位格 → 月历跟随翻月并加载该月（FR-CAL-06）
const nextMonthOutside = page
  .locator('.day-cell[data-outside]')
  .filter({ has: page.locator('.day-num') })
  .last();
const nextDate = await nextMonthOutside.getAttribute('data-date');
check('补位格日期属于相邻月', dayjs(nextDate).month() !== dayjs(today).month(), nextDate);
await nextMonthOutside.click();
check('点补位格后右栏切到该日', (await text(page.locator('.day-title'))) ===
  `${dayjs(nextDate).format('M月D日')} 周${WEEK_CN[dayjs(nextDate).day()]}`);
check('点补位格后月历跟随翻月', (await text(page.locator('.month-title'))) === dayjs(nextDate).format('YYYY年M月'));

await page.click('.today-btn');

/* ---------------------------------------------------------------- 菜单与删除 */

console.log('\n[8] 右键菜单与删除（FR-MENU-01 / FR-MENU-04 / FR-MENU-06 / FR-MENU-08 / AC-07）');

// 键盘导航：↓ 跳过分隔线，Esc 关闭
await firstRow.hover();
await firstRow.locator('.more-btn').click();
await page.waitForSelector('.ctx-menu');
await page.keyboard.press('ArrowDown');
const afterDown = await text(page.locator('.ctx-menu .ctx-item.active'));
await page.keyboard.press('ArrowUp');
const afterUp = await text(page.locator('.ctx-menu .ctx-item.active'));
check('↓ 从首项移到下一可选项（跳过分隔线）', afterDown === '编辑', afterDown);
check('↑ 回到首项', afterUp === '移动明日', afterUp);
await page.keyboard.press('Escape');
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('Esc 关闭菜单', (await page.locator('.ctx-menu').count()) === 0);

// 点击菜单外关闭
await firstRow.hover();
await firstRow.locator('.more-btn').click();
await page.waitForSelector('.ctx-menu');
await page.locator('.todo-panel .panel-stats').click();
await page.waitForSelector('.ctx-menu', { state: 'detached' });
check('点击菜单外关闭', (await page.locator('.ctx-menu').count()) === 0);

await firstRow.hover();
await firstRow.locator('.more-btn').click();
await page.waitForSelector('.ctx-menu');
const ctxItems = (await page.locator('.ctx-menu .ctx-item').allInnerTexts()).map((s) => s.trim());
check('今日条目的菜单项', ctxItems.join('|') === '移动明日|编辑|删除', ctxItems.join('|'));
check('菜单挂载在 body 下', (await page.locator('.ctx-menu').evaluate((el) => el.parentElement?.tagName)) === 'BODY');
check('菜单首项高亮', (await page.locator('.ctx-menu .ctx-item.active').count()) === 1);
await page.waitForTimeout(200); // 等入场动画结束再截图，避免拍到半透明状态
check('菜单已完全显示', (await page.locator('.ctx-menu').evaluate((el) => getComputedStyle(el).opacity)) === '1');
await page.screenshot({ path: `${OUT}/05-context-menu.png` });

await page.locator('.ctx-menu .ctx-item', { hasText: '删除' }).click();
await page.waitForFunction(() => document.querySelectorAll('.todo-panel .todo-item').length === 3);
check('删除后剩 3 条', (await page.locator('.todo-panel .todo-item').count()) === 3);
check('删到 3 条后 `+` 消失（AC-07）', (await todayCell.locator('.dot-count').count()) === 0);
check('删到 3 条仍有圆点', (await todayCell.locator('.dot').count()) === 1);
check('删除后共 3 项', (await text(page.locator('.todo-panel .panel-stats'))).includes('共 3 项'));

/* ---------------------------------------------------------------- 编辑器细节 */

console.log('\n[9] 编辑器（FR-EDT-03 / FR-EDT-04 / FR-EDT-05）');

await page.click('.new-btn');
await page.waitForSelector('.editor');
check('新建态按钮文案为「创建」', (await text(page.locator('.editor-save'))) === '创建');
check('标题为空时保存不可点', await page.locator('.editor-save').isDisabled());
const cardWidth = (await page.locator('.editor-card').boundingBox())?.width ?? 0;
check('卡片宽度约 400px', cardWidth >= 380 && cardWidth <= 420, `${cardWidth}`);
await page.fill('.editor input[type="text"]', '回车提交验证');
await page.press('.editor input[type="text"]', 'Enter');
await page.waitForSelector('.editor', { state: 'detached' });
check('标题框回车即保存', (await page.locator('.todo-panel .todo-item').count()) === 4);
await page.screenshot({ path: `${OUT}/06-calendar-final.png` });

// 编辑态按钮文案
await page.locator('.todo-panel .todo-item').first().locator('.item-body').click();
await page.waitForSelector('.editor');
check('编辑态按钮文案为「保存修改」', (await text(page.locator('.editor-save'))) === '保存修改');
check('编辑态回填标题', (await page.inputValue('.editor input[type="text"]')).length > 0);
await page.click('.editor-cancel');
await page.waitForSelector('.editor', { state: 'detached' });
check('取消后编辑器关闭', (await page.locator('.editor').count()) === 0);

/* ---------------------------------------------------------------- 布局比例 */

console.log('\n[10] 两栏布局（FR-CAL-09）');

const leftBox = await page.locator('.cal-card').boundingBox();
const rightBox = await page.locator('.todo-col').boundingBox();
const ratio = (leftBox?.width ?? 0) / (rightBox?.width ?? 0);
check('左右宽度约 7 : 6', Math.abs(ratio - 7 / 6) < 0.12, `实际 ${ratio.toFixed(2)}`);
check('右栏有工作法小卡片', (await page.locator('.mini-card').count()) === 1);
check('小卡片标题为今日工作法', (await text(page.locator('.mini-title'))) === '今日工作法');
const panelBottom = (await page.locator('.todo-panel').boundingBox())?.y ?? 0;
const panelHeight = (await page.locator('.todo-panel').boundingBox())?.height ?? 0;
check('当日面板撑满右栏剩余高度', panelBottom + panelHeight <= 800 && panelHeight > 200, `${panelHeight}`);

/* ---------------------------------------------------------------- 小窗口与多条目 */

console.log('\n[11] 小窗口与多条目（FR-CAL-09 / BR-23）');

await page.setViewportSize({ width: 900, height: 600 });
await page.waitForTimeout(150);
check(
  '900×600 无横向溢出',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
);
check('900×600 仍渲染 42 格', (await page.locator('.day-cell').count()) === 42);

for (let i = 0; i < 6; i += 1) await createTodo(`批量条目 ${i + 1}`);
check('10 条时统计为 共 10 项', (await text(page.locator('.todo-panel .panel-stats'))).includes('共 10 项'), await text(page.locator('.todo-panel .panel-stats')));

const listMetrics = await page.locator('.todo-list').evaluate((el) => ({
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
}));
check(
  '列表内部滚动而不是撑破页面',
  listMetrics.scrollHeight > listMetrics.clientHeight,
  JSON.stringify(listMetrics)
);
const smallPanel = await page.locator('.todo-panel').boundingBox();
check('面板不越出视口底部', (smallPanel?.y ?? 0) + (smallPanel?.height ?? 0) <= 601, JSON.stringify(smallPanel));
await page.screenshot({ path: `${OUT}/07-small-window-10-todos.png` });
await page.setViewportSize({ width: 1280, height: 800 });

/* ---------------------------------------------------------------- 源码级契约 */

console.log('\n[12] 源码级契约（FR-NAV-04 / FR-NAV-06 / AC-56）');

const sideNavSource = readFileSync('src/components/layout/SideNav.vue', 'utf8');
const registrySource = readFileSync('src/components/layout/navItems.ts', 'utf8');
check('导航注册表驱动', registrySource.includes('NAV_ITEMS'));
check('未知 id 回退默认时钟图标', sideNavSource.includes('ICONS[id] ?? CLOCK_ICON'));
check('注册表不含未实现的番茄钟', !/id:\s*['"]pomodoro['"]/.test(registrySource));
check(
  '未引入 UI 框架 / 状态管理 / 路由库（BR-15）',
  !/pinia|vuex|vue-router|element-plus|ant-design|vuetify|naive-ui/.test(
    readFileSync('package.json', 'utf8')
  )
);

/* ---------------------------------------------------------------- 结果 */

check('运行期无 console error', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
await browser.close();

console.log('\n----------------------------------------');
console.log(`断言通过 ${passed} 条，失败 ${failures.length} 条`);
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS（截图：${OUT}/01 ~ 07）`);
