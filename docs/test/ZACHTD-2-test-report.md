# T3 测试执行与报告 · 日程待办 macOS 版（ZACHTD-2）

| 项 | 内容 |
| --- | --- |
| 文档编号 | TR-ZACHTD-2 |
| 关联 Issue | ZACHTD-9（S7 测试执行与报告） |
| 判定基线 | `docs/requirements/ZACHTD-2-macos-prd.md` 的 **AC-01 ~ AC-56**（56 条；v1.3 的条文与 v1.2 定稿一致，只改了指针；AC-57~AC-67 属 S10.5，不在本段） |
| 执行用例 | `docs/test/ZACHTD-2-test-plan.md` v1.2 的 **TC-001 ~ TC-056** |
| 执行人 | @Tester |
| 执行日期 | 2026-11-01（CST） |
| 执行环境 | macOS 14.1（23B2073）/ arm64 / Node 22.21.1 / npm 10.9.4 / Rust 1.92.0 / Playwright 1.64.1 / 仅 CommandLineTools（无完整 Xcode） |
| 部署目标 | `deploy_url = none (local artifact)`：`src-tauri/target/release/bundle/macos/日程待办.app` + dev server `http://localhost:1420`（Q-T-04 预声明） |
| 本轮边界 | 只执行与记录；**未改任何产品代码**、未新增 `test()` |

## 0. 结论（先读这一段）

**56 条 AC（AC-01~AC-56）中 55 PASS / 0 FAIL / 1 BLOCKED / 0 NOT-VERIFIED。**
另有 **观察（不可达）0 条 AC**（2 个「半句」观察项见 §9）。

- **通过率 = PASS ÷ 本段可判定条数 = 55 ÷ 56 = 98.2%**
  - 可判定 **56 条** = 55 PASS + 1 BLOCKED + 0 FAIL；**观察 0 条**；`NOT-VERIFIED` 0 条。
  - 若只按「可判 PASS / FAIL」的 55 条算（把 BLOCKED 排除在分母外）：55 ÷ 55 = 100%。报告主口径用 55/56。
- **可交付（附阻塞项：1 条 AC + 10 项桌面人工取证待 TCC 授权后补）。**
  唯一被判 BLOCKED 的 AC 是 **AC-41（断网后完整走三模块）**：它只能靠「关网 + 在 WKWebView 里点三模块」取证，本机 `AXIsProcessTrusted=false` / `CGPreflightScreenCaptureAccess=false`，既无法操作桌面 UI，也不允许擅自杀掉本机网络。旁证已附（应用进程零网络 socket、产物内无外部请求地址、Chromium 侧 6 passed），但按纪律不把旁证当 PASS。
- 四组回归全部通过：`npm run build` 退出码 0、`node scripts/check-cases.mjs` PASS、`node scripts/check-permutation.mjs` 7/7 MATCH、`npx playwright test` **6 passed**（未新增 `test()`，仍是 5 功能 + 1 巡览）。
- FAIL / BLOCKED / NOT-VERIFIED 三类清单：**FAIL 0 条**；**BLOCKED 1 条 AC（AC-41）+ 10 项人工 checklist（M-01~M-11，均为 TCC）**；**NOT-VERIFIED 0 条 AC**（Windows 侧 3 项单列于 §8，不计入 AC）。

> 判定纪律（沿用计划 §0.1）：一条 AC 判 PASS = 其**主 TC** 的判据在本机以规定手段跑出来；桌面像素 / 手势类**辅助**项按 Leader 2026-11-01 口径记 `BLOCKED（环境：TCC 未授权）`，不改变 AC 判定；主 TC 本身完全依赖人工桌面操作时，该 AC 判 BLOCKED。

---

## 1. 环境与降级声明

| 事实 | 实测 | 对判定的影响 |
| --- | --- | --- |
| 操作系统 | macOS 14.1（23B2073），arm64 | 只判 macOS 侧；Windows 一律 `NOT-VERIFIED`（§8） |
| Xcode | `/Library/Developer/CommandLineTools`（无完整 Xcode） | 只验证「可产出 `.app` + `.dmg`」；公证 / universal 不在本期（OP-05） |
| 屏幕录制 | `PROBE tcc.screen-recording = false` | `screencapture -l<winid>` 报 `could not create image from window`（实测）→ 所有像素级桌面取证 BLOCKED |
| 辅助功能（AX） | `PROBE tcc.accessibility = false` | 无法读窗口标题 / 菜单栏、无法合成点击 → 手势类 checklist BLOCKED |
| 签名 | `Signature=adhoc`、`TeamIdentifier=not set`、`spctl --assess` exit 1 | OP-05 已关闭，`rejected` 属预期，不判交付失败 |
| Supabase key | 无 | AC-57~AC-67 不在本段；本段无同步入口，M-15 / M-16 仅登记 |

TCC 两项的原始输出：

```console
$ swift scripts/mac-desktop-probe.swift
PROBE tcc.accessibility = false
PROBE tcc.screen-recording = false
PROBE app.running = true
PROBE app.pid = 58908
PROBE app.bundle-id = com.poisson.todo
PROBE app.name = 日程待办
PROBE app.path = /Applications/日程待办.app
PROBE app.activation = regular
PROBE window.count = 1
PROBE window.number = 164243
PROBE window.bounds = 1100x720
PROBE window.title = BLOCKED (AX error -25211)
PROBE menubar.items = BLOCKED (AX error -25211)

$ bash scripts/mac-capture-window.sh 日程待办 /tmp/s7-launch.png
窗口号: 164243
could not create image from window
BLOCKED: screencapture 无法从窗口 164243 取图 —— 通常是系统未授予「屏幕录制」权限。
```

---

## 2. 四组回归命令（必做项，原始尾部输出）

### 2.1 `npm run build`

```console
$ npm run build
> todo@0.1.0 build
> vue-tsc --noEmit && vite build
vite v8.3.5 building client environment for production...
✓ 59 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.28 kB
dist/assets/index-DeETD-lH.css   25.84 kB │ gzip:  4.76 kB
dist/assets/index-BehJRYAf.js   183.92 kB │ gzip: 74.57 kB
✓ built in 146ms
EXIT=0
BUILD OK: dist/index.html      400 bytes
```

### 2.2 `node scripts/check-cases.mjs`

```console
$ node scripts/check-cases.mjs
内容库校验（scripts/check-cases.mjs）
  方法总数        65（期望 65）
  分类分布        thinking 17 / work 17 / report 12 / communication 7 / efficiency 12
  case 分布       practice 18 / story 47 / 缺失 0
  案例正文长度    126–240，均值 162.4（期望 126–240）
  id 唯一         65/65
  steps 真实分布  3 条 × 6 / 4 条 × 55 / 5 条 × 3 / 7 条 × 1（观测区间 3–7）
  steps > 4 条目  gtd(5), smart-goal(5), 5w2h(7), rice-scoring(5)（CFL-07 判定合规，不判失败）

PASS
EXIT=0
```

### 2.3 `node scripts/check-permutation.mjs`

```console
$ node scripts/check-permutation.mjs
MATCH 2026-01-01  首推=difficult-conversation  次推=okr  长度=65
MATCH 2026-03-15  首推=pyramid-principle  次推=issue-tree  长度=65
MATCH 2026-06-30  首推=task-batching  次推=meeting-lean  长度=65
MATCH 2026-11-01  首推=conclusion-argument-recommendation  次推=sunk-cost  长度=65
MATCH 2026-11-15  首推=pyramid-principle  次推=checklist  长度=65
MATCH 2026-12-31  首推=issue-tree  次推=critical-path  长度=65
MATCH 2027-02-28  首推=red-team  次推=pyramid-principle  长度=65

抽样日期比对：7/7 一致
PASS
EXIT=0
```

> 抽样日期与计划附录 A-6 列的 7 个日期不完全相同（脚本实际口径含 2026-11-01 / 11-15 / 2027-02-28 等）；判据「7 组 MATCH、退出码 0」成立。

### 2.4 `npx playwright test`

```console
$ npx playwright test --reporter=list
Running 6 tests using 1 worker
  ✓  1 [chromium] › e2e/todo.spec.ts:39:1 › 1 · 应用加载: shell, 42-cell calendar and the empty day panel (907ms)
  ✓  2 [chromium] › e2e/todo.spec.ts:143:1 › 2 · 完整链路: create, dots, priority, completion rate, cross-month (1.6s)
  ✓  3 [chromium] › e2e/todo.spec.ts:258:1 › 3 · 每日工作法: deterministic push, shuffle, history, library, scroll fade (957ms)
  ✓  4 [chromium] › e2e/todo.spec.ts:426:1 › 4 · 全部待办: cross-date groups, today marker, group progress, filters (846ms)
  ✓  5 [chromium] › e2e/todo.spec.ts:517:1 › 5 · 条目与编辑器: row anatomy, menu branches, closing, flip, editor (2.5s)
  ✓  6 [chromium] › e2e/tour.spec.ts:72:1 › 6 · 巡览: 14 screenshots + one continuous recording (1.9s)

  6 passed (10.3s)
EXIT=0
```

配套产物：`find test-results -name video.webm | wc -l` = **6**；`find test-results -name trace.zip | wc -l` = **0**（全绿，`trace: 'retain-on-failure'` 符合预期）。

### 2.5 补充命令（复核用，均本机实跑）

```console
$ node scripts/check-permutation.mjs      # → 7/7 MATCH（见 2.3）
$ node scripts/check-db-parity.mjs
双后端等价性对拍（scripts/check-db-parity.mjs）
  操作序列        13 步
  全部待办        4 条
  排序            丁 → 丙 → 乙改 → 戊
  推送记录        2026-11-01=5w2h(manual=true), 2026-11-02=issue-tree(manual=false)
  已比对维度      fetchTodos / ByDate / ByMonth×2 / DailyPicks / DailyPick×2
PASS：两条后端在相同操作序列下产生完全一致的可见结果

$ node scripts/check-data-layer.mjs
数据层 localStorage 路径自检 PASS（9 组断言）

$ node scripts/check-bundle-config.mjs
断言通过 44 条，失败 0 条
PASS（三份 conf 合并 + schema + 平台中立 + 数据路径中立 + workflow 结构）
```

---

## 3. 56 条 AC 逐条判定表

| AC | 主 TC | 判定 | 实测证据（本机命令 / 用例断言） | 辅助项 / 备注 |
| --- | --- | --- | --- | --- |
| AC-01 | TC-001 | **PASS** | `npm run build` exit 0；`vue-tsc --noEmit` 零错误；`✓ 59 modules transformed`；`dist/index.html` 400 B | TC-002 同批（`test -s` 通过） |
| AC-02 | TC-003 | **PASS** | 首实例 `curl -sI :1420` → `HTTP/1.1 200 OK`；第二实例 `second exit=1` + `Error: Port 1420 is already in use`（`strictPort`）；1421–1430 端口扫描全部 `000` | TC-004 |
| AC-03 | TC-005 | **PASS** | `6 passed (10.3s)`；视频 6 个；`trace.zip` 0（全绿） | 未新增 `test()`：`e2e/todo.spec.ts` 5 + `tour.spec.ts` 1 |
| AC-04 | TC-006 | **PASS** | `E2E_NOW=2026-11-15` → `6 passed`；`E2E_NOW=2026-11-30` → `6 passed`；无 strict-mode 冲突 | TC-007：`e2e/*.ts` 零字面量日期（仅 `COVERAGE.md` 文档示例命中） |
| AC-05 | TC-008 | **PASS** | `ls screenshots \| wc -l` = 14；`videos/日程待办-产品功能巡览.webm` 存在；两目录均在 `test-results/` 之外 | — |
| AC-06 | TC-009 | **PASS** | 用例 1：7 列头 `日…六`；`.day-cell` = 42 且 42 个 `data-date` 连续；today 格 `.today.selected`、`font-weight: 700`、非选中时色 = `.today-btn` 主色；`[data-outside]` opacity < 1；右栏默认今天 | TC-010 |
| AC-07 | TC-011 | **PASS** | 用例 2：3 条 → `.dot` 1 个、`.dot-count` 0 个；第 4 条 → `.dot-count` 文本 `+`；删回 3 条 → 消失 | — |
| AC-08 | TC-012 | **PASS** | 用例 2：点 `[data-outside][data-date=下月首日]` → 月标题与右栏同步切换；在该月造 1 条后折返再进入，圆点仍在（数据真加载） | — |
| AC-09 | TC-013 | **PASS** | 用例 1：`.today-btn` → 月标题回本月、右栏回今天、`.day-cell.selected` 落在今天 | — |
| AC-10 | TC-014 | **PASS** | 用例 1/2：`这一天还没有待办` + `.empty-action` 文案 `创建第一条待办`；点开新建编辑器 `date` = 该日 | 不含「无按钮」断言（AC-54 口径） |
| AC-11 | TC-015 | **PASS** | 用例 2：`没有符合筛选的待办`，空态内 `button` 数 = 0 | — |
| AC-12 | TC-016 | **PASS** | 用例 5：行内 `button` = 4 且恰为 `.check/.item-body/.priority-tag/.more-btn`；`aria-label`/class 无删除、垃圾桶、铅笔语义；`.item-note` 渲染备注 | AC-50 同用例 |
| AC-13 | TC-017 | **PASS** | 用例 2：低→中→高→低、`data-priority` 0→1→2→0、三次 `background-color` 互异；**S7 探针**：reload 后仍「高」(priority=2)；桌面库 `priority` 落在 0–2 | TC-018 的桌面点击部分见 §7 |
| AC-14 | TC-019 | **PASS** | 用例 2：勾 1 条 → `已完成 1 项` + `完成率 33%`；全勾 → 100%；取消 1 条 → 67%；用例 1：0 条时 `.stat-rate` 不渲染 | TC-020 |
| AC-15 | TC-021 | **PASS** | 用例 5：菜单文案/`data-action` = 复制到今日 / 移动到今日 / 编辑 / 删除，`.ctx-sep` = 1，无 `move-tomorrow` | Control+点击 / 双指 = **M-02/M-03 BLOCKED** |
| AC-16 | TC-023 | **PASS** | 用例 5：今日条目菜单 = 移动明日 / 编辑 / 删除 | — |
| AC-17 | TC-024 | **PASS** | 用例 5：复制后库中 +1 条（标题/优先级 2/备注/未完成一致、`date` = 今天），原条目仍在往期，今日圆点出现 | — |
| AC-18 | TC-025 | **PASS** | 用例 5：移动今日 → `date = 今天`、总数不变；再移动明日 → `date = 明天`、总数不变；圆点跟随 | — |
| AC-19 | TC-026 | **PASS** | 用例 5：①点菜单外 ②Esc ⑤真实滚轮滚动 → `.ctx-menu` 归 0；**S7 探针**：③`window.dispatchEvent(new Event('blur'))` ④`page.setViewportSize(1100×700)` → 均归 0 | ③④ 为事件级；真机切应用/拖窗 = **M-05/M-06 BLOCKED** |
| AC-20 | TC-028 | **PASS** | 用例 3：点 `5w2h` → `.mc-name` 变「5W2H 分析法」、`.mc-preview` = `方法库预览`、当日 `method_id` 未变；再点退出预览 | AC-51 同用例 |
| AC-21 | TC-029 | **PASS** | 用例 3：首开即出卡片（无空卡片）；库中恰好 1 行、`manual=false`、`method_id` = 独立参考实现首推；**桌面冷启动**自建 `daily_picks` 1 行（manual=0） | — |
| AC-22 | TC-030 | **PASS** | 桌面重启前后 `daily_picks` 快照 diff 为空（`method_id` / `manual` / `updated_at` 全一致） | 见 §4.3 |
| AC-23 | TC-031 | **PASS** | 用例 3：换一条 = 参考排列下一条、`manual=false→true`、徽章「已手动刷新」；桌面库中 `manual=1` 行跨我这次重启仍不变 | 桌面「换一条」点击本身 = **BLOCKED（TCC）** |
| AC-24 | TC-032 | **PASS** | `check-permutation.mjs`：7/7 MATCH，退出码 0 | — |
| AC-25 | TC-033 | **PASS** | 用例 3：`.history-item` = 7、日期升序、末行 = 今天、`.active` 跟随、点第 3 行主卡片切到该日 | — |
| AC-26 | TC-034 | **PASS** | 用例 3：`.library-count` = `65 条`；`.cf-btn` 6 个（全部 65 / 17 / 17 / 12 / 7 / 12），逐个点选后 `.lib-item` 条数与计数一致 | TC-035 交叉核对 |
| AC-27 | TC-035 | **PASS** | `check-cases.mjs` PASS：65 条、17/17/12/7/12、practice 18 + story 47、steps 分布 6/55/3/1（区间 3–7）、正文 126–240；4 条超限未判红 | TC-036（负向）未在本段复跑，见 §11 |
| AC-28 | TC-037 | **PASS** | 用例 3：`boundingBox()` → steps 底 ≤ duo 顶、duo 底 ≤ case 顶、三者 x 差 ≤ 1px、卡片宽 ≤ `.dv-main` | — |
| AC-29 | TC-038 | **PASS** | 用例 3（强制夹具 `5w2h`）：`scrollHeight > clientHeight`、`.mc-fade` 可见 → 滚到底 `toBeHidden()`、页面不滚动；`rice-scoring` 条件夹具本次不溢出（不判定） | 桌面 WKWebView = **M-11 BLOCKED** |
| AC-30 | TC-041 | **PASS** | 用例 3：`.mini-title` = `今日工作法`；点 `.mini-refresh` 后内容变化，`data-module` 仍 `calendar` 且 `.daily-module` 隐藏 | — |
| AC-31 | TC-042 | **PASS** | 用例 4：2 个 `.group` 升序；今天组标题含 ` · 今天`、昨天组不含；组计数 `1/1`、`0/1`；统计 `共 2 项 / 完成率 50%` | — |
| AC-32 | TC-043 | **PASS** | 用例 4：筛「未完成」只剩昨天组 `0/1`；筛「已完成」只剩今天组 `1/1`；统计行不随筛选变化 | — |
| AC-33 | TC-044 | **PASS** | 用例 4：当日面板筛「已完成」时全部待办仍 `all`（2 组）；切回日历面板仍 `done` | — |
| AC-34 | TC-045 | **PASS** | 删空数据目录后冷启动：`todo.db`/两表/索引自动重建，`.tables` = `_sqlx_migrations daily_picks todos`，迁移 1/2；现有库 todos 5 行，`date` 全部 `YYYY-MM-DD`（GLOB 不匹配数 0）、`priority` 0–2、`done` 0–1；`daily_picks` 1 行由应用自身在启动时写入 | 「新建 1 条」未用桌面 UI 复跑（TCC 无法点击），见 §4.1 |
| AC-35 | TC-046 | **PASS** | 本轮 4 次全量 E2E 后，桌面库与 `docs/verification/data/todos-after-0.1.1.txt` diff 为空；E2E 只写 `todo_local_db` / `todo_local_daily_db` | AC-55 同用例 |
| AC-36 | TC-047 | **PASS** | 三组 diff 全空：`todos-before-0.1.0 ↔ todos-after-0.1.1`、`picks-*` 同、`after-0.1.1 ↔ after-restart`；迁移仍只有 1、2 | 见 §4.2 |
| AC-37 | TC-048 | **PASS** | `grep -nE "DROP \|ALTER \|DELETE FROM\|UPDATE todos"` 无命中；仅 2 个 `CREATE TABLE IF NOT EXISTS` + 1 个 `CREATE INDEX IF NOT EXISTS` | `cargo test --test migration_guard` 属 S6，本段未复跑 |
| AC-38 | TC-049 | **PASS** | `rm -rf /Applications/日程待办.app` → `ditto` 重装 → `open` 启动；todos 5 条、picks 2 条，前后 diff 为空 | 见 §4.4 |
| AC-39 | TC-050 | **PASS** | `日程待办.app` 与 `日程待办_0.1.0_aarch64.dmg` 均在；`lipo -archs` = `arm64`；`CFBundleIdentifier` = `com.poisson.todo`、`LSMinimumSystemVersion` = `12.0`、版本 `0.1.0`；`codesign` = `adhoc`（预期） | `tauri build` 本身属 S6，本段复核产物与形态 |
| AC-40 | TC-052 | **PASS** | `open -a` 后进程 58908 存活；CGWindowList：窗口 164243、layer 0、1100×720、属主「日程待办」；bundle id / `activationPolicy = regular`；默认模块与全中文由巡览截图 01 + 用例 1 佐证 | 窗口标题文本与像素级截图被 AX/屏幕录制挡住（M-04 BLOCKED） |
| AC-41 | TC-053 | **BLOCKED** | 需「关闭 Wi-Fi/以太网 + 在桌面版走完新建→换一条→筛选」。本机无法操作 WKWebView（TCC），且不应擅自切断本机网络。旁证：应用进程 `lsof -a -p <pid> -i` **零 socket**；`dist` 内无外部请求地址（仅 XML 命名空间与 vuejs.org 报错链接）；Chromium 三模块 6 passed | 见 §7 与 §10 |
| AC-42 | TC-054 | **PASS** | 依赖扫描输出 `DEPENDENCY CLEAN`；依赖 10 个（@tauri-apps/api、plugin-sql、dayjs、vue + 构建工具链），无 Pinia/Vuex/UI 库/路由/第二日期库 | — |
| AC-43 | TC-055 | **PASS** | `git ls-files` 无 `.ps1`；基座 `tauri.conf.json` + `src/` 无 `nsis` / `%APPDATA%` / `msedge`；tracked `.ts/.json` 无 `channel.*msedge` | 工作区未跟踪的 `.opencode/skills/.../batch-create.ps1` 是 agent 工具链，不在交付物内 |
| AC-44 | TC-056 | **PASS** | 用例 1：`.nav-item` = 3（日历 / 每日工作法 / 全部待办），无「番茄钟」；导航内无账号 / 登录 / 同步入口；`grep -rn "updater\|自动更新"` 无命中；README §一·3 写明菜单栏英文、§二 写明空库起步不迁移 | 系统菜单栏像素取证 = **M-04 BLOCKED** |
| AC-45 | TC-013 | **PASS** | 用例 1：`.month-next` 后 `.day-title` 文本不变（选中值不变） | — |
| AC-46 | TC-015 | **PASS** | 用例 4：面板筛「已完成」→ 点另一日 → `.filter-tab.active` 回 `all` | — |
| AC-47 | TC-019 | **PASS** | 用例 5：空标题 `.editor-save` `disabled`（含全空格）；Enter 提交并关闭；按钮文案 `取消/创建` 与 `取消/保存修改`；`maxlength` 100 / 500；`.editor-card` 宽 400（区间 380–420）；`.editor` 带 `.backdrop-blur`（`blur(2px)`，含 `-webkit-backdrop-filter`） | 桌面模糊像素 = **M-08 BLOCKED** |
| AC-48 | TC-026 | **PASS** | 用例 5：首项 `.ctx-item.active` = 复制到今日；↓↓↓↑ 位移跳过分隔线；Enter 执行「编辑」打开编辑器；Esc 关闭 | — |
| AC-49 | TC-026 | **PASS** | 用例 5（1280×800）贴边向左/向上翻转且余量 ≥ 8px；**S7 探针（900×600 最小窗，右下角条目）**：菜单 box `{x:565,y:436,w:168,h:114}`，四边余量 `565 / 436 / 167 / 50` 均 ≥ 8 | — |
| AC-50 | TC-016 | **PASS** | 用例 5：`.ctx-menu` 的父节点 = `BODY` | — |
| AC-51 | TC-028 | **PASS** | 用例 3：三态各造一次，`.mc-preview` 计数恒为 1，文案逐字 `今日推送` / `已手动刷新` / `方法库预览` | — |
| AC-52 | TC-037 | **PASS** | **临时夹具**（`page.route` 拦截 `src/data/methods.ts`，模块末尾内存删 `case`，不入库、不改 `methods.ts`）：`.mc-case` = 0、`.case-title/.case-content` = 0，`.mc-steps-block` 与两个 `.mc-box` 正常；换一条后仍为 0 | **夹具构造，现有 65 条数据不可达**（全部带 `case`）；`check-cases.mjs` 仍绿 |
| AC-53 | TC-041 | **PASS** | **S7 探针（主套件缺此断言）**：切到非今日 → `.mini-title` = `11月4日 工作法`（正则 `^\d{1,2}月\d{1,2}日 工作法$`）；hover `.mini-refresh` 背景 `rgba(0,0,0,0) → rgb(240,140,0)`（= 分类色 `#f08c00`）、文字转白；回今天仍 `今日工作法` | E2E 覆盖缺口记于 §5 |
| AC-54 | TC-043 | **PASS** | 用例 4 末尾清空 `todo_local_db` + reload → `暂无待办`、空态内 `button` = 0、`.group` = 0、`共 0 项`、无完成率 | 「方法库空态」半句 = 观察项（§9） |
| AC-55 | TC-046 | **PASS** | `check-db-parity.mjs`：同一 13 步操作序列分别跑 localStorage 与 SQLite（真实 plugin JS + 应用真实 SQL），`fetchTodos / ByDate / ByMonth×2 / DailyPicks / DailyPick×2` 逐项 JSON 相等，输出 `PASS`；列表排序 `丁 → 丙 → 乙改 → 戊`、推送记录两侧一致 | 桌面 UI 六步点击未执行（TCC）；见 §10 |
| AC-56 | TC-056 | **PASS** | 代码评审：`navItems.ts` 注册表（3 项）；`SideNav.vue` `pathsFor = ICONS[id] ?? CLOCK_ICON`（未知 id 回退时钟）；注释写明新增模块只需「注册项 + 渲染分支 + 组件」三处 | 不可观察项，按计划走代码评审 |

**统计**：56 行 → **55 PASS / 0 FAIL / 1 BLOCKED / 0 NOT-VERIFIED**。

---

## 4. 桌面与数据复核（本机实跑，非引用他人结论）

### 4.1 AC-34 建库建表（冷启动重建）

```console
# 备份现有库 → 删除整个应用数据目录 → 冷启动
$ ls -d "$HOME/Library/Application Support/com.poisson.todo" || echo "DATA DIR REMOVED"
DATA DIR REMOVED
$ open -a "/Applications/日程待办.app" && sleep 8 && ls -l "$DBDIR"
-rw-r--r--@ 1 zachary  staff  32768 … todo.db
-rw-r--r--@ 1 zachary  staff  32768 … todo.db-shm
-rw-r--r--@ 1 zachary  staff   8272 … todo.db-wal
$ sqlite3 "$DBDIR/todo.db" ".tables"
_sqlx_migrations  daily_picks       todos
$ sqlite3 "$DBDIR/todo.db" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
1|create_todos_table|1
2|create_daily_picks_table|1
$ sqlite3 "$DBDIR/todo.db" "SELECT 'todos='||count(*) FROM todos; SELECT 'picks='||count(*) FROM daily_picks;"
todos=0
picks=1
```

结论：首次启动自动建目录、建库、建两表并记录迁移 1/2；`daily_picks` 的 1 行是**应用自身**在启动时写入（`manual=0`），说明写路径通。测试后已把原库（5 条 todos / 2 条 picks）原样还原。

> 缺口：AC-34 的「新建 1 条 → `count(*) = 1`」这一步需要在桌面 UI 里点「新建待办」，本机 TCC 未授权、无法点击，未复跑；行写入能力由 `daily_picks` 自动落库与本轮 E2E（同一 store 逻辑）佐证，不写成「已实测 1 行」。

### 4.2 AC-36 升级不丢数据（双构建法，复核 diff）

```console
$ diff docs/verification/data/todos-before-0.1.0.txt docs/verification/data/todos-after-0.1.1.txt ; echo "EXIT=$?"
EXIT=0
$ diff docs/verification/data/picks-before-0.1.0.txt docs/verification/data/picks-after-0.1.1.txt ; echo "EXIT=$?"
EXIT=0
$ diff docs/verification/data/todos-after-0.1.1.txt docs/verification/data/todos-after-restart.txt ; echo "EXIT=$?"
EXIT=0
$ diff docs/verification/data/picks-after-0.1.1.txt docs/verification/data/picks-after-restart.txt ; echo "EXIT=$?"
EXIT=0
$ cat docs/verification/data/todos-after-0.1.1.txt
1|2026-11-01|2|0|升级前 · 今天高优先级
2|2026-11-01|0|1|升级前 · 今天已完成
3|2026-10-31|1|0|升级前 · 昨天
4|2026-11-02|1|0|升级前 · 明天
5|2026-10-15|0|1|升级前 · 上月
$ sqlite3 "$DB" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
1|create_todos_table|1
2|create_daily_picks_table|1
```

### 4.3 AC-22 / AC-23 重启后保持

```console
$ sqlite3 "$DB" "SELECT date,method_id,manual,updated_at FROM daily_picks ORDER BY date;" > docs/verification/data/picks-restart-before.txt
$ open -a "/Applications/日程待办.app" && sleep 8 && pkill -f "/Applications/日程待办.app/Contents/MacOS/todo"
$ sqlite3 "$DB" "SELECT date,method_id,manual,updated_at FROM daily_picks ORDER BY date;" > docs/verification/data/picks-restart-after.txt
$ diff docs/verification/data/picks-restart-before.txt docs/verification/data/picks-restart-after.txt && echo "PICKS UNCHANGED ACROSS RESTART (AC-22)"
PICKS UNCHANGED ACROSS RESTART (AC-22)
# 内容（含 1 条 manual=1 的手刷记录）
2026-10-31|mece|1|1761900000000
2026-11-01|conclusion-argument-recommendation|0|1793474031463
```

### 4.4 AC-38 删除 `.app` 重装数据保留

```console
$ pkill -f "/Applications/日程待办.app/Contents/MacOS/todo"   # 先备份 todo.db
$ rm -rf "/Applications/日程待办.app"
$ ls -d "/Applications/日程待办.app" 2>/dev/null || echo "REMOVED: /Applications/日程待办.app absent"
REMOVED: /Applications/日程待办.app absent
$ ditto "…/bundle/macos/日程待办.app" "/Applications/日程待办.app" && echo REINSTALLED
REINSTALLED
$ open -a "/Applications/日程待办.app" && sleep 8 && pgrep -lf "/Applications/日程待办.app/Contents/MacOS/todo"
56806 /Applications/日程待办.app/Contents/MacOS/todo
$ sqlite3 "$DB" "SELECT count(*) FROM todos;"
5
$ diff docs/verification/data/todos-before-reinstall.txt docs/verification/data/todos-after-reinstall.txt && echo "TODOS UNCHANGED AFTER REINSTALL"
TODOS UNCHANGED AFTER REINSTALL
$ diff docs/verification/data/picks-before-reinstall.txt docs/verification/data/picks-after-reinstall.txt && echo "PICKS UNCHANGED AFTER REINSTALL"
PICKS UNCHANGED AFTER REINSTALL
```

### 4.5 AC-39 产物形态（复核）

```console
$ lipo -archs "…/bundle/macos/日程待办.app/Contents/MacOS/todo"
arm64
$ plutil -p "…/bundle/macos/日程待办.app/Contents/Info.plist" | grep -E "CFBundleDisplayName|CFBundleIdentifier|CFBundleShortVersionString|LSMinimumSystemVersion"
  "CFBundleDisplayName" => "日程待办"
  "CFBundleIdentifier" => "com.poisson.todo"
  "CFBundleShortVersionString" => "0.1.0"
  "LSMinimumSystemVersion" => "12.0"
$ ls -l "…/bundle/dmg/日程待办_0.1.0_aarch64.dmg"
-rw-r--r--@ … 3285579 … 日程待办_0.1.0_aarch64.dmg
$ codesign -dv "/Applications/日程待办.app" 2>&1 | grep -E "Identifier|Format|Signature|TeamIdentifier"
Identifier=todo-00813bc1339b37e6
Format=app bundle with Mach-O thin (arm64)
Signature=adhoc
TeamIdentifier=not set
```

---

## 5. E2E 覆盖缺口（只记录，不改用例）与本次临时探针

主套件仍是 **6 个 `test()`**，未新增任何用例。执行中发现以下断点在 `e2e/` 内没有断言，我按「不改用例」的要求另写了**不入库的临时探针**（跑完即删，仓库无新增文件）：

| 缺口 | 计划里的断言点 | 本次处置 | 结果 |
| --- | --- | --- | --- |
| 非今日小卡片标题 / 刷新钮 hover 底色 | AC-53（TC-041 的新增断言点） | 临时探针 `_ctx/s7/ac52/ac53.spec.ts`（已删） | `11月4日 工作法`；hover `rgba(0,0,0,0)→rgb(240,140,0)` = `#f08c00` |
| 菜单的 ③ 窗口失焦 / ④ resize | AC-19（TC-026 的 ③ 计划写「事件级模拟」；COVERAGE.md 说明实现未写） | 临时探针 `ac19.spec.ts`（已删） | blur 与 resize 事件均使 `.ctx-menu` 归 0（事件级，不等于真机） |
| 优先级 reload 后保持 | AC-13（TC-018 的桌面重启部分） | 临时探针 `ac13.spec.ts`（已删） | reload 后仍「高」、`data-priority=2` |
| 900×600 最小窗下的贴边翻转 | AC-49（主套件在 1280×800 下测） | 临时探针 `ac49.spec.ts`（已删） | 四边余量 565/436/167/50，均 ≥ 8 |
| 无 `case` 不渲染案例区块 | AC-52 | 临时夹具 `ac52.spec.ts`（已删） | `.mc-case` = 0，三区块正常；**现有 65 条全带 `case`，该路径不可达，靠夹具判定** |

> 探针第一次跑 AC-13 时因我自己的 `addInitScript` 在 reload 时重复种数据而得到「优先级没保持」的假失败；加 `sessionStorage` 一次性守卫后重跑通过。记录在此，避免把测试缺陷误判成产品缺陷。

---

## 6. 人工 checklist（M-01 ~ M-16，真机）

| # | 检查项 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| M-01 | Gatekeeper 首启与 `xattr` 处置 | **BLOCKED（部分）** | 已验：`spctl --assess` exit 1（`code has no resources…`，预期）、`codesign` = `adhoc`、`xattr -l` 为空（本机构建无 quarantine）。未验：**首次双击被拦的系统对话框**（需人工点「打开」，且需要带 quarantine 的副本） |
| M-02 | Control + 点击打开菜单 | **BLOCKED** | `tcc.accessibility = false`，无法合成点击 |
| M-03 | 双指点按打开菜单 | **BLOCKED** | 同上；还依赖系统「辅助点按」设置 |
| M-04 | 系统菜单栏与 `⌘Q` / `⌘C` / `⌘V` | **BLOCKED** | `menubar.items = BLOCKED (AX error -25211)`；README §一·3 已声明英文菜单栏，但无像素证据 |
| M-05 | 切到其他应用时菜单关闭 | **BLOCKED** | 需真实切应用；仅事件级 blur 已验证（§5） |
| M-06 | 拖动窗口尺寸时菜单关闭 | **BLOCKED** | 需拖动窗口；仅 viewport resize 事件已验证（§5） |
| M-07 | WKWebView 下 `<input type="date">` 渲染与取值 | **BLOCKED（取值为 PASS 部分）** | 代码为原生 `input[type=date][data-field=date]`，E2E 落库 `YYYY-MM-DD`；**WKWebView 外观需截图** → BLOCKED |
| M-08 | 编辑器遮罩模糊（硬项） | **BLOCKED** | 代码/产物含 `backdrop-filter: blur(2px)` + `-webkit-backdrop-filter`；真机模糊效果需截图 |
| M-09 | 断网后完整走三模块 | **BLOCKED** | 需关网 + 操作桌面 UI；旁证见 AC-41 行（零 socket / 无外链） |
| M-10 | Dock 图标 / Launchpad 收录 | **BLOCKED（结构已验）** | `activationPolicy = regular`、bundle 在 `/Applications`、`icon.icns` 与源图标同源；**视觉确认** BLOCKED |
| M-11 | `5w2h` / `rice-scoring` 桌面版内部滚动与渐隐（硬项） | **BLOCKED** | Chromium 侧用例 3 通过；WKWebView 需录屏/截图 |
| M-12 | 数据落盘路径与 `sqlite3` 复核 | **PASS** | §4.1 / §4.4：路径、两表、迁移 1/2、删 `.app` 重装后数据不变 |
| M-13 | 中文路径引用 | **PASS** | 本轮 `ditto` / `open -a` / `lipo` / `plutil` / `sqlite3` / `xattr` 全部直接用「日程待办.app」「日程待办_0.1.0_aarch64.dmg」，无编码错误 |
| M-14 | 交付说明与实现一致 | **PASS** | README §一·2 / §一·3 / §二 / §三 / §「已知边界」逐条对上（Gatekeeper 三情形、菜单栏英文、空库起步不迁移、Windows 未本机验证、无同步入口） |
| M-15 | 同步状态区「未配置」表现（无 key） | **记录（N/A）** | 本版**不含**同步入口（README 首段明示），无 `sync-panel` 可测；属 S10.5 记录项，不判 FAIL |
| M-16 | 已登录 + 断网时的同步表现 | **记录（N/A）** | 同上，S10.5 执行；不判 FAIL |

**人工项小计**：PASS 3（M-12/13/14）· BLOCKED 10（M-01~M-11）· 记录 2（M-15/16）· 未执行 0。
**硬项 M-01 / M-08 / M-11 均未签署**：按计划 §8「不通过则不能判交付」，本次结论只到「**可交付（附阻塞项）**」，不签「人工 checklist 全通过」。

---

## 7. FAIL 与 BLOCKED 清单

### 7.1 FAIL（0 条）

无。本段没有出现「实际行为与 AC 不符」的用例。

### 7.2 BLOCKED（1 条 AC + 10 项人工）

| 对象 | 阻塞原因 | 复现命令（授权后照此补） |
| --- | --- | --- |
| **AC-41**（断网三模块） | 环境：无法在桌面 UI 操作（辅助功能未授权）+ 不应擅自断网 | 系统设置授权 → 关 Wi-Fi/以太网 → 在新待办 / 换一条 / 全部待办筛选中各走一遍 → 截图 |
| M-01 | 首启拦截对话框需人工点击 | 给带 quarantine 的副本 `xattr -w com.apple.quarantine …` 后 Finder 双击 |
| M-02 / M-03 | 辅助功能未授权，无法合成点击 | `swift scripts/mac-desktop-probe.swift \| grep accessibility` 应为 true 后手点 |
| M-04 | AX 读不到菜单栏（-25211） | 授权后读 `menubar.items` 或截全屏 |
| M-05 / M-06 | 需真实切应用 / 拖窗 | 录屏 + 手操作 |
| M-07 | WKWebView 原生日期控件外观需截图 | `bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/07-date.png` |
| M-08 | 遮罩模糊需像素证据（硬项） | 同上，打开新建编辑器后抓图 |
| M-09 | 断网操作 | 同 AC-41 |
| M-10 | Dock / Launchpad 视觉确认 | 授权后截屏 |
| M-11 | WKWebView 滚动/渐隐（硬项） | 打开 `5w2h` 滚动录屏 |

### 7.3 NOT-VERIFIED（0 条 AC）

本段 AC-01~AC-56 **没有**只能靠云端 key 判定的条目；`NOT-VERIFIED` 计数为 **0**。Windows 相关项见 §8（不计入 AC 表）。

---

## 8. Windows 相关（一律 `NOT-VERIFIED`）

| 项 | 状态 | 理由 |
| --- | --- | --- |
| Windows 安装包（`.exe` / `.msi`）产出 | **NOT-VERIFIED** | 本机无交叉编译能力（Tauri 不支持 macOS → Windows），验证路径为 `windows-latest` CI；本轮未 push，CI 不可观察 |
| Windows 上的实机运行 / E2E / 安装升级 | **NOT-VERIFIED** | 同上，本机无 Windows 环境 |
| Windows 配置与 workflow 是否可构建 | **NOT-VERIFIED（本地仅静态自检）** | `check-bundle-config.mjs` 44 条断言 PASS（三份 conf 合并 / schema / 平台中立 / workflow 结构），但这**不等于** Windows 上真的构建成功 |

不把任何 Windows 项写成 PASS，也不以静态自检替代实机结论。

---

## 9. 观察（不可达）项

| 观察项 | 为什么不可达 | 报告口径 |
| --- | --- | --- |
| AC-54 的「方法库空态」半句 | 65 条方法都有分类（ES-04 现实不可达），构造空方法库需要改内容库，CFL-07 禁止 | 不设断言、不计 PASS / FAIL，只在「已知局限」留一行 |
| AC-29 的 `rice-scoring` 条件夹具 | 1280×800 下 `scrollHeight = clientHeight`（不溢出），按计划记「夹具不成立，本次不判定」 | 用例 3 已用 Playwright annotation `fixture-not-applicable` 留痕，不判失败 |

> AC-52 的「无 `case`」路径在现有 65 条数据下也不可达，但按 Leader 2026-11-01 口径已用**临时夹具**构造并断言 → 判 PASS（报告已注明「夹具构造，现有 65 条数据不可达」），不算观察项。

---

## 10. 已知局限（不影响本段结论，但必须写明）

1. **桌面像素级证据全缺**：TCC 两项未授权，`screencapture -l` 实测失败，`docs/verification/desktop/` 仍为空目录。AC-15 / AC-19 / AC-29 / AC-40 / AC-44 / AC-47 的**桌面辅助取证**因此缺失；这些 AC 的主 TC 已在 E2E / 命令层通过，按 §0 口径判 PASS 并在表中注明。
2. **AC-34 的「新建 1 条」未用 UI 复跑**：冷启动建库建表已实测，行写入由 `daily_picks` 自动落库佐证；如需一字不差的复现，需 TCC 授权。
3. **AC-55 的对拍发生在数据层**：`check-db-parity.mjs` 用真实 plugin JS + 应用真实 SQL 跑同一 13 步序列并逐项比对；桌面 UI 的六步点击未执行。
4. **AC-53 / AC-19③④ / AC-13 reload / AC-49 900×600 不在主套件里**：为保持 `6 passed` 未新增 `test()`，改用不入库的临时探针取证（§5），并在此登记为 E2E 覆盖缺口，供 S10/S11 决定是否并入。
5. **AC-27 的负向脚本（TC-036）本轮未重跑**：计划要求「四种篡改各自使脚本退出码 ≠ 0」；本轮只复跑了正向 `check-cases.mjs`（PASS）。负向能力属脚本自证，建议下轮补跑并留输出。
6. **`spctl` rejected 属预期**（OP-05 关闭），不判交付失败；`signature=adhoc` 同理。
7. **AC-43 的一个易误读点**：工作区存在未跟踪的 `.opencode/skills/…/batch-create.ps1`（agent 工具链），`git ls-files` 中没有任何 `.ps1`，交付物本身干净。

---

## 11. 本轮改动（changed files）

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/test/ZACHTD-2-test-report.md` | **新增** | 本报告 |
| `screenshots/07-daily-manual-refresh.png`、`videos/日程待办-产品功能巡览.webm` | 重新生成 | 4 次全量 E2E 的巡览产物，非源码改动 |
| `test-results/**` | 运行产物 | 6 个视频（未跟踪） |
| `docs/verification/data/todos-*-reinstall.txt`、`picks-*-reinstall.txt`、`picks-restart-*.txt` | **新增** | 本轮 AC-38 / AC-22 的快照（各 66–206 B） |
| `_ctx/s7/**` | 临时 | 探针与临时快照；**不入库**，探针目录已删除 |

**未改动**：`src/**`、`src-tauri/**`、`e2e/**`、`scripts/**`、`package.json`；`docs/verification/data/**` 下**既有文件一个字节未改**，只新增了 §11 列出的 6 个快照。

---

## 12. 与计划口径的偏差（逐条说明）

| 计划写法 | 本次实际 | 处置 |
| --- | --- | --- |
| TC-026 的 ③ 用 `dispatchEvent(new Event('blur'))` 并入用例 5 | 实现方未写入（COVERAGE.md 说明理由：事件级不能证明系统行为） | 我用临时探针补了事件级证据，仍把真机 M-05 记 BLOCKED |
| AC-53 的断言并入用例 3（TC-041） | 用例 3 只断言「今日工作法」与刷新不跳转 | 临时探针补齐两条断言，登记为覆盖缺口 |
| TC-049（AC-38）需「执行许可 + 备份」 | 已先 `cp todo.db` 备份（临时副本，验证后删除），再删装 | 执行完毕，数据未丢 |
| 附录 A-6 的 7 个抽样日期 | 脚本实际用的日期集合略有不同 | 判据「7/7 MATCH、退出码 0」成立，不判失败 |
| AC-03「失败用例有 trace」 | 本轮全绿，`trace.zip` = 0 | 符合 `retain-on-failure`；未人为制造失败 |

---

## 附录 · 判定计数速查

| 维度 | 数量 |
| --- | --- |
| 本段 AC 总数 | 56（AC-01 ~ AC-56） |
| PASS | **55** |
| FAIL | **0** |
| BLOCKED | **1**（AC-41） |
| NOT-VERIFIED | **0**（AC 级；Windows 3 项另计） |
| 观察（不可达） | 0 条 AC（2 个半句观察项） |
| 通过率 | **55 ÷ 56 = 98.2%**（可判定 56 条；排除 BLOCKED 后 55/55） |
| 人工 checklist | PASS 3 / BLOCKED 10 / 记录 2（M-15/16） |
| 回归命令 | 4 组全绿（build / check-cases / check-permutation / playwright 6 passed） |
