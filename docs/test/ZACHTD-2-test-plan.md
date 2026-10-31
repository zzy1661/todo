# 测试计划与用例 · 日程待办 macOS 版（ZACHTD-2）

| 项 | 内容 |
| --- | --- |
| 文档编号 | TP-ZACHTD-2 |
| 关联 Issue | ZACHTD-2《规划 macOS 版「日程待办」App 开发（Tauri 2 + Vue 3，废弃原有代码，暂不执行）》 |
| 版本 | **v1.2（G2-prep 判门后的两处指针必修 + 与 PRD v1.2 定稿措辞对齐）** |
| 作者 | @Tester |
| 日期 | 2026-11-01 |
| 唯一判定基线 | **PRD v1.2（待 PM 交付）**：AC-01~AC-44 沿用 v1.1 条文；AC-45~AC-56 为本计划 §7 转正项；AC-57~AC-67 为同步章节（编号以 PRD v1.2 定稿为准，偏差只影响编号不影响用例） |
| 上游输入 | PRD v1.1（962 行）+ PRD v1.2 增量指令；技术设计 v1.0（909 行）；四份 Windows 基线材料；`methods.ts`；Leader 裁定 CFL-07、G1 判门与 Q-T-01~05 裁定、Supabase 范围变更 7 条裁定 |
| 落地方式 | Confluence / JIRA 在本工作区不可写（无 skill、无凭据），按 Workflow E 降级：**本文件 + Issue 附件**即 T1 主副本；平台可用后原样发布，正文不需重写 |
| 本轮边界 | **只出规划与用例**。未执行任何用例、未 `npm install`、未 `npx playwright install`、未初始化工程、未做 git 操作 |

### v1.2 增量（本版只动 2 处必修 + 措辞对齐，TC 编号一个未动）

| # | 改动 | 依据 | 位置 |
| --- | --- | --- | --- |
| 1 | **AC-54 主 TC：TC-014 → TC-043**（用例 4 的「全部待办」清库场景）；方法库空态降为人工观察项；TC-014 只留 AC-10 的「有按钮」断言 | Leader G2-prep 裁定（同一断言被两条 AC 指向相反期望，S7 必踩） | §6、§7、TC-014、TC-043 |
| 2 | **TC-056 的 Then 缩到「导航内」**：导航内无账号 / 登录 / 同步入口；**同步入口只允许在 C-16（AC-58）**；保留「无自动更新入口」 | PRD v1.2 AC-44 已改口径；不缩会与 AC-58「C-16 必须有登录入口」互相打脸 | TC-056、§7 GAP-12 说明 |
| 3 | 措辞对齐 PRD v1.2 定稿（不动用例结构）：AC-47 卡片宽度写死区间、AC-51 用 `.mc-preview` 计数、AC-55 六步操作按 PRD 列、AC-64 / v3 迁移**只给 `todos` 加列**（`daily_picks` 不同步、不加列，D-19）、OPEN-01 由「默认口径」升为「已裁定：墓碑终结」（D-10） | PRD v1.2 §11.6 / §13.9 / §16.1 / §16.4 | 全文对应行 |

### v1.1 增量（5 处，保持有效）

| # | 改动 | 位置 |
| --- | --- | --- |
| 1 | Q-T-01~05 五条裁定全部落地：`.mc-fade` / `data-date` + `data-outside` / 双构建法 / 部署目标预声明 / GAP 转正 | §3.4、§9、§10、§12.1 |
| 2 | GAP-01~12 → **已转正 AC-45~AC-56**，**原 56 条 TC 编号一个不动**，改为在既有 TC 上追加断言点 | §7 + §6 矩阵新增 12 行 |
| 3 | 新增 **Supabase 同步用例组 TC-057~TC-080**（24 条），云端路径一律 `NOT-VERIFIED` | §5.8 + §6 矩阵新增 11 行 |
| 4 | T3 执行计划补：部署目标（降级可跑）、双构建法步骤、同步 stub 执行与 `NOT-VERIFIED` 报告规则、分段映射 S7 / S10.5 | §10 |
| 5 | §12「待确认」改为「已裁定」；新增同步侧 `OPEN-01~04`（不阻塞，已给默认执行口径） | §12 |

---

## 0. 本计划是什么，以及怎么用

### 0.1 判定纪律（先读这一条）

```
一条 AC 判 PASS = 该 AC 的「主 TC」证据齐全，且证据来自规定的那一层验证手段。
不允许的推论：
  ✗ 6/6 E2E 全绿 ⇒ AC 全过（E2E 只能证明它在 Chromium 下的那部分）
  ✗ `npm run build` 通过 ⇒ 功能正确
  ✗ 实现者自述 + 截图一张 ⇒ 通过
  ✗ 未装依赖 / 未构建 / 未实机 ⇒ 判 PASS（只能 BLOCKED）
  ✗ 云端能力未拿到 key ⇒ 判 PASS（只能 NOT-VERIFIED，且 NOT-VERIFIED 不等于 PASS）
```

**T3 结论只允许三选一**：`PASS` / `FAIL` / `BLOCKED`。缺环境、缺构建产物、缺 G2.5 ⇒ `BLOCKED`，不得降级为 PASS。

**单条 AC 多出第四种状态 `NOT-VERIFIED`**（本版新增）：用于**没有 key 就无法连通**的云端能力（同步、RLS、OAuth 端到端）。规则：

1. `NOT-VERIFIED` **不计入 PASS 数**，必须在报告里单列并写明"待 key 后补跑"；
2. 一条 AC 若只有云端路径能判定，则该 AC 整体为 `NOT-VERIFIED`；
3. 若同一 AC 同时有本地可判部分（如 `sync.enabled=false` 的短路行为），本地部分照常判 PASS/FAIL，云端部分记 `NOT-VERIFIED`；
4. **禁止**用 stub 通过代替云端通过——stub 通过只能证明"逻辑分支正确"，不能证明"Supabase 真的能用"。

### 0.2 本文件的阅读路径

| 你是 | 读哪些 |
| --- | --- |
| Leader 判 T1 门 | §1 范围、§5 用例清单（含 §5.8 同步组）、§6 追溯矩阵、§7 转正项、§12 已裁定与 OPEN |
| 实现（@资深全栈开发专家） | §3 配置/选择器契约（S2/S3 的 `.mc-fade`、`data-date`）、§4 夹具、§5 里"落点=E2E 用例 N"的断言、§5.8 同步契约、§12.2 OPEN |
| T3 执行（我自己） | §3、§4、§8 人工清单、§10 执行计划（含双构建法与 stub 执行）、§11 门禁 |
| 评审（@Reviewer） | §7 转正项、§9 风险（含同步侧 R-T-13~R-T-18）、§12 |

### 0.3 我在本轮实际做过的事（只做只读核对，不算执行测试）

**v1.0 那轮**：读全 PRD v1.1 与设计文档；下载 `methods.ts` 用 Node v22.21.1 的 type-stripping **独立求值 `METHODS`** 复跑基准值（§4.1）；核对 SPEC §8.2 选择器清单（§3.4）。

**v1.1 这轮**：按 G1 判门与同步范围变更做增量——把 Q-T-01~05 的裁定落进契约、把 GAP-01~12 转正为 AC-45~AC-56（沿用既有 TC 编号）、按 Leader 对 Supabase 的 7 条裁定设计同步用例组并标注 `NOT-VERIFIED` 边界。**本轮同样没有跑任何用例、没有装依赖、没有构建。**

> PRD v1.2 尚未落盘（PM 仍在跑）。本版 AC-45~AC-67 的**编号**取自 Leader 指令与我的 §7 表，**条文**以 PRD v1.2 定稿为准；若 PM 定稿的 Then 与本文不一致，以 PRD 为准并回改本计划（只影响措辞，不影响用例结构）。

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
| **数据同步（v1.1 新增）** | 本地优先降级、可选登录入口、5 秒防抖推送、启动/登录后拉取、LWW、软删除不复活、v3 迁移、密钥与 RLS 边界 | L1 E2E（stub）+ L0 静态 + **云端连通 `NOT-VERIFIED`** |

### 1.2 明确不测（与 OP- / 裁定一致，避免误判为缺陷）

| 不测项 | 依据 |
| --- | --- |
| Windows 端运行时行为 | NS-09 已改为「Windows **可构建**、CI 验证」；本机为 macOS，**不承诺本机 Windows 产物**，交付证据是 CI job |
| Windows 本机安装包产物 | Tauri 不支持 macOS 交叉编译 Windows 安装包；CI 产物是否算交付由 Leader 定，测试侧只核对 CI job 是否真的执行并上传 |
| 从 Windows `todo.db` 迁移数据 | OP-02 已关闭：不继承，空库起步（交付说明声明即可） |
| 代码签名、公证、`spctl` 通过 | OP-05 已关闭：本期不做；`spctl` 返回 `rejected` 属预期，**不得判交付失败** |
| 系统菜单栏中文化 | OP-10 已关闭：框架默认英文，BR-22 白名单不含系统菜单栏 |
| 深色模式适配 | OP-11 已关闭：固定浅色 |
| 与 Windows 逐像素一致 | 设计 §6.2：只承诺行为等价；字体栈在 macOS 命中 PingFang SC，字宽/行高必然有差 |
| 性能、并发、压力（本地三模块） | 单用户本地应用（BR-18），PRD 未定义指标 |
| **云端真实连通**（同步写入、拉取、RLS 生效、GitHub OAuth 端到端） | 人类尚未提供 key ⇒ **一律 `NOT-VERIFIED`**，不得判 PASS；stub 通过只证明逻辑分支 |

### 1.3 设计研读摘要（采纳哪些、质疑哪些）

| # | 设计侧结论 | 我的处置 |
| --- | --- | --- |
| D-1 | `check-cases.mjs` 按 CFL-07 断言 `steps ≥ 2`，并打印真实分布 3–7 | **采纳**，并加一条**负向**用例（TC-036）证明脚本不是"永真" |
| D-2 | 溢出夹具固定 `5w2h` 与 `rice-scoring` | **部分采纳**：`5w2h` 升为**强制**夹具；`rice-scoring` 降为**条件**夹具（理由见 §4.2，其正文总长与 `first-principles` 仅差 1 字符，临界可能不溢出） |
| D-3 | E2E 仍是「5 功能 + 1 巡览」= 6 个 `test()` | **采纳并升为硬约束**：AC-03 判定 `6 passed`，**任何新增 `test()` 都会让 AC-03 自己失效**；macOS 新断言必须并入既有用例的断言体（§3.3） |
| D-4 | 三层证据链：Chromium 巡览 → `screencapture -l` 窗口级抓图 → 人工 checklist M-01~M-12 | **采纳**，M- 清单编号沿用不另起，仅补 M-13 / M-14 两项（§8） |
| D-5 | `AC-36` 用"覆盖安装新构建"验证升级不丢数据 | **已裁定（Q-T-03）**：采用双构建法——0.1.0 出包 → 造 5 条 → 版本升 0.1.1 重构建 → 覆盖安装 → `sqlite3` 快照 `diff`。TC-047 前置条件已按此改实（§5.6） |
| D-6 | 选择器沿用 SPEC §8.2（`.day-cell` / `.day-num` / `.mc-inner` 等） | **已裁定（Q-T-01 / Q-T-02）**：实现方补 `.mc-fade`（`v-show` 控制）与 `.day-cell[data-date]` + `[data-outside]`，已写进 S2 / S3 任务书；本计划**一律用 `data-*` 定位，禁止文本推断**（§3.4） |
| D-7 | 同步范围变更（人类 17:02，Leader 17:10 裁定 7 条） | **新增 §5.8 同步用例组**：本地优先、可选登录、5s 防抖、启动/登录后拉取、LWW、软删除优先、v3 迁移、密钥与 RLS 边界。云端一律 `NOT-VERIFIED` |
| D-8 | 同步不破坏既有交付 | 定为**回归红线**：`sync.enabled=false` 时全量 E2E 必须仍 `6 passed`（TC-077），否则视为同步污染主流程，直接判 FAIL |

---

## 2. 验证体系（四层证据链）

```
L0 静态与脚本        check-cases.mjs / check-permutation.mjs / grep / package.json 扫描 / sqlite3
   ↓
L1 E2E（Chromium）   6 个 test()：5 功能 + 1 巡览；断言并入，不新增用例
   ↓
L2 桌面产物          .app 启动、lipo -archs、plutil、sqlite3 直查、screencapture -x -o -l<winid>
   ↓
L3 人工 checklist    M-01 ~ M-16（Gatekeeper / 手势 / 失焦 / resize / 原生控件 / 断网 / 破坏性操作 / 同步降级）
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

### 3.4 选择器契约（v1.1：两处缺口已由 Q-T-01 / Q-T-02 关闭）

| 元素 | 选择器 | 来源 | 状态 |
| --- | --- | --- | --- |
| 待办条目 | `.todo-item` | SPEC §8.2 | 可用 |
| 完成圆圈 / 标题区 / 优先级 / 更多 | `.check` / `.item-body` / `.priority-tag` / `.more-btn` | SPEC §8.2 | 可用 |
| 右键菜单 / 菜单项 | `.ctx-menu` / `.ctx-item` | SPEC §8.2 | 可用 |
| 编辑器 / 优先级选项 | `.editor` / `.priority-option` | SPEC §8.2 | 可用 |
| 日期格 / 日期数字 | `.day-cell` / `.day-num` / `.day-cell.out-month` | SPEC §8.2 + §8.3 | 保留，但**仅作视觉断言**；定位一律走 `data-*` |
| **日期格的日期值（新）** | **`.day-cell[data-date="YYYY-MM-DD"]`**；补位格 **`[data-outside]`** | **Q-T-02 裁定（S2 任务书）** | ✅ 已定，AC-06 / AC-08 专用 |
| 圆点 / `+` 标记 | `.day-dots .dot` / `.day-dots .dot-count` | SPEC §2.1（AC-07 引用 `.dot-count`） | 可用 |
| 分组 / 组内列表 | `.group` / `.group-items` | SPEC §8.2 | 可用 |
| 工作法卡片 | `.method-card` / `.mc-inner` / `.mc-name` / `.mc-cat` / `.mc-steps-block` / `.mc-box` / `.mc-case` / `.case-title` | SPEC §8.2 + 设计 §6.3 | 可用 |
| **底部渐隐提示（新）** | **`.mc-fade`**（`v-show` 控制显隐） | **Q-T-01 裁定（S3 任务书）** | ✅ 已定，AC-29 判**断言**，不再截图目测 |
| 状态徽章（v1.2 补） | **`.mc-preview`** | PRD v1.2 AC-51 | ✅ AC-51 判据：同屏 `.mc-preview` **计数恒为 1** + 文案逐字比对 |
| 方法库 / 分类筛选 / 往期 | `.lib-item` / `.cf-btn` / `.history-item` | SPEC §8.2 | 可用 |
| 导航项 | `.nav-item` | SPEC §8.2 | 可用 |
| 同步状态区（新） | `.sync-panel` / `.sync-state` / `.sync-login` | 本计划提议，S10 任务书确认 | ⏳ 待实现侧确认命名（只影响 TC-057~TC-080，见 §12.2 OPEN-04） |

**用法纪律（v1.1 收紧）**：

```ts
// ✅ AC-06 / AC-08 唯一允许的定位方式
page.locator('.day-cell[data-date="2026-11-15"]');
page.locator('.day-cell[data-outside]').first();       // 补位格

// ❌ 禁止再用文本推断日期（v1.0 的兜底方案作废）
page.locator('.day-cell').filter({ hasText: '15' });

// ✅ AC-29 渐隐判断
await expect(page.locator('.mc-fade')).toBeVisible();  // 可溢出时
await page.locator('.mc-inner').evaluate(el => el.scrollTop = el.scrollHeight);
await expect(page.locator('.mc-fade')).toBeHidden();   // 滚到底后
```

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

## 5. 用例清单（80 条：TC-001 ~ TC-056 为 v1.0 原用例，编号一个未动；TC-057 ~ TC-080 为 v1.1 新增同步组）

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
| TC-010 | AC-06 | W: 断言网格为 6 行 × 7 列且首列是周日；T: `.day-cell` = 42、`.day-cell[data-date]` 全部有值、每行 7 格、首列 7 格 `data-date` 互差 7 天 | E2E | 用例 1（**用 `data-date`，Q-T-02 已定**） |
| TC-011 | AC-07 | G: `F_3`（3 条）；W: 观察该日格；T: `.day-dots .dot` 存在、`.dot-count` **不存在**；再造第 4 条 → `.dot-count` 出现且文本为 `+`；删 1 条回 3 条 → 消失 | E2E | 用例 2 |
| TC-012 | AC-08 | G: 日历显示本月；W: 点 `.day-cell[data-outside]` 中下月 15 日那格（`data-date` 精确匹配）；T: 右栏切到该日、月标题变为下月、该月圆点数据已加载（不是空数据） | E2E | 用例 2（**用 `data-date` + `data-outside`**） |
| TC-013 | AC-09 / AC-45 | G: 已翻月且选中了非今日日期；W: 点「今天」；T: 月标题回本月、右栏回今天、`.day-cell.selected` 落在今天那格 | E2E | 用例 1 |
| TC-014 | AC-10 | G: `D_EMPTY` 无任何待办；W: 选中该日；T: 显示 `这一天还没有待办` 与「创建第一条待办」按钮；点按钮打开编辑器且日期默认 = 该日。**本用例只判 AC-10，"无按钮"的 AC-54 不在此处**（见 TC-043） | E2E | 用例 1（文案）/ 用例 2（按钮默认日期） |
| TC-015 | AC-11 / AC-46 | G: 某日 2 条均未完成；W: 切「已完成」页签；T: 显示 `没有符合筛选的待办`，且**不出现**创建按钮 | E2E | 用例 4 变体（并入） |

### 5.3 C 组 · 待办条目与右键菜单（AC-12 ~ AC-19）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-016 | AC-12 / AC-50 | G: 1 条带备注的待办；W: 枚举条目内可交互元素；T: 恰好 `.check` / `.item-body` / `.priority-tag` / `.more-btn` 四类；无铅笔、无垃圾桶、无独立「删除」按钮 | E2E | 用例 5 |
| TC-017 | AC-13 | G: 一条优先级「低」；W: 连点 `.priority-tag` 3 次；T: 文本依次 中 → 高 → 低；颜色按 绿/黄/红 切换（断言 class 或 `background-color` 一致变化） | E2E | 用例 2 |
| TC-018 | AC-13 | G: 桌面版把某条设为「高」；W: 退出并重启桌面版；T: 该条仍为「高」，`sqlite3` 查 `priority = 2` | 命令+人工 | 附录 A-5 |
| TC-019 | AC-14 / AC-47 | G: 3 条 0 完成；W: 勾 1 条；T: `已完成 1 项`、`完成率 33%`；全勾 → `完成率 100%`；取消 1 条 → 回 67% | E2E | 用例 2（33% / 67% 段）+ 用例 4 变体（100% 段） |
| TC-020 | AC-14 | G: 当日 0 条；W: 观察统计行；T: 显示 `共 0 项`、`已完成 0 项`，**不显示**完成率（也不显示 `0%`） | E2E | 用例 1 |
| TC-021 | AC-15 | G: 一条 `D_OTHER`（非今日）条目；W: 右键打开菜单；T: `.ctx-item` 文本集合 = {复制到今日, 移动到今日, 编辑, 删除}，**无**「移动明日」；分隔线存在 | E2E | 用例 5 |
| TC-022 | AC-15 | G: 桌面版同一条非今日条目；W: ① Control + 点击 ② 双指点按；T: 两种手势都弹出同一菜单，系统默认右键菜单不出现 | 人工 | M-02 / M-03 |
| TC-023 | AC-16 | G: 一条 `D_TODAY` 条目；W: 打开菜单；T: 文本集合 = {移动明日, 编辑, 删除}，**无**「复制到今日」「移动到今日」 | E2E | 用例 5 |
| TC-024 | AC-17 | G: `D_OTHER` 1 条（含备注、优先级高）；W: 点「复制到今日」；T: 今日新增 1 条（标题/优先级/备注相同、未完成）；原条目仍在 `D_OTHER`；总条数 +1；今日日历圆点出现 | E2E | 用例 5 + 附录 A-5 计数 |
| TC-025 | AC-18 | G: 非今日 1 条；W: 点「移动到今日」→ 再对同条点「移动明日」；T: 第一次 `date = D_TODAY` 且总数不变；第二次 `date = D_TOMORROW` 且总数不变；两次后日历圆点随之迁移（BR-09） | E2E | 用例 5 + 附录 A-5 |
| TC-026 | AC-19 / AC-48 / AC-49 | G: 菜单已打开；W: ① 点菜单外 ② 按 Esc ③ 触发窗口失焦（E2E 用 `window.dispatchEvent(new Event('blur'))` 模拟）⑤ 滚动列表；T: 每种操作后 `.ctx-menu` 不存在 | E2E | 用例 5（③ 为事件级模拟，真机切换应用由 M-05 复核） |
| TC-027 | AC-19 | G: 桌面版菜单已打开；W: ④ 拖动改变窗口尺寸；T: 菜单关闭 | 人工 | M-06 |

### 5.4 D 组 · 每日工作法（AC-20 ~ AC-30）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-028 | AC-20 / AC-51 | G: `daily_picks` 当日已有记录；W: 在方法库点另一条；T: `.mc-name` 变为该条、状态徽章文本 = `方法库预览`；该日 `method_id` 未变（E2E 查 localStorage / 桌面查库） | E2E+命令 | 用例 3 + 附录 A-5 |
| TC-029 | AC-21 | G: 该日无推送记录（清空 `todo_local_daily_db` / 删除该行）；W: 首次打开该日；T: 立即显示方法卡片（无空卡片），且落库 1 行、`manual = 0`、`method_id` ∈ 内容库 | 命令+E2E | 用例 3 + 附录 A-5 |
| TC-030 | AC-22 | G: 某日已推送方法 A；W: 退出应用、重启、再打开同一天；T: 仍是 A；重启前后 `method_id` 相同、该行 `updated_at` 未变 | 命令 | 附录 A-5（桌面版） |
| TC-031 | AC-23 | G: 该日 `manual = 0` 且方法 = 排列第 k 条；W: 点「换一条」；T: 切到第 `(k+1) % 65` 条（**用参考实现算期望，不用应用自己的函数**）、`manual` 0→1、徽章变 `已手动刷新`；重启后仍是该条 | 命令+E2E | 用例 3 + 附录 A-5 |
| TC-032 | AC-24 | G: 参考实现（按 PRD 附录 A 独立实现）就绪；W: `node scripts/check-permutation.mjs` 对 7 个抽样日期（`2026-01-01` / `02-28` / `03-15` / `06-30` / `10-31` / `12-31` / `2027-07-04`）；T: 每日 65 个 id 的排列序列与参考实现逐位一致、首条一致、重复计算 3 次一致，退出码 0 打印 7 组 MATCH | 命令 | 附录 A-6 |
| TC-033 | AC-25 | G: 打开每日工作法；W: 观察往期回顾并点第 3 行；T: `.history-item` = 7、日期由早到晚、当前日行高亮、点击后主卡片切到该日 | E2E | 用例 3 |
| TC-034 | AC-26 | G: 打开方法库；W: 观察标题与筛选按钮；T: 标题含 `65 条`；`.cf-btn` 计数为 全部 / 思维 17 / 工作 17 / 汇报 12 / 沟通 7 / 效率 12，合计 65；点每个分类后列表条数与计数一致 | E2E+命令 | 用例 3 + 附录 A-7 |
| TC-035 | AC-27 | G: 内容库就位；W: `node scripts/check-cases.mjs`；T: 退出码 0；输出总数 65 / 分类 17/17/12/7/12 / case 18+47 / `steps` ≥2 且分布 3×6·4×55·5×3·7×1 / 正文 126–240；4 条超限条目**未被判红** | 命令 | 附录 A-7 |
| TC-036 | AC-27 | G: 内容库副本放临时目录；W: ① 删 1 条 ② 造 1 条 `steps = 1` ③ 把某条 `case.type` 改成非法值 ④ 把某条案例正文截到 100 字；T: 四种篡改**各自**使脚本退出码 ≠ 0（证明断言不是永真）；而保留 4 条超限条目时退出码 = 0 | 命令 | 附录 A-7（负向） |
| TC-037 | AC-28 / AC-52 | G: 打开任一方法卡；W: 用 `boundingBox()` 取几何；T: `stepsBlock.y + height < box.y`、`box.y + height < caseBlock.y`；三者 `x` 相等（容差 1px）；卡片宽度 ≤ 内容区宽度 | E2E | 用例 3 |
| TC-038 | AC-29 | G: 通过方法库打开 `5w2h`；W: 读 `.mc-inner` 的 `scrollHeight/clientHeight`、滚到底；T: `scrollHeight > clientHeight`；`.mc-fade` 可见 → 滚到底后 `toBeHidden()`；`document.scrollingElement.scrollHeight <= window.innerHeight`（卡片不撑破页面） | E2E | 用例 3（**强制夹具**；渐隐用 `.mc-fade` 断言，Q-T-01） |
| TC-039 | AC-29 | G: 打开 `rice-scoring`；W: 同上；T: 若 `scrollHeight > clientHeight` → 断言 `.mc-fade` 与滚到底消失；若未溢出 → 记「夹具不成立，不判定」，**不判失败** | E2E | 用例 3（**条件夹具**，理由见 §4.2） |
| TC-040 | AC-29 | G: 桌面版打开 `5w2h`；W: 触控板/鼠标滚轮滚动；T: 卡片内部滚动、`.mc-fade` 出现且滚到底消失、页面外层不滚动、卡片不撑破窗口 | 人工 | M-11（WKWebView 渲染差异） |
| TC-041 | AC-30 / AC-53 | G: 日历页且今天有推送；W: 观察小卡片标题后点刷新圆钮；T: 标题 = `今日工作法`；点击后方法内容变化但**仍停留在日历模块**（`.day-cell` 仍可见、方法卡模块容器不出现） | E2E | 用例 3 |

### 5.5 E 组 · 全部待办（AC-31 ~ AC-33）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-042 | AC-31 | G: `F_MIX`（昨天 1 条未完成 + 今天 1 条已完成）；W: 打开全部待办；T: 2 个 `.group`；今天组标题以 ` · 今天` 结尾、昨天组无；组内右上角分别 `1/1`（今天）、`0/1`（昨天）；组按日期升序 | E2E | 用例 4 |
| TC-043 | AC-32 / **AC-54** | G: 同上；W: ① 依次筛「未完成」「已完成」；② 清空本地库后重新进入全部待办。T: ① 未完成只剩昨天组、已完成只剩今天组，组标题与组内统计同步，统计行不随筛选变化；② 显示 `暂无待办` 中性空态，且**该空态区域内无任何 `button`**（AC-54） | E2E | 用例 4（② 与 AC-32 同一 `test()`，清库段放最后） |
| TC-044 | AC-33 | G: 当日面板筛到「已完成」；W: 切到全部待办；T: 全部待办仍是「全部」（反之亦然） | E2E | 用例 4（并入） |

### 5.6 F 组 · 数据层与迁移（AC-34 ~ AC-38）

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 落点 |
| --- | --- | --- | --- | --- |
| TC-045 | AC-34 | G: 桌面版从未运行过（先备份并移走旧库）；W: 启动并新建 1 条；T: `~/Library/Application Support/com.poisson.todo/todo.db` 存在；`.tables` 含 `todos` 与 `daily_picks`；`count(*) = 1`；字段口径为 `YYYY-MM-DD` / `priority` 0-2 / `done` 0-1 | 命令 | 附录 A-5 |
| TC-046 | AC-35 / AC-55 | G: 桌面版有 3 条（记录 count 与明细）；W: 在同一台机器上跑全量 E2E；T: 桌面版仍 3 条、明细逐字节一致；E2E 数据只在 localStorage | 命令+人工 | 附录 A-5 |
| TC-047 | AC-36 | G: **0.1.0 与 0.1.1 两个构建都已产出**（双构建法，Q-T-03）：先装 0.1.0 并造 5 条（含不同日期与完成态）；W: 用 0.1.1 覆盖安装 → 启动 → 只读浏览 → 退出；T: `todos` 5 条且 id/date/done/title 一致；`daily_picks` 不丢；迁移版本号只增不减；`diff` 为空 | 命令 | 附录 A-5（**前置改为双构建，不再是 BLOCKED**） |
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
| TC-056 | AC-44 / AC-56 | G: 应用已启动；W: 检查**侧边导航**与交付说明；T: 导航仅 3 项、无「番茄钟」；**导航内**无账号 / 登录 / 同步入口（同步入口只允许出现在同步状态区 C-16，见 AC-58 / TC-062）；无自动更新入口；交付说明写明「数据空库起步、不迁移 Windows 历史数据」与「系统菜单栏为框架默认英文」 | 人工 | M-01 / M-04 + 巡览截图 |

---

### 5.8 H 组 · 数据同步（v1.1 新增，AC-57 ~ AC-67，TC-057 ~ TC-080）

**前置**：本组用例在 **S10（ZACHTD-12）实现完成、S10.5（ZACHTD-13）回归**时执行，不在 S7 的 AC-01~AC-56 判定里。本轮只出规划。

**数据范围（PRD v1.2 §16.1 + D-07 / D-19）**：**只同步 `todos`**；`daily_picks` 是「本机今天推了哪条」的本地状态，**不同步、不加同步列、不对它做任何联网断言**（跨设备不一致属预期）。因此 v3 迁移只给 `todos` 加 `uuid` / `updated_at_ms` / `deleted`。

**手段分三类，报告里必须分开写**：

| 手段 | 能证明 | 不能证明 |
| --- | --- | --- |
| **stub**（本地假云端：E2E 用 `page.route` 拦截 `**/rest/v1/**`；桌面版用可配置 base URL 指向本地 `scripts/mock-supabase.mjs`） | 逻辑分支正确（防抖、LWW、软删除、短路） | Supabase 真实可用、RLS 生效、GitHub OAuth 真能登 |
| **静态/命令**（grep、`sqlite3`、payload schema） | 密钥边界、迁移结构、OAuth 参数形态 | 运行时连通 |
| **真云端** | 端到端 | **无 key ⇒ 一律 `NOT-VERIFIED`** |

> **可测性硬要求（写进 S10 任务书）**：Supabase base URL 与 anon key 必须**可配置**（env 或设置项），否则桌面版 stub 根本跑不起来，本组 24 条里至少 14 条会变成"只能靠读代码"。这条不给，本组 24 条里 **16 条**（E2E 5 + stub 11）会退化成「只能读代码」，我只能如实标 BLOCKED。

| TC | 覆盖 AC | Given / When / Then（压缩） | 类型 | 手段 / 落点 |
| --- | --- | --- | --- | --- |
| TC-057 | AC-57 | G: 未配置 key（或 `sync.enabled=false`）；W: 启动并统计所有 `**/rest/v1/**` 请求；T: 云端请求 **0 次**；三模块功能与基线完全一致；日志无错误堆栈 | E2E | `page.route` 计数 + 用例 1 断言体 |
| TC-058 | AC-57 | G: 同上，且网络整体不可用（route 全部 abort）；W: 走「新建待办 → 每日工作法换一条 → 全部待办筛选」；T: 全部成功，无网络错误提示、无阻塞态 | E2E | 与 TC-053 / AC-41 同源，同步侧另计 |
| TC-059 | AC-57 | G: 同步代码已接入；W: `sync.enabled=false` 下跑全量 E2E；T: 仍 `6 passed`（**回归红线**，D-8），新增同步断言未破坏既有用例 | 命令 | `npx playwright test --reporter=list` |
| TC-060 | AC-57 | G: 浏览器 / E2E 环境；W: 观察同步是否被触发；T: localStorage 环境下**不启用同步**、零云端请求（数据隔离不破，FR-DB-10） | E2E | route 计数 = 0 |
| TC-061 | AC-58 | G: 首次启动；W: 观察首屏；T: **不出现**登录页 / 全屏遮罩 / 强制登录，直接进日历；三模块可用 | E2E | 用例 1 断言体 |
| TC-062 | AC-58 | G: 已进入应用；W: 打开同步状态区；T: 提供 GitHub 登录入口，无 key 时给「未配置」说明；登录不阻塞主流程，关闭后状态不丢 | E2E | `.sync-panel` / `.sync-login`（命名待 S10 确认，OPEN-04） |
| TC-063 | AC-59 | W: 检索 OAuth 实现；T: 含 `code_challenge` / `code_verifier`（PKCE）、`redirect_uri` 为 `http://127.0.0.1:<port>` 回环；**无** `response_type=token`（隐式流程） | 命令 | `grep -rn "code_challenge\|response_type\|127.0.0.1" src/` |
| TC-064 | AC-59 | G: 真实 GitHub 账号 + 真实 Supabase 项目；W: 完整走一次登录；T: 回跳到应用并拿到会话 | **NOT-VERIFIED** | 无 key，等补跑；**不得记 PASS** |
| TC-065 | AC-60 | G: 已登录（stub）；W: 2 秒内连续改 3 条；T: 推进到第 5 秒 → **只推送 1 次**，payload 含 3 条（防抖合并） | stub | fake timer + stub 请求记录 |
| TC-066 | AC-60 | G: 同上；W: 改 1 条后停在 4.9 秒；T: 无请求；第 5.0 秒 → 1 次请求，payload **只含变更条目**，含 `uuid` / `updated_at_ms` / `deleted` | stub | 同上 |
| TC-067 | AC-60 | G: 已登录；W: 删除 1 条；T: 第 5 秒推送 `deleted=1`（**软删除**），本地行仍在库、不是物理 `DELETE` | stub | payload 断言 + `sqlite3` 查 `deleted` |
| TC-068 | AC-61 | G: stub 云端有 2 条本地没有的记录；W: 启动应用；T: 启动后拉取并合并，列表出现这 2 条；本地原有数据不丢 | stub | 启动流程 + stub 计数 ≥ 1 |
| TC-069 | AC-61 | G: 未登录且本地有数据；W: 登录成功；T: 登录后立即拉取一次，冲突按 LWW 合并 | stub | 登录回调后 stub 计数 +1 |
| TC-070 | AC-62 | G: 同 `uuid`，本地 `updated_at_ms=100`、远端 200；W: 拉取；T: 远端胜；反向（本地 200 / 远端 100）→ 本地胜，且不把旧值回写云端 | stub | 双向断言 |
| TC-071 | AC-62 | G: 两条记录 `updated_at_ms` 同毫秒；W: 以两种不同到达顺序各合并一次；T: 最终态一致（稳定序：`uuid` 字典序），两次结果逐字节相同 | stub | 顺序无关收敛 |
| TC-072 | AC-62 | G: 远端设备时钟比本地快 6 小时；W: 拉取 + 本地改同一条；T: 按 LWW 判远端胜（**不自行改规则**），并登记 R-T-13 风险 | stub | 断言 + 风险登记 |
| TC-073 | AC-63 | G: 远端某条 `deleted=1`、`updated_at_ms=T`；W: 拉取；T: 本地该条 `deleted=1`，三模块列表均不可见，统计同步减少 | stub | `sqlite3` + UI 断言 |
| TC-074 | AC-63 | G: 已按 TC-073 删除；W: 更旧记录（`updated_at_ms<T`、`deleted=0`）后到；T: **不复活**，`deleted` 仍为 1 | stub | 核心断言（防"旧数据复活"） |
| TC-075 | AC-63 | G: 已登录；W: 本地删除一条并等 5 秒；T: 推送 `deleted=1` 而非物理删除；本地 `todos` 行仍存在 | stub | payload + `sqlite3` |
| TC-076 | AC-64 | G: 从 v2 库升级到含 v3 迁移的构建；W: `PRAGMA table_info(todos)` / `PRAGMA table_info(daily_picks)` 并二次启动；T: **`todos`** 有 `uuid` / `updated_at_ms` / `deleted` 三列，老数据 `uuid` 回填且唯一非空、`deleted` 默认 0，二次启动不重复生成 uuid（幂等）；**`daily_picks` 未新增这三列**（D-19：不同步就不加列） | 命令 | 附录 A-11 |
| TC-077 | AC-64 | W: 检索迁移源码与版本记录；T: v1 / v2 未被修改（与基线逐字一致）、新增只有 v3；`DROP` / `ALTER` 仍为 0；迁移版本号只增 | 命令 | 附录 A-8 + A-11 |
| TC-078 | AC-65 | G: 无 key；W: 尝试一次真实同步（写云端）；T: — | **NOT-VERIFIED** | 登记项，**不得判 PASS**；等 key 后补跑 |
| TC-079 | AC-66 | W: ① 检索仓库内 RLS 策略 SQL：存在 `enable row level security` 与 `using (auth.uid() = user_id)`；② 用 A 用户 token 读 B 用户数据（需云库）；T: ① 判 PASS/FAIL；② **NOT-VERIFIED** | 命令 + NOT-VERIFIED | `grep -rn "row level security\|auth.uid()" supabase/`；云侧等 key |
| TC-080 | AC-67 | W: ① `grep -rn "service_role\|SUPABASE_SERVICE" . --exclude-dir=node_modules` ② `git ls-files` 中无 `.env` / 密钥文件 ③ 打包产物内无 `service_role` 字符串；T: 三项均无命中；anon key 只出现在运行期配置、不硬编码 | 命令 | 附录 A-12 |

**NOT-VERIFIED 清单（无 key 期间，报告必须单列，不得计入 PASS）**：TC-064（OAuth 端到端）、TC-078（云端真实连通）、TC-079 的第二段（跨用户判权）。等人类提供 key 后，这三项作为 S10.5 的补充回归重跑。

**stub 契约（S10 必须实现到可测）**：① base URL 可配置（env `SUPABASE_URL` 或设置项）；② anon key 可注入且不入库；③ `scripts/mock-supabase.mjs` 提供 `GET/POST/PATCH /rest/v1/todos` 与 `/auth/v1/health`；④ 时间源可注入（防抖与 `updated_at_ms` 用同一个 `now()`）。缺 ①④ 时，TC-065~TC-072 只能读代码，我会如实标 BLOCKED。

---

## 6. AC ↔ TC 追溯矩阵（67 / 67 全覆盖）

> v1.0 的 44 行原样保留；v1.1 追加 AC-45~AC-56（GAP 转正）与 AC-57~AC-67（同步）。

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
| AC-36 | 升级不丢数据 | TC-047 | 双构建法（Q-T-03，已裁定） |
| AC-37 | 迁移只增不改 | TC-048 | — |
| AC-38 | 卸载重装数据保留 | TC-049 | — |
| AC-39 | `.app` + `.dmg` 产物 | TC-050 | TC-051（架构/最低版本/签名） |
| AC-40 | `.app` 启动 | TC-052 | 巡览截图 01 对照 |
| AC-41 | 断网可用 | TC-053 | — |
| AC-42 | 依赖克制 | TC-054 | — |
| AC-43 | Windows 残留 | TC-055 | — |
| AC-44 | 范围边界 | TC-056 | 巡览截图 |
| **AC-45** | 翻月不重置选中日（原 GAP-01） | TC-013 | TC-009（同一 `test()` 内追加断言） |
| **AC-46** | 切日期筛选重置为「全部」（原 GAP-02） | TC-015 | 用例 4 变体 |
| **AC-47** | 编辑器五条：空标题禁用 / 回车提交 / 按钮文案 / 100-500 上限 / 400px 遮罩（原 GAP-03） | TC-019 | 用例 2 创建与编辑段 |
| **AC-48** | 菜单键盘导航与首项高亮（原 GAP-04） | TC-026 | 用例 5 |
| **AC-49** | 菜单贴边翻转 + 8px 安全边距（原 GAP-05） | TC-026 | 用例 5（缩窗到边缘后右键） |
| **AC-50** | 菜单不被列表裁切（Teleport 挂 body）（原 GAP-06） | TC-016 | 用例 5 断言 `.ctx-menu` 父级 |
| **AC-51** | 状态徽章「今日推送」与三态互斥（原 GAP-07） | TC-028 | 用例 3 |
| **AC-52** | 无 `case` 不渲染案例区块（原 GAP-08） | TC-037 | **临时夹具（不入库）** + 代码评审；现有 65 条不可达 |
| **AC-53** | 非今日小卡片标题与刷新钮 hover（原 GAP-09） | TC-041 | 用例 3 切到非今日日期 |
| **AC-54** | `暂无待办` 空态（原 GAP-10） | **TC-043** | 用例 4 清库场景；方法库空态＝人工观察项（ES-04 现实不可达） |
| **AC-55** | 双实现语义逐条一致（原 GAP-11） | TC-046 | 命令 + 人工对拍 |
| **AC-56** | 导航注册表驱动、未知 id 回退默认图标（原 GAP-12） | TC-056 | 代码评审（不可观察） |
| **AC-57** | 本地优先：无 key / 未登录 / 断网不发起云端请求（同步） | TC-057 | TC-058 / TC-059 / TC-060 |
| **AC-58** | 同步为可选入口，不启动强制登录 | TC-061 | TC-062 |
| **AC-59** | GitHub OAuth 走 loopback + PKCE，无隐式流程 | TC-063 | TC-064（NOT-VERIFIED） |
| **AC-60** | 变更后 5 秒防抖推送（合并 + 只推变更 + 软删除） | TC-065 | TC-066 / TC-067 |
| **AC-61** | 启动时拉取 + 登录后拉取 | TC-068 | TC-069 |
| **AC-62** | 冲突 LWW（`updated_at_ms` 大者胜，同毫秒稳定序） | TC-070 | TC-071 / TC-072（时钟偏移） |
| **AC-63** | 软删除优先，已删不复活 | TC-073 | TC-074（核心）/ TC-075 |
| **AC-64** | v3 迁移新增 `uuid` / `updated_at_ms` / `deleted` 且幂等回填、只增不改 | TC-076 | TC-077 |
| **AC-65** | 无 key 期间 `sync.enabled=false` 短路；云端真实连通 | TC-078 | — |
| **AC-66** | 云表开启 RLS（`auth.uid() = user_id`） | TC-079 | 云侧判权 NOT-VERIFIED |
| **AC-67** | service_role key 不进客户端与仓库 | TC-080 | 附录 A-12 |

**统计**：**67 / 67 AC 有主 TC**（AC-01~AC-44 原样；AC-45~AC-56 由 GAP 转正、挂在既有 TC 上；AC-57~AC-67 同步组）；**80 条用例**（TC-001~TC-080，连续无重号）。按判定手段：E2E 参与 **33** 条、命令/脚本参与 **32** 条、人工参与 **9** 条、同步 **stub 11** 条、`NOT-VERIFIED` **3** 条（TC-064 / TC-078 / TC-079 第二段），混合判定重复计入。

---

## 7. 原 AC 缺口 → 已转正 AC-45 ~ AC-56（v1.1）

> **状态：已转正（Q-T-05，Leader G1 判门裁定）。** 编号严格沿用 v1.0 §7 表的建议号，PRD v1.2 逐行落条文。
> **原 56 条 TC 编号一个未动**：这 12 项全部作为**既有 TC 的新增断言点**并入，不新增用例编号——因为 AC-03 判的是 `6 passed`，任何新 `test()` 都会让它自己失效（§3.3）。
> 判定口径：自 PRD v1.2 交付起，这 12 项**计入** AC 判定（不再进"观察区"）；PRD v1.2 未交付前，T3 不执行本段判定。

| 原缺口 | 现 AC | 行为 | 主 TC（编号未变） | 新增断言点 | 层 |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | **AC-45** | 翻月不重置选中日 | TC-013 | 翻月后右栏日期不变、选中态仍在原日 | E2E 用例 1 |
| GAP-02 | **AC-46** | 切日期筛选重置为「全部」 | TC-015 | 先筛「已完成」再点另一日 → 页签回到「全部」 | E2E 用例 4 |
| GAP-03 | **AC-47** | 编辑器五条：空标题禁用保存 / 回车提交 / 按钮文案「取消·创建」vs「取消·保存修改」/ 标题 100 字与备注 500 字上限 / 卡片约 400px + 遮罩模糊 | TC-019 | 逐条断言：保存按钮 `disabled`、按 Enter 后关闭、按钮文案逐字比对、`maxlength` 或截断行为、`boundingBox().width ∈ [380, 420]`（区间取 PRD v1.2 定稿值，不再写"≈400"） | E2E 用例 2 |
| GAP-04 | **AC-48** | 菜单键盘导航：↑↓ 循环跳过分隔线、Enter 执行、Esc 关闭、首项高亮 | TC-026 | 打开后第一项高亮；连按 ↓ 高亮循环；Esc 关闭 | E2E 用例 5 |
| GAP-05 | **AC-49** | 菜单贴边翻转 + 8px 安全边距 | TC-026 | 窗口缩到 900×600、在右下角条目右键 → 菜单不越界且距边 ≥ 8px | E2E 用例 5 |
| GAP-06 | **AC-50** | 菜单渲染在最上层、不被列表裁切 | TC-016 | `.ctx-menu` 父级是 `body`（Teleport），不被 `.group-items` 的 overflow 裁切 | E2E 用例 5 |
| GAP-07 | **AC-51** | 状态徽章「今日推送」，与「已手动刷新」「方法库预览」三态互斥 | TC-028 | 三态各造一次，断言 `.mc-preview` **计数恒为 1** 且文案逐字比对（PRD v1.2 指定选择器） | E2E 用例 3 |
| GAP-08 | **AC-52** | 无 `case` 时不渲染案例区块 | TC-037 | **临时夹具**：本地临时删一条的 `case` 字段（**不得入库**）→ 断言 `.mc-case` 不存在、其余区块正常；同时代码评审保留该分支 | 人工 + 代码评审 |
| GAP-09 | **AC-53** | 非今日小卡片标题 `M月D日 工作法`；刷新钮 hover 变分类色 | TC-041 | 切到非今日日期 → 标题匹配 `M月D日 工作法`；刷新钮 hover 背景色变化 | E2E 用例 3 |
| GAP-10 | **AC-54** | `暂无待办` 空态（全部待办），**无创建按钮**；方法库空态同口径但现实不可达 | **TC-043**（原写 TC-014，已被 Leader G2-prep 裁定改指） | 用例 4 末尾清库：全部待办显示 `暂无待办` 且该区域无 `button`；**方法库空态 = 人工观察项**，不设断言、不判 PASS/FAIL（65 条均有分类，ES-04 不可达） | E2E 用例 4 + 人工观察 |
| GAP-11 | **AC-55** | 双实现语义逐条一致（同操作序列 → 同可见结果） | TC-046 | PRD v1.2 定稿的同一组 6 步：新建 → 改优先级 → 完成 → 改日期 → 删一条 → 换一条方法；两种环境各跑一次，比对列表内容 / 排序 / 完成率 / 推送记录 | 命令 + 人工对拍 |
| GAP-12 | **AC-56** | 导航注册表驱动、未知 id 回退默认时钟图标 | TC-056 | 代码评审（新增模块只需三处改动）+ 源码检索未知 id 回退分支 | 代码评审 |

**仍需注意的一条口径**：AC-52 在现有 65 条数据下**不可达**（全部带 `case`）。我不会为了让它"可测"去改内容库——那是 CFL-07 明令禁止的。所以它只能靠"临时夹具 + 代码评审"判定，报告必须写明这个局限。

---

## 8. 人工 checklist（M-01 ~ M-16，E2E 盖不住的部分）

编号 M-01 ~ M-12 沿用设计 §7.4，不另起编号；M-13 / M-14 为 v1.0 新增，M-15 / M-16 为 v1.1 同步侧新增。每条都要留证据（截图 > 录屏 > 文字描述），并在 T3 报告里以「人工-通过 / 人工-失败」单列。

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
| M-15 | 同步状态区的「未配置」表现（无 key） | TC-062 / AC-58 | 入口可见但不痛；点击后给出"未配置 Supabase key"说明而不是报错弹窗；主流程三模块仍可用 | 截图 |
| M-16 | 桌面版已登录 + 断网时的同步表现 | TC-058 / AC-57 | 界面不阻塞、不反复重试打点、本地读写照常；恢复网络后 5 秒内自动补推（若 S10 未做补推，记录为遗留，**不判 FAIL**） | 录屏 + 日志 |

**人工 checklist 的门禁作用**：M-01 / M-08 / M-11 属"不通过则不能判交付"的硬项（分别对应首启可用、编辑器视觉契约、AC-29 桌面版）；M-15 / M-16 属同步侧记录项（无 key 期间不判 FAIL，但必须在报告出现）；其余为记录项，失败记为观察并列入遗留。

---

## 9. E2E 覆盖不了的部分与测试风险

> **v1.1 变更**：原 `BLK-01`（AC-36 无上一版本）已由 Q-T-03 裁定关闭，移入下方「已裁定」表；新增同步侧 `R-T-13 ~ R-T-18`。

**已裁定的原阻塞（不再作为风险跟踪）**

| 原编号 | 事项 | 裁定 | 落地 |
| --- | --- | --- | --- |
| BLK-01 | AC-36 无"上一版本"可升级 | **Q-T-03 双构建法**（0.1.0 出包 → 造 5 条 → 升 0.1.1 重构建 → 覆盖安装 → `diff`），已写进 S6 任务书 | TC-047 前置已改实；判据是 `diff` 相同，口头"数据没丢"不算 PASS |
| Q-T-01 | 渐隐无稳定 class | `.mc-fade` + `v-show`，S3 任务书 | AC-29 改为断言（TC-038/039/040） |
| Q-T-02 | 日期格无 `data-date` | `data-date` + `data-outside`，S2 任务书 | AC-06 / AC-08 改为 `data-*` 定位（TC-010/012） |
| Q-T-04 | 无 deploy URL | 部署目标预声明 = 本机 `.app` + dev server，`deploy_url = none (local artifact)`，降级可跑 | T3 不因无 URL 判 BLOCKED（§10.1） |

| 编号 | 风险 / 局限 | 说明 | 处置 |
| --- | --- | --- | --- |
| R-T-01 | 引擎差异（Chromium vs WKWebView） | 日期控件、模糊、字体行高、`contextmenu` 语义 | M-07 / M-08 / M-11 + AC-29 桌面复核；报告里明确"E2E 绿 ≠ WKWebView 绿" |
| R-T-02 | 6 个 `test()` 的硬约束 | 新增 `test()` 会让 AC-03 的 `6 passed` 失效 | §3.3：新断言并入既有用例；确需新增先改 AC |
| R-T-03 | `page.clock` 能力依赖 Playwright 版本 | AC-04 需要"月中/月末各跑一次" | Playwright ≥ 1.45 用 `page.clock.install`；否则退化为"真实月末择日复跑"，并在报告注明降级 |
| R-T-04 | AC-38 是破坏性操作 | `rm -rf "/Applications/日程待办.app"` | 执行前 `cp` 备份 `todo.db` 到 `verify/`，且必须拿到执行许可；无备份不执行 |
| R-T-05 | ~~选择器契约缺 2 项~~ **已关闭** | Q-T-01 / Q-T-02 已裁定并写进任务书 | 保留编号以便追溯，不再作为风险 |
| R-T-06 | 中文路径 | `日程待办.app` / `日程待办_0.1.0_aarch64.dmg` | 所有命令加引号、用变量（PRD RISK-09）；M-13 专项核对 |
| R-T-07 | 无 `MULTICA.md` §2 | 仓库根目录无该文件，skill 要求的自动化产物路径约定缺失 | 本期按基线 `e2e/` 落库；T2/T3 前若团队要求 §2，需 DevOps 在执行阶段补 |
| R-T-08 | 屏幕录制授权 | 未授权时 `screencapture -l` 静默失败（窗口名为空、图为空） | 执行 M-11/M-12 前先确认「系统设置 → 隐私与安全性 → 屏幕录制」已授权 |
| R-T-09 | 只有 CLT，无完整 Xcode | 公证、`xcodebuild`、universal 不可用 | 本期都不做（OP-04/05） |
| R-T-10 | 内容库溢出夹具临界 | `rice-scoring`(404) 与 `first-principles`(403) 仅差 1 字符 | TC-039 设为条件断言，判定由 `5w2h` 承担（§4.2） |
| R-T-11 | 用例串行共享状态 | 单跑某一个用例可能因缺少前序数据而失败 | 用例开头断言前置状态；巡览用例强制自包含 |
| R-T-12 | 首次 `npx playwright install chromium` 需网络 | 断网环境无法首次安装 | 装机后立即执行一次并记录版本；AC-41 的断网验证必须在浏览器已就绪之后 |
| **R-T-13** | **LWW 依赖客户端时钟** | `updated_at_ms` 若取本机时钟，多设备时钟不同步（甚至回拨）会让"新改动永远输给旧数据"，且本地数据看似"同步不上" | **不改规则**（裁定 3 已定 LWW），TC-072 专门造时钟偏移并如实记录；建议 S10 评估改用服务端 `server_updated_at` 或"取 `max(本地, 服务端)`"作为二次判据——属决策项，测试侧只提风险不擅改 |
| **R-T-14** | stub 通过 ≠ 云可用 | 无 key 期间防抖/LWW/软删除全在 stub 上验证，真实 Supabase 的 RLS、时区、`jsonb` 行为可能不同 | TC-064 / TC-078 / TC-079 第二段一律 `NOT-VERIFIED`；key 到位后必须补跑，不得用 stub 结果替代 |
| **R-T-15** | 同步污染主流程 | 一旦启动即拉取或强制登录，AC-03 的 `6 passed`、AC-41 断网、AC-34 空库会当场失效 | **D-8 回归红线**：TC-059 专项守门，红则直接 FAIL |
| **R-T-16** | E2E 不得访问真实网络 | 用例里若漏配 route，会真的打到 `*.supabase.co`，既不可重复也会污染云端 | 所有同步用例强制 `page.route('**/*supabase*', ...)`；并断言未匹配请求数 = 0 |
| **R-T-17** | 双构建法的版本号语义 | 0.1.0 / 0.1.1 仅用于升级验证，正式交付版本号需 Leader 定（0.1.1 还是 1.0.0） | 测试只认"两个不同版本号 + 同一 identifier + 数据目录不变"，不锁定具体版本字符串 |
| **R-T-18** | `deleted` 列改变查询口径 | 现有一切查询（按月、按日、全量、推送）都必须带 `deleted = 0`，漏一处就会让已删条目重新出现在日历圆点或统计里 | 新增静态检索断言：`sqlite3` 查询与数据层 SQL 中 `todos` 的读取必须含 `deleted` 条件（TC-073 的 UI 侧 + 代码评审） |

---

## 10. T3 执行计划（G2.5 之后，本轮不执行）

### 10.1 前置材料（缺则 BLOCKED；`deploy_url` 已由 Q-T-04 预声明）

| 字段 | 本项目等价物 | 当前状态 |
| --- | --- | --- |
| `g2_pass` | Leader 的 G2 判门 + 变更文件清单 | 未到 |
| `g2_sha` | 构建对应的本地 commit SHA（S9 前不 push，用本地 SHA） | 未到 |
| `deploy_url` | **`none (local artifact)`**：部署目标 = `src-tauri/target/release/bundle/macos/日程待办.app` + dev server `http://localhost:1420`，属**降级可跑**，报告注明（Q-T-04 已预声明，不再等 G2.5 补） | **已定** |
| 变更文件表 | 前端 `src/**` + `src-tauri/**` 变更清单 | 未到 |
| `api_contract` | **N/A**（纯本地应用，无业务接口） | 已可判定 N/A |
| `g25_pass` | Leader/DevOps 的 G2.5 判门 | 未到 |
| `ui_auth` | `auth_mode = none`（应用无账号；同步的 GitHub 登录属可选入口，不是测试账号） | 已可判定 |
| Apifox 三 ID | **N/A（非缺失）** | 已可判定 |

### 10.2 执行顺序（FR-QA-07，不可颠倒）

```bash
# 1) 构建与类型检查
npm ci && npm run build
# 2) E2E（Chromium，6 用例；含新增 macOS 断言，不新增 test()）
npx playwright test --reporter=list
# 3) 桌面打包（当前版本，例如 0.1.0 —— 双构建第一段）
npm run tauri build
# 4) 双构建升级验证（Q-T-03）
#    4.1 装 0.1.0 → 造 5 条（不同日期/完成态）→ 退出
#    4.2 版本号升 0.1.1（迁移集不变或加 v3）→ npm run tauri build
#    4.3 覆盖 .app → 启动 → 只读浏览 → 退出 → sqlite3 快照 diff
#    —— 判据是 diff 为空；口头「数据没丢」不算 PASS
# 5) 巡览产物重生成（UI 有变化时）
npx playwright test e2e/tour.spec.ts
# 6) 桌面版取证 + 人工 checklist
#    swift scripts/mac-window-id.swift → screencapture -x -o -l<winid> → M-01 ~ M-16
# 7) 同步组（S10 之后）：stub 执行 + NOT-VERIFIED 登记
node scripts/mock-supabase.mjs &            # 本地假云端
npx playwright test -c playwright.sync.config.ts   # 独立目录 e2e-sync/，不污染 AC-03 的 6 用例（§10.6）
```

### 10.3 产物与证据

| 产物 | 位置 | 用于 |
| --- | --- | --- |
| E2E 视频 / trace | `test-results/` | AC-03 |
| 巡览截图 14 张 + 录屏 | `screenshots/`、`videos/`（`test-results/` 之外） | AC-05、AC-40 对照 |
| 数据快照与 diff（两段：本地库 + 升级后） | `verify/before.txt` / `after.txt` / `picks-*.txt` | AC-36、AC-38 |
| 桌面窗口抓图 | `screenshots/15-…` ~ `18-…` | AC-29 桌面、AC-40 |
| 同步 stub 请求日志 | `verify/sync-requests.jsonl` | TC-065~TC-072（防抖次数、payload schema） |
| 人工 checklist 签署 | T3 报告正文 | M-01 ~ M-16 |

### 10.4 失败分诊（先分类，再定性）

| 现象 | 归类 | 处理 |
| --- | --- | --- |
| 选择器找不到 / strict mode 冲突 | 用例问题 | 我自修（`data-*` / 精确匹配），修完重跑 |
| 日期相关断言在特定日期失败 | 用例问题 | 改为相对日期计算，重跑 |
| `check-cases.mjs` 把 4 条超限条目判红 | **脚本口径问题** | 改脚本断言为 `>= 2`，**不得改数据**（CFL-07） |
| 实际行为与 Then 不符 | 产品问题 | 出 FAIL 工单：复现步骤 / 期望 / 实际 / 证据 / 严重程度，派实现方 |
| 同步用例真的打到了 `*.supabase.co` | **用例问题（高危）** | 立即中止、检查 route 缺失；不得把这次结果计入任何 AC |
| 同步逻辑只体现在代码、无 stub 可跑 | 可测性缺失 | 判 BLOCKED 并回给 S10（缺 base URL 可配置 / 时间可注入） |
| 缺少构建产物、权限、授权、网络 | 环境问题 | 记 BLOCKED，不降级为 PASS |

### 10.5 报告结构（对应 G3，v1.1 扩展）

```
1. 结论：PASS / FAIL / BLOCKED（三选一，不得模糊）
2. 67 条 AC 逐条表：AC | 判定 | 证据（命令输出 / 测试名 / 截图号） | 备注
   —— AC-01~AC-44 在 S7 判；AC-45~AC-56 在 S7 判（PRD v1.2 交付后）；
      AC-57~AC-67 在 S10.5（ZACHTD-13）判
3. 三态之外的第四态单列：NOT-VERIFIED（TC-064 / TC-078 / TC-079 第二段）
4. 人工 checklist（M-01 ~ M-16）：通过 / 失败 / 未执行
5. 缺陷清单（FAIL 项）：严重程度 + 复现步骤 + 证据
6. 环境事实与降级声明（deploy_url = none、无完整 Xcode、无签名、无 key）
```

### 10.6 分段映射（与 Leader 的 9 段 + 同步 3 段对齐）

| 段 | 子任务 | 我执行什么 | 判定范围 |
| --- | --- | --- | --- |
| S7 | ZACHTD-9 | 全量 T3：AC-01~AC-56 逐条判定 + 人工 checklist + 报告 | 56 条（44 原有 + 12 转正） |
| S10.5 | ZACHTD-13 | 同步回归：TC-057~TC-080（stub 可跑的 + `NOT-VERIFIED` 登记） | AC-57~AC-67 |
| S11 | ZACHTD-14 | 增量评审的测试意见（不改判、不代评审） | — |

> **同步断言不并入 6 个既有 `test()`**：它们与本地三模块无关，且一旦写进主用例，`sync.enabled=false` 与 `=true` 两种配置会互相打架（AC-03 的 `6 passed` 会随配置漂移）。所以同步组在 **S10.5 用独立目录 + 独立配置**执行：`e2e-sync/`（**不在** `testDir: './e2e'` 之内）+ `playwright.sync.config.ts`，命令是 `npx playwright test -c playwright.sync.config.ts`。这样 `npx playwright test` 仍是 **6 passed**（AC-03 不被污染），同步用例另计一套。这一点必须写进 S10 任务书，否则实现方会把同步断言塞进主用例、或把 `e2e-sync/` 放进 `testDir`，直接破 AC-03。

---

## 11. 进入 / 退出准则

### 11.1 T1 退出准则（v1.0 已判 PASS；v1.1 增量自检）

- [x] 67 条 AC 逐条有主 TC，无遗漏（§6）
- [x] 80 条 TC 每条都有 AC 归属（§5），编号 TC-001~TC-080 连续无重号
- [x] `steps` 断言按 CFL-07（`>= 2`，分布 3–7），未沿用「2–4」
- [x] 明确列出 E2E 覆盖不到的部分并单列人工 checklist（§8，M-01~M-16）
- [x] 基线对齐：5 功能 + 1 巡览，且把"不得新增 test()"写成硬约束（§3.3）
- [x] Q-T-01~05 裁定已落进契约（§3.4 / §9 / §10 / §12.1）
- [x] GAP-01~12 已转正为 AC-45~AC-56，**原 56 条 TC 编号一个未动**（§7）
- [x] 同步组 24 条已建，云端路径全部标 `NOT-VERIFIED`，本地 stub 路径可执行（§5.8）
- [x] 同步侧 4 项 OPEN 已给默认口径，不阻塞（§12.2）
- [ ] 待 Leader 判 v1.1 增量（或直接并入 T3 底稿）

### 11.2 T3 进入准则

- G2 PASS（变更文件清单可见）
- G2.5 PASS；部署目标按 **Q-T-04 预声明**（本机 `.app` + dev server，`deploy_url = none (local artifact)`，降级可跑）
- `npm ci` + `npm run build` 可执行、`npx playwright install chromium` 已就绪
- `.app` 可产出并可启动；**双构建的 0.1.0 与 0.1.1 均可用**（AC-36）
- 破坏性用例（AC-38）已拿到执行许可 + 数据已备份
- 同步组（S10.5）额外要求：`scripts/mock-supabase.mjs` 可跑，且 base URL / 时间源可注入（§5.8 stub 契约）

### 11.3 T3 退出准则

- **67 条 AC** 全部有判定（PASS / FAIL / BLOCKED / NOT-VERIFIED），无"未执行"空白
- 每条 PASS 都指向具体证据（不允许"截图看起来正常"）
- `NOT-VERIFIED` 单列且**未计入 PASS**（TC-064 / TC-078 / TC-079 第二段）
- 人工 checklist 的硬项（M-01 / M-08 / M-11）已签署；M-15 / M-16 已记录
- 回归红线 TC-059（`sync.enabled=false` 下 `6 passed`）必须绿

---

## 12. 待确认项 → 已裁定（v1.1）

### 12.1 Q-T-01 ~ Q-T-05：全部已裁定（Leader G1 判门）

| 编号 | 原问题 | **裁定** | 落地位置 | 状态 |
| --- | --- | --- | --- | --- |
| Q-T-01 | 渐隐提示无稳定 class | 采用 **`.mc-fade`**，`v-show` 控制显隐 | S3（ZACHTD-5）任务书；本计划 §3.4 / TC-038~040 | ✅ 已裁定 |
| Q-T-02 | 日期格无 `data-date` | 每个日期格加 **`data-date="YYYY-MM-DD"`**，补位格加 **`data-outside`**；AC-06/AC-08 一律 `data-*` 定位，**禁止文本推断** | S2（ZACHTD-4）任务书；§3.4 / TC-010 / TC-012 | ✅ 已裁定 |
| Q-T-03 | AC-36 无"上一版本" | **双构建法**：0.1.0 出包 → 造 5 条 → 升 0.1.1 重构建 → 覆盖安装 → `sqlite3` 快照 `diff`；**判据是 diff 相同**，口头"数据没丢"不算 PASS | S6（ZACHTD-8 §E / T-15、T-18）；TC-047 | ✅ 已裁定 |
| Q-T-04 | 无 deploy URL | **G2.5 预声明**：部署目标 = 本机 `.app` + `http://localhost:1420`，`deploy_url = none (local artifact)`，属**降级可跑**，报告注明；T3 不因无 URL 判 BLOCKED | §10.1 / §11.2 | ✅ 已裁定 |
| Q-T-05 | GAP-01~12 是否补 AC | **转正为 AC-45~AC-56**，编号严格沿用本计划 v1.0 §7 表，不另起号；PM 在 PRD v1.2 逐行落条文 | §7（本版已改）；§6 矩阵已加 12 行 | ✅ 已裁定 |

### 12.2 同步侧新增 OPEN（不阻塞执行，已给默认口径；按 Leader「先按建议」先做）

| 编号 | 问题 | 默认执行口径（我现在按这个测） | 影响 |
| --- | --- | --- | --- |
| ~~OPEN-01~~ **已裁定（D-10）** | 软删除是否为**终结态** | **墓碑终结**：`deleted=1` 不被任何远端非删除记录覆盖，`updated_at_ms` 更大也不复活（PRD v1.2 §16.4 已同步改口径）。TC-074 依此断言，不再作为"默认口径" | AC-63 判定口径 |
| **OPEN-02（PRD v1.2 同号）** | 5 秒防抖窗口内**应用退出**时，未推送的变更怎么办 | **不 flush**（PRD v1.2 §16.4）：未到期变更随退出丢弃，本地库已写，下次变更会重新带上。TC-067/075 只判"防抖与软删"，不判 flush；若 S10 增量做了 flush，补一条正向断言 | AC-60 |
| **OPEN-03（PRD v1.2 同号）** | 登录后拉取与"启动时拉取"是否会重复拉两次 | **允许重叠**（PRD v1.2 §16.4）：两次均为幂等合并，只断言"合并结果正确"，不断言请求次数恰为 1 | TC-068/069 |
| **OPEN-04（PRD v1.2 同号）** | 同步状态区（C-16）的 DOM 命名 | 由 S10 实现方定，但**必须稳定可测**；我按 `.sync-panel` / `.sync-state` / `.sync-login` 占位，改名只回改 §3.4 与 6 条用例的选择器（不改判定） | TC-057~TC-080 |

> OPEN-01 已由 Leader 裁定为**墓碑终结**（D-10），不再挂"默认口径"；OPEN-02~04 保留 PRD v1.2 的编号与默认口径，**不阻塞执行**，但每条都会在 S10.5 报告里以"口径声明"出现，避免把默认口径当成需求。

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

**A-11 同步 v3 迁移与软删除（TC-073~TC-077）**

```bash
DB="$HOME/Library/Application Support/com.poisson.todo/todo.db"
# 三列是否存在
sqlite3 "$DB" "PRAGMA table_info(todos);" | grep -E "uuid|updated_at_ms|deleted"
# 回填是否完整（应输出 0 行：uuid 为空或重复）
sqlite3 "$DB" "SELECT count(*) FROM todos WHERE uuid IS NULL OR uuid = '';"
sqlite3 "$DB" "SELECT uuid, count(*) c FROM todos GROUP BY uuid HAVING c > 1;"
# v3 只动 todos：daily_picks 不得有同步列（应输出 0 行）
sqlite3 "$DB" "PRAGMA table_info(daily_picks);" | grep -E "uuid|updated_at_ms|deleted"
# 软删除不物理删（应输出 0 行）
sqlite3 "$DB" "SELECT count(*) FROM todos WHERE deleted = 1;"
# 读取必须带 deleted 条件（漏则已删条目会重新出现在列表/圆点）
grep -rn "FROM todos" src/ | grep -v "deleted" && echo "MISSING deleted FILTER"
```

**A-12 密钥与安全边界（TC-080）**

```bash
# 1) 仓库内不得出现 service_role / 服务端密钥
grep -rn "service_role\|SUPABASE_SERVICE" . --exclude-dir=node_modules --exclude-dir=.git || echo "NO SERVICE ROLE KEY"
# 2) 版本库里不得有 .env / 密钥文件
git ls-files | grep -E "^\.env|secret|key\.json" || echo "NO SECRET FILES TRACKED"
# 3) 打包产物内不得有 service_role 字符串
strings "src-tauri/target/release/bundle/macos/日程待办.app/Contents/MacOS/日程待办" | grep -c "service_role" || echo "BINARY CLEAN"
# 4) OAuth 流程形态
grep -rn "code_challenge\|response_type\|127.0.0.1" src/ || echo "NO PKCE CODE FOUND"
```

---

## 附录 B · 用例统计（v1.1）

| 维度 | 数量 |
| --- | --- |
| AC 总数 | **67**（AC-01~AC-44 原 44 条 + AC-45~AC-56 转正 12 条 + AC-57~AC-67 同步 11 条） |
| 已覆盖 AC | 67 / 67（100%） |
| TC 总数 | **80**（TC-001~TC-080，连续无重号） |
| E2E 参与判定 | **33**（v1.0 的 28 + 同步组 5，含 4 条与命令混合） |
| 命令 / 脚本参与判定 | **32**（v1.0 的 26 + 同步组 6；含 3 条与人工混合、4 条与 E2E 混合、1 条与 NOT-VERIFIED 混合） |
| 人工参与判定 | **9**（纯人工 6，另 3 条与命令混合；AC-52 的临时夹具计入 TC-037 的人工段） |
| 同步 stub 判定 | **11**（TC-065~TC-075，逻辑分支专测） |
| `NOT-VERIFIED` | 3（TC-064 OAuth 端到端、TC-078 云端连通、TC-079 跨用户判权） |
| 人工 checklist 项 | 16（M-01 ~ M-16，硬项 3 条：M-01 / M-08 / M-11） |
| 已关闭的原阻塞 | 1（BLK-01 → 双构建法，Q-T-03） |
| 已裁定待确认项 | 5（Q-T-01 ~ Q-T-05，全部关闭） |
| 同步侧 OPEN | 4（OPEN-01 ~ OPEN-04，给默认口径、不阻塞） |

---

## 附录 C · 与设计文档的口径差异（需 @资深全栈开发专家 知悉）

| # | 设计文档写法 | 实测 / 本计划 | 处置 |
| --- | --- | --- | --- |
| 1 | `rice-scoring` 正文总长最大 = **426 字符** | 我按 `summary + steps + when + action + case` 统计 = **404**；`first-principles` = 403（差 1） | 不写死 426；夹具判定改由 `5w2h` 承担 |
| 2 | `5w2h`「每条 step 文本 ≤ 31 字符，最长即 `5w2h`」 | `5w2h` 单步最长 18；单步最长 31 属 `rice-scoring` | 表述笔误，不影响"`5w2h` 最高"的结论 |
| 3 | 溢出夹具固定 `5w2h` + `rice-scoring` | `5w2h` 强制、`rice-scoring` 条件 | 避免临界高度造成 AC-29 误判/漏判 |
| 4 | AC-36「覆盖安装新构建」 | 本期无"上一版本" | **已裁定 Q-T-03**：双构建法（0.1.0 → 0.1.1），已写进 S6 任务书；TC-047 前置改实 |
| 5 | 设计 §7.4 的 M-01 ~ M-12 | 我补 M-13（中文路径）/ M-14（交付说明一致性）/ M-15（无 key 同步提示）/ M-16（已登录 + 断网） | 编号不冲突，设计侧无需改 |
| 6 | 设计 v1.0 未覆盖同步 | 本计划 §5.8 新增 24 条同步用例与 stub 契约 | 需 @资深全栈开发专家 在 S10 任务书里落"base URL / 时间源可注入"，否则 14 条只剩读代码 |

---

## 附录 D · 修订记录

| 版本 | 日期 | 变更摘要 |
| --- | --- | --- |
| v1.2 | 2026-11-01 | **G2-prep 判门后的两处指针必修（TC 编号一个未动）**：① AC-54 主 TC 由 **TC-014 改为 TC-043**（用例 4 清库场景），方法库空态降为人工观察项，TC-014 只留 AC-10 的「有按钮」断言——消除"同一断言被两条 AC 指向相反期望"的 S7 必踩坑；② TC-056 的 Then 缩到「**导航内**无账号 / 登录 / 同步入口」，并写明同步入口只允许在 C-16（AC-58），与 AC-44 新口径一致；③ 按 PRD v1.2 定稿对齐措辞：AC-47 宽度区间 [380,420]、AC-51 用 `.mc-preview` 计数、AC-55 六步按 PRD 列、AC-64 与 v3 迁移**只给 `todos` 加列**（`daily_picks` 不同步，D-19）、OPEN-01 升为「已裁定：墓碑终结」（D-10）。④ 顺带把 **AC-45~AC-56 回填进对应 TC 的「覆盖 AC」列**（映射与 §7 完全一致、判定不变），让「AC ↔ TC」可由脚本机械校验，不再只靠 §7 的散文映射。AC / TC 计数不变：67 AC / 80 TC |
| v1.1 | 2026-11-01 | **G1 判门 PASS 后的增量（只动 5 处）**：① Q-T-01~05 五条裁定落地——`.mc-fade`（AC-29 改断言）、`data-date` + `data-outside`（AC-06/08 禁文本推断）、双构建法（TC-047 前置改实）、部署目标预声明（`deploy_url = none (local artifact)`）；② GAP-01~12 转正为 **AC-45~AC-56**，挂在既有 TC 上、**原 56 条编号一个未动**；③ 新增 **同步用例组 TC-057~TC-080**（24 条）与 `NOT-VERIFIED` 第四态规则（TC-064 / TC-078 / TC-079 第二段）；④ T3 执行计划补双构建步骤、同步 stub 执行、S7/S10.5 分段映射、同步断言不进主用例（守 AC-03 的 `6 passed`）；⑤ §12 待确认改已裁定，新增同步侧 OPEN-01~04（给默认口径）。新增风险 R-T-13~R-T-18，其中 R-T-13（LWW 依赖本机时钟）与 R-T-18（`deleted` 漏过滤会让已删条重现）是同步侧最需要盯的两条 |
| v1.0 | 2026-11-01 | 首版 T1 测试计划：44 条 AC 全覆盖、56 条 TC、M-01~M-14 人工 checklist、12 项 AC 缺口、BLK-01；T1 判门 PASS（Leader G1） |
