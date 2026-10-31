## 用户请求

根据随附的四份材料（AGENTS.md、PLAYBOOK.md、SPEC.md、README.md，均已作为附件上传到本 issue），开发 **TODO 的 mac 应用（macOS 版「日程待办 / Schedule Todo」）**。

明确约束：

- **todo 原本目录中的代码全部废弃** —— 不沿用现有仓库实现，从零按材料重建。
- **暂不考虑同步 git** —— 本阶段不做 git 同步 / 远端仓库协作相关工作。
- **本次只创建规划任务，暂不考虑执行** —— 本 issue 的产出是规划方案（而非直接进入开发实现）。

## 上下文

附件材料描述的是一个已在 Windows 上验证过的现成产品「日程待办 / Schedule Todo」，事实要点：

**产品形态**：纯本地桌面应用，无云端依赖、无账号体系。三个模块 —— 日历（月历 + 选中日待办面板 + 当天工作法小卡片）、每日工作法（每天按日期哈希确定性推送一条方法，支持「换一条」、往期回顾 7 天、方法库 65 条）、全部待办（跨日期分组，全部 / 未完成 / 已完成 筛选）。待办条目支持右键菜单（复制到今日 / 移动到今日 / 移动明日 / 编辑 / 删除），编辑与删除收进菜单，行内只留勾选框、优先级标签与 `⋯` 按钮。

**技术栈**：Tauri 2 + Vue 3.5（`<script setup>`）+ TypeScript 6 + Vite 8，dayjs 为唯一日期库，`@tauri-apps/plugin-sql` 提供 SQLite，E2E 用 Playwright。刻意不用 Pinia/Vuex（`reactive` 手写 store）、不用 UI 框架（手写 CSS + CSS 变量）、不用路由库（`currentModule` 字符串切换）。

**数据层**：`src/db/database.ts` 收敛 SQLite（桌面）与 localStorage（浏览器/E2E）双实现，语义一致，上层 store 不感知差异。表结构由 `src-tauri/src/lib.rs` 的 Migration 列表管理（v1 `todos`、v2 `daily_picks`），铁律为**迁移只增不改**，一律 `CREATE TABLE IF NOT EXISTS`，绝不 DROP / ALTER 旧表。日期一律 `YYYY-MM-DD` 字符串。

**构建与打包（原材料为 Windows 环境，移植到 macOS 时需重新规划）**：`tauri.conf.json` 中 `identifier` 为 `com.poisson.todo`，窗口 1100×720（min 900×600），bundle `targets: ["nsis"]`、`nsis.installMode: currentUser`；Vite 端口固定 1420 且 `strictPort`。产物路径、安装位置、桌面快捷方式、数据库路径均为 Windows 约定（`%APPDATA%\com.poisson.todo\todo.db`）。

**验证体系**：Playwright `channel: 'msedge'`（不下载浏览器）、`fullyParallel: false` + `workers: 1`（用例共享 localStorage 必须串行）、`video: 'on'`、`trace: 'retain-on-failure'`；`e2e/todo.spec.ts` 5 个功能用例 + `e2e/tour.spec.ts` 1 个巡览用例（逐页截图 14 张 + 连续录屏），基线 6/6 通过；`screenshots/` 与 `videos/` 需放在 `test-results/` 之外才不被清空。固定收尾顺序：build（含 vue-tsc 类型检查）→ playwright test → tauri build → 静默升级安装包 → 复核数据完整性 → 重新生成截图/录屏。

**已知坑（规格中已记录）**：日历格选择器须按 `.day-num` 精确匹配以避开上月补位格导致的 strict mode 报错；抓图与点击须分进程以免 `window blur` 关掉右键菜单；DPI 感知需在创建窗口前调用；PowerShell 脚本须存 UTF-8 with BOM；`.ps1` 桌面版实机验证脚本依赖 Windows UI Automation / PrintWindow，移植到 macOS 需替换为等价方案。

**内容库**：`src/data/methods.ts` 约 1446 行，65 条方法（思维 17 / 工作 17 / 汇报 12 / 沟通 7 / 效率 12），每条含 `steps`(2–4)、`when`、`action`，`case` 为可选字段（当前 18 条 practice / 47 条 story）。

**规划时需要覆盖的 macOS 适配点**（材料为 Windows 实现，材料本身未覆盖）：Tauri bundle target 由 nsis 改为 macOS 产物（app / dmg）、安装与数据落盘路径、签名与公证、cargo 工具链在 macOS 的安装与 PATH、Playwright 浏览器 channel 在 macOS 的替代（system Edge 不存在于 macOS）、Windows 专属的 `.ps1` 实机验证脚本在 macOS 的等价实现、E2E 与桌面版双数据源的隔离仍然成立。

**开发命令基线**：`npm install`、`npm run dev`、`npm run build`（vue-tsc --noEmit && vite build）、npm run tauri dev`、`npm run tauri build`、`npx playwright test`。
