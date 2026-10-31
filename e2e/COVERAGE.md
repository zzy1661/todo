# E2E 覆盖对照（S5 / T-14）

测试计划的 **28 条 E2E 用例**（TC-009 ~ TC-017、TC-019 ~ TC-021、TC-023 ~ TC-026、TC-028、TC-029、TC-031、TC-033、TC-034、TC-037 ~ TC-039、TC-041 ~ TC-044）
与 6 个 `test()` 的对应关系。`e2e/todo.spec.ts` 恰好 5 个功能用例，`e2e/tour.spec.ts` 恰好 1 个巡览用例 —— AC-03 判的是 `6 passed`，
新增 `test()` 会让该判据失效，因此 macOS 侧断言全部并入既有用例体。

## 总表（28 条 E2E TC → 6 个用例）

| TC | 覆盖 AC | 用例 |
| --- | --- | --- |
| TC-009 | AC-06 | 1 |
| TC-010 | AC-06 | 1 |
| TC-011 | AC-07 | 2 |
| TC-012 | AC-08 | 2 |
| TC-013 | AC-09 / AC-45 | 1 |
| TC-014 | AC-10 | 1（今日空态）/ 2（`D_EMPTY`） |
| TC-015 | AC-11（AC-46 在用例 4） | 2 |
| TC-016 | AC-12 / AC-50 | 5 |
| TC-017 | AC-13 | 2 |
| TC-019 | AC-14 / AC-47 | 2 |
| TC-020 | AC-14 | 1 |
| TC-021 | AC-15 | 5 |
| TC-023 | AC-16 | 5 |
| TC-024 | AC-17 | 5 |
| TC-025 | AC-18 | 5 |
| TC-026 | AC-19 / AC-48 / AC-49 | 5 |
| TC-028 | AC-20 / AC-51 | 3 |
| TC-029 | AC-21 | 3 |
| TC-031 | AC-23 | 3 |
| TC-033 | AC-25 | 3 |
| TC-034 | AC-26 | 3 |
| TC-037 | AC-28 / AC-52 | 3 |
| TC-038 | AC-29 | 3（强制夹具 `5w2h`） |
| TC-039 | AC-29 | 3（条件夹具，本次不成立） |
| TC-041 | AC-30 / AC-53 | 3 |
| TC-042 | AC-31 | 4 |
| TC-043 | AC-32 / AC-54 | 4 |
| TC-044 | AC-33 | 4 |

用例编号：1 应用加载 / 2 完整链路 / 3 每日工作法 / 4 全部待办 / 5 条目与编辑器 / 6 巡览（巡览不承担 TC，只产证据）。

## 运行方式

```bash
npx playwright test                      # 全量 6 个用例（AC-03）
npx playwright test e2e/tour.spec.ts     # 只重生成 screenshots/ 与 videos/（AC-05）
E2E_NOW=2026-11-15 npx playwright test   # 把时钟固定到指定日期复跑（AC-04 / TC-006）
```

`E2E_NOW` 只固定日期（`page.clock.setFixedTime`），所有夹具与断言仍由 `dayjs` 相对计算；两个复跑日期见
「命令类用例」一节。

## 功能用例 ↔ TC 映射

### 用例 1 · 应用加载（`1 · 应用加载: shell, 42-cell calendar and the empty day panel`）

| TC | 判定的断言 |
| --- | --- |
| TC-009 | 默认 `data-module="calendar"`；7 列星期头（日→六）；`.day-cell` = 42；今天格 `.today` + `.day-num` 加粗；`.day-cell[data-outside]` 存在且 `opacity < 1`；右栏默认今天 + `今天` 徽章 |
| TC-010 | 42 格全部带 `data-date`、互不重复、逐格 +1 天；每行 7 格；首列 `day() === 0`（周日）；每列互差 7 天 |
| TC-013 | 选中补位格（跨月）后点「今天」：月标题回本月、右栏回今天、`.day-cell.selected` 落在今天格 |
| TC-014 | `D_TODAY` 无待办：`这一天还没有待办` + `创建第一条待办`；点按钮打开新建编辑器且日期 = 该日 |
| TC-020 | 当日 0 条：`共 0 项`、`已完成 0 项`，`.stat-rate` **不渲染**（不是 0%） |

### 用例 2 · 完整链路（`2 · 完整链路: create, dots, priority, completion rate, cross-month`）

| TC | 判定的断言 |
| --- | --- |
| TC-011 | `D_OTHER` 3 条 → `.dot` 有、`.dot-count` 无；UI 新建第 4 条 → `.dot-count` 文本 `+`；菜单删除 1 条回 3 条 → `.dot-count` 消失 |
| TC-012 | 点 `[data-outside]` 精确匹配的日期格：右栏切到该日、月标题翻到该月；在该月造 1 条后折返再进入，圆点仍在（证明该月数据已加载，不是空数据） |
| TC-014 | 选中 `D_EMPTY`（+5 天且无待办）：空态按钮打开的编辑器日期 = 该日 |
| TC-015 | 该日 3 条全部完成后筛「未完成」：`没有符合筛选的待办`，空态内 `button` 数量 = 0 |
| TC-017 | 优先级标签连点 3 次：低 → 中 → 高 → 低，`data-priority` 0→1→2→0，三次 `background-color` 互不相同 |
| TC-019 | 3 条 0 完成勾 1 条 → `已完成 1 项` + `完成率 33%`；全勾 → `100%`；取消 1 条 → `67%` |

### 用例 3 · 每日工作法（`3 · 每日工作法: deterministic push, shuffle, history, library, scroll fade`）

| TC | 判定的断言 |
| --- | --- |
| TC-028 | 方法库点 `5w2h` → `.mc-name` 变 `5W2H 分析法`、`.mc-preview` 文案 `方法库预览`；`todo_local_daily_db` 中当日 `method_id` 未变；再点一次退出预览 |
| TC-029 | 首次进入该日：卡片立即有内容（无空卡片）；库中恰好 1 行、`manual = false`、`method_id` = 参考实现的首推 |
| TC-031 | 「换一条」→ 切到参考实现排列的**下一条**、`manual` 变 `true`、徽章 `已手动刷新`；期望值来自 `e2e/support/fixtures.ts` 内独立实现的 PRD 附录 A 算法，不调用应用的 `permutationFor` |
| TC-033 | `.history-item` = 7、日期升序、最后一行是今天、当前行 `.active`；点第 3 行后 `.dm-date-text` 的 `data-date` 与该行一致、主卡片切到该日（往期且未手刷时无徽章） |
| TC-034 | 标题 `65 条`；`.cf-btn` = 6 个，文案 `全部 / 思维方法 17 / 工作方法 17 / 汇报方法 12 / 沟通方法 7 / 效率方法 12`；逐个点选后 `.lib-item` 数量与计数一致 |
| TC-037 | `boundingBox()` 实测：步骤块底部 ≤ 适用场景块顶部、适用场景块底部 ≤ 案例块顶部、三者 `x` 差 ≤ 1px、卡片宽度 ≤ `.dv-main` 宽度 |
| TC-038 | `5w2h`：`.mc-inner` `scrollHeight > clientHeight`、`.mc-fade` 可见 → 滚到底后 `toBeHidden()`；`document.scrollingElement.scrollHeight ≤ innerHeight`（卡片不撑破页面） |
| TC-039 | `rice-scoring`：**条件夹具**。1280×800 实测 `scrollHeight = clientHeight`（不溢出），按计划记「夹具不成立，不判定」，以 Playwright annotation `fixture-not-applicable` 留痕，不判失败 |
| TC-041 | 日历页小卡片标题 `今日工作法`；点 `.mini-refresh` 后方法变化，`data-module` 仍为 `calendar`、`.cal-card` 可见、`.daily-module` 隐藏；库中当日 `method_id` 同步为下一条 |

### 用例 4 · 全部待办（`4 · 全部待办: cross-date groups, today marker, group progress, filters`）

| TC | 判定的断言 |
| --- | --- |
| TC-042 | `F_MIX`（昨天 1 条未完成 + 今天 1 条已完成）：2 个 `.group`、`data-group-date` 升序；今天组标题含 ` · 今天`、昨天组不含；组内计数 `1/1`、`0/1` |
| TC-043 | 筛「未完成」只剩昨天组、筛「已完成」只剩今天组，组标题/组内计数同步，统计行恒为 `共 2 项` / `完成率 50%`；最后清空 `todo_local_db` 重载：`暂无待办` 中性空态，空态内 `button` = 0（AC-54），统计行 `共 0 项` 且无完成率 |
| TC-044 | 当日面板筛到「已完成」→ 切全部待办仍为「全部」（2 组）；再切回日历，当日面板仍是「已完成」；另：选中另一个日期后当日面板筛选重置为「全部」（AC-46） |

### 用例 5 · 条目与编辑器（`5 · 条目与编辑器: row anatomy, menu branches, closing, flip, editor`）

| TC | 判定的断言 |
| --- | --- |
| TC-016 | 条目内 `button` 数量 = 4，且恰为 `.check` / `.item-body` / `.priority-tag` / `.more-btn`；`.item-note` 渲染备注；任意按钮的 `aria-label` / class 不含删除、垃圾桶、铅笔语义 |
| TC-021 | 往期条目菜单文案 `复制到今日 / 移动到今日 / 编辑 / 删除`、`data-action` 一一对应、无 `move-tomorrow`、`.ctx-sep` = 1；`.ctx-item.active` 恰好 1 个且文本为「复制到今日」；菜单父节点是 `BODY`（不被裁切） |
| TC-023 | 今日条目菜单文案 `移动明日 / 编辑 / 删除`、`data-action` = `move-tomorrow|edit|delete`，无复制/移动到今日 |
| TC-024 | 复制到今日：库中新增 1 条（标题/优先级 2/备注/未完成一致、日期 = 今天），原条目仍在往期，总数 +1；今日日历圆点存在；今日面板条目数增加 |
| TC-025 | 移动到今日 → `date = 今天` 且总数不变；再「移动明日」→ `date = 明天` 且总数不变；明天格圆点出现（跨月时先翻到该月） |
| TC-026 | 三种可在 Chromium 复现的关闭条件：① 点菜单外、② `Escape`、⑤ 真实滚轮滚动列表（先断言 `.todo-list` 可滚动且 `scrollTop` 真的变大）；键盘导航 `↓ ↓ ↓ ↑` 的高亮位移序列（跳过分隔线）、`Enter` 执行高亮项（打开编辑编辑器）；贴边翻转：`⋯` 触发时菜单右边界不超出触发点、四边余量 ≥ 8px，视口压矮后右下角条目向上翻转。菜单 ③ 窗口失焦 / ④ 窗口 resize 不在此用例（见下） |

## 未纳入 E2E 的部分（含原因）

| 项 | 原因 | 归属 |
| --- | --- | --- |
| 右键菜单 ③ 窗口失焦、④ 窗口尺寸变化 | Chromium 内无法产生真实的窗口级 blur/resize；`dispatchEvent(new Event('blur'))` 只能证明事件监听注册，不能证明系统行为，故不写成通过 | 人工 checklist M-05 / M-06 |
| AC-29 在 WKWebView 下的滚动/渐隐 | 引擎渲染差异（Safari vs Chromium） | 人工 M-11 + S6 `screencapture` |
| TC-018 / TC-030（重启后保持） | 需要桌面版进程重启与 `sqlite3` 查库 | 附录 A-5（桌面版） |
| TC-022（Control + 点击 / 双指点按） | 系统手势，Playwright 无等价能力 | 人工 M-02 / M-03 |
| TC-027（拖动窗口尺寸） | 窗口级操作 | 人工 M-06 |
| TC-040（触控板滚轮） | 真实输入设备 + WKWebView | 人工 M-11 |
| 桌面版 `.app` 取证、数据落盘、升级不丢数据 | S6 / S7 范围 | S6 `screencapture` + 人工 checklist |

## 命令类用例（同批执行，附证据）

| TC | 命令 | 结果 |
| --- | --- | --- |
| TC-005 | `npx playwright test` | `6 passed`；每个用例各自产出 `test-results/**/video.webm`，失败时留 `trace.zip` |
| TC-006 | `E2E_NOW=2026-11-15 npx playwright test` 与 `E2E_NOW=2026-11-30 npx playwright test` | 两次均 `6 passed`（月中 / 月末，无 strict-mode 冲突） |
| TC-007 | `grep -rnE "\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b|getDate\(\)|hasText\('[0-9]+'\)" e2e/` | 无命中（用例内零字面量日期） |
| TC-008 | `ls screenshots \| wc -l` / `ls videos/*.webm` | `14` / 1 个 `日程待办-产品功能巡览.webm`；两目录均在 `test-results/` 之外 |

## 关于「用例共享 localStorage」

FR-QA-03 的口径是**串行执行**（`fullyParallel: false` + `workers: 1`），本仓库照做。
Playwright 默认给每个 `test()` 新建浏览器上下文，因此 localStorage 在用例之间天然隔离；
本套件选择让**每个用例自行准备前置数据并在开头显式断言前置状态**（测试计划 §4.5 的要求），
而不是依赖前一个用例的副产物 —— 这样 6 个用例可以独立复跑、失败定位不串味。
造数优先级沿用 §3.6：能在 UI 走完的一律走 UI（用例 2 的 3 条待办、复制/移动/删除、编辑器都走真实点击），
只有列表规模（用例 5 的 20 条填充、用例 4 的分组夹具、巡览夹具）才写固定键名的 localStorage。
