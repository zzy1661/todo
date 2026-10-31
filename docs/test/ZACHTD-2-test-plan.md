# 测试计划与用例 · 日程待办 macOS 版（ZACHTD-2）

| 项 | 内容 |
| --- | --- |
| 文档编号 | TP-ZACHTD-2 |
| 关联 Issue | ZACHTD-2《规划 macOS 版「日程待办」App 开发（Tauri 2 + Vue 3，废弃原有代码，暂不执行）》 |
| 版本 | v1.0（T1 测试设计，待 Leader 判门） |
| 作者 | @Tester |
| 日期 | 2026-11-01 |
| 唯一判定基线 | PRD v1.1（`docs/requirements/ZACHTD-2-macos-prd.md`，962 行）§13 的 **44 条 AC** |
| 上游输入 | PRD v1.1；技术设计 `docs/design/ZACHTD-2-macos-design.md`（909 行）；四份 Windows 基线材料；`methods.ts`（附件 `01a192dc-26c1-7bc6-aea5-6cbcaee076cd`）；Leader 裁定 CFL-07 |
| 落地方式 | Confluence / JIRA 在本工作区不可写（无 skill、无凭据），按 Workflow E 降级：**本文件 + Issue 附件**即 T1 主副本；平台可用后原样发布，正文不需重写 |
| 本轮边界 | **只出规划与用例**。未执行任何用例、未 `npm install`、未 `npx playwright install`、未初始化工程、未做 git 操作、未设 deploy 目标 |

---

## 0. 本计划是什么，以及怎么用

### 0.1 判定纪律（先读这一条）

```
一条 AC 判 PASS = 该 AC 的「主 TC」证据齐全，且证据来自规定的那一层验证手段。
不允许的推论：
  ✗ 6/6 E2E 全绿 ⇒ 44 条 AC 全过（E2E 只覆盖 27 条的主判定）
  ✗ `npm run build` 通过 ⇒ 功能正确
  ✗ 实现者自述 + 截图一张 ⇒ 通过
  ✗ 未装依赖 / 未构建 / 未实机 ⇒ 判 PASS（只能 BLOCKED）
```

**T3 结论只允许三选一**：`PASS` / `FAIL` / `BLOCKED`。缺环境、缺构建产物、缺 G2.5 ⇒ `BLOCKED`，不得降级为 PASS。

### 0.2 本文件的阅读路径

| 你是 | 读哪些 |
| --- | --- |
| Leader 判 T1 门 | §1 范围、§5 用例清单、§6 追溯矩阵、§7 AC 缺口、§12 待确认项 |
| 实现（@资深全栈开发专家） | §3 配置/选择器契约、§4 夹具、§5 里"落点=E2E 用例 N"的断言、§12 待确认项 |
| T3 执行（我自己） | §3、§4、§8 人工清单、§10 执行计划、§11 门禁 |
| 评审（@Reviewer） | §7 缺口、§9 风险、§12 待确认项 |

### 0.3 我在本轮实际做过的事（只做只读核对，不算执行测试）

1. 读全 PRD v1.1 与设计文档全文；
2. 下载 `methods.ts`（78,817 字节 / 1,450 行），用本机 Node v22.21.1 的 type-stripping **独立求值 `METHODS`**，逐项复跑 PRD §11.4 / §11.5 的基准值（结果见 §4.1，与 PRD 一致，与设计文档有 2 处数字口径差异，见 §4.2）；
3. 核对 SPEC §8.2 的选择器清单与 PRD AC 中引用的选择器是否可落地（差异见 §3.4 与 §12）。

**没有做**：没有跑任何 E2E、没有构建、没有装依赖、没有进开发实现。这也是本轮的边界。

---

## 1. 测试范围

### 1.1 范围内（本期必测）

| 域 | 覆盖内容 | 主判定层 |
| --- | --- | --- |
| 构建与工程基线 | 类型检查、1420 固定端口、E2E 6 用例、日期无关性、巡览产物 | L0 命令 + L1 E2E |
| 日历模块 | 42 格网格、四态、圆点与 `+`、跨月跟随、今天按钮、两种空态 | L1 E2E |
| 待办条目与右键菜单 | 行内四元素、优先级循环、完成率、菜单按日期分支、复制/移动、五种关闭条件 | L1 E2E + L3 人工 |
| 每日工作法 | 确定性推送、落库与重启保持、换一条、排列等价、往期 7 天、方法库 65 条、卡片几何、溢出滚动与渐隐 | L0 脚本 + L1 E2E + L3 人工 |
| 全部待办 | 跨日期分组、今天是标记、组内统计、三筛选、与当日面板筛选独立 | L1 E2E |
| 数据层与迁移 | 建库建表、双数据源隔离、升级 diff、迁移只增不改、卸载重装保留 | L0 命令 + L3 人工 |
| macOS 交付物 | `.app` / `.dmg` 产物、架构与最低版本、启动、断网可用、依赖克制、Windows 残留、范围边界 | L0 命令 + L3 人工 |

### 1.2 明确不测（与 OP- 一致，避免误判为缺陷）

| 不测项 | 依据 |
| --- | --- |
| Windows 端任何行为 / Windows 打包 | NS-09；本 issue 不交付 Windows 版 |
| 从 Windows `todo.db` 迁移数据 | OP-02 已关闭：不继承，空库起步（交付说明声明即可） |
| 代码签名、公证、`spctl` 通过 | OP-05 已关闭：本期不做；`spctl` 返回 `rejected` 属预期，**不得判交付失败** |
| 系统菜单栏中文化 | OP-10 已关闭：框架默认英文，BR-22 白名单不含系统菜单栏 |
| 深色模式适配 | OP-11 已关闭：固定浅色 |
| 与 Windows 逐像素一致 | 设计 §6.2：只承诺行为等价；字体栈在 macOS 命中 PingFang SC，字宽/行高必然有差 |
| 性能、并发、压力 | 单用户本地应用（BR-18），PRD 未定义指标 |

### 1.3 设计研读摘要（采纳哪些、质疑哪些）

| # | 设计侧结论 | 我的处置 |
| --- | --- | --- |
| D-1 | `check-cases.mjs` 按 CFL-07 断言 `steps ≥ 2`，并打印真实分布 3–7 | **采纳**，并加一条**负向**用例（TC-036）证明脚本不是"永真" |
| D-2 | 溢出夹具固定 `5w2h` 与 `rice-scoring` | **部分采纳**：`5w2h` 升为**强制**夹具；`rice-scoring` 降为**条件**夹具（理由见 §4.2，其正文总长与 `first-principles` 仅差 1 字符，临界可能不溢出） |
| D-3 | E2E 仍是「5 功能 + 1 巡览」= 6 个 `test()` | **采纳并升为硬约束**：AC-03 判定 `6 passed`，**任何新增 `test()` 都会让 AC-03 自己失效**；macOS 新断言必须并入既有用例的断言体（§3.3） |
| D-4 | 三层证据链：Chromium 巡览 → `screencapture -l` 窗口级抓图 → 人工 checklist M-01~M-12 | **采纳**，M- 清单编号沿用不另起，仅补 M-13 / M-14 两项（§8） |
| D-5 | `AC-36` 用"覆盖安装新构建"验证升级不丢数据 | **质疑**：本期是 0.1.0 首次发布，**不存在"上一版本"**。见 §9 BLK-01，需 Leader 决定用「双构建法」还是把 AC-36 降级为 BLOCKED |
| D-6 | 选择器沿用 SPEC §8.2（`.day-cell` / `.day-num` / `.mc-inner` 等） | **采纳**，但发现 2 处选择器契约缺口（§3.4 / Q-T-01），不补上会让 AC-06/AC-07 的断言变脆 |

---

## 2. 验证体系（四层证据链）

```
L0 静态与脚本        check-cases.mjs / check-permutation.mjs / grep / package.json 扫描 / sqlite3
   ↓
L1 E2E（Chromium）   6 个 test()：5 功能 + 1 巡览；断言并入，不新增用例
   ↓
L2 桌面产物          .app 启动、lipo -archs、plutil、sqlite3 直查、screencapture -x -o -l<winid>
   ↓
L3 人工 checklist    M-01 ~ M-14（Gatekeeper / 手势 / 失焦 / resize / 原生控件 / 断网 / 破坏性操作）
```

| 层 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| L0 | 数据与源码事实、产物形态、迁移是否只增不改 | 任何界面行为 |
| L1 | Chromium 下的可观察行为、几何关系、文本与状态 | WKWebView 的真实渲染、系统级交互、SQLite 落盘 |
| L2 | 桌面版真的能跑、数据真的落到 `Application Support`、架构与最低版本 | 交互细节（无自动化驱动 WKWebView） |
| L3 | 系统层与引擎层差异、Gatekeeper、断网、破坏性操作 | 可重复性（人工记录必须带截图与时间戳） |

---

## 3. 环境与配置契约

### 3.1 机器事实（Leader 实测 + 我复核）

```
macOS 14.1 (23B2073) · arm64
Node v22.21.1 / npm 10.9.4          ← 材料是 Node v20.19 / npm 10.8，不照抄
cargo / rustc 在 ~/.cargo/bin（已在 PATH）
xcode-select → /Library/Developer/CommandLineTools   ← 只有 CLT，没有完整 Xcode
```

对测试的直接影响：

| 事实 | 影响 |
| --- | --- |
| 只有 CLT | arm64 的 `.app` + `.dmg` 可构建（`clang` + `hdiutil` 在 CLT 内）；**公证、universal 二进制不可做**——本期都不做，故不阻塞 |
| 无完整 Xcode | 任何依赖 `xcodebuild` / `notarytool` 的步骤一律不纳入本期验收（若将来做 OP-05，需先装完整 Xcode） |
| `screencapture` 需「屏幕录制」授权 | 未授权时 `CGWindowList` 拿到的窗口名为空、抓图为空 → L2 证据链会静默失败。执行前必须先确认授权（M-11 / M-12 的前置） |

### 3.2 Playwright 配置契约（OP-06 默认，`channel` 必须去掉）

执行阶段 `playwright.config.ts` 的目标态（本计划据此写用例，不在本轮创建文件）：

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // 用例共享 localStorage，必须串行
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:1420',
    video: 'on',                 // 每个用例都留视频
    trace: 'retain-on-failure',  // 失败留 trace
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],  // 无 channel（OP-06）
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
  },
});
```

**验收口径**：

| 项 | 期望 | 判定 |
| --- | --- | --- |
| `channel` 字段 | 全文不存在 | `grep -n "channel" playwright.config.ts` 无输出 |
| project 名 | `chromium` | 报告里 `project` 列为 chromium（不是 edge） |
| 浏览器来源 | Playwright 自带 | 首次 `npx playwright install chromium`；`~/Library/Caches/ms-playwright/chromium-*` 存在 |
| 串行 | `workers: 1` + `fullyParallel: false` | 报告执行顺序即文件顺序，无并发交错 |
| 视频 | 每用例 1 个 webm | `test-results/**/video.webm` 数量 = 用例数 |
| trace | 仅失败用例 | 全绿时无 `trace.zip`；人为制造失败后出现 |

### 3.3 E2E 用例数与结构契约（硬约束）

- **必须恰好 6 个 `test()`**：`e2e/todo.spec.ts` 5 个 + `e2e/tour.spec.ts` 1 个。AC-03 的 Then 是 `6 passed`。
- macOS 侧新增断言（`.app` 相关除外）**全部并入既有 5 个用例的断言体**，不新建 `test()`、不新建 spec 文件。若确实需要独立用例，必须先由 Leader 改 AC-03（属范围变更，不在本轮）。
- **巡览用例必须可独立运行**（附录 B.3 单独跑 `e2e/tour.spec.ts` 重生成产物），所以 `tour.spec.ts` 必须**自包含造数**，不能依赖 `todo.spec.ts` 留下的 localStorage 状态。
- 5 个功能用例保留基线「串行 + 共享状态」约定（用例 2 造的数据被后续用例复用）；每个用例进入时若依赖前序数据，必须**显式断言前置状态**，不得假设。

### 3.4 选择器契约（含 2 处缺口）

| 元素 | 选择器 | 来源 | 状态 |
| --- | --- | --- | --- |
| 待办条目 | `.todo-item` | SPEC §8.2 | 可用 |
| 完成圆圈 / 标题区 / 优先级 / 更多 | `.check` / `.item-body` / `.priority-tag` / `.more-btn` | SPEC §8.2 | 可用 |
| 右键菜单 / 菜单项 | `.ctx-menu` / `.ctx-item` | SPEC §8.2 | 可用 |
| 编辑器 / 优先级选项 | `.editor` / `.priority-option` | SPEC §8.2 | 可用 |
| 日期格 / 日期数字 | `.day-cell` / `.day-num` / `.day-cell.out-month` | SPEC §8.2 + §8.3 | 可用（**按 `.day-num` 精确匹配**） |
| 圆点 / `+` 标记 | `.day-dots .dot` / `.day-dots .dot-count` | SPEC §2.1（AC-07 引用 `.dot-count`） | 可用 |
| 分组 / 组内列表 | `.group` / `.group-items` | SPEC §8.2 | 可用 |
| 工作法卡片 | `.method-card` / `.mc-inner` / `.mc-name` / `.mc-cat` / `.mc-steps-block` / `.mc-box` / `.mc-case` / `.case-title` | SPEC §8.2 + 设计 §6.3 | 可用 |
| 方法库 / 分类筛选 / 往期 | `.lib-item` / `.cf-btn` / `.history-item` | SPEC §8.2 | 可用 |
| 导航项 | `.nav-item` | SPEC §8.2 | 可用 |
| 底部渐隐提示 | **未定义 class** | SPEC §3.2 仅描述 `showFade` 逻辑 | ⚠ **缺口 Q-T-01**：需设计侧给稳定 class（建议 `.mc-fade`），否则 AC-29「渐隐消失」只能靠截图目测 |
| 日期格的日期值 | **无 `data-date`** | — | ⚠ **缺口 Q-T-02**：`.day-cell` 是否带 `data-date="YYYY-MM-DD"` 未定义。没有它，AC-06「周日起始/42 格对齐」与 AC-08「跨月补位格精确定位」只能用文本推断，月末换日易脆断 |

### 3.5 日期无关性纪律（BR-19 / AC-04 / FR-QA-06）

```ts
// ✅ 唯一允许的日期定位方式
page.locator('.day-cell:not(.out-month)')
    .filter({ has: page.locator('.day-num', { hasText: /^29$/ }) })
    .first();

// ❌ 禁止：hasText('29') 会同时命中本月 29 与上月补位 29 → strict mode 报错（且只在特定日期触发）
```

- 用例内**所有日期由 dayjs 相对计算**（`dayjs().format('YYYY-MM-DD')`、`.subtract(1,'day')`、`.add(1,'month')`），不得出现字面量日期。
- 断言"今天高亮"时，用 `dayjs().date()` 生成期望的日号，不得写死。
- 跨月夹具统一用「本月 1 日所在格的补位区」或「下月 15 日」，禁止依赖"当月有 28/30/31 天"。

### 3.6 数据隔离纪律（BR-14 / FR-DB-10）

| 环境 | 数据载体 | 谁可以写 |
| --- | --- | --- |
| L1 E2E（Chromium） | `localStorage`：`todo_local_db` / `todo_local_daily_db`（键名固定，不得改名/合并） | 只有 E2E 用例 |
| L2/L3 桌面版 | `~/Library/Application Support/com.poisson.todo/todo.db` | 只有人工/桌面操作 |

规则：

1. 任何 E2E 步骤**不得**碰 `todo.db`；任何桌面版验证不得依赖 E2E 留下的数据（AC-35 正是反向验证这一点）。
2. 桌面版验证**默认只读浏览**；必须造数据时，验证后逐条删除并比对 `count` / `id` / `date` / `done` / `title` 还原（BR-14）。
3. 造数优先级：**UI 造数 > `addInitScript` 种 localStorage**。因为 localStorage 的字段结构属实现细节，硬编码会让用例与实现耦合；只有在 UI 路径过长（如 AC-07 造 4 条）时才允许种数据，且必须只用 §3.6 的固定键名 + PRD §11.1/§11.2 的字段口径。

### 3.7 产物与目录纪律（FR-QA-04 / AC-05）

| 目录 | 内容 | 生命周期 |
| --- | --- | --- |
| `test-results/` | Playwright 默认输出（视频、trace） | **每次运行被清空** |
| `screenshots/` | 巡览 14 张（`01-…` ~ `14-…`）+ 桌面取证 `15-…` ~ `18-…` | 必须长期留存 → **放在 `test-results/` 之外** |
| `videos/` | 巡览连续录屏 1 个 webm | 同上 |
| `verify/` | 数据快照与 `diff` 结果（`before.txt` / `after.txt` / `picks-*.txt`） | 随验收记录留存 |

判定：`ls screenshots | wc -l` = 14（不含 `15-…` 桌面取证时），`ls videos/*.webm` 非空，且 `screenshots` / `videos` 均**不在** `test-results/` 下。

---

## 4. 测试数据与夹具

### 4.1 内容库基线（我用 Node v22.21.1 独立求值 `methods.ts` 的结果）

| 断言 | 基准 | 我的实测 | 结论 |
| --- | --- | --- | --- |
| 方法总数 | 65 | 65 | 一致 |
| 分类分布 | 17 / 17 / 12 / 7 / 12 | thinking 17 / work 17 / report 12 / communication 7 / efficiency 12 | 一致 |
| `case.type` 分布 | 18 practice / 47 story | practice 18 / story 47 / 无 `case` 0 | 一致 |
| `steps` 分布 | 3×6 / 4×55 / 5×3 / 7×1 | 完全相同，最小 3、最大 7，**无 2 条条目** | 一致 |
| 超限（> 4）条目 | `gtd` / `smart-goal` / `5w2h` / `rice-scoring` | 4 条全中（5 / 5 / 7 / 5） | 一致，CFL-07 判合规 |
| 案例正文长度 | 126–240，均值 ≈162 | min 126 / max 240 / avg 162.4，越界 0 | 一致 |
| `id` 唯一 | 唯一 | 65 唯一，重复 0 | 一致 |
| 必填字段 | 齐全 | 缺失 0 | 一致 |
| 三个导出 | `METHODS` / `METHOD_MAP` / `CATEGORY_COUNTS` | 均在，`METHOD_MAP` = 65 | 一致 |

**CFL-07 口径落进用例**：`steps` 断言写 **`>= 2`**，并断言真实分布为 `3×6 / 4×55 / 5×3 / 7×1`；4 条超限条目**判通过**。任何把 `steps` 判成 2–4 的实现或脚本都属**脚本口径错误**，不得据此判 AC-27 失败。

### 4.2 溢出夹具裁定（与设计 §6.3 的一处数字口径差异）

我对 65 条做全字段字符统计（`summary + steps + when + action + case.content`）：

| id | steps | 步骤总字数 | 单步最长 | 案例正文 | 全文字符 |
| --- | --- | --- | --- | --- | --- |
| `rice-scoring` | 5 | 93 | **31** | 204 | **404** |
| `first-principles` | 4 | 66 | 20 | **240** | 403 |
| `5w2h` | **7** | 105 | 18 | 184 | 382 |
| `gtd` | 5 | 89 | 23 | 207 | 371 |

与设计 §6.3 的差异：

| 设计说法 | 我的实测 | 处置 |
| --- | --- | --- |
| `rice-scoring` 正文总长最大 = 426 字符 | 404（按我的口径）；`first-principles` 403，**仅差 1 字符** | 不把「rice-scoring 一定溢出」写成硬断言 |
| `5w2h` "每条 step 文本 ≤ 31 字符，最长即 `5w2h`" | `5w2h` 单步最长 18；单步最长 31 的是 `rice-scoring` | 该句属表述笔误，不影响结论（`5w2h` 靠 7 条 step 成为最高卡片） |

**本计划的夹具裁定**：

- `5w2h`：**强制**溢出夹具（7 条 step = 高度主因，不受字宽微小差异影响）→ AC-29 的判定由它单独承担。
- `rice-scoring`：**条件**夹具。断言「若 `scrollHeight > clientHeight` 则必须出现渐隐且滚到底消失」；若实测未溢出，记为「夹具不成立，本次不判定」，**不判失败**——否则会把渲染临界值当成功能缺陷（反向也会漏：真溢出时不报）。
- `first-principles`：仅作观察项（案例正文最长 240），不纳入判定。
- 渐隐阈值 `scrollHeight - scrollTop - clientHeight > 8` 与切换后 260ms 重算时序**不得为测试而调整**（设计 §6.3 第 2/3 条）。

### 4.3 日期夹具（全部动态生成，禁止字面量）

| 夹具 | 定义 | 用于 |
| --- | --- | --- |
| `D_TODAY` | `dayjs().format('YYYY-MM-DD')` | AC-09/14/16/17/23/31/34… |
| `D_YESTERDAY` | `dayjs().subtract(1,'day')` | AC-31/32（跨日期分组） |
| `D_TOMORROW` | `dayjs().add(1,'day')` | AC-18（移动明日） |
| `D_OTHER` | `dayjs().subtract(3,'day')`（避开月初/月末） | AC-15/17/18（非今日条目） |
| `D_EMPTY` | `dayjs().add(5,'day')` 且该日无任何待办 | AC-10（当日空态） |
| `D_NEXT_MONTH_15` | `dayjs().add(1,'month').date(15)` | AC-08（点补位格→翻月） |
| `M_MID` / `M_END` | 当月 15 日 / 当月最后一天（供 `page.clock` 固定） | AC-04（月中/月末两次全量） |

### 4.4 造数夹具

| 夹具 | 内容 | 用于 |
| --- | --- | --- |
| `F_3` | `D_OTHER` 上 3 条未完成（低/中/高各 1） | AC-07（无 `+`）、AC-14（完成率 33%） |
| `F_4` | `D_OTHER` 上 4 条 | AC-07（出现 `+`） |
| `F_MIX` | `D_YESTERDAY` 1 条未完成 + `D_TODAY` 1 条已完成 | AC-31/32/33 |
| `F_EDIT` | 1 条带备注的条目 | AC-12（`.item-body` 含备注）、AC-13 |
| `F_MENU_TODAY` / `F_MENU_OTHER` | 今日条目 / 非今日条目各 1 | AC-15/16/17/18 |

造数一律走编辑器 UI（`+ 新建待办` → 填标题 → 选日期 → 选优先级 → 保存），避免与 localStorage 结构耦合。

### 4.5 重置与幂等

- 5 个功能用例串行共享状态：**不新增 beforeEach 全清**（会破坏基线用例 2→3→4 的数据传递）。
- 每个用例开头断言自身依赖的前置状态；不满足则抛错并提示「本用例依赖用例 N 的产物，请按顺序全量运行」。
- 巡览用例自包含：内部自行清空 localStorage → 造数 → 截图 → 结束（保证 B.3 可单独执行）。

---

## 5. 用例清单（56 条，TC-001 ~ TC-056）

列说明：**覆盖 AC** = 该用例主判定的验收标准；**类型** = `E2E` / `命令` / `人工`；**落点** = 归属的既有 `test()` 或命令（E2E 用例编号沿用设计 §9.2：1 应用加载 / 2 完整链路 / 3 每日工作法 / 4 全部待办 / 5 右键菜单 / 6 巡览）。

### 5.1 A 组 · 构建与工程基线（AC-01 ~ AC-05）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-001 | AC-01 | G: `npm ci` 完成；W: `npm run build`；T: 退出码 0、`vue-tsc --noEmit` 零错误、`vite build` 成功 | 命令 | 附录 A-1 |
| TC-002 | AC-01 | W: `test -f dist/index.html && test -s dist/index.html`；T: 产物存在且非空 | 命令 | 附录 A-1 |
| TC-003 | AC-02 | G: 1420 未被占用；W: `npm run dev` 后台起；T: `curl -sI http://localhost:1420` 首行 200 | 命令 | 附录 A-2（**不可在 Playwright webServer 内做**：`reuseExistingServer` 会掩盖第二个实例） |
| TC-004 | AC-02 | G: TC-003 的实例还在；W: 再起第二个 `npm run dev`；T: 进程非零退出、不监听 1421–1430、输出含端口占用/`strictPort` 提示 | 命令 | 附录 A-2 |
| TC-005 | AC-03 | G: `npx playwright install chromium` 已执行；W: `npx playwright test --reporter=list`；T: `6 passed`；`test-results/**/video.webm` ≥ 6；失败用例有 `trace.zip` | 命令 | 附录 A-3 |
| TC-006 | AC-04 | G: 用例已日期相对化；W: 分别把时钟固定到 `M_MID`（15 日）与 `M_END`（月末最后一天）各跑一次全量；T: 两次均 `6 passed`，无 strict-mode 冲突、无"resolved to N elements" | 命令 | 附录 A-3（`page.clock.install`；Playwright < 1.45 时退化为真实月末复跑，见 §9 R-T-03） |
| TC-007 | AC-04 | W: 静态检索 `e2e/` 内日期来源：`grep -rnE "\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b\|getDate()\|hasText\('[0-9]+'\)" e2e/`；T: 无字面量日期、无按数字文本定位日期格 | 命令 | 附录 A-3 |
| TC-008 | AC-05 | W: `ls screenshots \| wc -l` / `ls videos/*.webm` / 检查 `screenshots` 与 `videos` 不在 `test-results/` 下；T: 14 / 非空 / 均不在 | 命令 | 附录 A-4 |

### 5.2 B 组 · 日历模块（AC-06 ~ AC-11）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-009 | AC-06 | G: 首次启动；W: 观察日历页；T: 默认日历模块、7 列星期头（日→六）、`.day-cell` = 42、今天格 `.day-num` 主色加粗、`.day-cell.out-month` 存在且弱化、右栏默认今天 | E2E | 用例 1 |
| TC-010 | AC-06 | W: 断言网格为 6 行 × 7 列且首列是周日；T: 每行 7 格、共 6 行；首列 7 格日期互差 7 天；第一列表头为「日」 | E2E | 用例 1（依赖 Q-T-02 的 `data-date`；无则退化为「星期头顺序 + 首格日期与表头一致」的弱断言） |
| TC-011 | AC-07 | G: `F_3`（3 条）；W: 观察该日格；T: `.day-dots .dot` 存在、`.dot-count` **不存在**；再造第 4 条 → `.dot-count` 出现且文本为 `+`；删 1 条回 3 条 → 消失 | E2E | 用例 2 |
| TC-012 | AC-08 | G: 日历显示本月；W: 点击 `.day-cell.out-month` 中下月 15 日那格；T: 右栏切到该日、月标题变为下月、下月圆点数据已加载（不是空数据） | E2E | 用例 2 |
| TC-013 | AC-09 | G: 已翻月且选中了非今日日期；W: 点「今天」；T: 月标题回本月、右栏回今天、`.day-cell.selected` 落在今天那格 | E2E | 用例 1 |
| TC-014 | AC-10 | G: `D_EMPTY` 无任何待办；W: 选中该日；T: 显示 `这一天还没有待办` 与「创建第一条待办」按钮；点按钮打开编辑器且日期默认 = 该日 | E2E | 用例 1（文案）/ 用例 2（按钮默认日期） |
| TC-015 | AC-11 | G: 某日 2 条均未完成；W: 切「已完成」页签；T: 显示 `没有符合筛选的待办`，且**不出现**创建按钮 | E2E | 用例 4 变体（并入） |

### 5.3 C 组 · 待办条目与右键菜单（AC-12 ~ AC-19）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-016 | AC-12 | G: 1 条带备注的待办；W: 枚举条目内可交互元素；T: 恰好 `.check` / `.item-body` / `.priority-tag` / `.more-btn` 四类；无铅笔、无垃圾桶、无独立「删除」按钮 | E2E | 用例 5 |
| TC-017 | AC-13 | G: 一条优先级「低」；W: 连点 `.priority-tag` 3 次；T: 文本依次 中 → 高 → 低；颜色按 绿/黄/红 切换（断言 class 或 `background-color` 一致变化） | E2E | 用例 2 |
| TC-018 | AC-13 | G: 桌面版把某条设为「高」；W: 退出并重启桌面版；T: 该条仍为「高」，`sqlite3` 查 `priority = 2` | 命令+人工 | 附录 A-5 |
| TC-019 | AC-14 | G: 3 条 0 完成；W: 勾 1 条；T: `已完成 1 项`、`完成率 33%`；全勾 → `完成率 100%`；取消 1 条 → 回 67% | E2E | 用例 2（33% / 67% 段）+ 用例 4 变体（100% 段） |
| TC-020 | AC-14 | G: 当日 0 条；W: 观察统计行；T: 显示 `共 0 项`、`已完成 0 项`，**不显示**完成率（也不显示 `0%`） | E2E | 用例 1 |
| TC-021 | AC-15 | G: 一条 `D_OTHER`（非今日）条目；W: 右键打开菜单；T: `.ctx-item` 文本集合 = {复制到今日, 移动到今日, 编辑, 删除}，**无**「移动明日」；分隔线存在 | E2E | 用例 5 |
| TC-022 | AC-15 | G: 桌面版同一条非今日条目；W: ① Control + 点击 ② 双指点按；T: 两种手势都弹出同一菜单，系统默认右键菜单不出现 | 人工 | M-02 / M-03 |
| TC-023 | AC-16 | G: 一条 `D_TODAY` 条目；W: 打开菜单；T: 文本集合 = {移动明日, 编辑, 删除}，**无**「复制到今日」「移动到今日」 | E2E | 用例 5 |
| TC-024 | AC-17 | G: `D_OTHER` 1 条（含备注、优先级高）；W: 点「复制到今日」；T: 今日新增 1 条（标题/优先级/备注相同、未完成）；原条目仍在 `D_OTHER`；总条数 +1；今日日历圆点出现 | E2E | 用例 5 + 附录 A-5 计数 |
| TC-025 | AC-18 | G: 非今日 1 条；W: 点「移动到今日」→ 再对同条点「移动明日」；T: 第一次 `date = D_TODAY` 且总数不变；第二次 `date = D_TOMORROW` 且总数不变；两次后日历圆点随之迁移（BR-09） | E2E | 用例 5 + 附录 A-5 |
| TC-026 | AC-19 | G: 菜单已打开；W: ① 点菜单外 ② 按 Esc ③ 触发窗口失焦（E2E 用 `window.dispatchEvent(new Event('blur'))` 模拟）⑤ 滚动列表；T: 每种操作后 `.ctx-menu` 不存在 | E2E | 用例 5（③ 为事件级模拟，真机切换应用由 M-05 复核） |
| TC-027 | AC-19 | G: 桌面版菜单已打开；W: ④ 拖动改变窗口尺寸；T: 菜单关闭 | 人工 | M-06 |

### 5.4 D 组 · 每日工作法（AC-20 ~ AC-30）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-028 | AC-20 | G: `daily_picks` 当日已有记录；W: 在方法库点另一条；T: `.mc-name` 变为该条、状态徽章文本 = `方法库预览`；该日 `method_id` 未变（E2E 查 localStorage / 桌面查库） | E2E+命令 | 用例 3 + 附录 A-5 |
| TC-029 | AC-21 | G: 该日无推送记录（清空 `todo_local_daily_db` / 删除该行）；W: 首次打开该日；T: 立即显示方法卡片（无空卡片），且落库 1 行、`manual = 0`、`method_id` ∈ 内容库 | 命令+E2E | 用例 3 + 附录 A-5 |
| TC-030 | AC-22 | G: 某日已推送方法 A；W: 退出应用、重启、再打开同一天；T: 仍是 A；重启前后 `method_id` 相同、该行 `updated_at` 未变 | 命令 | 附录 A-5（桌面版） |
| TC-031 | AC-23 | G: 该日 `manual = 0` 且方法 = 排列第 k 条；W: 点「换一条」；T: 切到第 `(k+1) % 65` 条（**用参考实现算期望，不用应用自己的函数**）、`manual` 0→1、徽章变 `已手动刷新`；重启后仍是该条 | 命令+E2E | 用例 3 + 附录 A-5 |
| TC-032 | AC-24 | G: 参考实现（按 PRD 附录 A 独立实现）就绪；W: `node scripts/check-permutation.mjs` 对 7 个抽样日期（`2026-01-01` / `02-28` / `03-15` / `06-30` / `10-31` / `12-31` / `2027-07-04`）；T: 每日 65 个 id 的排列序列与参考实现逐位一致、首条一致、重复计算 3 次一致，退出码 0 打印 7 组 MATCH | 命令 | 附录 A-6 |
| TC-033 | AC-25 | G: 打开每日工作法；W: 观察往期回顾并点第 3 行；T: `.history-item` = 7、日期由早到晚、当前日行高亮、点击后主卡片切到该日 | E2E | 用例 3 |
| TC-034 | AC-26 | G: 打开方法库；W: 观察标题与筛选按钮；T: 标题含 `65 条`；`.cf-btn` 计数为 全部 / 思维 17 / 工作 17 / 汇报 12 / 沟通 7 / 效率 12，合计 65；点每个分类后列表条数与计数一致 | E2E+命令 | 用例 3 + 附录 A-7 |
| TC-035 | AC-27 | G: 内容库就位；W: `node scripts/check-cases.mjs`；T: 退出码 0；输出总数 65 / 分类 17/17/12/7/12 / case 18+47 / `steps` ≥2 且分布 3×6·4×55·5×3·7×1 / 正文 126–240；4 条超限条目**未被判红** | 命令 | 附录 A-7 |
| TC-036 | AC-27 | G: 内容库副本放临时目录；W: ① 删 1 条 ② 造 1 条 `steps = 1` ③ 把某条 `case.type` 改成非法值 ④ 把某条案例正文截到 100 字；T: 四种篡改**各自**使脚本退出码 ≠ 0（证明断言不是永真）；而保留 4 条超限条目时退出码 = 0 | 命令 | 附录 A-7（负向） |
| TC-037 | AC-28 | G: 打开任一方法卡；W: 用 `boundingBox()` 取几何；T: `stepsBlock.y + height < box.y`、`box.y + height < caseBlock.y`；三者 `x` 相等（容差 1px）；卡片宽度 ≤ 内容区宽度 | E2E | 用例 3 |
| TC-038 | AC-29 | G: 通过方法库打开 `5w2h`；W: 读 `.mc-inner` 的 `scrollHeight/clientHeight`、滚到底；T: `scrollHeight > clientHeight`；底部渐隐存在 → 滚到底后消失；`document.scrollingElement.scrollHeight <= window.innerHeight`（卡片不撑破页面） | E2E | 用例 3（**强制夹具**） |
| TC-039 | AC-29 | G: 打开 `rice-scoring`；W: 同上；T: 若 `scrollHeight > clientHeight` → 断言渐隐与滚到底消失；若未溢出 → 记「夹具不成立，不判定」，**不判失败** | E2E | 用例 3（**条件夹具**，理由见 §4.2） |
| TC-040 | AC-29 | G: 桌面版打开 `5w2h`；W: 触控板/鼠标滚轮滚动；T: 卡片内部滚动、渐隐出现且滚到底消失、页面外层不滚动、卡片不撑破窗口 | 人工 | M-11（WKWebView 渲染差异） |
| TC-041 | AC-30 | G: 日历页且今天有推送；W: 观察小卡片标题后点刷新圆钮；T: 标题 = `今日工作法`；点击后方法内容变化但**仍停留在日历模块**（`.day-cell` 仍可见、方法卡模块容器不出现） | E2E | 用例 3 |

### 5.5 E 组 · 全部待办（AC-31 ~ AC-33）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-042 | AC-31 | G: `F_MIX`（昨天 1 条未完成 + 今天 1 条已完成）；W: 打开全部待办；T: 2 个 `.group`；今天组标题以 ` · 今天` 结尾、昨天组无；组内右上角分别 `1/1`（今天）、`0/1`（昨天）；组按日期升序 | E2E | 用例 4 |
| TC-043 | AC-32 | G: 同上；W: 依次筛「未完成」「已完成」；T: 未完成只剩昨天组、已完成只剩今天组；组标题与组内统计同步正确；统计行（共 N 项）不随筛选变化 | E2E | 用例 4 |
| TC-044 | AC-33 | G: 当日面板筛到「已完成」；W: 切到全部待办；T: 全部待办仍是「全部」（反之亦然） | E2E | 用例 4（并入） |

### 5.6 F 组 · 数据层与迁移（AC-34 ~ AC-38）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-045 | AC-34 | G: 桌面版从未运行过（先备份并移走旧库）；W: 启动并新建 1 条；T: `~/Library/Application Support/com.poisson.todo/todo.db` 存在；`.tables` 含 `todos` 与 `daily_picks`；`count(*) = 1`；字段口径为 `YYYY-MM-DD` / `priority` 0-2 / `done` 0-1 | 命令 | 附录 A-5 |
| TC-046 | AC-35 | G: 桌面版有 3 条（记录 count 与明细）；W: 在同一台机器上跑全量 E2E；T: 桌面版仍 3 条、明细逐字节一致；E2E 数据只在 localStorage | 命令+人工 | 附录 A-5 |
| TC-047 | AC-36 | G: 上一版本已安装并造 5 条（含不同日期与完成态）；W: 覆盖安装新构建后启动 → 只读浏览 → 退出；T: `todos` 5 条且 id/date/done/title 一致；`daily_picks` 不丢；迁移版本号只增不减；`diff` 为空 | 命令 | 附录 A-5（**依赖 BLK-01 的双构建方案**，见 §9） |
| TC-048 | AC-37 | W: 检索迁移源码 `grep -nE "DROP \|ALTER "`、`grep -nE "DELETE\|UPDATE"` 限定在迁移块；T: 只有 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`；无 `DROP` / `ALTER` / 对既有表的数据改写 | 命令 | 附录 A-8 |
| TC-049 | AC-38 | G: 桌面版有数据（先 `cp` 备份 `todo.db` 到 `verify/`）；W: `rm -rf "/Applications/日程待办.app"` → 重新装 `.app` → 启动；T: 待办条数与明细不变 | 人工 | M-12（**破坏性，需先备份并获得执行许可**） |

### 5.7 G 组 · macOS 交付物与范围（AC-39 ~ AC-44）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-050 | AC-39 | G: 依赖与工具链就绪；W: `npm run tauri build`；T: 退出码 0；`src-tauri/target/release/bundle/macos/日程待办.app` 与 `.../bundle/dmg/日程待办_0.1.0_aarch64.dmg` 均存在 | 命令 | 附录 A-9 |
| TC-051 | AC-39 | W: `lipo -archs "…/Contents/MacOS/日程待办"` / `plutil -p "…/Info.plist" \| grep -E "LSMinimumSystemVersion\|CFBundleIdentifier"` / `codesign -dv` ；T: `arm64` / `12.0` + `com.poisson.todo` / 显示 `code object is not signed at all`（OP-05 预期） | 命令 | 附录 A-9 |
| TC-052 | AC-40 | G: `.app` 已产出；W: `open "…/日程待办.app"`；T: 窗口打开、标题「日程待办」、默认日历模块、界面全中文；与巡览截图 01 对照一致 | 命令+人工 | 附录 A-9 + M-01 |
| TC-053 | AC-41 | G: 关闭 Wi-Fi 与以太网；W: 完整走「新建待办 → 每日工作法换一条 → 全部待办筛选」；T: 全部可用，无网络错误提示、无加载转圈、无空白 | 人工 | M-09 |
| TC-054 | AC-42 | W: 附录 B.9 依赖扫描脚本；T: 输出 `DEPENDENCY CLEAN`；人工核对新增依赖只有 dayjs / @tauri-apps/plugin-sql / @playwright/test | 命令 | 附录 A-10 |
| TC-055 | AC-43 | W: ① 附录 B.10 的 grep（`tauri.conf.json` + `src/`）② `find . -name "*.ps1" -not -path "./node_modules/*"` ③ `grep -rn "channel.*msedge" . --include=*.ts --include=*.json`（排除 `node_modules`、`docs/`）；T: 三项均无命中 | 命令 | 附录 A-10 |
| TC-056 | AC-44 | G: 应用已启动；W: 检查导航与交付说明；T: 导航仅 3 项、无「番茄钟」；无账号/登录/云同步/自动更新入口；交付说明写明「数据空库起步、不迁移 Windows 历史数据」与「系统菜单栏为框架默认英文」 | 人工 | M-01 / M-04 + 巡览截图 |

---

## 6. AC ↔ TC 追溯矩阵（44 / 44 全覆盖）

| AC | 主题 | 主 TC | 辅助 TC / 层 |
| --- | --- | --- | --- |
| AC-01 | 构建含类型检查 | TC-001 | TC-002（产物） |
| AC-02 | 1420 固定端口 | TC-003 | TC-004（第二实例失败） |
| AC-03 | E2E 6/6 + 视频/trace | TC-005 | — |
| AC-04 | 日期无关性 | TC-006 | TC-007（静态检索） |
| AC-05 | 巡览 14 图 + 1 视频 | TC-008 | 用例 6 |
| AC-06 | 日历 42 格与四态 | TC-009 | TC-010 |
| AC-07 | 圆点 + `+`（>3） | TC-011 | — |
| AC-08 | 跨月补位格 → 翻月 | TC-012 | — |
| AC-09 | 今天按钮 | TC-013 | — |
| AC-10 | 当日空态 + 创建按钮 | TC-014 | — |
| AC-11 | 筛选无结果空态 | TC-015 | — |
| AC-12 | 行内四元素 | TC-016 | — |
| AC-13 | 优先级循环 + 持久化 | TC-017 | TC-018（重启后查库） |
| AC-14 | 完成率 | TC-019 | TC-020（0 条不显示） |
| AC-15 | 非今日菜单五项 | TC-021 | TC-022（Control+点击/双指） |
| AC-16 | 今日菜单三项 | TC-023 | — |
| AC-17 | 复制到今日 | TC-024 | — |
| AC-18 | 移动今日/明日 | TC-025 | — |
| AC-19 | 五种关闭条件 | TC-026（①②③⑤） | TC-027（④ resize） |
| AC-20 | 方法库预览不改落库 | TC-028 | — |
| AC-21 | 首推自动落库 | TC-029 | — |
| AC-22 | 重启后不变 | TC-030 | — |
| AC-23 | 换一条 + manual=1 | TC-031 | — |
| AC-24 | 排列逐字等价 | TC-032 | — |
| AC-25 | 往期 7 天 | TC-033 | — |
| AC-26 | 65 条与分类计数 | TC-034 | TC-035（脚本交叉核对） |
| AC-27 | 内容库校验脚本 | TC-035 | TC-036（负向） |
| AC-28 | 卡片单栏几何 | TC-037 | — |
| AC-29 | 溢出滚动 + 渐隐 | TC-038（`5w2h`） | TC-039（条件）/ TC-040（桌面） |
| AC-30 | 小卡片刷新不跳转 | TC-041 | — |
| AC-31 | 跨日期分组 | TC-042 | — |
| AC-32 | 三筛选 | TC-043 | — |
| AC-33 | 两处筛选独立 | TC-044 | — |
| AC-34 | 建库建表 | TC-045 | — |
| AC-35 | 双数据源隔离 | TC-046 | — |
| AC-36 | 升级不丢数据 | TC-047 | **BLK-01** |
| AC-37 | 迁移只增不改 | TC-048 | — |
| AC-38 | 卸载重装数据保留 | TC-049 | — |
| AC-39 | `.app` + `.dmg` 产物 | TC-050 | TC-051（架构/最低版本/签名） |
| AC-40 | `.app` 启动 | TC-052 | 巡览截图 01 对照 |
| AC-41 | 断网可用 | TC-053 | — |
| AC-42 | 依赖克制 | TC-054 | — |
| AC-43 | Windows 残留 | TC-055 | — |
| AC-44 | 范围边界 | TC-056 | 巡览截图 |

**统计**：44 / 44 AC 有主 TC；56 条用例。按判定手段：E2E 参与 28 条、命令/脚本参与 26 条、人工参与 9 条（其中 7 条为混合判定，两类重复计入，故三项之和 63 > 56）。

---

## 7. AC 覆盖缺口（FR- 有、AC- 未单列）

下面 12 项是 PRD 里**有 FR- 要求但没有对应 AC-** 的行为。它们不是"可以不测"，而是"测了也不能计入 44 条 AC 判定"。建议 PRD v1.2 补 AC-45 及之后，转正后并入本计划。

| 缺口 | 行为 | 来源 | 现有可测手段 | 建议 AC |
| --- | --- | --- | --- | --- |
| GAP-01 | 翻月不重置选中日 | FR-CAL-02 / OP-12 | 用例 1 可加断言（翻月后右栏不变） | AC-45 |
| GAP-02 | 切换选中日期时筛选重置为「全部」 | FR-DAY-04 | 用例 2 可加断言 | AC-46 |
| GAP-03 | 编辑器：标题空禁用保存 / 回车提交 / 按钮文案随模式变 / 100-500 字上限 / 400px 遮罩 | FR-EDT-01~05、BR-16 | 用例 2 的创建/编辑步骤内可加断言（**建议必补**，AC 完全没覆盖编辑器） | AC-47 |
| GAP-04 | 菜单键盘导航（↑↓ 循环、Enter 执行、Esc 关闭）与首项高亮 | FR-MENU-06/07 | 用例 5 可加断言 | AC-48 |
| GAP-05 | 菜单贴边翻转、8px 安全边距 | FR-MENU-09 | 用例 5 需把窗口缩到边缘再右键（可行但脆） | AC-49 |
| GAP-06 | 菜单不被列表容器裁切 | FR-MENU-10 | 用例 5 断言 `.ctx-menu` 的 `parentElement === body`（Teleport） | AC-50 |
| GAP-07 | 状态徽章「今日推送」 | FR-DM-08 | 用例 3 断言三态互斥 | AC-51 |
| GAP-08 | 无 `case` 时不渲染案例区块 | FR-DM-11 / ES-05 | **当前不可达**（65 条全有 case）；只能代码评审 + 临时删 `case` 的本地跑（不得入库） | AC-52 |
| GAP-09 | 非今日小卡片标题 `M月D日 工作法`；刷新钮 hover 变分类色 | FR-DM-12/13 | 用例 3 切到非今日日期后断言 | AC-53 |
| GAP-10 | 全部待办与方法库的 `暂无待办` 空态 | ES-03 / ES-04 / OP-07 | 用例 4 在清库后断言 | AC-54 |
| GAP-11 | 双实现语义逐条一致（同操作序列同可见结果） | FR-DB-04 | 只能靠 AC-35 的隔离 + 手工对拍，无 AC 判"一致" | AC-55 |
| GAP-12 | 未知模块 id 回退默认图标、导航注册表驱动 | FR-NAV-04 | 不可观察 → 代码评审项 | AC-56 |

**处理方式（本轮）**：这 12 项写入 T3 报告的「AC 缺口观察区」，**不计入 44 条 AC 的 PASS/FAIL**；其中 GAP-03（编辑器）与 GAP-01/GAP-02 风险最高（属高频操作路径），建议 Leader 优先让 PM 补 AC。

---

## 8. 人工 checklist（M-01 ~ M-14，E2E 盖不住的部分）

编号 M-01 ~ M-12 沿用设计 §7.4，不另起编号；M-13 / M-14 为本计划新增。每条都要留证据（截图 > 录屏 > 文字描述），并在 T3 报告里以「人工-通过 / 人工-失败」单列。

| # | 检查项 | 挂接 TC / AC | 判定标准 | 证据 |
| --- | --- | --- | --- | --- |
| M-01 | Gatekeeper 首启与 `xattr` 处置 | TC-052 / AC-40 | Finder 双击被拦 → 右键「打开」可确认；`xattr -dr com.apple.quarantine "…/日程待办.app"` 后可直接打开；`spctl --assess` 返回 `rejected` **属预期** | 首启拦截截图 + 打开后截图 + `spctl` 输出 |
| M-02 | Control + 点击打开菜单 | TC-022 / AC-15 | 弹出同一菜单，系统默认菜单不出现 | 截图 |
| M-03 | 双指点按打开菜单 | TC-022 / AC-15 | 同上（取决于系统「辅助点按」设置，需记录设置状态） | 截图 + 系统设置截图 |
| M-04 | 系统菜单栏与 `⌘Q` / `⌘C` / `⌘V` | TC-056 / AC-44 | 菜单栏为框架默认英文项；`⌘Q` 退出、`⌘C/⌘V` 在输入框可用；交付说明已写明英文边界 | 截图 |
| M-05 | 切到其他应用时菜单关闭 | TC-026 / AC-19 | 真实点击别的应用后菜单消失 | 录屏（可选） |
| M-06 | 拖动改变窗口尺寸时菜单关闭 | TC-027 / AC-19 | 菜单消失 | 录屏 |
| M-07 | WKWebView 下 `<input type="date">` 渲染与取值 | TC-052 / AC-40（引擎差异观察项） | 控件可见、可点选日期、保存后 `date` 为 `YYYY-MM-DD`；占位符样式与 Chromium 的差异**不作为缺陷** | 截图 + 查库 |
| M-08 | 编辑器遮罩 `backdrop-filter` 模糊生效 | TC-052 / AC-40（引擎差异观察项） | 遮罩后内容可见模糊（Safari 17 需 `-webkit-` 前缀）；不模糊则 FAIL（设计 §6.2 明确"必须做"） | 截图 |
| M-09 | 断网后完整走一遍三模块 | TC-053 / AC-41 | 新建、换一条、筛选全部可用，无网络错误 | 断网状态截图 + 操作截图 |
| M-10 | Dock 图标 / Launchpad 收录 | TC-052 / AC-40 | 从 `.app` 启动后 Dock 有图标；图标非默认 Tauri 占位（Q-03 未决则记录为"未完成项"） | 截图 |
| M-11 | `5w2h` / `rice-scoring` 桌面版内部滚动与渐隐 | TC-040 / AC-29 | 内部滚动、渐隐出现且滚到底消失、卡片不撑破窗口 | 录屏 + 前后截图 |
| M-12 | 桌面版数据落盘路径与 `sqlite3` 复核 | TC-045/046/049 / AC-34/35/38 | 路径为 `~/Library/Application Support/com.poisson.todo/todo.db`；两表存在；删除 `.app` 后数据保留 | 终端输出截图 |
| M-13 | 中文路径引用（`.app` / `.dmg` 名含中文） | TC-050/051 / AC-39 | 引号引用后所有命令可执行、无编码错误 | 终端输出 |
| M-14 | 交付说明与实现一致（空库起步、不迁移、菜单栏英文、Gatekeeper 三条路径） | TC-056 / AC-44 | README 交付段逐条与实际行为对上，无夸大承诺（不得承诺"与 Windows 逐像素一致"） | README 截图 |

**人工 checklist 的门禁作用**：M-01 / M-08 / M-11 属"不通过则不能判交付"的硬项（分别对应首启可用、编辑器视觉契约、AC-29 桌面版）；其余为记录项，失败记为观察并列入遗留。

---

## 9. E2E 覆盖不了的部分与测试风险

| 编号 | 风险 / 局限 | 说明 | 处置 |
| --- | --- | --- | --- |
| **BLK-01** | **AC-36 无"上一版本"可升级** | 本期是 0.1.0 首次发布，`AC-36` 的 Given 是"已安装上一版本并造 5 条数据"——该前置不存在。**这条 AC 按当前定义不可执行** | 两个方案请 Leader 择一：① **双构建法**：先构建 `0.1.0` 造数 → 版本号改 `0.1.1`（迁移集不变或追加一条空迁移）再构建 → 覆盖安装对拍（推荐，最接近真实升级）；② 判 `BLOCKED` 并在 G3 报告里注明"本期无上一版本，AC-36 不适用"。**不得**用"数据没丢"的口头结论替代 diff |
| R-T-01 | 引擎差异（Chromium vs WKWebView） | 日期控件、模糊、字体行高、`contextmenu` 语义 | M-07 / M-08 / M-11 + AC-29 桌面复核；报告里明确"E2E 绿 ≠ WKWebView 绿" |
| R-T-02 | 6 个 `test()` 的硬约束 | 新增 `test()` 会让 AC-03 的 `6 passed` 失效 | §3.3：新断言并入既有用例；确需新增先改 AC |
| R-T-03 | `page.clock` 能力依赖 Playwright 版本 | AC-04 需要"月中/月末各跑一次" | Playwright ≥ 1.45 用 `page.clock.install`；否则退化为"真实月末择日复跑"，并在报告注明降级 |
| R-T-04 | AC-38 是破坏性操作 | `rm -rf "/Applications/日程待办.app"` | 执行前 `cp` 备份 `todo.db` 到 `verify/`，且必须拿到执行许可；无备份不执行 |
| R-T-05 | 选择器契约缺 2 项 | 渐隐 class、`data-date` 未定义 | Q-T-01 / Q-T-02；未定前 AC-29 的渐隐只能截图目测、AC-06/08 的网格断言用弱化版本 |
| R-T-06 | 中文路径 | `日程待办.app` / `日程待办_0.1.0_aarch64.dmg` | 所有命令加引号、用变量（PRD RISK-09）；M-13 专项核对 |
| R-T-07 | 无 `MULTICA.md` §2 | 仓库根目录无该文件，skill 要求的自动化产物路径约定缺失 | 本期按基线 `e2e/` 落库；T2/T3 前若团队要求 §2，需 DevOps 在执行阶段补 |
| R-T-08 | 屏幕录制授权 | 未授权时 `screencapture -l` 静默失败（窗口名为空、图为空） | 执行 M-11/M-12 前先确认「系统设置 → 隐私与安全性 → 屏幕录制」已授权，并记录到验收记录 |
| R-T-09 | 只有 CLT，无完整 Xcode | 公证、`xcodebuild`、universal 不可用 | 本期都不做（OP-04/05）；若后续要做，先在计划里加"装完整 Xcode"的前置 |
| R-T-10 | 内容库溢出夹具临界 | `rice-scoring`(404) 与 `first-principles`(403) 仅差 1 字符 | TC-039 设为条件断言，判定由 `5w2h` 承担（§4.2） |
| R-T-11 | 用例串行共享状态 | 单跑某一个用例可能因缺少前序数据而失败 | 用例开头断言前置状态；巡览用例强制自包含 |
| R-T-12 | 首次 `npx playwright install chromium` 需网络 | 断网环境无法首次安装 | 装机后立即执行一次并记录版本；AC-41 的断网验证必须在浏览器已就绪之后 |

---

## 10. T3 执行计划（G2.5 之后，本轮不执行）

### 10.1 前置材料（缺则 BLOCKED）

| 字段 | 本项目等价物 | 当前状态 |
| --- | --- | --- |
| `g2_pass` | Leader 的 G2 判门 + 变更文件清单 | 未到 |
| `g2_sha` | 构建对应的 commit SHA（本期不做 git 推送，用本地 SHA 或产物 `updated_at`） | 未到 |
| 变更文件表 | 前端 `src/**` + `src-tauri/**` 变更清单 | 未到 |
| `api_contract` | **N/A**（纯本地应用，无接口、无后端服务） | 已可判定 N/A |
| `g25_pass` | Leader/DevOps 的 G2.5 判门 | 未到 |
| `deploy_url` | **本项目无 URL**：等价物 = `src-tauri/target/release/bundle/macos/日程待办.app` + `http://localhost:1420`（dev server） | **需 Leader 在 G2.5 明确"以本机产物为部署目标"**，否则 T3 按规则只能 BLOCKED |
| `ui_auth` | `auth_mode = none`（无账号，§4 U-） | 已可判定 |
| Apifox 三 ID | **N/A（非缺失）** | 已可判定 |

### 10.2 执行顺序（FR-QA-07，不可颠倒）

```bash
# 1) 构建与类型检查
npm ci && npm run build
# 2) E2E（Chromium，6 用例）
npx playwright test --reporter=list
# 3) 桌面打包
npm run tauri build
# 4) 覆盖安装 + 数据完整性对拍（AC-36 见 BLK-01）
#    —— 双构建法：0.1.0 造数 → 0.1.1 覆盖 → sqlite3 快照 diff
# 5) 巡览产物重生成（UI 有变化时）
npx playwright test e2e/tour.spec.ts
# 6) 桌面版取证 + 人工 checklist
#    swift scripts/mac-window-id.swift → screencapture -x -o -l<winid> → M-01 ~ M-14
```

### 10.3 产物与证据

| 产物 | 位置 | 用于 |
| --- | --- | --- |
| E2E 视频 / trace | `test-results/` | AC-03 |
| 巡览截图 14 张 + 录屏 | `screenshots/`、`videos/`（`test-results/` 之外） | AC-05、AC-40 对照 |
| 数据快照与 diff | `verify/before.txt` / `after.txt` / `picks-*.txt` | AC-36、AC-38 |
| 桌面窗口抓图 | `screenshots/15-…` ~ `18-…` | AC-29 桌面、AC-40 |
| 人工 checklist 签署 | T3 报告正文 | M-01 ~ M-14 |

### 10.4 失败分诊（先分类，再定性）

| 现象 | 归类 | 处理 |
| --- | --- | --- |
| 选择器找不到 / strict mode 冲突 | 用例问题 | 我自修（按 BR-19 精确匹配），修完重跑 |
| 日期相关断言在特定日期失败 | 用例问题 | 改为相对日期计算，重跑 |
| `check-cases.mjs` 把 4 条超限条目判红 | **脚本口径问题** | 改脚本断言为 `>= 2`，**不得改数据**（CFL-07） |
| 实际行为与 Then 不符 | 产品问题 | 出 FAIL 工单：复现步骤 / 期望 / 实际 / 证据 / 严重程度，派实现方 |
| 缺少构建产物、权限、授权、网络 | 环境问题 | 记 BLOCKED，不降级为 PASS |

### 10.5 报告结构（对应 G3）

```
1. 结论：PASS / FAIL / BLOCKED（三选一，不得模糊）
2. 44 条 AC 逐条表：AC | 判定 | 证据（命令输出 / 测试名 / 截图号） | 备注
3. AC 缺口观察区（GAP-01 ~ GAP-12）：不参与判定，列现象
4. 人工 checklist 结果（M-01 ~ M-14）：通过 / 失败 / 未执行
5. 缺陷清单（FAIL 项）：严重程度 + 复现步骤 + 证据
6. 环境事实与降级声明（无 deploy URL、无完整 Xcode、无签名等）
```

---

## 11. 进入 / 退出准则

### 11.1 T1（本轮）退出准则

- [x] 44 条 AC 逐条有主 TC，无遗漏（§6）
- [x] 56 条 TC 每条都有 AC 归属（§5）
- [x] `steps` 断言按 CFL-07（`>= 2`，分布 3–7），未沿用「2–4」
- [x] 明确列出 E2E 覆盖不到的部分并单列人工 checklist（§8）
- [x] 基线对齐：5 功能 + 1 巡览，且把"不得新增 test()"写成硬约束（§3.3）
- [x] 列出 AC 缺口（§7）与执行阻塞（§9 BLK-01）
- [ ] 待 Leader 判门 + 回答 §12 的 Q-T-01 ~ Q-T-05

### 11.2 T3 进入准则

- G2 PASS（变更文件清单可见）
- G2.5 PASS，且**明确指定本机产物路径**作为"部署目标"（本项目无 URL）
- `npm ci` + `npm run build` 可执行、`npx playwright install chromium` 已就绪
- `.app` 可产出并可启动
- 破坏性用例（AC-38）已拿到执行许可 + 数据已备份

### 11.3 T3 退出准则

- 44 条 AC 全部有判定（PASS / FAIL / BLOCKED），无"未执行"空白
- 每条 PASS 都指向具体证据（不允许"截图看起来正常"）
- 人工 checklist 的硬项（M-01 / M-08 / M-11）已签署
- AC 缺口观察区已写，且**未**被计入 AC 判定

---

## 12. 待确认项（需 Leader / 实现方拍板）

| 编号 | 问题 | 影响 | 我的建议 |
| --- | --- | --- | --- |
| **Q-T-01** | 底部渐隐提示**没有稳定 class**（SPEC 只描述了 `showFade` 逻辑） | AC-29「渐隐出现/消失」无法用断言判定，只能截图目测，T3 会成为主观判定 | 实现方给一个固定 class（建议 `.mc-fade`，`v-show` 控制），写进设计 §6.3 |
| **Q-T-02** | `.day-cell` 是否带 `data-date="YYYY-MM-DD"` 未定义 | AC-06（周日起始/6×7 对齐）、AC-08（补位格精确定位）只能靠文本推断，月末易脆断 | 实现方给 `data-date`；用例据此断言网格，比文本匹配稳一个量级 |
| **Q-T-03** | AC-36 的"上一版本"不存在（BLK-01） | 该 AC 无法按原文执行；若强行判 PASS 就是造假 | 采用**双构建法**（0.1.0 → 0.1.1），把两次构建写进 T-15/T-18；否则该 AC 判 BLOCKED |
| **Q-T-04** | T3 的"部署目标"如何定义（无 URL 的桌面应用） | 按 skill 门禁缺 `deploy_url` 时 T3 只能 BLOCKED | G2.5 时由 Leader 书面明确：部署目标 = 本机 `.app` + dev server，属"降级可跑"，报告注明 |
| **Q-T-05** | GAP-03（编辑器 5 条 FR 无 AC）是否补 AC | 编辑器是最高频路径，当前 AC 完全没覆盖"标题空禁用保存/回车提交/字数上限/按钮文案" | 建议 PM 在 v1.2 补 AC-47；本轮我先按观察项执行，不计入判定 |

---

## 附录 A · 命令清单（T3 直接照抄，含中文路径加引号）

**A-1 构建（TC-001 / TC-002）**

```bash
npm ci
npm run build
echo "exit=$?"
test -s dist/index.html && echo "BUILD OK"
```

**A-2 端口（TC-003 / TC-004）**

```bash
npm run dev > /tmp/dev1.log 2>&1 &
sleep 6
curl -sI http://localhost:1420 | head -1        # 期望 200
npm run dev > /tmp/dev2.log 2>&1; echo "second exit=$?"   # 期望非 0
for p in 1421 1422 1423; do curl -sI "http://localhost:$p" >/dev/null && echo "UNEXPECTED $p"; done
kill %1 2>/dev/null || true
```

**A-3 E2E（TC-005 / TC-006 / TC-007）**

```bash
npx playwright install chromium
npx playwright test --reporter=list                     # 期望 6 passed
grep -rn "channel" playwright.config.ts || echo "NO CHANNEL OK"
grep -rnE "\b20[0-9]{2}-[0-9]{2}-[0-9]{2}\b" e2e/ || echo "NO LITERAL DATE OK"
```

**A-4 巡览产物（TC-008）**

```bash
ls screenshots | wc -l            # 期望 14
ls videos/*.webm                  # 非空
test -d screenshots && ! test -e test-results/screenshots && echo "ARTIFACTS OUTSIDE OK"
```

**A-5 数据落盘与对拍（TC-018/024/025/028~031/045~047）**

```bash
DB="$HOME/Library/Application Support/com.poisson.todo/todo.db"
ls -l "$DB"
sqlite3 "$DB" ".tables"
sqlite3 "$DB" "SELECT count(*) FROM todos;"
sqlite3 "$DB" "SELECT count(*) FROM daily_picks;"
sqlite3 "$DB" "SELECT id, date, priority, done, title FROM todos ORDER BY id;"
sqlite3 "$DB" "SELECT date, method_id, manual FROM daily_picks ORDER BY date;"
# 升级/重装对拍
mkdir -p verify
sqlite3 "$DB" "SELECT id||'|'||date||'|'||priority||'|'||done||'|'||title FROM todos ORDER BY id;" > verify/before.txt
# … 覆盖安装/重装后 …
sqlite3 "$DB" "SELECT id||'|'||date||'|'||priority||'|'||done||'|'||title FROM todos ORDER BY id;" > verify/after.txt
diff verify/before.txt verify/after.txt && echo "TODOS UNCHANGED"
```

**A-6 推送确定性（TC-032）**

```bash
node scripts/check-permutation.mjs    # 期望 7 组 MATCH，退出码 0
```

**A-7 内容库（TC-034 / TC-035 / TC-036）**

```bash
node scripts/check-cases.mjs; echo "exit=$?"     # 期望 0
# 负向：在临时副本上篡改，必须非 0
```

**A-8 迁移只增不改（TC-048）**

```bash
grep -nE "DROP |ALTER " src-tauri/src/lib.rs && echo "FOUND FORBIDDEN SQL" || echo "MIGRATION CLEAN"
```

**A-9 打包与启动（TC-050 / TC-051 / TC-052）**

```bash
npm run tauri build
ls -d src-tauri/target/release/bundle/macos/*.app
ls src-tauri/target/release/bundle/dmg/*.dmg
lipo -archs "src-tauri/target/release/bundle/macos/日程待办.app/Contents/MacOS/日程待办"
plutil -p "src-tauri/target/release/bundle/macos/日程待办.app/Contents/Info.plist" | grep -E "LSMinimumSystemVersion|CFBundleIdentifier"
codesign -dv "src-tauri/target/release/bundle/macos/日程待办.app" 2>&1 | head -3   # 期望 not signed
open "src-tauri/target/release/bundle/macos/日程待办.app"
```

**A-10 依赖与残留（TC-054 / TC-055）**

```bash
node -e "const p=require('./package.json');const d=Object.keys({...p.dependencies,...p.devDependencies});const bad=d.filter(x=>/pinia|vuex|element-plus|ant-design|naive-ui|vue-router|moment|luxon|date-fns/.test(x));console.log(bad.length? 'FOUND: '+bad.join(','): 'DEPENDENCY CLEAN')"
grep -rnE "nsis|%APPDATA%|msedge" src-tauri/tauri.conf.json src/ 2>/dev/null && echo "WINDOWS RESIDUE" || echo "NO WINDOWS RESIDUE"
find . -name "*.ps1" -not -path "./node_modules/*" | head -5
```

---

## 附录 B · 用例统计

| 维度 | 数量 |
| --- | --- |
| AC 总数（PRD v1.1 §13） | 44 |
| 已覆盖 AC | 44 / 44（100%） |
| TC 总数 | 56 |
| E2E 参与判定 | 28（含 4 条与命令混合） |
| 命令 / 脚本参与判定 | 26（含 3 条与人工混合、4 条与 E2E 混合） |
| 人工参与判定 | 9（纯人工 6，另 3 条与命令混合） |
| 人工 checklist 项 | 14（M-01 ~ M-14，硬项 3 条） |
| AC 缺口观察项 | 12（GAP-01 ~ GAP-12） |
| 执行阻塞 | 1（BLK-01 · AC-36 无上一版本） |
| 待确认项 | 5（Q-T-01 ~ Q-T-05） |

---

## 附录 C · 与设计文档的口径差异（需 @资深全栈开发专家 知悉）

| # | 设计文档写法 | 实测 / 本计划 | 处置 |
| --- | --- | --- | --- |
| 1 | `rice-scoring` 正文总长最大 = **426 字符** | 我按 `summary + steps + when + action + case` 统计 = **404**；`first-principles` = 403（差 1） | 不写死 426；夹具判定改由 `5w2h` 承担 |
| 2 | `5w2h`「每条 step 文本 ≤ 31 字符，最长即 `5w2h`」 | `5w2h` 单步最长 18；单步最长 31 属 `rice-scoring` | 表述笔误，不影响"`5w2h` 最高"的结论 |
| 3 | 溢出夹具固定 `5w2h` + `rice-scoring` | `5w2h` 强制、`rice-scoring` 条件 | 避免临界高度造成 AC-29 误判/漏判 |
| 4 | AC-36「覆盖安装新构建」 | 本期无"上一版本" | BLK-01 / Q-T-03，需双构建法 |
| 5 | 设计 §7.4 的 M-01 ~ M-12 | 我补 M-13（中文路径）/ M-14（交付说明一致性） | 编号不冲突，设计侧无需改 |
