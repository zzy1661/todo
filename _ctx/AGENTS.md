# AGENTS.md · 日程待办（Schedule Todo）

> 给接手本仓库的 code agent 看的入口。**先读这一份**,需要细节再按需展开 `docs/`。
> 本文件描述的是**当前已实现的真实行为**,照着做即可复现出一模一样的产品。

## 1. 这是什么

一个**纯本地**的桌面日程待办应用。Tauri 2 + Vue 3 + TypeScript,数据全部存在本机,无任何云端依赖、无账号体系。

三个模块:

| 模块 | 一句话 |
| --- | --- |
| 日历 | 月历 + 选中日的待办面板 + 当天的工作法小卡片 |
| 每日工作法 | 每天自动推送一条"当天就能落地"的工作方法,含案例、方法库、往期回顾 |
| 全部待办 | 跨日期分组,支持 全部 / 未完成 / 已完成 筛选 |

## 2. 技术栈与依赖

```
Tauri 2                桌面壳 + SQL 插件
Vue 3.5 (<script setup>) + TypeScript 6 + Vite 8
dayjs                   日期处理(全项目唯一日期库)
@tauri-apps/plugin-sql  SQLite
@playwright/test        E2E(用系统 Edge,不下载浏览器)
```

**刻意没有的东西**:没有 Pinia/Vuex(用 `reactive` 手写 store)、没有 UI 框架(纯手写 CSS + CSS 变量)、没有日期选择组件(用原生 `<input type="date">`)、没有路由库(用 `currentModule` 字符串切换)。

新增依赖前先问:能不能用上面已有的替代?这个项目的一致性来自克制。

## 3. 目录地图

```
src/
├─ App.vue                       模块路由 + 编辑器状态 + 日历页两栏布局
├─ types/index.ts                全部类型定义(唯一类型来源)
├─ styles/main.css               设计 token(颜色/圆角/阴影/字体)+ 全局重置
├─ data/methods.ts               65 条工作法内容库(1446 行,纯数据)
├─ db/database.ts                数据访问层:SQLite / localStorage 双实现
├─ stores/
│  ├─ todo.ts                    待办状态 + 优先级元数据
│  └─ dailyMethod.ts             每日推送状态 + 确定性排列算法
└─ components/
   ├─ layout/SideNav.vue         侧边导航(模块注册表)
   ├─ calendar/CalendarView.vue  42 格月历
   ├─ daily/
   │  ├─ DailyMethodView.vue     每日工作法主视图
   │  └─ DailyMethodMini.vue     日历页内嵌的小卡片
   └─ todo/                      待办相关,日历日面板与全部待办**共用**
      ├─ TodoListView.vue        某一天的待办面板
      ├─ TodosAllView.vue        全部待办(按日期分组)
      ├─ TodoItem.vue            单条待办(右键菜单入口)
      ├─ TodoContextMenu.vue     右键菜单
      └─ TodoEditor.vue          新建/编辑弹层

src-tauri/
├─ src/lib.rs                    SQL 迁移定义(纯新增)
├─ tauri.conf.json               窗口 1100×720 / NSIS currentUser
└─ capabilities/default.json     窗口权限(sql:allow-execute 等)

e2e/
├─ todo.spec.ts                  5 个功能用例
└─ tour.spec.ts                  产品巡览:逐页截图 + 连续录屏

scripts/                          桌面版实机验证与截图脚本(PowerShell / Node)
screenshots/                      18 张逐页截图
videos/                           巡览录屏(webm)+ 预览页
```

## 4. 常用命令

```bash
npm run dev          # 前端 dev server(端口固定 1420,strictPort)
npm run build        # vue-tsc --noEmit && vite build —— 类型检查是构建的一部分
npm run tauri dev    # 桌面应用开发模式
npm run tauri build  # 桌面发布构建(cargo 需手动加 PATH,见 PLAYBOOK)
npx playwright test  # 全量 E2E
npx playwright test e2e/tour.spec.ts   # 只跑巡览(重新生成截图 + 录屏)
```

> Windows 上 `cargo`/`rustc` 不在默认 PATH:
> `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`

## 5. 不可违反的约束

1. **数据库迁移只增不改**。新增表用 `CREATE TABLE IF NOT EXISTS` 追加一个 version 更高的 Migration,绝不修改/删除既有表或既有数据。升级必须只增不改。
2. **开发完成后先跑 E2E**,再构建桌面版。这是固定收尾顺序。
3. **不动用户已有数据**。验证桌面版时优先用只读交互;确需临时数据必须自己清理干净并复核。
4. **E2E 与桌面版是两套数据**。E2E 跑在浏览器 localStorage,桌面版用 SQLite,两者互不影响。
5. **日期一律 `YYYY-MM-DD` 字符串**,统一用 dayjs 处理,不要混用 Date 对象。
6. **中文输出**,注释与文档都用中文。

## 6. 三个最容易踩的坑(务必先看)

| 坑 | 症状 | 正解 |
| --- | --- | --- |
| 日历格子选择器过宽 | `hasText('29')` 同时命中 10月29 和 9月29 → Playwright strict mode 报错,且**只在特定日期出现** | 按 `.day-num` 精确匹配:`.filter({ has: page.locator('.day-num', { hasText: /^29$/ }) })` |
| 抓图时动了窗口焦点 | 右键菜单被 `window blur` 监听关掉,截图里没有菜单 | 抓图与点击**分成两个进程**,抓图用 `-CaptureOnly` 跳过一切焦点操作 |
| 合成点击打到别的窗口 | 用户的 Chrome 挡在前面,点击全被 Chrome 吃掉 | 先让目标窗口拿到前台(`AttachThreadInput` + `AppActivate`),或改用 UI Automation 直接 Invoke |

完整清单见 `docs/PLAYBOOK.md`。

## 7. 详细文档

| 文档 | 内容 |
| --- | --- |
| `docs/SPEC.md` | 完整功能规格:每个模块的 UI 结构、交互规则、数据模型、算法细节、逐文件职责 |
| `docs/PLAYBOOK.md` | 构建 / 测试 / 桌面版升级发布流程 + 踩坑清单 + 扩展配方 |

## 8. 想改点什么,从哪下手

| 目标 | 改哪里 |
| --- | --- |
| 加一个新模块 | `SideNav.vue` 的 `navItems` 加一项 → `App.vue` 加渲染分支 → 建组件 |
| 加一张数据表 | `src-tauri/src/lib.rs` 追加 Migration(version+1) → `db/database.ts` 加导出函数(SQLite + localStorage 双实现) |
| 加一条工作方法 | `src/data/methods.ts` 追加条目(注意 `id` 唯一、`case` 可选) |
| 改待办字段 | `types/index.ts` → `db/database.ts` 双实现同步 → Migration 加列(仅新增,不重写旧表) |
| 改菜单项 | `TodoContextMenu.vue` 的 `items` computed(按 `todo.date === today` 分支) |
| 改每日推送规则 | `stores/dailyMethod.ts` 的 `permutationFor()` / `refresh()` |
