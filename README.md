# 日程待办 · Schedule Todo（macOS 版）

基于 Tauri 2 + Vue 3 + TypeScript 的**本地**日程与待办应用。数据全部保存在本机，
不依赖任何云端服务，不发起任何网络请求。

> 本仓库当前处于 **S2 应用外壳 + 日历 + 当日待办面板** 阶段：工程基座、数据层、
> 内容库与确定性推送算法已就绪；日历页与当日待办面板可完整操作，
> 「每日工作法」与「全部待办」两个模块的视图在 S3 / S4 实现。

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
```

`check-s2-ui.mjs` 需要先另开一个 `npm run dev`（它直接驱动 1420 端口的开发服务器，
不通过 Playwright 的 webServer 自启），断言 106 条，覆盖 AC-06 ~ AC-11 / AC-14 / AC-45 / AC-46。

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
   ├─ daily/DailyMethodMini.vue  日历页内的工作法小卡片
   └─ todo/
      ├─ TodoListView.vue      当日待办面板（统计 / 三页签 / 两种空态）
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
