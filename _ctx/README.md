# 日程待办 · Schedule Todo

基于 Tauri 2 + Vue 3 + TypeScript 的本地日程与待办应用，数据全部保存在本机，不依赖任何云端服务。

> **给 code agent / 接手者的入口**：[`AGENTS.md`](AGENTS.md)（项目地图 + 命令 + 硬约束 + 常见坑）·
> [`docs/SPEC.md`](docs/SPEC.md)（完整实现规格）· [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md)（构建/测试/发布流程 + 踩坑清单）

## 功能

| 模块 | 说明 |
| --- | --- |
| 日历 | 月历视图、待办圆点标记、当日待办面板联动 |
| 每日工作法 | 每天推送一条可落地的工作 / 思维 / 汇报 / 沟通 / 效率方法，支持「换一条」、往期回顾与方法库浏览 |
| 全部待办 | 跨日期分组、全部 / 未完成 / 已完成筛选 |

### 待办右键菜单

在任意待办条目上右键（或点击条目右侧的 `⋯` 按钮）打开菜单，菜单项随条目日期变化：

| 条目日期 | 菜单项 |
| --- | --- |
| 非今日 | 复制到今日 / 移动到今日 / 编辑 / 删除 |
| 今日 | 移动明日 / 编辑 / 删除 |

- **复制到今日**：在今日生成一条内容相同的新待办，原条目保留。
- **移动到今日 / 移动明日**：直接改写原条目的日期。
- **编辑 / 删除**：原先行内的铅笔与垃圾桶按钮已收进菜单，行内只保留勾选框、优先级标签与 `⋯` 按钮。

菜单贴边自动翻转，支持方向键上下选择、Enter 执行、Esc 关闭，点击菜单外部或滚动页面也会关闭。

### 每日工作法

- **按日推送**：以日期哈希生成当天的方法，同一天内稳定不变，跨天自动更新，应用重启后依然是同一条。
- **换一条**：在日历卡片或独立模块中点击刷新，立即切换到当天的另一条方法并持久化，重启后保持。
- **往期回顾**：展示最近 7 天推送过的方法，点击可回看任意一天。
- **方法库**：内置 65 条方法，覆盖思维方法、工作方法、汇报方法、沟通方法、效率方法五类，可按分类筛选并预览。

每条方法包含四个部分：

| 区块 | 内容 |
| --- | --- |
| 核心步骤 | 2–4 条可执行的操作步骤 |
| 适用场景 | 什么情况下该用这一条 |
| 今日一练 | 当天就能做完的一个具体动作 |
| 实践案例 | 优先写**方法提出者本人的实践案例**；没有可靠实践案例时改为**作者故事**（讲提出者的经历）；两者都没有则整栏不展示 |

案例字段 `case` 是可选的，取值为 `practice`（实践案例）或 `story`（作者故事），界面据此决定标题与是否渲染该栏。当前 65 条方法中 18 条为实践案例、47 条为作者故事。

## 截图与录屏

`e2e/tour.spec.ts` 是一个「产品巡览」用例：按真实操作路径走遍所有页面与关键状态，逐页截图并同时录成一段连续视频。

```bash
npx playwright test e2e/tour.spec.ts
```

| 产物 | 位置 |
| --- | --- |
| 逐页截图（14 张，E2E 巡览） | `screenshots/01-…` ~ `screenshots/14-…` |
| 桌面版实机截图（4 张） | `screenshots/15-桌面版-…` ~ `screenshots/18-桌面版-…` |
| 巡览录屏（webm，约 29 秒 / 1440×900） | `videos/日程待办-产品功能巡览.webm` |
| 录屏预览页 | `videos/preview.html` |

桌面版实机截图由 `scripts/app-ctx-verify.ps1` 抓取（`PrintWindow` + `SetProcessDPIAware`，不受窗口遮挡影响），`scripts/app-uia.ps1` 通过 UI Automation 触发界面元素，避免依赖窗口前台焦点。

## 开发

```bash
npm install
npm run dev          # 前端开发服务器
npm run tauri dev    # 桌面应用开发模式
npm run build        # 类型检查 + 前端构建
npm run tauri build  # 桌面应用发布构建（产物在 src-tauri/target/release/bundle）
npx playwright test  # E2E 测试
```

## 数据存储

| 环境 | 实现 |
| --- | --- |
| 桌面应用（Tauri） | SQLite，数据库文件位于 `%APPDATA%\com.poisson.todo\todo.db` |
| 浏览器（E2E / 预览） | localStorage 降级实现，语义与 SQLite 一致 |

数据访问层统一收敛在 `src/db/database.ts`，上层 store 不感知底层差异。

### 表结构与迁移

迁移由 `src-tauri/src/lib.rs` 中的 `Migration` 列表管理，按版本号顺序执行：

| 版本 | 迁移 | 内容 |
| --- | --- | --- |
| 1 | `create_todos_table` | 待办表 `todos` |
| 2 | `create_daily_picks_table` | 每日推送记录表 `daily_picks` |

所有迁移均为**纯新增**（`CREATE TABLE IF NOT EXISTS`），不会修改或删除既有表与既有数据；升级只增不改，卸载重装数据库文件依然保留。

## 项目结构

```
src/
├─ components/
│  ├─ calendar/CalendarView.vue     月历
│  ├─ daily/                        每日工作法（视图 + 日历内嵌卡片）
│  ├─ layout/SideNav.vue            侧边导航（新增模块在此注册）
│  └─ todo/                         待办相关组件
├─ data/methods.ts                  工作法内容库
├─ db/database.ts                   数据访问层（SQLite / localStorage 双实现）
├─ stores/                          状态层
└─ types/                           类型定义
```
