# 日程待办 · Schedule Todo

基于 Tauri 2 + Vue 3 + TypeScript 的**本地**日程与待办应用。数据全部保存在本机 SQLite，
不依赖云端服务，不发起任何网络请求。

> **当前阶段：S6 打包与交付说明（中间版）**
> macOS 侧已在本机产出 `.app` + `.dmg` 并实机启动；Windows 侧交付的是**可构建能力**
> （配置 + CI），**安装包未在本机产出**（Tauri 无交叉编译），详见「Windows」一节。
> 同步（Supabase）能力属后续阶段，本版**不含**任何登录 / 同步入口。

---

## 一、安装与首次打开（macOS）

### 1. 安装

1. 打开 `日程待办_0.1.0_aarch64.dmg`；
2. 把「日程待办」拖到左侧的 **Applications**（即 `/Applications`）；
3. 在「启动台」或「应用程序」里点开「日程待办」。

也可以直接把 `日程待办.app` 拖进 `/Applications`，效果相同。
**卸载** = 退出应用后把 `/Applications/日程待办.app` 拖进废纸篓；数据不会被删除（见第五节）。

- **Dock**：应用以 regular（普通 GUI）策略注册，运行时会出现在 Dock，右键有「退出 / 保留在 Dock」等标准项。
- **启动台**：`/Applications` 下的应用会被启动台自动收录（首次索引可能有几秒延迟）。

### 2. Gatekeeper：三种情形（本版未签名、未公证，属预期）

本期**不做代码签名与公证**（PRD OP-05），所以首次打开可能被系统拦一次。三种情形的处理：

| 情形 | 现象 | 处理 |
| --- | --- | --- |
| ① 右键打开（推荐，最省事） | 双击提示「无法打开，因为 Apple 无法检查其是否包含恶意软件」 | 不要双击：在 **Finder 里右键（或 Control + 点击）图标 → 打开 → 再点「打开」**，之后该应用不再被拦 |
| ② 命令行去隔离（批量 / 反复安装时） | 同上 | `xattr -dr com.apple.quarantine "/Applications/日程待办.app"`，之后可直接双击 |
| ③ `spctl` 返回 `rejected` | `spctl --assess -vv "/Applications/日程待办.app"` 输出 `rejected` | **这是未签名应用的正常结果，不是安装失败**。判定「应用可用」请看它能否启动，不要看 `spctl` 的返回码 |

本机实测（2026-11-01，macOS 14.1 / Apple Silicon）：
`codesign -dv` 显示 `Signature=adhoc`、`TeamIdentifier=not set`；`spctl --assess` 返回 `rejected`；
产物在**本机构建**，不带 quarantine 属性（`xattr -l` 为空），因此本机直接双击即可打开。

### 3. 系统菜单栏是框架默认英文（Q-01 边界声明）

应用**内容区**全中文；但窗口顶部的 macOS 系统菜单栏（`File / Edit / Window / Help` 及
`Quit`、`Copy`、`Paste` 等项）来自 Tauri 框架默认菜单，**本版为英文**。
这是已知边界，不是漏译；改造成中文菜单需要自定义菜单模板，不在本期范围。

### 4. 快捷键与手势（与 Windows 基线的等价关系）

| 操作 | macOS |
| --- | --- |
| 右键菜单 | 触控板**双指点按**（需在「系统设置 → 触控板」里开启「辅助点按」）或 **Control + 点击** |
| 菜单的等价入口 | 条目右侧 `⋯` 按钮，任何时候都可用（不依赖手势设置） |
| 复制 / 粘贴 | `⌘C` / `⌘V` |
| 退出 | `⌘Q` |

---

## 二、数据存放：空库起步，不迁移历史数据

**本期不继承 Windows 端已有的 `todo.db`，也不提供迁移工具**（PRD OP-02）。
首次启动会在应用数据目录里**新建空库**并建好两张表；如果你的 Windows 机器上已有数据，
它不会被带到 macOS 上来。

数据库文件位置**由 `identifier`（`com.poisson.todo`）决定，代码里不写死任何一端**：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/com.poisson.todo/todo.db` |
| Windows | `%APPDATA%\com.poisson.todo\todo.db` |

在 macOS 上复核（PRD 附录 B §B.4）：

```bash
DB="$HOME/Library/Application Support/com.poisson.todo/todo.db"
ls -l "$DB"
sqlite3 "$DB" ".tables"                                                     # todos / daily_picks / _sqlx_migrations
sqlite3 "$DB" "SELECT count(*) FROM todos; SELECT count(*) FROM daily_picks;"
sqlite3 "$DB" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
```

数据访问层统一收敛在 `src/db/database.ts`：桌面用 SQLite，浏览器（E2E / 预览）用同名语义的
localStorage 降级实现（`todo_local_db` / `todo_local_daily_db`），上层 store 不感知差异。

---

## 三、Windows：配置与 CI 已交付，安装包未在本机验证

> **诚实声明**：macOS 机器**不能**交叉编译出 Windows 安装包（Tauri 无交叉编译支持）。
> 本仓库交付的是 **Windows 可构建能力**：平台配置 + CI 流水线。
> **Windows 产物未在本机产出，也未在本机运行过**；唯一验证路径是 GitHub Actions 的
> `windows-latest` job，其结果要等仓库 push 之后才可见。本机只验证了配置合法性与前端跨平台性。

### 1. 平台配置的组织方式

| 文件 | 作用 |
| --- | --- |
| `src-tauri/tauri.conf.json` | 平台中立基线：`identifier` / `productName` / 窗口 / SQL 预加载 / 图标集合；**不含**任何一端的产物形态 |
| `src-tauri/tauri.macos.conf.json` | macOS overlay：`targets: ["app","dmg"]`、`minimumSystemVersion: "12.0"`、`hardenedRuntime: false`、DMG 布局 |
| `src-tauri/tauri.windows.conf.json` | Windows overlay：`targets: ["nsis","msi"]`、`nsis.installMode: currentUser`（装到用户目录，允许中文安装路径）、`nsis.languages: ["SimpChinese","English"]`、`wix.language: ["zh-CN"]`、WebView2 引导安装 |

Tauri 会按构建平台**自动合并**对应的 overlay，不需要手动 `--config`。

### 2. 在 Windows 上构建

```powershell
npm ci
npm run build
npx playwright install chromium
npx playwright test          # 基线必须 6 passed
npx tauri build              # 出 NSIS .exe 与 MSI .msi
```

产物在 `src-tauri\target\release\bundle\nsis\*.exe` 与 `...\bundle\msi\*.msi`。
前置条件：Node 22、Rust stable（MSVC toolchain）、WebView2（Win10 1803+ 通常已内置）。

### 3. CI 入口

`.github/workflows/build.yml`：matrix = `macos-latest` + `windows-latest`，两条 job 走同一套步骤
（`npm ci` → `npm run build` → 装 Playwright Chromium → `npx playwright test` → `npx tauri build` → 上传安装包）。
Windows job 真的执行 `npx tauri build`，不是占位。

本机能做、也已经做了的校验：

```bash
node scripts/check-bundle-config.mjs   # 三份 conf 合并 + schema + 平台中立 + 数据路径中立 + workflow 结构断言
```

---

## 四、开发命令基线

```bash
npm install            # 或用 npm ci（CI 用 ci）
npm run dev            # 前端开发服务器（端口固定 1420，strictPort）
npm run build          # vue-tsc --noEmit && vite build —— 类型检查是构建的一部分
npm run tauri dev      # 桌面应用开发模式
npm run tauri build    # 桌面发布构建（含前端构建）
npx playwright test    # E2E：6 个用例（5 功能 + 1 巡览），基线 6 passed
```

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust 侧只做 SQL 插件注册与迁移，无后端服务） |
| 前端 | Vue 3.5 `<script setup>` + TypeScript 6 + Vite 8 |
| 状态 | `reactive` + `computed` 手写 store（无 Pinia / Vuex） |
| 日期 | dayjs（全项目唯一日期库，日期一律 `YYYY-MM-DD` 字符串） |
| 桌面存储 | SQLite（`@tauri-apps/plugin-sql`） |
| 浏览器 / E2E 存储 | localStorage 降级实现，语义与 SQLite 逐条一致 |
| E2E | Playwright（`@playwright/test`） |

**刻意没有的东西**：没有状态管理库、没有 UI 组件库、没有路由库、没有第二套日期库、
没有 vitest 单测框架。样式手写 + CSS 变量，界面全中文，浅色单一主题。

## 校验脚本

```bash
node scripts/check-cases.mjs         # 内容库校验（CFL-07 口径）：总数 65 / 分类 17·17·12·7·12
node scripts/check-permutation.mjs   # 推送确定性比对：7 个抽样日期 + 落库与「换一条」规则
node scripts/check-data-layer.mjs    # 数据层 localStorage 路径行为自检（9 组断言）
node scripts/check-db-parity.mjs     # 双后端等价性对拍：同一操作序列下两条后端结果一致
node scripts/check-bundle-config.mjs # S6 打包配置自证：三份 conf 合并 + schema + workflow 结构（44 条断言）
node scripts/check-s2-ui.mjs         # S2 界面自证：外壳/日历/当日面板，截图落 docs/evidence/s2/
node scripts/check-s3-ui.mjs         # S3 界面自证：每日工作法七区块/渐隐/换一条/往期/方法库，截图落 docs/evidence/s3/
node scripts/check-s4-ui.mjs         # S4 界面自证：全部待办分组/菜单五条件/翻转/编辑器，截图落 docs/evidence/s4/
```

`check-s2-ui.mjs` / `check-s3-ui.mjs` / `check-s4-ui.mjs` 需要先另开一个 `npm run dev`
（它们直接驱动 1420 端口的开发服务器，不通过 Playwright 的 webServer 自启），断言数与覆盖范围
见各脚本头部注释。

## 桌面取证脚本（macOS）

```bash
swift scripts/mac-window-id.swift 日程待办                    # 取 CGWindowNumber（含候选表）
bash scripts/mac-capture-window.sh 日程待办 out.png            # 按窗口号抓 WebView 真实渲染
swift scripts/mac-desktop-probe.swift                          # 桌面探针：TCC 授权 / 进程 / 窗口 / 标题 / 菜单栏
```

`screencapture -l<窗口号>` 与 `osascript ... System Events` 都受 macOS TCC 约束：
未授予「屏幕录制」时抓图报 `could not create image from window`；未授予「辅助功能」时 AX 读取报
`-1719 / -25211`。**这两种失败必须与「应用坏了」区分开** —— `mac-desktop-probe.swift` 会分别打印
`tcc.accessibility` / `tcc.screen-recording`，人工 checklist 的执行结果见
`docs/verification/mac-desktop.md`。

## E2E（Playwright）

```bash
npx playwright test                      # 全量 6 个用例（5 功能 + 1 巡览），需 6 passed
npx playwright test e2e/tour.spec.ts     # 只重生成巡览证据：screenshots/ 14 张 + videos/ 1 段
E2E_NOW=2026-11-15 npx playwright test   # 把浏览器时钟固定到指定日期复跑（日期无关性）
```

| 用例 | 文件 | 内容 |
| --- | --- | --- |
| 1 · 应用加载 | `e2e/todo.spec.ts` | 外壳与导航、42 格月历（周日起始）、今天/补位格/选中态、当日空态与「今天」按钮 |
| 2 · 完整链路 | `e2e/todo.spec.ts` | 编辑器造数 → 圆点与 `+` → 优先级循环 → 完成率 33/100/67% → 跨月补位格与数据加载 |
| 3 · 每日工作法 | `e2e/todo.spec.ts` | 确定性推送（对照独立参考实现）、换一条、往期 7 天、65 条方法库、预览不落库、`5w2h` 内滚动与渐隐、小卡片刷新 |
| 4 · 全部待办 | `e2e/todo.spec.ts` | 跨日期分组与 ` · 今天`、组内 `已完成/总数`、筛选同步、与当日面板筛选独立、清库后的中性空态 |
| 5 · 条目与编辑器 | `e2e/todo.spec.ts` | 行内四元素、菜单按日期分支、三种关闭条件（点外部/Esc/滚动）、贴边翻转、编辑器空标题禁用与回车提交 |
| 6 · 巡览 | `e2e/tour.spec.ts` | 自包含造数，逐页 14 张截图 + 1 段连续录屏，落 `screenshots/` `videos/` |

`playwright.config.ts` 用 Playwright 自带 Chromium（无 `channel`），`fullyParallel: false` + `workers: 1` 串行，
`video: 'on'`、`trace: 'retain-on-failure'`，webServer 复用 1420 端口。`screenshots/` 与 `videos/` 刻意放在
`test-results/` 之外（后者每次运行会被清空）。TC 覆盖对照与未自动化项见 `e2e/COVERAGE.md`。

## 目录结构

```
src/
├─ App.vue                     模块切换（currentModule）+ 编辑器状态 + 日历页两栏
├─ types/index.ts              唯一类型来源
├─ styles/main.css             设计 token + 全局重置 + macOS 兼容层
├─ data/methods.ts             65 条内容库（原样搬运，零改动）
├─ db/database.ts              数据层：SQLite / localStorage 双实现
├─ stores/
│  ├─ todo.ts                  待办状态 + 优先级元数据
│  └─ dailyMethod.ts           每日推送状态 + 确定性排列算法
└─ components/
   ├─ layout/SideNav.vue       侧边导航（注册表驱动，底部「数据本地存储」）
   ├─ layout/navItems.ts       导航注册表（新增模块只改这里 + App 分支 + 新组件）
   ├─ calendar/CalendarView.vue  42 格月历（data-date / data-outside、四态、圆点 + `+`）
   ├─ daily/DailyMethodView.vue  每日工作法模块（顶栏步进 / 主卡片 / 往期 7 天 / 65 条方法库）
   ├─ daily/MethodCard.vue       主卡片七区块 + `.mc-inner` 内滚动 + `.mc-fade` 底部渐隐
   ├─ daily/DailyMethodMini.vue  日历页内的工作法小卡片
   └─ todo/
      ├─ TodoListView.vue      当日待办面板（统计 / 三页签 / 两种空态）
      ├─ TodosAllView.vue      全部待办模块（跨日期分组、组内 已完成/总数、独立筛选）
      ├─ TodoStats.vue         统计行（两个视图共用，完成率分母为视图总条数）
      ├─ TodoFilterTabs.vue    筛选页签（两个视图共用，选中值由父组件各自持有）
      ├─ TodoItem.vue          条目行（圆圈 / 标题 / 优先级 / ⋯）
      ├─ TodoContextMenu.vue   右键菜单（按日期分支、五种关闭条件）
      └─ TodoEditor.vue        待办编辑器（新建 / 编辑）

src-tauri/
├─ src/lib.rs                  SQL 迁移定义（v1 todos / v2 daily_picks，纯新增）
├─ tauri.conf.json             平台中立基线：productName 日程待办 / identifier com.poisson.todo
├─ tauri.macos.conf.json       macOS overlay：app+dmg / 最低 12.0 / 不签名 / DMG 布局
├─ tauri.windows.conf.json     Windows overlay：nsis+msi / currentUser / zh-CN
├─ icons/                      全套图标（由 1024×1024 源图经 `npx tauri icon` 生成：icns / ico / png 族）
└─ capabilities/default.json   窗口权限（core:default + sql:default + sql:allow-execute）

.github/workflows/build.yml    CI：macOS + Windows 双平台打包（含 E2E 前置门禁）
scripts/                       校验脚本 + macOS 桌面取证脚本
e2e/                           Playwright：todo.spec.ts（5 功能）/ tour.spec.ts（巡览）/ support/ / COVERAGE.md
playwright.config.ts           E2E 配置（自带 Chromium、workers 1、video on、trace 失败留存）
screenshots/                   巡览截图 01~14（长期留存，不在 test-results/ 下）
videos/                        巡览录屏 1 段 webm（同上）
docs/requirements/             PRD（需求唯一口径）
docs/design/                   技术设计
docs/test/                     测试计划
docs/verification/             S6 桌面取证与数据复核证据（mac-desktop.md / data/）
_ctx/                          Windows 基线事实材料
```

## 稳定选择器（E2E 与自证脚本唯一允许的定位口径）

> 三个模块用 `v-show` 同时挂在 DOM 里（BR-21：切模块不重置界面状态），所以
> **`.todo-item` / `.filter-tab` / `.panel-stats` / `.empty-state` 在两个视图里各有一份**。
> 任何列表级选择器都必须带容器前缀 `.todo-panel`（当日面板）或 `.all-view`（全部待办），
> 否则会命中隐藏视图或在 strict mode 下直接报错。禁止用文本推断位置。

| 区块 | 容器 | 元素选择器 |
| --- | --- | --- |
| 应用外壳 | `main.app-main` | `[data-module="calendar"｜"daily"｜"todos"]` |
| 侧边导航 | `.side-nav` | `.nav-item[data-nav-id="calendar"｜"daily"｜"todos"]`、`.nav-item.active` |
| 月历 | `.cal-card` | `.month-title`、`.month-prev`、`.month-next`、`.today-btn`、`.legend`、`.day-cell[data-date="YYYY-MM-DD"]`、`.day-cell[data-outside]`、`.day-cell.today`、`.day-cell.selected`、`.day-num`、`.dot`、`.dot-count` |
| 当日面板 | `.todo-panel` | `.day-title`、`.today-badge`、`.new-btn`、`.panel-stats`、`.stat-rate`、`.filter-tab[data-filter="all"｜"active"｜"done"]`、`.filter-tab.active`、`.empty-state[data-empty="no-todos"｜"no-match"]`、`.empty-title`、`.empty-action` |
| 全部待办 | `.all-view` | `.all-title`、`.panel-stats`、`.stat-rate`、`.filter-tab[data-filter=…]`、`.filter-tab.active`、`.group[data-group-date="YYYY-MM-DD"]`、`.group-title`、`.group-count`、`.group-items`、`.empty-state[data-empty=…]`、`.empty-title` |
| 待办条目 | `.todo-panel` / `.all-view` | `.todo-item[data-todo-id="<id>"]`、`[data-done="true"｜"false"]`、`[data-priority="0"｜"1"｜"2"]`、`.check`、`.item-body`、`.item-title`、`.item-note`、`.priority-tag`、`.more-btn` |
| 右键菜单 | `body > .ctx-menu` | `.ctx-menu`、`.ctx-item`、`.ctx-item.active`、`.ctx-item.danger`、`.ctx-sep`、`.ctx-item[data-action="copy-today"｜"move-today"｜"move-tomorrow"｜"edit"｜"delete"]` |
| 编辑器 | `.editor[data-editor-mode="create"｜"edit"]` | `.editor-card`、`.editor-title`、`input[data-field="title"]`、`input[data-field="date"]`、`textarea[data-field="note"]`、`.priority-option[data-priority=…]`、`.priority-option.active`、`.editor-cancel[data-action="cancel"]`、`.editor-save[data-action="save"]` |

## 表结构与迁移

迁移由 `src-tauri/src/lib.rs` 的 `Migration` 列表管理，按版本号递增顺序执行：

| 版本 | 迁移 | 内容 |
| --- | --- | --- |
| 1 | `create_todos_table` | 待办表 `todos`（含 `AUTOINCREMENT` 主键与日期索引） |
| 2 | `create_daily_picks_table` | 每日推送记录表 `daily_picks` |

所有迁移均为**纯新增**（`CREATE TABLE IF NOT EXISTS`），不会修改或删除既有表与既有数据；
版本号只增不减。升级（覆盖安装）与卸载重装都不会丢数据，复核结果见
`docs/verification/mac-desktop.md`。

## 已知边界与遗留

| 项 | 说明 |
| --- | --- |
| 代码签名 / 公证 | 本期不做（OP-05）。首次打开按「一、2」三种情形处理；`spctl` 返回 `rejected` 属预期 |
| 最低系统版本 | 声明 `macOS 12.0`，但**只在 macOS 14.1 / Apple Silicon 实机验证过**，更低版本未实测（PRD OP-04） |
| 架构 | 仅 arm64；不产出 universal 二进制，Intel Mac 不在本期范围 |
| 系统菜单栏 | 框架默认英文（Q-01），见「一、3」 |
| Windows 产物 | **未在本机验证**（无交叉编译），验证路径是 CI 的 `windows-latest` job |
| 桌面人工 checklist | M-01 ~ M-14 的执行情况见 `docs/verification/mac-desktop.md`；受 TCC 权限限制的项已标 BLOCKED 并给出复现命令 |
| 同步 / 账号 | 本版**不含**；相关能力与说明在后续阶段补入本文档 |

## 文档

| 文档 | 内容 |
| --- | --- |
| `docs/requirements/ZACHTD-2-macos-prd.md` | PRD（需求唯一口径） |
| `docs/design/ZACHTD-2-macos-design.md` | 技术设计与实施规划 |
| `docs/test/ZACHTD-2-test-plan.md` | 测试计划 |
| `docs/verification/mac-desktop.md` | S6 桌面取证、人工 checklist M-01~M-14、数据复核（升级 / 重装 / 迁移） |
| `docs/verification/data/` | 数据复核的原始快照（`sqlite3` 导出文本） |
| `_ctx/SPEC.md` / `_ctx/PLAYBOOK.md` | Windows 基线的实现规格与构建流程 |
