# 日程待办 · Schedule Todo（macOS 版）

基于 Tauri 2 + Vue 3 + TypeScript 的**本地**日程与待办应用。数据全部保存在本机，
不依赖任何云端服务，不发起任何网络请求。

> 本仓库当前处于 **S4 三个模块全部可用** 阶段：工程基座、数据层、内容库与确定性推送算法已就绪；
> 日历页、当日待办面板、「每日工作法」与「全部待办」四个界面均可完整操作，
> 待办条目、右键菜单与编辑器已收口。E2E 套件（S5）与打包（S6）尚未开始。

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

**刻意没有的东西**：没有状态管理库、没有 UI 组件库、没有路由库、没有第二套日期库。
样式手写 + CSS 变量，界面全中文，浅色单一主题。

## 常用命令

```bash
npm install
npm run dev            # 前端开发服务器（端口固定 1420，strictPort）
npm run build          # vue-tsc --noEmit && vite build —— 类型检查是构建的一部分
npm run tauri dev      # 桌面应用开发模式
npm run tauri build    # 桌面发布构建
npx playwright test    # E2E（S5 / T-14 起）
```

## 校验脚本

```bash
node scripts/check-cases.mjs       # 内容库校验（CFL-07 口径）：总数 65 / 分类 17·17·12·7·12
node scripts/check-permutation.mjs # 推送确定性比对：7 个抽样日期 + 落库与「换一条」规则
node scripts/check-data-layer.mjs  # 数据层 localStorage 路径行为自检（9 组断言）
node scripts/check-db-parity.mjs   # 双后端等价性对拍：同一操作序列下两条后端结果一致
node scripts/check-s2-ui.mjs       # S2 界面自证：真实浏览器跑外壳/日历/当日面板，截图落 docs/evidence/s2/
node scripts/check-s3-ui.mjs       # S3 界面自证：每日工作法七区块/渐隐/换一条/往期/方法库，截图落 docs/evidence/s3/
node scripts/check-s4-ui.mjs       # S4 界面自证：全部待办分组/菜单五条件/翻转/编辑器，截图落 docs/evidence/s4/
```

`check-s2-ui.mjs` 需要先另开一个 `npm run dev`（它直接驱动 1420 端口的开发服务器，
不通过 Playwright 的 webServer 自启），断言 106 条，覆盖 AC-06 ~ AC-11 / AC-14 / AC-45 / AC-46。

`check-s3-ui.mjs` 同样需要先起 dev server，断言 107 条，覆盖 AC-20 / AC-21 / AC-23 ~ AC-26 /
AC-28 / AC-29 / AC-51；溢出与渐隐的强制夹具是 `5w2h` 与 `rice-scoring`。

`check-s4-ui.mjs` 同样需要先起 dev server，断言 109 条，覆盖 AC-12 / AC-15 ~ AC-19 / AC-31 ~ AC-33 /
AC-47 / AC-48 / BR-20 / BR-21：跨日期分组与 ` · 今天`、组内 `已完成/总数`、三页签筛选、
两个视图的筛选互相独立、菜单按日期分支、复制到今日 / 移动到今日 / 移动明日、五种关闭条件、
贴边翻转（pad 8）、键盘导航与编辑器两种模式。夹具直接写 `todo_local_db`（20 条 / 4 组），
跑完清空 localStorage，不碰桌面版的 `todo.db`（BR-14）。

Rust 侧：

```bash
cd src-tauri && cargo test --test migration_guard   # SQLite 路径语义 + 迁移只增不改
```

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
├─ tauri.conf.json             productName 日程待办 / identifier com.poisson.todo
└─ capabilities/default.json   窗口权限（core:default + sql:default + sql:allow-execute）

scripts/                       校验脚本
docs/requirements/             PRD（需求唯一口径）
docs/design/                   技术设计
docs/test/                     测试计划
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

## 数据存储

| 环境 | 实现 |
| --- | --- |
| 桌面应用（Tauri） | SQLite，数据库文件位于 `~/Library/Application Support/com.poisson.todo/todo.db` |
| 浏览器（E2E / 预览） | localStorage 降级实现，键名 `todo_local_db` / `todo_local_daily_db` |

数据访问层统一收敛在 `src/db/database.ts`，上层 store 与组件不感知底层差异。

### 表结构与迁移

迁移由 `src-tauri/src/lib.rs` 的 `Migration` 列表管理，按版本号递增顺序执行：

| 版本 | 迁移 | 内容 |
| --- | --- | --- |
| 1 | `create_todos_table` | 待办表 `todos`（含 `AUTOINCREMENT` 主键与日期索引） |
| 2 | `create_daily_picks_table` | 每日推送记录表 `daily_picks` |

所有迁移均为**纯新增**（`CREATE TABLE IF NOT EXISTS`），不会修改或删除既有表与既有数据；
版本号只增不减，卸载重装数据库文件依然保留。

## 文档

| 文档 | 内容 |
| --- | --- |
| `docs/requirements/ZACHTD-2-macos-prd.md` | PRD（需求唯一口径） |
| `docs/design/ZACHTD-2-macos-design.md` | 技术设计与实施规划 |
| `docs/test/ZACHTD-2-test-plan.md` | 测试计划 |
| `_ctx/SPEC.md` / `_ctx/PLAYBOOK.md` | Windows 基线的实现规格与构建流程 |
