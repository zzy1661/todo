/**
 * S3 阶段验收自证脚本（每日工作法模块 T-10）。
 *
 * 这不是 E2E 套件（S5 / T-14 才建 `e2e/` + `playwright.config.ts`），
 * 只是本阶段的真实浏览器验证：直接驱动运行中的开发服务器，用真实点击与真实
 * localStorage 断言 FR-DM-01 ~ FR-DM-16 的可观察结果，截图落 `docs/evidence/s3/`。
 *
 * 覆盖：主卡片七区块与几何（AC-28）、`.mc-inner` 内部滚动 + `.mc-fade` 渐隐（AC-29）、
 * 状态徽章三态（AC-51 / AC-20 / AC-23）、换一条不重复且落库、往期 7 天（AC-25）、
 * 方法库 65 条与分类筛选（AC-26）、日期步进、预览不污染日历小卡片。
 *
 * 用法：
 *   npm run dev            # 另开一个终端
 *   node scripts/check-s3-ui.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import dayjs from 'dayjs';
import { METHODS, METHOD_MAP, CATEGORY_META, CATEGORY_COUNTS } from '../src/data/methods.ts';

const BASE = process.env.BASE_URL ?? 'http://localhost:1420';
const OUT = 'docs/evidence/s3';
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
/** WebView 内容区按设计 §6.2：1100×720 窗口的内容区 ≈ 1100×692 */
const VIEW = { width: 1100, height: 692 };

const today = dayjs().format('YYYY-MM-DD');
const dayText = (d) => `${dayjs(d).format('M月D日')} 周${WEEK_CN[dayjs(d).day()]}`;

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

/* ---------------------------------------------------------------- 参考实现（PRD 附录 A） */

function refHashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function refMulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function refPermutation(date) {
  const out = METHODS.map((m) => m.id);
  const rand = refMulberry32(refHashCode(date));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const firstIdOf = (date) => refPermutation(date)[0];
const nextIdOf = (date, id) => {
  const order = refPermutation(date);
  return order[(order.indexOf(id) + 1) % order.length];
};

const nameOf = (id) => METHOD_MAP[id]?.name ?? '';

const text = async (locator) => (await locator.innerText()).trim();

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

/** localStorage 里的推送记录（浏览器侧数据层，BR-04 口径：一日一行） */
const readPicks = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('todo_local_daily_db') ?? '[]'));
const pickOf = async (date) => (await readPicks()).find((p) => p.date === date) ?? null;

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.day-cell[data-date]');

/* ---------------------------------------------------------------- 1. 首次进入自动落库 */

console.log('\n[1] 首次查看自动落库（FR-DM-01 / ES-07 / AC-21）');

const initialPicks = await readPicks();
check('首次打开就产生今日推送记录，且只有 1 行', initialPicks.length === 1, JSON.stringify(initialPicks));
check('今日记录的 manual = 0', initialPicks[0]?.manual === false, JSON.stringify(initialPicks[0]));
check(
  '今日记录的 method_id = 确定性首推',
  initialPicks[0]?.method_id === firstIdOf(today),
  `${initialPicks[0]?.method_id} vs ${firstIdOf(today)}`
);

/** 进入模块前先记下日历页小卡片的内容，后面对比它是否跟着当日推送变化 */
const miniNameInitial = await text(page.locator('.mini-name'));
check('日历页小卡片展示今日首推', miniNameInitial === nameOf(initialPicks[0]?.method_id), miniNameInitial);

await page.click('.nav-item[data-nav-id="daily"]');
await page.waitForSelector('.method-card');

/* ---------------------------------------------------------------- 2. 顶栏 */

console.log('\n[2] 顶栏与日期步进（FR-DM-10）');

check('进入每日工作法模块', (await page.getAttribute('main', 'data-module')) === 'daily');
check('模块标题', (await text(page.locator('.dm-title'))) === '每日工作法');
check('日期文案 M月D日 周X', (await text(page.locator('.dm-date-text'))) === dayText(today), await text(page.locator('.dm-date-text')));
check('日期文本带 data-date', (await page.getAttribute('.dm-date-text', 'data-date')) === today);
check('前一天 / 后一天按钮存在', (await page.locator('.dm-prev').count()) === 1 && (await page.locator('.dm-next').count()) === 1);
check('按钮文案「今天」', (await text(page.locator('.dm-today'))) === '今天');
check('按钮文案「换一条」', (await text(page.locator('.dm-shuffle'))) === '换一条');

/* ---------------------------------------------------------------- 3. 主卡片七区块 */

console.log('\n[3] 主卡片七区块单栏平铺（FR-DM-07 / FR-DM-11 / FR-DM-08）');

const todayMethod = METHODS.find((m) => m.id === firstIdOf(today));
check('方法名 = 今日确定性首推', (await text(page.locator('.mc-name'))) === todayMethod.name, await text(page.locator('.mc-name')));
check('分类徽章文案', (await text(page.locator('.mc-cat'))) === CATEGORY_META[todayMethod.category].label, await text(page.locator('.mc-cat')));
check('来源文案', (await text(page.locator('.mc-source'))) === todayMethod.source);
check('一句话说明文案', (await text(page.locator('.mc-summary'))) === todayMethod.summary);
check('核心步骤条数与内容库一致', (await page.locator('.mc-step').count()) === todayMethod.steps.length, `实际 ${await page.locator('.mc-step').count()}`);
check('步骤序号为 1..n', (await page.locator('.mc-step-num').allInnerTexts()).map((s) => s.trim()).join(',') === todayMethod.steps.map((_, i) => i + 1).join(','));
check('步骤文本逐条一致', (await page.locator('.mc-step-text').allInnerTexts()).map((s) => s.trim()).join('|') === todayMethod.steps.join('|'));
check('适用场景 / 今日一练为同一行两栏', (await page.locator('.mc-duo .mc-box').count()) === 2);
check('两栏标题逐字', (await page.locator('.mc-box .mc-label').allInnerTexts()).map((s) => s.trim()).join('|') === '适用场景|今日一练');
check('两栏正文逐字', (await page.locator('.mc-box .mc-text').allInnerTexts()).map((s) => s.trim()).join('|') === `${todayMethod.when}|${todayMethod.action}`);
check('案例区块标题由 case.type 决定', (await text(page.locator('.mc-case-label'))) === (todayMethod.case.type === 'practice' ? '实践案例' : '作者故事'));
check('案例小标题与正文逐字', (await text(page.locator('.case-title'))) === todayMethod.case.title && (await text(page.locator('.case-content'))) === todayMethod.case.content);
check('状态徽章唯一且为「今日推送」', (await page.locator('.mc-preview').count()) === 1 && (await text(page.locator('.mc-preview'))) === '今日推送', await text(page.locator('.mc-preview')));
check('今日推送徽章为主色淡底样式', (await page.getAttribute('.mc-preview', 'data-state')) === 'today');

// 单栏几何（AC-28）：核心步骤块 → 适用场景/今日一练 → 案例块，y 递增且左边缘对齐
const geo = await page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, height: b.height, right: b.right };
  };
  return {
    steps: rect('.mc-steps-block'),
    boxes: [...document.querySelectorAll('.mc-box')].map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, height: b.height };
    }),
    caseBlock: rect('.mc-case'),
    card: rect('.method-card'),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
check(
  '核心步骤块底部 y < 适用场景块 y',
  geo.steps.y + geo.steps.height < geo.boxes[0].y,
  JSON.stringify([geo.steps, geo.boxes[0]])
);
check(
  '适用场景块底部 y < 案例块 y',
  Math.max(...geo.boxes.map((b) => b.y + b.height)) < geo.caseBlock.y,
  JSON.stringify([geo.boxes, geo.caseBlock])
);
check(
  '三个区块左边缘 x 相等（容差 1px）',
  Math.abs(geo.steps.x - geo.boxes[0].x) <= 1 && Math.abs(geo.steps.x - geo.caseBlock.x) <= 1,
  `${geo.steps.x} / ${geo.boxes[0].x} / ${geo.caseBlock.x}`
);
check('卡片不越出视口', geo.card.y + geo.card.height <= geo.viewport.h + 1, JSON.stringify(geo.card));
check(
  '页面本身不滚动（卡片不撑破布局）',
  await page.evaluate(() => document.scrollingElement.scrollHeight <= window.innerHeight)
);

await page.screenshot({ path: `${OUT}/01-daily-card.png` });

/* ---------------------------------------------------------------- 4. 往期回顾 */

console.log('\n[4] 往期回顾 7 天（FR-DM-04 / AC-25）');

const historyItems = page.locator('.history-item');
check('往期回顾 7 行', (await historyItems.count()) === 7, `实际 ${await historyItems.count()}`);

const historyDates = (await historyItems.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-date'))));
check(
  '日期由早到晚且连续',
  historyDates.every((d, i) => dayjs(d).diff(dayjs(historyDates[0]), 'day') === i),
  historyDates.join(',')
);
check('最后一行是今天', historyDates[6] === today, historyDates[6]);
check('当前查看日期行高亮', (await page.locator('.history-item.active').getAttribute('data-date')) === today);
check(
  '每行 MM/DD + 周X',
  (await historyItems.allInnerTexts()).every((t) => /^\d{2}\/\d{2}\s+周[日一二三四五六]/.test(t.replace(/\s+/g, ' ').trim())),
  (await historyItems.first().innerText()).replace(/\s+/g, ' ')
);
check(
  '未落库日期显示确定性首推名称（只读，不落库）',
  (await text(historyItems.nth(0).locator('.history-name'))) === nameOf(firstIdOf(historyDates[0])),
  await text(historyItems.nth(0).locator('.history-name'))
);
check(
  '往期列表不凭空写入记录（仍只有今天 1 行）',
  (await readPicks()).length === 1,
  JSON.stringify(await readPicks())
);

const thirdDate = historyDates[2];
await historyItems.nth(2).click();
await page.waitForFunction(
  (d) => document.querySelector('.dm-date-text')?.getAttribute('data-date') === d,
  thirdDate
);
check('点往期行切换查看日期', (await text(page.locator('.dm-date-text'))) === dayText(thirdDate));
check('主卡片切到该日推送', (await text(page.locator('.mc-name'))) === nameOf(firstIdOf(thirdDate)), await text(page.locator('.mc-name')));
check('该行变为高亮', (await page.locator('.history-item.active').getAttribute('data-date')) === thirdDate);
const thirdPick = await pickOf(thirdDate);
check('查看该日即落库 1 行', thirdPick !== null, JSON.stringify(thirdPick));
check('落库 manual = 0 且 method_id 为确定性首推', thirdPick?.manual === false && thirdPick?.method_id === firstIdOf(thirdDate), JSON.stringify(thirdPick));
check('往期日期（非今天、未手动刷新）不渲染状态徽章（PRD 未定义第四态）', (await page.locator('.mc-preview').count()) === 0);

await page.click('.dm-today');
await page.waitForFunction(
  (d) => document.querySelector('.dm-date-text')?.getAttribute('data-date') === d,
  today
);
check('「今天」按钮回到今天', (await text(page.locator('.dm-date-text'))) === dayText(today));

/* ---------------------------------------------------------------- 5. 换一条 */

console.log('\n[5] 换一条：下一条候选 + 落库（FR-DM-03 / BR-05 / BR-06 / AC-23）');

const pickBeforeShuffle = await pickOf(today);
const firstShuffleTarget = nextIdOf(today, pickBeforeShuffle.method_id);
await page.click('.dm-shuffle');
await page.waitForFunction(
  (name) => document.querySelector('.mc-name')?.textContent?.trim() === name,
  nameOf(firstShuffleTarget)
);
check('换一条切到排列中的下一条', (await text(page.locator('.mc-name'))) === nameOf(firstShuffleTarget));
check('徽章变为「已手动刷新」', (await text(page.locator('.mc-preview'))) === '已手动刷新', await text(page.locator('.mc-preview')));
check('徽章为橙色状态', (await page.getAttribute('.mc-preview', 'data-state')) === 'manual');
let todayPick = await pickOf(today);
check('落库 manual = true', todayPick?.manual === true, JSON.stringify(todayPick));
check('落库 method_id = 下一条', todayPick?.method_id === firstShuffleTarget, JSON.stringify(todayPick));
check('「换一条」不新增行，仍一日一行', (await readPicks()).filter((p) => p.date === today).length === 1);

const secondTarget = nextIdOf(today, firstShuffleTarget);
await page.click('.dm-shuffle');
await page.waitForFunction(
  (name) => document.querySelector('.mc-name')?.textContent?.trim() === name,
  nameOf(secondTarget)
);
todayPick = await pickOf(today);
check('连续两次换一条得到不同方法', secondTarget !== firstShuffleTarget);
check('第二次也落在排列的下一条', todayPick?.method_id === secondTarget, JSON.stringify(todayPick));
check(
  '两次点击之间不重复（今天已出现过的两条不同）',
  pickBeforeShuffle.method_id !== firstShuffleTarget && firstShuffleTarget !== secondTarget
);

await page.screenshot({ path: `${OUT}/02-manual-refresh.png` });

/* ---------------------------------------------------------------- 6. 方法库 */

console.log('\n[6] 方法库 65 条与分类筛选（FR-DM-05 / FR-DM-06 / AC-26）');

check('方法库标题', (await text(page.locator('.library-head .side-title'))) === '方法库');
check('标题右侧固定显示「65 条」', (await text(page.locator('.library-count'))) === '65 条');
const cfTexts = (await page.locator('.cf-btn').allInnerTexts()).map((s) => s.trim());
check(
  '筛选按钮文案与顺序',
  cfTexts.join('|') === `全部|思维方法 ${CATEGORY_COUNTS.thinking}|工作方法 ${CATEGORY_COUNTS.work}|汇报方法 ${CATEGORY_COUNTS.report}|沟通方法 ${CATEGORY_COUNTS.communication}|效率方法 ${CATEGORY_COUNTS.efficiency}`,
  cfTexts.join('|')
);
check('分类计数合计 65', Object.values(CATEGORY_COUNTS).reduce((a, b) => a + b, 0) === 65);
check('默认「全部」筛选 65 条', (await page.locator('.lib-item').count()) === 65, `实际 ${await page.locator('.lib-item').count()}`);

for (const [key, count] of Object.entries(CATEGORY_COUNTS)) {
  await page.click(`.cf-btn[data-filter="${key}"]`);
  await page.waitForFunction((n) => document.querySelectorAll('.lib-item').length === n, count);
  check(`${CATEGORY_META[key].label} 筛选 ${count} 条`, (await page.locator('.lib-item').count()) === count);
  const btnColor = await page.locator(`.cf-btn[data-filter="${key}"]`).evaluate((el) => getComputedStyle(el).color);
  const rgb = CATEGORY_META[key].color;
  const expected = `rgb(${parseInt(rgb.slice(1, 3), 16)}, ${parseInt(rgb.slice(3, 5), 16)}, ${parseInt(rgb.slice(5, 7), 16)})`;
  check(`选中分类使用分类色文字（${CATEGORY_META[key].label}）`, btnColor === expected, `${btnColor} vs ${expected}`);
}

await page.screenshot({ path: `${OUT}/03-library-filter.png` });
await page.click('.cf-btn[data-filter="work"]');

/* ---------------------------------------------------------------- 7. 预览态 */

console.log('\n[7] 方法库预览（FR-DM-06 / FR-DM-08 / AC-20 / AC-51）');

const pickBeforePreview = await pickOf(today);
await page.click('.lib-item[data-method-id="5w2h"]');
await page.waitForFunction(() => document.querySelector('.mc-name')?.textContent?.trim() === '5W2H 分析法');
check('点方法库条目切到该方法', (await text(page.locator('.mc-name'))) === '5W2H 分析法');
check('徽章为「方法库预览」', (await text(page.locator('.mc-preview'))) === '方法库预览', await text(page.locator('.mc-preview')));
check('三态互斥：同一时刻只有一枚徽章', (await page.locator('.mc-preview').count()) === 1);
check('列表该项高亮', (await page.locator('.lib-item.active').getAttribute('data-method-id')) === '5w2h');
const pickDuringPreview = await pickOf(today);
check(
  '预览不改变该日落库记录（AC-20）',
  pickDuringPreview?.method_id === pickBeforePreview.method_id && pickDuringPreview?.manual === pickBeforePreview.manual,
  `${JSON.stringify(pickBeforePreview)} vs ${JSON.stringify(pickDuringPreview)}`
);

/* ---------------------------------------------------------------- 8. 溢出与渐隐（5w2h） */

console.log('\n[8] 溢出 · 内部滚动 · 底部渐隐（5w2h，AC-29）');

await page.waitForTimeout(600); // 等 260ms 重算 + 过渡完成
const metrics5w2h = await page.locator('.mc-inner').evaluate((el) => ({
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
  scrollTop: el.scrollTop,
}));
check('5w2h 内容超出可用高度', metrics5w2h.scrollHeight > metrics5w2h.clientHeight, JSON.stringify(metrics5w2h));
check('溢出时底部渐隐可见', await page.locator('.mc-fade').isVisible());
check('渐隐元素带稳定 class .mc-fade', (await page.locator('.mc-fade').count()) === 1);
check('卡片带 has-more 标记', (await page.getAttribute('.method-card', 'class')).includes('has-more'));
await page.screenshot({ path: `${OUT}/04-5w2h-top.png` });

await page.locator('.mc-inner').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
});
await page.waitForTimeout(200);
check('滚到底后渐隐消失', !(await page.locator('.mc-fade').isVisible()));
check('滚到底后卡片不再 has-more', !(await page.getAttribute('.method-card', 'class')).includes('has-more'));
check(
  '滚到底后页面外层仍不滚动',
  await page.evaluate(() => document.scrollingElement.scrollHeight <= window.innerHeight)
);
await page.screenshot({ path: `${OUT}/05-5w2h-bottom.png` });

/* ---------------------------------------------------------------- 9. 第二夹具 rice-scoring */

console.log('\n[9] 第二溢出夹具 rice-scoring（AC-29）');

await page.click('.lib-item[data-method-id="rice-scoring"]');
await page.waitForFunction(() => document.querySelector('.mc-name')?.textContent?.trim() === 'RICE 评分');
await page.waitForTimeout(600);
const metricsRice = await page.locator('.mc-inner').evaluate((el) => ({
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
}));
check('rice-scoring 也溢出', metricsRice.scrollHeight > metricsRice.clientHeight, JSON.stringify(metricsRice));
check('rice-scoring 渐隐可见', await page.locator('.mc-fade').isVisible());
await page.screenshot({ path: `${OUT}/06-rice-scoring.png` });
await page.locator('.mc-inner').evaluate((el) => {
  el.scrollTop = el.scrollHeight;
});
await page.waitForTimeout(200);
check('rice-scoring 滚到底渐隐消失', !(await page.locator('.mc-fade').isVisible()));

/* ---------------------------------------------------------------- 10. 预览不污染日历小卡片 */

console.log('\n[10] 预览不污染日历页小卡片（BR-21 / FR-DM-12）');

await page.click('.nav-item[data-nav-id="calendar"]');
await page.waitForSelector('.mini-card');
const miniNameAfter = await text(page.locator('.mini-name'));
const pickNow = await pickOf(today);
check('切换模块后小卡片内容 = 当日推送（跟随「换一条」）', miniNameAfter === nameOf(pickNow.method_id), `${miniNameAfter} vs ${nameOf(pickNow.method_id)}`);
check('小卡片确实跟着换一条变了（不是首次那条）', miniNameAfter !== miniNameInitial, `${miniNameAfter} vs ${miniNameInitial}`);
check('预览态不影响日历小卡片内容', miniNameAfter !== '5W2H 分析法' && miniNameAfter !== 'RICE 评分', miniNameAfter);
check('小卡片标题为「今日工作法」', (await text(page.locator('.mini-title'))) === '今日工作法');

// 切回模块：预览态与筛选状态都应保留（BR-21）
await page.click('.nav-item[data-nav-id="daily"]');
await page.waitForSelector('.method-card');
check('切回模块后仍是预览态', (await text(page.locator('.mc-preview'))) === '方法库预览');
check('切回模块后筛选仍为「工作方法」', (await text(page.locator('.cf-btn.active'))) === `工作方法 ${CATEGORY_COUNTS.work}`);

// 再点一次同一条退出预览（回到该日推送）
await page.click('.lib-item[data-method-id="rice-scoring"]');
await page.waitForFunction((name) => document.querySelector('.mc-name')?.textContent?.trim() === name, nameOf(pickNow.method_id));
check('再点同一条退出预览、回到该日推送', (await text(page.locator('.mc-name'))) === nameOf(pickNow.method_id));
check('退出预览后徽章回到「已手动刷新」', (await text(page.locator('.mc-preview'))) === '已手动刷新');

/* ---------------------------------------------------------------- 11. 日期步进 */

console.log('\n[11] 日期步进（FR-DM-10）');

const yesterday = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD');
await page.click('.dm-prev');
await page.waitForFunction(
  (d) => document.querySelector('.dm-date-text')?.getAttribute('data-date') === d,
  yesterday
);
check('前一天步进改变查看日期', (await text(page.locator('.dm-date-text'))) === dayText(yesterday));
check('前一天主卡片为确定性首推', (await text(page.locator('.mc-name'))) === nameOf(firstIdOf(yesterday)), await text(page.locator('.mc-name')));
const yesterdayPick = await pickOf(yesterday);
check('查看昨天也落库 manual = 0', yesterdayPick?.manual === false && yesterdayPick?.method_id === firstIdOf(yesterday), JSON.stringify(yesterdayPick));

const tomorrow = dayjs(today).add(1, 'day').format('YYYY-MM-DD');
await page.click('.dm-next');
await page.click('.dm-next');
await page.waitForFunction(
  (d) => document.querySelector('.dm-date-text')?.getAttribute('data-date') === d,
  tomorrow
);
check('后一天步进到明天', (await text(page.locator('.dm-date-text'))) === dayText(tomorrow));
check('明天主卡片为确定性首推', (await text(page.locator('.mc-name'))) === nameOf(firstIdOf(tomorrow)));

await page.click('.dm-today');
await page.waitForFunction(
  (d) => document.querySelector('.dm-date-text')?.getAttribute('data-date') === d,
  today
);
check('回今天后仍显示手动刷新过的那条', (await text(page.locator('.mc-name'))) === nameOf(pickNow.method_id));

/* ---------------------------------------------------------------- 12. 落库口径 */

console.log('\n[12] daily_picks 落库口径（BR-05 / BR-06 / INV-03）');

const finalPicks = await readPicks();
check('每个日期只有一行（日期主键，一日一行）', new Set(finalPicks.map((p) => p.date)).size === finalPicks.length, JSON.stringify(finalPicks.map((p) => p.date)));
check(
  '每条 method_id 都存在于内容库',
  finalPicks.every((p) => Object.prototype.hasOwnProperty.call(METHOD_MAP, p.method_id))
);
check('manual 为布尔值', finalPicks.every((p) => typeof p.manual === 'boolean'));
check('今天为 manual = true（换过一条）', (await pickOf(today))?.manual === true);
check('只落了查看过的日期（未点开过的日期不写入）', finalPicks.length <= 6, JSON.stringify(finalPicks.map((p) => p.date)));
console.log(`  INFO  daily_picks 快照：${JSON.stringify(finalPicks, null, 0)}`);

/* ---------------------------------------------------------------- 13. 小窗口与布局 */

console.log('\n[13] 900×600 最小窗口（FR-DM-09 / BR-23）');

await page.setViewportSize({ width: 900, height: 600 });
await page.waitForTimeout(400);
check(
  '900×600 无横向溢出',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
);
check(
  '900×600 页面不纵向滚动',
  await page.evaluate(() => document.scrollingElement.scrollHeight <= window.innerHeight)
);
const smallCard = await page.locator('.method-card').boundingBox();
check('900×600 卡片不越出视口', (smallCard?.y ?? 0) + (smallCard?.height ?? 0) <= 601, JSON.stringify(smallCard));
const smallInner = await page.locator('.mc-inner').evaluate((el) => ({
  scrollHeight: el.scrollHeight,
  clientHeight: el.clientHeight,
}));
check('900×600 内容走内部滚动', smallInner.scrollHeight > smallInner.clientHeight, JSON.stringify(smallInner));
await page.screenshot({ path: `${OUT}/07-small-window.png` });
await page.setViewportSize(VIEW);

/* ---------------------------------------------------------------- 14. 结果 */

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
