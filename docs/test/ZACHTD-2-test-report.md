# T3 测试执行与报告 · 日程待办 macOS 版（ZACHTD-2）

| 项 | 内容 |
| --- | --- |
| 文档编号 | TR-ZACHTD-2 |
| 关联 Issue | ZACHTD-9（S7 测试执行与报告，AC-01 ~ AC-56）+ **ZACHTD-13（S10.5 同步层执行与全量回归，AC-43 重判 / AC-57 ~ AC-68）** + **ZACHTD-14（S11 判门后的台账统一，M2）** + **ZACHTD-15（S7.5 桌面人工取证补跑，屏幕录制已授权）** + **ZACHTD-16（S7.6 bundle 签名修复与 Gatekeeper 实测）** |
| 判定基线 | `docs/requirements/ZACHTD-2-macos-prd.md` **v1.6**（共 **68 条**，自 v1.4 起条数未变）：v1.5 = **AC-37 判据收窄为三段式** + **AC-68 判定归属归正为「S10.5 执行并留证」**（表述仍有效）；v1.6 = **AC-67 判据口径收窄 + 白名单兜底**、**OPEN-02 措辞校正**，**不改任何 AC 判定**。AC-01 ~ AC-56 见 §3（S7 段）；AC-57 ~ AC-68 见 **§13（S10.5 段）**；**AC-01 ~ AC-68 逐条台账见 §14** |
| 执行用例 | `docs/test/ZACHTD-2-test-plan.md` **v1.3**：TC-001 ~ TC-056（S7）+ TC-057 ~ TC-080（S10.5） |
| 执行人 | @Tester |
| 执行日期 | 2026-11-01（CST） |
| 执行环境 | macOS 14.1（23B2073）/ arm64 / Node 22.21.1 / npm 10.9.4 / Rust 1.92.0 / Playwright 1.64.1 / 仅 CommandLineTools（无完整 Xcode） |
| 部署目标 | `deploy_url = none (local artifact)`：`src-tauri/target/release/bundle/macos/日程待办.app` + dev server `http://localhost:1420`（Q-T-04 预声明） |
| 本轮边界 | 只执行与记录；**未改任何产品代码**、未新增 `test()`、未放宽任何断言 |

## 0. 结论（先读这一段）

### 0.1 S10.5 增量结论（2026-11-01 第二轮，读 §13）

**AC-57 ~ AC-68（12 条）：PASS 11 / NOT-VERIFIED 1（AC-65）；AC-43 是 AC-01~56 段内的重判，不新增条目。全量 68 条合计 66 PASS / 0 FAIL / 1 BLOCKED（AC-41）/ 1 NOT-VERIFIED（AC-65）。**

- **68 条逐条台账见 §14**（AC / 判定 / 证据段落 / 用例号）。**`66 PASS` 不等于 66 条都有完整证据**：其中 4 条是「主判 PASS + 子项 `NOT-VERIFIED`」——AC-58（TC-062 真实已登录态截图）、AC-59（TC-064 真实 GitHub OAuth 往返）、AC-66②（云侧 RLS 越权）、AC-68（CI 实际运行结果）。
- **算术口径（唯一）**：68 = 56（AC-01 ~ AC-56 = 55 PASS + 1 BLOCKED）+ 12（AC-57 ~ AC-68 = 11 PASS + 1 NOT-VERIFIED）。AC-43 只在 AC-01~56 段内计一次，任何把 AC-43 再算作「第 13 条」的写法都是重复计数（附录 A.2 本轮已修）。
- **AC-67 的账写「凭据 0 / 文本 1」**（§13.10 / §13.17）：可用真实密钥 0；`sync.config.example.json:5` 值位 1 行说明性否定文本，不判 FAIL。**产物侧分两笔**：前端字节看 `dist/`（0，带正控），二进制 `strings` 0 只覆盖 Rust 层与未压缩资源。**S1 白名单已闭环**（`check-sync.mjs` 78 项断言）。
- 四组回归第二次全绿（`build` / `check-cases` / `check-permutation` / `playwright 6 passed`），**同步套件独立执行 4 passed**（≠6，两套分别报）。
- AC-01 ~ AC-56 的 56 条旧判定**一条未变**；同步层是纯新增，v3 迁移只给 `todos` ADD COLUMN（§13.11）。
- AC-43 按 PRD v1.4 收窄口径**重判 PASS**（S7 的旧结论作废）；AC-68 的三条静态证据 PASS，**CI 实际运行结果 `NOT-VERIFIED`**。
- 云端四条（真实读写 / 真实 OAuth / 云侧 RLS 越权 / 钥匙串+回环实机链路）仍 `NOT-VERIFIED`；`supabase/schema.sql` **未在云端执行**。**辅助功能**未解除（屏幕录制已解除，见 §0.3），AC-41 等桌面人工项继续 `BLOCKED`。

### 0.2 S7 段结论（AC-01 ~ AC-56，2026-11-01 第一轮）

**56 条 AC（AC-01~AC-56）中 55 PASS / 0 FAIL / 1 BLOCKED / 0 NOT-VERIFIED。**
另有 **观察（不可达）0 条 AC**（2 个「半句」观察项见 §9）。

- **通过率 = PASS ÷ 本段可判定条数 = 55 ÷ 56 = 98.2%**
  - 可判定 **56 条** = 55 PASS + 1 BLOCKED + 0 FAIL；**观察 0 条**；`NOT-VERIFIED` 0 条。
  - 若只按「可判 PASS / FAIL」的 55 条算（把 BLOCKED 排除在分母外）：55 ÷ 55 = 100%。报告主口径用 55/56。
- **可交付（附阻塞项：1 条 AC + 8 项桌面人工取证，待「辅助功能」授权后补；S7.6 后 M-01 / M-10 / M-14 已 PASS，M-04 为 PARTIAL）。**
  唯一被判 BLOCKED 的 AC 是 **AC-41（断网后完整走三模块）**：它只能靠「关网 + 在 WKWebView 里点三模块」取证，本机 `AXIsProcessTrusted=false`（S7.5 复测仍为 false；屏幕录制 `CGPreflightScreenCaptureAccess` 已为 true），既无法操作桌面 UI，也不允许擅自杀掉本机网络。旁证已附（应用进程零网络 socket、产物内无外部请求地址、Chromium 侧 6 passed），但按纪律不把旁证当 PASS。
- 四组回归全部通过：`npm run build` 退出码 0、`node scripts/check-cases.mjs` PASS、`node scripts/check-permutation.mjs` 7/7 MATCH、`npx playwright test` **6 passed**（未新增 `test()`，仍是 5 功能 + 1 巡览）。
- FAIL / BLOCKED / NOT-VERIFIED 三类清单：**FAIL 0 条**；**BLOCKED 1 条 AC（AC-41）+ 8 项人工 checklist（M-02/03/05/06/07/08/09/11；S7.5 补跑后由 10 项降为 8 项）**；**NOT-VERIFIED 0 条 AC**（Windows 侧 3 项单列于 §8，不计入 AC）。

> 判定纪律（沿用计划 §0.1）：一条 AC 判 PASS = 其**主 TC** 的判据在本机以规定手段跑出来；桌面像素 / 手势类**辅助**项按 Leader 2026-11-01 口径记 `BLOCKED（环境：TCC 未授权）`，不改变 AC 判定；主 TC 本身完全依赖人工桌面操作时，该 AC 判 BLOCKED。

> 逐条台账见 **§14**（AC-01 ~ AC-68 一张表）。AC-43 在本段 56 条之内按 v1.5 收窄口径**重判 PASS**（§13.7），**不另计一条**。

### 0.3 S7.5 桌面取证补跑（2026-11-01 第三轮，读 §6 / §7.2 / §13.13）

**人类已授权「屏幕录制」。本轮只做一件事：把因 TCC 记为 `BLOCKED` 的桌面人工项能补的补成 PASS 并留证据。**

- **屏幕录制已解除**：`PROBE tcc.screen-recording = true`，`screencapture -l<窗口号>` 可用 → 桌面像素证据首次产出
  （5 张图在 `docs/verification/desktop/`，逐项命令见 `S7.5-evidence.md`）。
- **辅助功能未解除**：`PROBE tcc.accessibility = false`。实测失败动作：`keystroke` → `-1002`、`click at` → `-25211`、
  `CGEvent(.cghidEventTap)` / `CGEvent.postToPid` 只出 hover 不生效。**凡是「点一下 / 按一下」的项依然拿不到。**
- **补成 PASS 1 项**：M-10（Dock 图标 = 应用自己的黄/青双环图标 + 运行指示点，不是默认 Tauri 占位）。
- **由 BLOCKED 提到 PARTIAL 2 项**：M-01（首启拦截框已截到；`xattr` 处置实测能进）、M-04（菜单栏为框架默认英文五项；三个快捷键未验）。
- **仍 BLOCKED 8 项**：M-02 / M-03 / M-05 / M-06 / M-07 / M-08 / M-09 / M-11（其中 **M-08、M-11 是硬项**，都卡在「开不了编辑器 / 切不到 `5w2h`」）。
- **AC 一条没改判**：AC-34 / AC-55 / AC-41 仍 `BLOCKED`（六步/新建全是点击；断网需人类批准）。
  因此 **68 条的算术不变**：66 PASS / 0 FAIL / 1 BLOCKED / 1 NOT-VERIFIED。
- **本轮唯一可能影响交付的发现**：带 quarantine 的副本首启显示的是「**已损坏，无法打开**」，而不是 README §2 情形①
  描述的「无法检查是否包含恶意软件」。根因是 bundle 只有链接器签名（`Sealed Resources=none`、无 `_CodeSignature/`、
  `codesign --verify` exit 1）。**该对话框只提供「移到废纸篓 / 取消」，没有可放行的「打开」按钮，因此「右键 → 打开」这条推荐路径对这份产物不适用**
  （「点了会怎样」本身也未实测——缺辅助功能）；可走的是情形② 的 `xattr -dr com.apple.quarantine`（已实测能进）。
  连带把 **M-14 由 PASS 降为 PARTIAL**，等 Leader 定稿 README 后回填。

### 0.4 S7.6 修复 bundle 签名（2026-11-01 第四轮，读 §1 / §4.0 / §6）

**S7.5 的发现是真问题，S7.6 修的是产物而不是文案：给 bundle 加 ad-hoc 封条，再重做 quarantine 实验。**

- **配置**：`src-tauri/tauri.macos.conf.json` 的 `bundle.macOS.signingIdentity = "-"`（ad-hoc），
  仍**不引入证书、不做公证**（OP-05 不变）；`hardenedRuntime` 保持 `false`。
- **重建**：`npm run tauri build` → 10:35 产出 `.app`、10:36 产出 `.dmg`。日志含
  `Signing with identity "-"`（先签 `Contents/MacOS/todo`，再签 `.app`），公证步骤按预期跳过。
- **签名四项（全部通过）**：
  - `codesign -dv --verbose=4` → `Signature=adhoc`、`Info.plist entries=15`、
    `Sealed Resources version=2 rules=13 files=1`、`TeamIdentifier=not set`；
  - `codesign --verify --deep --strict` → **exit 0**（旧构建 `code has no resources but signature indicates
    they must be present` / exit 1）；
  - `Contents/_CodeSignature/CodeResources` 存在（2 440 B）；
  - `codesign -d --verbose=2 | grep sealed` → `Sealed Resources version=2`（不再是 `none`）。
- **quarantine 实验（dmg 内 `.app` → `ditto` 到临时目录 → `xattr -w com.apple.quarantine "0083;00000000;Safari;"` → 双击）**：
  弹框变成「**无法打开"日程待办.app"，因为 Apple 无法检查其是否包含恶意软件**」，
  按钮为 **在访达中显示 / 好**——**「已损坏」判定消失**，S7.5 的阻塞点解除。
  证据：`docs/verification/desktop/M-01-c-gatekeeper-after-signing.png`。
  随后 `xattr -dr com.apple.quarantine` 的同一份副本可正常启动（进程存活、1100×720 窗口在场）。
- **未实测**：「右键 → 打开」与「系统设置 → 仍要打开」都是点击操作，本机 `tcc.accessibility = false`
  合成不了点击，**README 已如实标注为未实测**，不写成已验证。
- **产物身份（新）**：`Contents/MacOS/todo` **6 250 704 B**、md5 `4db99e8ce40473a7954eb802f629b838`；
  dmg **3 310 932 B**、md5 `a90ec0e812ecbc2c70be27168d94ee64`；两处 `.app` 的整树 sha256 摘要同为
  `f79d0212…`（`lipo -archs` = `arm64`，`CFBundleIdentifier = com.poisson.todo`，`CFBundleName = 日程待办`，
  `LSMinimumSystemVersion = 12.0`）。
- **判定回填**：**M-01 → PASS**（首启拦截框 + `xattr` 处置两半都有实测），
  **M-14 → PASS**（README §2 已按实测现象重写，现象 / 按钮 / 未实测项与产物一致）。
- **AC 仍一条未改判**：68 条的算术不变（66 PASS / 0 FAIL / 1 BLOCKED / 1 NOT-VERIFIED）。
- **密钥边界不回退**：新二进制里 `sb_publishable_` / `sb_secret_` / legacy JWT / `*.supabase.co` 命中数均为 **0**；
  `node scripts/check-no-secrets.mjs` 仍 PASS（AC-67）。

---

## 1. 环境与降级声明

| 事实 | 实测 | 对判定的影响 |
| --- | --- | --- |
| 操作系统 | macOS 14.1（23B2073），arm64 | 只判 macOS 侧；Windows 一律 `NOT-VERIFIED`（§8） |
| Xcode | `/Library/Developer/CommandLineTools`（无完整 Xcode） | 只验证「可产出 `.app` + `.dmg`」；公证 / universal 不在本期（OP-05） |
| 屏幕录制 | **S7.5 起 `PROBE tcc.screen-recording = true`**（S7 段为 `false`） | `screencapture -l<winid>` 已可用 → 窗口/全屏像素证据已产出（§6、`docs/verification/desktop/S7.5-evidence.md`） |
| 辅助功能（AX） | `PROBE tcc.accessibility = false`（S7.5 复测仍为 `false`） | 无法读窗口标题 / 菜单栏、无法合成点击/按键（`keystroke` → `-1002`、`click at` → `-25211`）→ 手势与快捷键类 checklist 仍 BLOCKED |
| 签名 | **S7.6 起**：`Signature=adhoc`、`Sealed Resources version=2 rules=13 files=1`、`Info.plist entries=15`、有 `_CodeSignature/`；`codesign --verify --deep --strict` **exit 0**；`spctl --assess` 仍 exit 1（未公证，预期） | OP-05 已关闭，`rejected` 属预期。**S7.5 记录的是修复前状态**（`linker-signed`、`Info.plist=not bound`、`Sealed Resources=none`、`verify` exit 1），那种产物带 quarantine 首启被判「**已损坏**」；S7.6 加 ad-hoc 封条后变为「**无法验证开发者 / Apple 无法检查**」变体（§0.4） |
| Supabase key | 无 | AC-57~AC-67 不在本段；本段无同步入口，M-15 / M-16 仅登记 |

TCC 两项的原始输出（**这是 S7 段的快照**；S7.5 复测为 `screen-recording = true` / `accessibility = false`，见 §0.3 与 §13.13）：

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
| AC-37 | TC-048 | **PASS** | `grep -nE "DROP \|ALTER \|DELETE FROM\|UPDATE todos"` 无命中；仅 2 个 `CREATE TABLE IF NOT EXISTS` + 1 个 `CREATE INDEX IF NOT EXISTS` | 判据已按 PRD **v1.5 附录 B.7 三段式**扩展并复核：`LIB.RS CLEAN` / `MIGRATIONS CLEAN` / `CREATE OK`（§13.17）；`cargo test --test migration_guard` 属 S6，本段未复跑。PASS 的含义是「**没有改写历史迁移、没有破坏性动作**」，不是「文件里不出现 `ALTER`」——见 §14 判定含义注 |
| AC-38 | TC-049 | **PASS** | `rm -rf /Applications/日程待办.app` → `ditto` 重装 → `open` 启动；todos 5 条、picks 2 条，前后 diff 为空 | 见 §4.4。**取证对象 = 03:17 构建（已入废纸篓）**；07:21 构建未重跑此桌面项（§4.0） |
| AC-39 | TC-050 | **PASS** | `日程待办.app`（`Contents/MacOS/todo` 6 232 576 B / 07:21，**S7.6 重建后为 6 250 704 B / 10:35，见 §0.4**）与 `日程待办_0.1.0_aarch64.dmg`（**3 309 469 B** / 07:22，S7.6 后 **3 310 932 B** / 10:36）均在；`lipo -archs` = `arm64`；`CFBundleIdentifier` = `com.poisson.todo`、`LSMinimumSystemVersion` = `12.0`、版本 `0.1.0`；`codesign` = `adhoc`（预期） | `tauri build` 本身属 S6。**形态数字已按 07:21/07:22 构建复测**（旧记 3285579 属上一份构建，已作废）；**S7.6 重建后的数字见 §0.4**，判定不变 |
| AC-40 | TC-052 | **PASS** | `open -a` 后进程 58908 存活；CGWindowList：窗口 164243、layer 0、1100×720、属主「日程待办」；bundle id / `activationPolicy = regular`；默认模块与全中文由巡览截图 01 + 用例 1 佐证 | 窗口标题文本与像素级截图被 AX/屏幕录制挡住（M-04 BLOCKED）。**取证对象 = 03:17 构建（已入废纸篓）**；07:21 构建未复跑启动项（§4.0） |
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

### 4.0 产物身份与时效（先说清楚"这份证据对应哪一份字节"）

S11 整改（S1 白名单）之后产物被**第三次重建**，旧字节曾有**三份**（03:17 / 00:10 两份 `.app` + 05:41 一份已被覆盖的构建）。**S12 收尾轮已收口**：旧的两份 `.app` 移入废纸篓（可恢复）。**S7.6（ZACHTD-16）又重建了一次**：加 ad-hoc 封条后的 **10:35 / 10:36** 产物才是当前分发源，07:21 那份已被覆盖、盘上不存在；`/Applications` 里的副本已由人类删除（本轮**未**重装）。本节及 §3 的产物级证据必须带构建身份读，否则「实测过」会被读成「新产物已验」。

| 构建 | 现在的状态 | 身份 | 用它验了什么 |
| --- | --- | --- | --- |
| **03:17**（S7 轮） | **已移入废纸篓（可恢复）** | `Contents/MacOS/todo` **6 182 464 B**，md5 `17fa52a6…`；早于 S1 整改，**不含白名单** | **§4.1 ~ §4.4 桌面复核、§6 早期人工项、§13.13 桌面 BLOCKED 项的取证对象都是它**（当时 `/Applications` 里就是这份） |
| **00:10 / `todo.app`**（改名前的旧脚手架） | **已移入废纸篓（可恢复）** | `CFBundleIdentifier = com.zachary.todo`，4 159 632 B | 未作为任何证据；不属交付物 |
| **05:41**（S10.5 第二轮重建） | **已被覆盖，盘上不存在** | — | 只跑过 E2E 与脚本；**没有做过任何桌面人工复核** |
| **07:21 / 07:22**（S11 整改后重建） | **已被 10:35 / 10:36 覆盖** | `todo` **6 232 576 B**，md5 `d66b3ea6…`；dmg **3 309 469 B** / 07:22；**无 bundle 封条**（`Sealed Resources=none`） | S12 的静态复核（§4.5 / §13.10 / §13.17）与 S7.5 的桌面取证（10:00 是它的上一轮同源构建）。**带 quarantine 首启被判「已损坏」的就是这一类产物** |
| **10:35 / 10:36**（S7.6 修复签名后重建） | **当前唯一分发源** | `todo` **6 250 704 B**，md5 `4db99e8ce40473a7954eb802f629b838`；dmg **3 310 932 B**、md5 `a90ec0e812ecbc2c70be27168d94ee64`；`Signature=adhoc` + 完整封条 | **§0.4 的签名四项 / quarantine 实验 / 产物身份 / 启动**；旧的桌面项结论不因重建而升级（AC-38 / AC-40 / AC-41 仍按原文口径读） |

> **这几行身份的来源**：03:17 / 07:21 / 07:22 / 10:35 / 10:36 的数字与 md5 我自己量过；**00:10 那份 `todo.app` 的字节数与 bundle id 来自开发侧记录**——它已经在废纸篓里，而 `~/.Trash` 在本机不可列（`Operation not permitted`），我没法逐字节复核，故按「转引」标注，不当作本机实测。

**三条口径**

1. **§4.1 ~ §4.4 的取证对象是 03:17 构建**（该构建**已入废纸篓**，其结论仍然有效——证据是当时采集的，不是现在回采的）；§4.5 的形态数字是 **07:21 / 07:22 构建**的，**已被 §0.4 的 10:35 / 10:36 数字取代**（形态判据不变：`.app` + `.dmg` 均在、`arm64`、`com.poisson.todo`、`12.0`、`0.1.0`）。
2. **10:35 构建只补了签名与 Gatekeeper**（§0.4）；**AC-38 重装、AC-40 启动、AC-41 断网这些桌面项没有在它上面重跑**。本报告**不**把「静态复核通过」或「签名修好」写成「新产物全项已验」。
3. **盘上只剩一份产品字节**：`bundle/macos/日程待办.app` 与 `bundle/dmg/…dmg` 内的 `.app` 整树 sha256 摘要相同（`f79d0212…`，§0.4）；`/Applications/日程待办.app` 已由人类删除，**本轮没有重装**，所以「装到 Applications 后能不能用」仍按 §2 的 Gatekeeper 口径读。

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

### 4.5 AC-39 产物形态（复核，对象 = **07:21 / 07:22 构建**；数字已被 §0.4 的 10:35 / 10:36 取代）

> 本节保留的是 S12 那一轮的原始输出（历史证据，不改写）。S7.6 重建后当前分发源的字节数与 md5 见 **§0.4**；
> 形态判据本身不变（`.app` + `.dmg`、`arm64`、`com.poisson.todo`、`12.0`、`0.1.0`），故 AC-39 判定不受影响。

```console
$ ls -l "…/bundle/macos/日程待办.app/Contents/MacOS/todo"
-rwxr-xr-x  1 zachary  staff  6232576 Nov  1 07:21 …/Contents/MacOS/todo
$ lipo -archs "…/bundle/macos/日程待办.app/Contents/MacOS/todo"
arm64
$ plutil -p "…/bundle/macos/日程待办.app/Contents/Info.plist" | grep -E "CFBundleDisplayName|CFBundleIdentifier|CFBundleShortVersionString|LSMinimumSystemVersion"
  "CFBundleDisplayName" => "日程待办"
  "CFBundleIdentifier" => "com.poisson.todo"
  "CFBundleShortVersionString" => "0.1.0"
  "LSMinimumSystemVersion" => "12.0"
$ ls -l "…/bundle/dmg/日程待办_0.1.0_aarch64.dmg"
-rw-r--r--@ 1 zachary  staff  3309469 Nov  1 07:22 日程待办_0.1.0_aarch64.dmg
$ md5 -q "…/bundle/dmg/日程待办_0.1.0_aarch64.dmg"
3373115774d7c98c8b9133fc6752ac2b
$ codesign -dv "…/bundle/macos/日程待办.app" 2>&1 | grep -E "Identifier|Format|Signature|TeamIdentifier"
Identifier=todo-00813bc1339b37e6
Format=app bundle with Mach-O thin (arm64)
Signature=adhoc
TeamIdentifier=not set
$ md5 -q "…/bundle/macos/日程待办.app/Contents/MacOS/todo"; md5 -q "/Applications/日程待办.app/Contents/MacOS/todo"
d66b3ea6e24d3b54d74dcd0c24e5a51b
d66b3ea6e24d3b54d74dcd0c24e5a51b
```

**判定：PASS（形态）+ 身份已标定。** `.app` 与 `.dmg` 均在、`arm64`、`CFBundleIdentifier` = `com.poisson.todo`、`LSMinimumSystemVersion` = `12.0`、版本 `0.1.0`、`Signature=adhoc`（OP-05 已关闭，`rejected` 属预期）。dmg 实测 **3 309 469 B / 07:22 / md5 `3373115774…`**（旧记录 `3285579` 属更早一份构建，已作废）。**`/Applications` 与 `bundle` 的 `todo` 现在 md5 相同（都是 `d66b3ea6…`）**——S12 收尾轮已把 03:17 那份移入废纸篓、用 07:21 覆盖了 `/Applications`，所以**不再存在"装着旧包"的路径**。形态判据不依赖运行，故新构建无需重跑桌面项即可判 PASS；**但「能启动」类结论（AC-40）的取证对象仍是 03:17 构建**（§4.0），不因文件被移走而升级为新构建已验。

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

> 产物身份：本节 M-12 / M-13 / M-14 与 §4 的证据对象是 **03:17 构建**（当时 `/Applications` 那份；现已移入废纸篓，§4.0）；
> **M-01 / M-04 / M-10 三项在 S7.5（2026-11-01 10:25）对 10:00 构建重跑过**，已换上新证据并标注；
> 其余仍 BLOCKED 的项既未在 03:17 构建上判过、也没有在 10:00 构建上跑通——**「新产物已验」这句话仍然不成立**。
> 逐项原始命令与失败动作见 `docs/verification/desktop/S7.5-evidence.md`。

| # | 检查项 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| M-01 | Gatekeeper 首启与 `xattr` 处置 | **PASS**（S7.5 BLOCKED → PARTIAL → S7.6 PASS） | S7.5 证据（`M-01-a` 是旧产物被判「已损坏」）+ S7.6 修复后的新证据 `docs/verification/desktop/M-01-c-gatekeeper-after-signing.png`：加 ad-hoc 封条后，带 quarantine 的 dmg 副本双击 → 「**无法打开"日程待办.app"，因为 Apple 无法检查其是否包含恶意软件**」（在访达中显示 / 好），**「已损坏」消失**；`xattr -dr com.apple.quarantine` 后同一副本正常启动（进程存活、1100×720 窗口）。**「右键 → 打开」仍未实测**（无辅助功能，合成不了点击），README 已如实标注，不当作已验证 |
| M-02 | Control + 点击打开菜单 | **BLOCKED** | S7.5 复测：`click at` → `-25211`；`CGEvent(.cghidEventTap)` 与 `CGEvent.postToPid` 两条路线均只产生 hover、点击不生效。卡在「无法合成点击」 |
| M-03 | 双指点按打开菜单 | **BLOCKED** | 同 M-02（同为合成鼠标事件）；另依赖系统「辅助点按」设置，也需 AX |
| M-04 | 系统菜单栏与 `⌘Q` / `⌘C` / `⌘V` | **PARTIAL**（S7.5 由 BLOCKED 上调） | 新证据：`docs/verification/desktop/M-04-a-menubar.png` → `日程待办 / File / Edit / View / Window / Help`，**框架默认英文五项、无自定义菜单**（README §一·3 / Q-01 有像素证据了）。**未验：三个快捷键**——`keystroke` → `-1002`，无法发送按键 |
| M-05 | 切到其他应用时菜单关闭 | **BLOCKED** | 前提是先用 M-02 打开菜单，第一步即失败；仅事件级 blur 已验证（§5） |
| M-06 | 拖动窗口尺寸时菜单关闭 | **BLOCKED** | 同 M-05；`CGWindowList` 只能读几何、不能拖窗 |
| M-07 | WKWebView 下 `<input type="date">` 渲染与取值 | **BLOCKED（取值为 PASS 部分）** | 代码为原生 `input[type=date][data-field=date]`，E2E 落库 `YYYY-MM-DD`；S7.5 仍卡在「打开编辑器需要一次点击」，日历默认视图里没有日期输入框 |
| M-08 | 编辑器遮罩模糊（硬项） | **BLOCKED** | 代码/产物含 `backdrop-filter: blur(2px)` + `-webkit-backdrop-filter`；S7.5 仍卡在同一步：遮罩只在编辑器打开时出现 |
| M-09 | 断网后完整走三模块 | **BLOCKED** | 按任务书**不自行断网**（需人类批准）+ 需桌面 UI 操作；旁证见 AC-41 行 |
| M-10 | Dock 图标 / Launchpad 收录 | **PASS（Dock 部分）**（S7.5 由 BLOCKED 上调） | 新证据：`docs/verification/desktop/M-10-a-dock.png` → Dock 里是应用自己的黄/青双环图标（与 `src-tauri/icons/icon.png` 同图形）+ 运行指示点，**不是默认 Tauri 占位**。Launchpad 收录需打开 Launchpad（一次点击）→ 子项未验，不影响已证部分 |
| M-11 | `5w2h` / `rice-scoring` 桌面版内部滚动与渐隐（硬项） | **BLOCKED** | 卡在「切到 `5w2h` 需要一次点击」：进不去就没有可滚容器，`PageDown`/滚轮也就无从施加（按键本身也发不出，`-1002`） |
| M-12 | 数据落盘路径与 `sqlite3` 复核 | **PASS** | §4.1 / §4.4：路径、两表、迁移 1/2、删 `.app` 重装后数据不变 |
| M-13 | 中文路径引用 | **PASS** | 本轮 `ditto` / `open -a` / `lipo` / `plutil` / `sqlite3` / `xattr` 全部直接用「日程待办.app」「日程待办_0.1.0_aarch64.dmg」，无编码错误 |
| M-14 | 交付说明与实现一致 | **PASS**（S7.5 PARTIAL → S7.6 回填） | README §一·2 已按 S7.6 实测重写：情形① 的现象（「Apple 无法检查…包含恶意软件」）、按钮（在访达中显示 / 好）、**「右键 → 打开」明确标注未实测**，情形② 的 `xattr -dr` 为实测可用路径；§一·3 / §二 / §三 与产物一致；分发源字节数 / md5 已按 10:35 构建更新（§0.4） |
| M-15 | 同步状态区「未配置」表现（无 key） | **记录（N/A）** | 本版**不含**同步入口（README 首段明示），无 `sync-panel` 可测；属 S10.5 记录项，不判 FAIL |
| M-16 | 已登录 + 断网时的同步表现 | **记录（N/A）** | 同上，S10.5 执行；不判 FAIL |

**人工项小计（S7.6 后）**：PASS 5（M-01 / M-10 / M-12 / M-13 / M-14）· PARTIAL 1（M-04，仅「三个快捷键」未验）· BLOCKED 8（M-02/03/05/06/07/08/09/11）· 记录 2（M-15/16）· 未执行 0。
（S7 时为 PASS 3 · BLOCKED 10；S7.5 补跑把 M-01 / M-04 从 BLOCKED 提到 PARTIAL、M-10 提到 PASS，同时因 M-01 的新证据把 M-14 从 PASS 降到 PARTIAL，故 BLOCKED 10 → 8。）
**硬项 M-01 / M-08 / M-11 仍均未签署**：M-08 / M-11 还是 BLOCKED（缺辅助功能，开不了编辑器 / 切不到 `5w2h`），M-01 只到 PARTIAL。
按计划 §8「不通过则不能判交付」，本次结论仍只到「**可交付（附阻塞项）**」，不签「人工 checklist 全通过」。

---

## 7. FAIL 与 BLOCKED 清单

### 7.1 FAIL（0 条）

无。本段没有出现「实际行为与 AC 不符」的用例。

### 7.2 BLOCKED（1 条 AC + 8 项人工）

> S7.5（2026-11-01 10:25）补跑后：M-01 / M-04 已提到 PARTIAL、M-10 已 PASS，**不再列在 BLOCKED**。
> 下表保留仍 BLOCKED 的项，并写明「卡在哪一步」；逐项失败动作（`-1002` / `-25211` / CGEvent 无效）见
> `docs/verification/desktop/S7.5-evidence.md` §5。

| 对象 | 阻塞原因 / 卡在哪一步 | 复现命令（授权后照此补） |
| --- | --- | --- |
| **AC-41**（断网三模块） | 环境：无法在桌面 UI 操作（辅助功能未授权）+ 按任务书不擅自断网（需人类批准） | 系统设置授权辅助功能 → 人类批准后关 Wi-Fi/以太网 → 在新待办 / 换一条 / 全部待办筛选中各走一遍 → 截图 |
| **AC-34**（桌面 UI 新建 1 条 → `count(*)` +1） | 卡在「+ 新建待办」这一下点击：`click at` → `-25211` | 授权后点「+ 新建待办」→ 填标题/日期 → 保存 → `sqlite3` 查 `count(*)` 与 `date`/`uuid` |
| **AC-55**（桌面 UI 六步对拍） | 同上，六步全是点击 | 同 AC-34 |
| M-02 / M-03 | 卡在「无法合成点击」（`-25211`；CGEvent 两条路线均只出 hover） | `swift scripts/mac-desktop-probe.swift \| grep accessibility` 为 true 后手点 |
| M-05 / M-06 | 前提是先打开菜单（M-02 即失败）；且需真实切应用 / 拖窗 | 授权后录屏 + 手操作 |
| M-07 | 卡在「打开编辑器需要一次点击」 | `bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/M-07-date-input.png` |
| M-08 | 卡在同一步：遮罩只在编辑器打开时出现（硬项） | 同上，打开新建编辑器后抓图 |
| M-09 | 断网操作（不擅自断网） | 同 AC-41 |
| M-11 | 卡在「切到 `5w2h` 需要一次点击」；按键也发不出（`-1002`），无法注入滚动（硬项） | 切到 `5w2h` 后录屏滚动 |

**另记两处「需人类/Leader 拍板」的判定（不是 BLOCKED，但影响交付）**：

| 对象 | 结论 | 要谁决定 |
| --- | --- | --- |
| M-01 的「右键 → 打开」 | **无法在本机验证**（不能合成点击）；S7.5 时实测对话框为「已损坏」变体，**没有「打开」按钮** | **S7.6 已处置**：给 bundle 补 ad-hoc 封条、README 走 `xattr -dr` 路线并标注「右键 → 打开」未实测（§0.4）；右键路径本身仍待有辅助功能的环境补测 |
| M-14 | 因上面这条，README §2 情形① 的现象描述与实测不符 → S7.5 由 PASS 降为 PARTIAL | **S7.6 已修复**：README §2 按实测重写、M-14 回填 PASS（§0.4） |

### 7.3 NOT-VERIFIED（S7 段 0 条 AC；S10.5 段新增 1 条）

S7 段的 AC-01~AC-56 **没有**只能靠云端 key 判定的条目，`NOT-VERIFIED` 为 **0**。
S10.5 段新增 **AC-65 = `NOT-VERIFIED`**（无 anon key，按 PRD 明文不得记 PASS），另有两个子项 `NOT-VERIFIED`：AC-66②（云侧越权）与 AC-68 的 CI 实际运行结果。完整清单见 **§13.12**。

---

## 8. Windows 相关（一律 `NOT-VERIFIED`）

| 项 | 状态 | 理由 |
| --- | --- | --- |
| Windows 安装包（`.exe` / `.msi`）产出 | **NOT-VERIFIED** | 本机无交叉编译能力（Tauri 不支持 macOS → Windows），验证路径为 `windows-latest` CI；本轮未 push，CI 不可观察 |
| Windows 上的实机运行 / E2E / 安装升级 | **NOT-VERIFIED** | 同上，本机无 Windows 环境 |
| Windows 配置与 workflow 是否可构建 | **AC-68 静态三证 = PASS（§13.8）；CI 实际结果 = `NOT-VERIFIED`** | `check-bundle-config.mjs` 44 条断言 PASS + matrix 含 `windows-latest` 且真跑 `tauri build` + 交付说明标注未本机验证；但这**不等于** Windows 上真的构建成功 |

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
5. **AC-27 的负向脚本（TC-036）已在 S10.5 补跑**：`node scripts/check-cases-negative.mjs` → 四种篡改各自使 `check-cases.mjs` 退出码 ≠ 0、未篡改副本退出码 0（见 §13.16）。S7 段当时只跑了正向，已由本段结清。
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

> **S10.5 段（本轮第二轮）的 changed files 见 §13.15**：只改两份测试文档 + 新增 3 个独立验证脚本（`scripts/check-sync-extra.mjs` / `check-sync-console.mjs` / `check-cases-negative.mjs`）；`src/**`、`src-tauri/**`、`e2e/**`、`e2e-sync/**`、`package.json` 均未改。

---

## 12. 与计划口径的偏差（逐条说明）

| 计划写法 | 本次实际 | 处置 |
| --- | --- | --- |
| TC-026 的 ③ 用 `dispatchEvent(new Event('blur'))` 并入用例 5 | 实现方未写入（COVERAGE.md 说明理由：事件级不能证明系统行为） | 我用临时探针补了事件级证据，仍把真机 M-05 记 BLOCKED |
| AC-53 的断言并入用例 3（TC-041） | 用例 3 只断言「今日工作法」与刷新不跳转 | 临时探针补齐两条断言，登记为覆盖缺口 |
| TC-049（AC-38）需「执行许可 + 备份」 | 已先 `cp todo.db` 备份（临时副本，验证后删除），再删装 | 执行完毕，数据未丢 |
| 附录 A-6 的 7 个抽样日期 | 脚本实际用的日期集合略有不同 | 判据「7/7 MATCH、退出码 0」成立，不判失败 |
| AC-03「失败用例有 trace」 | 本轮全绿，`trace.zip` = 0 | 符合 `retain-on-failure`；未人为制造失败 |
| AC-37 旧判据「所有迁移 SQL 无 `ALTER`」 | v3 用 `ALTER TABLE … ADD COLUMN`（D-SYNC-04 要求） | PRD **v1.5** 已收窄为三段式（§13.17-a 实跑三段全净）；实现不违约，见 §14 判定含义注 |
| AC-67 判据「三处均无命中」 | 裸 grep 必命中两位数行数（值位恒为 1 行；行数随文档自身增长，不作判据） | 账改按 **「凭据 0 / 文本 1」** 记（§13.10）；「三处均无命中」这个写法本身就是永真/永假陷阱 |
| AC-67③「产物无 key」的旧证据是 `strings` | 前端字符串压缩嵌入，`strings` 看不见（实证：「未配置同步」`dist/` = 1、二进制 = 0） | 改为 **前端字节以 `dist/` 为真判据 + 正控**，`strings` 只声明覆盖 Rust 与未压缩层（§13.10 ③） |

---

## 13. S10.5 · 同步层执行与全量回归（AC-57 ~ AC-67 + AC-43 重判 + AC-68）

> 执行 Issue：ZACHTD-13（S10.5）。判定基线：PRD **v1.4 → v1.5 → v1.6**（68 条，条数未变；v1.5 收窄 AC-37 判据、归正 AC-68 判定归属；v1.6 收窄 AC-67 判据 + 校正 OPEN-02 措辞，不改判定）；用例：本计划 **v1.3**。
> 本段**不改产品代码、不新增 `test()`、不放宽任何断言**；新增的只是三个独立验证脚本（见 §13.15）。

### 13.1 结论（先读这一段）

**同步组：AC-57 ~ AC-64、AC-66① 、AC-67 = PASS（10 条）；AC-65 = `NOT-VERIFIED`；AC-66② = `NOT-VERIFIED`（子项）。**
**另：AC-43 按 v1.4 收窄口径重判 = PASS（S7 的旧结论作废，以本段为准）；AC-68 的三条静态/命令证据 = PASS，其 CI 实际运行结果 = `NOT-VERIFIED`。**

全量 68 条合计：**PASS 66 / FAIL 0 / BLOCKED 1（AC-41）/ NOT-VERIFIED 1（AC-65）**，PASS 率 **66 ÷ 68 = 97.1%**（排除 BLOCKED 与 NOT-VERIFIED 后 66 ÷ 66 = 100%）。

- **四组必做回归全绿**：`npm run build` exit 0；`check-cases.mjs` PASS；`check-permutation.mjs` 7/7 MATCH；`npx playwright test` **6 passed**。
- **同步套件独立执行、单独报数**：`npx playwright test -c playwright.sync.config.ts` → **4 passed**（`e2e-sync/` 不在主套件 `testDir` 内，主套件仍是 6 个用例）。
- **AC-01 ~ AC-56 判定无一改变**：同步层是纯新增，v3 迁移只给 `todos` ADD COLUMN；56 条旧判定逐条复用，回归证据见 §13.11。
- **云端四条仍 `NOT-VERIFIED`**：真实读写、真实 OAuth 往返、云侧 RLS 越权、桌面钥匙串 + 回环监听的实机点击链路。**没有 anon key 之前不升格为 PASS**；`supabase/schema.sql` **未在云端执行**（本机无 key、无项目凭据），这一点必须随报告交付。
- **1 项环境阻塞未解除**：TCC 两项仍为 `false`（§13.13），AC-41 / M-09 / M-11 等桌面人工取证继续 `BLOCKED`，不口头签过。

### 13.2 执行环境与手段分层

| 项 | 实测 |
| --- | --- |
| 机器 | macOS 14.1（23B2073）/ arm64 / Node v22.21.1 / npm 10.9.4 / Playwright 1.64.1 |
| dev server | `npm run dev` → `http://localhost:1420`（`strictPort`） |
| 打包产物 | `src-tauri/target/release/bundle/macos/日程待办.app`（`Contents/MacOS/todo`，**S7.6 重建后 10:35 / 6 250 704 B / md5 `4db99e8c…`**，ad-hoc 封条完整；S12 那一轮的 07:21 / 6 232 576 B / `d66b3ea6…` 已被覆盖，§0.4）；`/Applications/日程待办.app` 已由人类删除，本轮未重装（§4.0） |
| 真实桌面库 | `~/Library/Application Support/com.poisson.todo/todo.db`（40 960 B，mtime `Nov 1 05:35`，早于本轮 E2E，未被测试写脏） |
| anon key | **无**（`sync.config.json` 不存在；仓库只有 `.example`） |
| TCC | `tcc.accessibility = false` / `tcc.screen-recording = false`（S10.5 当时）｜S7.5 复测 `screen-recording = true`，见 §13.13 |

| 手段 | 本段用在哪 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| **stub**（`scripts/mock-supabase.mjs` + 注入时钟 / 定时器 / 会话存储） | TC-065 ~ TC-075、登录登出、401、断网降级 | 逻辑分支（防抖、合并、LWW、墓碑、401 刷新、登出清会话） | 真实 Supabase / 真实 OAuth / RLS |
| **E2E 同步套件**（`e2e-sync/` + `playwright.sync.config.ts`） | TC-057 ~ TC-062 | 浏览器里「无 key ⇒ 零请求 / 无登录拦截 / 状态区不阻塞」 | 桌面 WKWebView |
| **静态 / 命令** | TC-063、TC-076~TC-077、TC-079①、TC-080、AC-43、AC-68 | 密钥边界、迁移结构、OAuth 参数形态、Windows 配置 | 运行时连通 |
| **真云端** | TC-064、TC-078、TC-079② | 端到端 | **无 key ⇒ 一律 `NOT-VERIFIED`** |

### 13.3 四组必做回归（原始尾部输出，四组分别贴）

```console
$ npm run build
> todo@0.1.0 build
> vue-tsc --noEmit && vite build
vite v8.3.5 building client environment for production...
✓ 73 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.28 kB
dist/assets/index-DjAB6kqC.css   28.31 kB │ gzip:  5.10 kB
dist/assets/index-Dl_TVPFd.js   206.72 kB │ gzip: 80.79 kB
✓ built in 214ms
EXIT=0
```

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

```console
$ npx playwright test --reporter=list
Running 6 tests using 1 worker

  ✓  1 [chromium] › e2e/todo.spec.ts:39:1 › 1 · 应用加载: shell, 42-cell calendar and the empty day panel (895ms)
  ✓  2 [chromium] › e2e/todo.spec.ts:143:1 › 2 · 完整链路: create, dots, priority, completion rate, cross-month (1.6s)
  ✓  3 [chromium] › e2e/todo.spec.ts:258:1 › 3 · 每日工作法: deterministic push, shuffle, history, library, scroll fade (959ms)
  ✓  4 [chromium] › e2e/todo.spec.ts:426:1 › 4 · 全部待办: cross-date groups, today marker, group progress, filters (880ms)
  ✓  5 [chromium] › e2e/todo.spec.ts:517:1 › 5 · 条目与编辑器: row anatomy, menu branches, closing, flip, editor (2.5s)
  ✓  6 [chromium] › e2e/tour.spec.ts:72:1 › 6 · 巡览: 14 screenshots + one continuous recording (2.1s)

  6 passed (10.6s)
```

配套：`find test-results -name video.webm | wc -l` = **6**；`trace.zip` = **0**（全绿，`retain-on-failure` 符合预期）。
用例数未变：`e2e/todo.spec.ts` 5 个 `test()` + `e2e/tour.spec.ts` 1 个 = **6**。

### 13.4 同步套件单独执行（与主套件**分别报**）

```console
$ npx playwright test -c playwright.sync.config.ts --reporter=list
Running 4 tests using 1 worker

  ✓  1 [chromium] › e2e-sync/sync.spec.ts:33:1 › S1 · 未配置 key：全程零 rest/v1 与 auth/v1 请求（AC-57 / TC-057 / TC-060） (618ms)
  ✓  2 [chromium] › e2e-sync/sync.spec.ts:67:1 › S2 · 网络整体不可用：本地三模块照常可用（AC-57 / TC-058） (333ms)
  ✓  3 [chromium] › e2e-sync/sync.spec.ts:84:1 › S3 · 首屏无登录页 / 无遮罩 / 直接进日历（AC-58 / TC-061） (144ms)
  ✓  4 [chromium] › e2e-sync/sync.spec.ts:103:1 › S4 · 状态区：未配置说明、登录入口存在但禁用、关闭后不丢状态（AC-58 / TC-062） (427ms)

  4 passed (2.4s)
```

`testDir: './e2e-sync'`（物理独立）、`outputDir: 'test-results-sync'`、`video: 'off'`；`e2e-sync/sync.spec.ts` 仍是 4 个 `test()`，**本段未新增**。

### 13.5 同步用例逐条判定表（TC-057 ~ TC-080）

| TC | AC | 判定 | 证据（本机命令 / 断言） |
| --- | --- | --- | --- |
| TC-057 | AC-57 | **PASS** | 同步套件 S1：`expect(traffic.rest).toBe(0)` + `expect(traffic.auth).toBe(0)`；计数器同时挂 `**/rest/v1/**` 与 `**/auth/v1/**` 两条 route |
| TC-058 | AC-57 | **PASS** | 同步套件 S2：`page.route` 全量 `abort()` 后仍能新建、切「全部待办」、无 `.app-notice`；stub 侧 `scripts/check-sync-extra.mjs` ② 断网推送失败本地不丢 |
| TC-059 | AC-57 | **PASS** | 主套件 `6 passed`（§13.3）+ 同步套件 `4 passed`（§13.4），两套分别报数 |
| TC-060 | AC-57 | **PASS** | 同步套件 S1（浏览器 localStorage 环境零请求）+ stub 路径 ⑥（`sync.enabled=false` 下登录 / 重试 / 增删改后 `stub.state.requests.length === 0`） |
| TC-061 | AC-58 | **PASS** | 同步套件 S3：`.login-page/.login-mask/.auth-overlay` 计数 0、无 `.editor` 遮罩、`main.app-main[data-module=calendar]` |
| TC-062 | AC-58 | **PASS** | 同步套件 S4（未配置说明 + 登录按钮 disabled + 关闭重开仍是「未配置」且 `data-phase=disabled`）+ `check-sync-extra.mjs` ③（引擎层：关闭 / 重开后仍 `signed-in`、`email` 与 `lastSyncAt` 不变、会话存储未被清；引擎重建后仍已登录）。**真实登录态的像素截图 `NOT-VERIFIED`（需 key）** |
| TC-063 | AC-59 | **PASS** | `grep -rn "code_challenge\|code_verifier\|127.0.0.1" src/` 命中 `src/sync/oauth.ts:87 code_challenge` / `:88 code_challenge_method: 's256'` / `:14 LOOPBACK_HOST='127.0.0.1'`；stub 侧断言 `codeChallengeMethod === 's256'`、`redirectTo` 以 `http://127.0.0.1:` 开头；隐式流程检索 `response_type=token` **零命中** |
| TC-064 | AC-59 | **NOT-VERIFIED** | 无 anon key，真实 GitHub OAuth 往返不可跑；等 key 后补 |
| TC-065 | AC-60 | **PASS** | `check-sync.mjs` ①：2 秒内 3 次变更 → 第 5 秒**只推 1 次**、payload 3 条、只含变更 uuid；`check-sync-extra.mjs` ④ 同口径复跑 |
| TC-066 | AC-60 | **PASS** | `check-sync-extra.mjs` ④ 打印时间线：`+2.0s → 0 次`、`+4.9s → 0 次`、`+5.0s → 1 次`；payload 每条含 `uuid` / `updated_at_ms` / `deleted` |
| TC-067 | AC-60 | **PASS** | `check-sync.mjs` ①：删除后第 5 秒 payload `deleted = 1`，本地行仍在库（`syncRows([uuid]).length === 1`），`fetchTodos()` 不再返回该行 |
| TC-068 | AC-61 | **PASS** | `check-sync.mjs` ②：重启后 `start()` → `pullCount() === 1`、`pushCount() === 0`（NEG-04），合并后标题 = 本地原有 + 远端 2 条 |
| TC-069 | AC-61 | **PASS** | `check-sync.mjs` ①：登录成功后 `stub.pullCount() === 1`、状态 `signed-in` |
| TC-070 | AC-62 | **PASS** | `check-sync.mjs` ③(a)(b)：本地 100 / 远端 200 → 远端胜且记 1 次更新；反向 → 本地胜且 `stats.skipped === 1`（旧值不回写） |
| TC-071 | AC-62 | **PASS** | `check-sync.mjs` ③(c)(d)：同毫秒两种到达顺序 `contentKey` 逐字节相同；不同 uuid 同毫秒两种顺序 `sqlite` 状态串相同 |
| TC-072 | AC-62 | **PASS** | `check-sync.mjs` ③(e)：快 6 小时的设备按 LWW 胜出，规则未改；R-T-13 已在脚本输出登记 |
| TC-073 | AC-63 | **PASS** | `check-sync.mjs` ④①：远端 `deleted=1` 落到本地后 `fetchTodos()` / `fetchTodosByDate` / `fetchTodosByMonth` 均不返回该条 |
| TC-074 | AC-63 | **PASS** | `check-sync.mjs` ④②③：更旧（1500）与更新（9000）的非删除记录**都不复活**墓碑 |
| TC-075 | AC-63 | **PASS** | `check-sync.mjs` ④④：本地删除 → payload `deleted = 1`，本地行仍在且 `deleted = true` |
| TC-076 | AC-64 | **PASS** | 真实桌面库 `PRAGMA`（§13.9）+ `check-sync.mjs` 迁移段（v3 只加 `todos` 三列、`daily_picks` 仍四列、uuid 唯一非空、`deleted` 默认 0） |
| TC-077 | AC-64 | **PASS** | `check-sync.mjs` 迁移段：`lib.rs` 只有 v1 / v2 两段字面量 SQL 且无 `DROP` / `ALTER`；v3 独立文件、版本 1/2/3 `success=1`（§13.9） |
| TC-078 | AC-65 | **NOT-VERIFIED** | 无 key，不得尝试真实写入；报告单列 |
| TC-079 | AC-66 | **PASS（①）/ NOT-VERIFIED（②）** | ① `supabase/schema.sql:31 alter table public.todos enable row level security`、`:36/:41/:45/:46/:50 using (auth.uid() = user_id)`（S12 只改了 `:10` 的操作指引注释、换成 `<project-ref>` 占位，**策略行号 31/36/41/45/46/50 未变，已逐行复核**）；② 跨用户判权需两个真实会话 → `NOT-VERIFIED` |
| TC-080 | AC-67 | **PASS（S1 已闭环）** | §13.10 / §13.17：**凭据 0 / 文本 1**——可用真实密钥 0（唯一 JWT 形态命中是 `scripts/check-sync.mjs:218` 的负向夹具，签名段为字面量 `sig`；密钥文件 0）；**值位文本 1**（`sync.config.example.json:5` 的说明性否定文本）。产物侧分两笔账：**前端字节以 `dist/` 为真判据（`grep -rac service_role dist/` = 0，正控 `sb_publishable_` = 1）**，二进制 `strings` = 0 只覆盖 Rust 层与未压缩资源（§13.10 ①·③）。运行期兜底：白名单只放行 `role === 'anon'` 的 legacy JWT 或 `sb_publishable_` 前缀，`sb_secret_` / 管理员角色 / 无 role / 非 JWT 全部拒绝且 `enabled = false`（`check-sync.mjs` **78 项断言**，§13.17-c） |

**小计**：PASS **21** / FAIL **0** / `NOT-VERIFIED` **3**（TC-064、TC-078、TC-079②）。

### 13.6 逐路径证据（必做项 1：每条都有命令与输出）

**必做项 1 的八条路径 → 命令与判定（先给映射，再贴原始输出）**

| # | 路径 | 命令 | 结论 | 原始输出 |
| --- | --- | --- | --- | --- |
| 1 | 登录与登出 | `node scripts/check-sync-extra.mjs` ① ＋ `node scripts/check-sync.mjs` ① | **PASS**：登录 → `signed-in` + 邮箱入会话存储；登出 → 会话存储 `null`、状态回 `signed-out`、待推集合清空、登出后本地改动 10 秒内零请求 | §13.6.2 ① + §13.6.1 ① |
| 2 | 5 秒防抖（窗口内多次变更只推一次） | `node scripts/check-sync-extra.mjs` ④ ＋ `check-sync.mjs` ① | **PASS**：2 秒内 3 次变更 → 1 次推送含 3 条；时间线 `+4.9s 0 次 / +5.0s 1 次` | §13.6.2 ④ |
| 3 | 启动拉取 | `node scripts/check-sync.mjs` ② | **PASS**：重启后 `pullCount=1`、`pushCount=0`，本地原有 + 远端 2 条合并到位 | §13.6.1 ② |
| 4 | 登录后拉取 | `node scripts/check-sync.mjs` ① | **PASS**：登录成功后 `pullCount=1`（FR-SYNC-06） | §13.6.1 ① |
| 5 | LWW（含同毫秒稳定序、时钟偏移） | `node scripts/check-sync.mjs` ③ | **PASS**：远端新胜 / 本地新胜且不回写；同毫秒两种到达顺序逐字节相同；6 小时偏移按 LWW 判并登记 R-T-13 | §13.6.1 ③ |
| 6 | 软删除不复活 | `node scripts/check-sync.mjs` ④ | **PASS**：墓碑落库后三模块不可见；更旧**与更新**的非删除记录都不复活；本地删除推 `deleted=1` 且行仍在库 | §13.6.1 ④ |
| 7 | 401 失效重登 | `node scripts/check-sync.mjs` ⑤ | **PASS**：401 → 刷新 → 重试原请求成功；刷新也失败 → 清会话、置未登录、10 秒内不再重试 | §13.6.1 ⑤ |
| 8 | 无 key / 断网降级 | `node scripts/check-sync-console.mjs` ＋ 同步套件 S1/S2 ＋ `check-sync-extra.mjs` ② ＋ `check-sync.mjs` ⑥ | **PASS**：浏览器零 `rest/v1` + 零 `auth/v1` 请求、零控制台错误；断网时三模块照常可用、推送失败不回滚本地数据 | §13.6.3 + §13.4 + §13.6.2 ② + §13.6.1 ⑥ |

#### 13.6.1 总览：`node scripts/check-sync.mjs`（六组路径 + v3 迁移）

```console
$ node scripts/check-sync.mjs
── ① 5 秒防抖推送（TC-065 / TC-066 / TC-067）
   ✓ ① 5 秒防抖推送（TC-065 / TC-066 / TC-067） PASS（23 项断言）

── ② 启动拉取合并 / 登录后立即拉取（TC-068 / TC-069）
   ✓ ② 启动拉取合并 / 登录后立即拉取（TC-068 / TC-069） PASS（4 项断言）

── ③ LWW 与同毫秒稳定序（TC-070 / TC-071 / TC-072）
   · R-T-13 已登记：updated_at_ms 取客户端时钟，快 6 小时的设备会一直胜出
   ✓ ③ LWW 与同毫秒稳定序（TC-070 / TC-071 / TC-072） PASS（8 项断言）

── ④ 墓碑终结与软删除（TC-073 / TC-074 / TC-075）
   ✓ ④ 墓碑终结与软删除（TC-073 / TC-074 / TC-075） PASS（9 项断言）

── ⑤ 401 失效 → 刷新重试 / 刷新失败重登（AC-58 会话语义）
   ✓ ⑤ 401 失效 → 刷新重试 / 刷新失败重登（AC-58 会话语义） PASS（9 项断言）

── ⑥ 未配置时零请求（AC-57）
   ✓ ⑥ 未配置时零请求（AC-57） PASS（2 项断言）

── v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列）
   · PRAGMA table_info(todos) → 0|id|INTEGER|0||1 ; 1|title|TEXT|1||0 ; 2|date|TEXT|1||0 ; 3|priority|INTEGER|1|1|0 ; 4|note|TEXT|1|''|0 ; 5|done|INTEGER|1|0|0 ; 6|created_at|TEXT|1|datetime('now','localtime')|0 ; 7|updated_at|TEXT|1|datetime('now','localtime')|0 ; 8|uuid|TEXT|0||0 ; 9|updated_at_ms|INTEGER|0||0 ; 10|deleted|INTEGER|1|0|0
   · 回填 uuid → be5a1656-d1a8-48c9-b08d-0061abb8a73c,d461ce96-aa61-47e7-a1e3-36cbfc38122b
   · 软删除后 deleted → 2:0,1:1
   ✓ v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列） PASS（20 项断言）

✓ 同步自检 PASS：78 项断言，六组路径 + v3 迁移结构证据全部通过
  NOT-VERIFIED：真实 Supabase 读写、真实 GitHub OAuth 往返、云侧 RLS 越权不可见
```

> 口径：**78 = 六组 55（23+4+8+9+9+2）+ v3 迁移 20 + 白名单前置 3**。白名单那 3 条（`sb_secret_` 必须被拒 / 拒绝须给原因 / `sb_publishable_` 必须放行）写在 `check-sync.mjs` 的**模块顶部**、**只在失败时抛错、通过时不出行**，所以上面的尾部输出里看不到它们；可读证据见 §13.17-c 的矩阵调用。断言数 **75 → 78** 来自这 3 条，与六组、迁移段无关。

#### 13.6.2 登录 / 登出 / 断网降级 / 防抖时间线：`node scripts/check-sync-extra.mjs`

```console
$ node scripts/check-sync-extra.mjs
── ① 登录 → 登出：会话清空、状态回未登录、登出后零推送（AC-58 / TC-062）
   ✓ ① 登录 → 登出：会话清空、状态回未登录、登出后零推送（AC-58 / TC-062） PASS（12 项断言）

── ② 断网降级：推送/拉取失败不阻塞、本地数据不丢、状态可重试（AC-57 / TC-058）
   ✓ ② 断网降级：推送/拉取失败不阻塞、本地数据不丢、状态可重试（AC-57 / TC-058） PASS（10 项断言）

── ③ 状态区关闭不丢会话：状态与会话在 UI 开关之外（AC-58 / TC-062 扩展）
   ✓ ③ 状态区关闭不丢会话：状态与会话在 UI 开关之外（AC-58 / TC-062 扩展） PASS（9 项断言）

── ④ 防抖时间线：4.9 秒零请求、5.0 秒一次（AC-60 / TC-065 / TC-066）
   · 推进方法：setClock / setTimers 注入 + advance(ms)（见本文件顶部）
   · +2.0 秒 → 推送 0 次
   · +4.9 秒（最后一次改动后）→ 推送 0 次
   · +5.0 秒（最后一次改动后）→ 推送 1 次
   · 该次 payload 条数 = 2
   · payload 字段 = user_id,uuid,title,date,priority,note,done,created_at,updated_at,updated_at_ms,deleted
   ✓ ④ 防抖时间线：4.9 秒零请求、5.0 秒一次（AC-60 / TC-065 / TC-066） PASS（6 项断言）

✓ 补充自检 PASS：37 项断言（登出 / 断网降级 / 状态区关闭不丢会话 / 防抖时间线）
  NOT-VERIFIED：真实云端登录态下的状态区截图、真实断网（Wi-Fi 关闭）下的桌面 UI
```

**AC-60 的 fake timer 推进方法（唯一口径，实现方不得各写一套）**：注入 `setClock({ now() })` 与 `setTimers({ setTimeout, clearTimeout })`，用 `advance(ms)` **按到期时间依次触发**挂起的定时器并把假时间停到目标点（`scripts/check-sync.mjs` 与 `check-sync-extra.mjs` 各有一份同形实现）；浏览器侧日期基线用 `page.clock.setFixedTime(RUN_START)`。判据固定为「最后一次改动后 4.9 s 零请求、5.0 s 一次请求」。

#### 13.6.3 零请求 + 零控制台错误：`node scripts/check-sync-console.mjs`

主套件与同步套件都没有控制台断言，而 AC-57 的判据含「日志无错误堆栈」。故补一个独立探针（不进任何 `testDir`）：

```console
$ node scripts/check-sync-console.mjs
PROBE sync.panel.dom-nodes-after-close = 1（v-show 保留节点）
PROBE sync.panel.visible-after-close = false
PROBE sync.entry.data-phase = disabled
PROBE init-error nodes = 0
✓ 控制台错误（console.error + pageerror） = 0
✓ 云端请求（rest/v1 + auth/v1） = 0

AC-57 日志证据 PASS：三模块 + 状态区开关 + 重载全过程零控制台错误、零云端请求
```

### 13.7 AC-43 重判（PRD v1.5 附录 B §B.10，条款与 v1.4 一致；S7 结论作废）

```console
$ grep -rnE "nsis|%APPDATA%|msedge|\.ps1|SetProcessDPIAware|AttachThreadInput|PrintWindow" \
    src-tauri/tauri.conf.json src/ e2e/ \
    && echo "WINDOWS RESIDUE" || echo "NO WINDOWS RESIDUE"
NO WINDOWS RESIDUE

$ node -e "const c=require('./src-tauri/tauri.conf.json');process.exit(c.bundle && c.bundle.targets ? 1 : 0)" \
    && echo "BASE CONF CLEAN" || echo "BASE CONF HAS PLATFORM TARGETS"
BASE CONF CLEAN
```

**判定：PASS。** 扫描范围严格按 v1.4 收窄口径（v1.5 未改动本条）：基础配置 + `src/` + `e2e/`，**不含** `tauri.windows.conf.json` 与 `scripts/`。`nsis` / `%APPDATA%` / `currentUser` 出现在 Windows overlay、CI 与校验脚本中属应有内容，本段不判失败。

### 13.8 AC-68（PRD v1.5 附录 B §B.11，Windows 可构建正向）

```console
$ node scripts/check-bundle-config.mjs
  ✓ macOS 产物路径含 dmg 与 .app
  ✓ Windows 产物路径含 nsis exe 与 msi
----------------------------------------
断言通过 44 条，失败 0 条
PASS（三份 conf 合并 + schema + 平台中立 + 数据路径中立 + workflow 结构）
EXIT=0
```

```console
$ grep -nE "windows-latest|runs-on|tauri build" .github/workflows/build.yml
22:    runs-on: ${{ matrix.os }}
34:            os: windows-latest
79:        run: npx tauri build
83:        run: npx tauri build
```

逐条核对：matrix 里有 `windows-latest`（`:34`）；打包步骤按平台分支，`runner.os == 'Windows'` 时**真跑** `npx tauri build`（`:81-83`，不是占位）；`Upload bundles` 在打包之后且 `if-no-files-found: error`；E2E 闸门（`npx playwright test`）在 `tauri build` 之前。交付说明侧：

```console
$ grep -rniE "windows (版)?(已)?(可用|验证)" README.md docs/verification/ 2>/dev/null \
    | grep -v "未在本机验证" | grep -v "未在本机产出" \
    && echo "FORBIDDEN CLAIM" || echo "CLAIM CLEAN"
CLAIM CLEAN
```

**判定：PASS（仅限 ①②③ 三条静态/命令证据）。** `.github/workflows/build.yml` 头注释与 README 均写明「Windows 产物未在本机验证，验证路径是 CI」；**CI 的实际运行结果 = `NOT-VERIFIED`**（本机无 Windows、无 Actions 运行记录），不因此项升格。

### 13.9 AC-64 · 真实桌面库的 v3 结构（贴 `PRAGMA` 原文，不引用 S10 文字）

```console
$ DB="$HOME/Library/Application Support/com.poisson.todo/todo.db"
$ ls -l "$DB"
-rw-r--r--@ 1 zachary  staff  40960 Nov  1 05:35 …/com.poisson.todo/todo.db

$ sqlite3 "$DB" "PRAGMA table_info(todos);"
0|id|INTEGER|0||1
1|title|TEXT|1||0
2|date|TEXT|1||0
3|priority|INTEGER|1|1|0
4|note|TEXT|1|''|0
5|done|INTEGER|1|0|0
6|created_at|TEXT|1|datetime('now','localtime')|0
7|updated_at|TEXT|1|datetime('now','localtime')|0
8|uuid|TEXT|0||0
9|updated_at_ms|INTEGER|0||0
10|deleted|INTEGER|1|0|0

$ sqlite3 "$DB" "PRAGMA table_info(daily_picks);"
0|date|TEXT|0||1
1|method_id|TEXT|1||0
2|manual|INTEGER|1|0|0
3|updated_at|INTEGER|1|0||0

$ sqlite3 "$DB" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
1|create_todos_table|1
2|create_daily_picks_table|1
3|add_sync_columns_to_todos|1

$ sqlite3 "$DB" "SELECT count(*) AS rows, count(DISTINCT uuid) AS distinct_uuid, sum(deleted) AS deleted_sum FROM todos;"
5|5|0

$ sqlite3 "$DB" "SELECT id, uuid, updated_at_ms, deleted, title FROM todos ORDER BY id;"
1|31c94722-be8b-454a-ac95-ac86def03148|1793474102000|0|升级前 · 今天高优先级
2|31b22eaf-6a65-4ab6-a789-b9af6f7f68c8|1793474102000|0|升级前 · 今天已完成
3|4c5a74ff-6fba-4648-80b6-927fc82e81ca|1793474102000|0|升级前 · 昨天
4|3a51a44f-8ee1-4353-abf4-adba54d610ff|1793474102000|0|升级前 · 明天
5|a1efd450-563f-46a2-9f8b-21f046014542|1793474102000|0|升级前 · 上月

$ sqlite3 "$DB" "SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY name;"
idx_todos_date|todos
idx_todos_live|todos
idx_todos_uuid|todos
sqlite_autoindex__sqlx_migrations_1|_sqlx_migrations
sqlite_autoindex_daily_picks_1|daily_picks
```

幂等（在**真实库副本**上重跑同一段回填 SQL，等价于「迁移被重复执行」）：

```console
$ cp "$DB" copy.db
$ sqlite3 copy.db "UPDATE todos SET uuid = … WHERE uuid IS NULL;"
$ sqlite3 copy.db "UPDATE todos SET updated_at_ms = CAST(strftime('%s', updated_at, 'utc') AS INTEGER) * 1000 WHERE updated_at_ms IS NULL;"
BEFORE=31b22eaf-…,31c94722-…,3a51a44f-…,4c5a74ff-…,a1efd450-…
AFTER =31b22eaf-…,31c94722-…,3a51a44f-…,4c5a74ff-…,a1efd450-…
IDEMPOTENT OK
$ sqlite3 copy.db "SELECT count(*) FROM todos WHERE uuid IS NULL OR uuid='';"
0
```

**判定：PASS。** `todos` 三列齐备、`daily_picks` 四列未被污染（D-19）、5 行 5 个唯一 uuid、`deleted` 全 0、`updated_at_ms` 为正毫秒、迁移版本 1/2/3 且 `success=1`、二次回填不重新生成 uuid。

### 13.10 AC-67 · 密钥边界（账：**凭据 0 / 文本 1**；产物侧分两笔）

**① 源码与配置值位（S10.5 原始范围，保留原样）**

```console
$ grep -rnI "service_role\|SUPABASE_SERVICE" \
    src src-tauri/tauri.conf.json src-tauri/tauri.macos.conf.json \
    src-tauri/tauri.windows.conf.json src-tauri/Cargo.toml src-tauri/migrations \
    package.json sync.config.example.json
sync.config.example.json:5:  "anonKey": "<在这里填 anon public key（legacy JWT 且 role 为 anon，或 sb_publishable_ 前缀）；其它形态一律被拒并停在「未配置」，这是预期行为，绝不要填 service_role>"

$ grep -rnIE "eyJ[A-Za-z0-9_-]{10,}" src src-tauri/src src-tauri/migrations \
    src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json sync.config.example.json
（无输出，exit 1）

$ git ls-files | grep -iE "\.env|secret|credential|\.pem|\.key$"
（无输出，exit 1）
```

**② 全仓 tracked 分账（行数不作判据）**

| 维度 | 实测 | 计法 |
| --- | --- | --- |
| `git grep`（tracked 全量） | **两位数行 / 7 文件（不给绝对值）** | 命令已从 `grep $(git ls-files)` 换成 `git grep`：旧写法会漏掉带引号的中文路径、并对盘上已删除的 `CLAUDE.md` 报错（§13.17-b 有 stderr 原文）。行数随本报告自身增长（同一轮内 39 → 43），**不作判据**。命中文件固定为 README、PRD、设计、计划、验证文档与本报告自身，全部是**说明性文本**（"怎么防"），不是"真的填了" |
| 其中**值位**命中 | **1 行**（`sync.config.example.json:5`） | 值位 = 配置项的值里出现该词；本条是占位说明「绝不要填 `service_role`」 |
| 凭据（可用密钥） | **0** | JWT 形态唯一命中 `scripts/check-sync.mjs:218` 是**负向夹具**（`role: supabase_admin`，签名段字面量 `sig`，不可用）；密钥文件 0 |

> 上一版把具体行数写成绝对数，是个会自我打脸的判据：报告每加一段说明，这个数字就变大（本轮实测 39 → 43，全是说明文本）。**所以本报告不再给这个数**——结论只挂在「值位命中数」与「可用凭据数」上，**行数不作判据**。
>
> **另一处会漂移的是「值位 1」**：S11 整改第 1 件要求把 `sync.config.example.json` 的占位 `anonKey` 注释改成与新白名单一致。若那份占位文案改成不提角色名，值位命中会从 **1 归 0**，账变为「**凭据 0 / 文本 0**」——**判定不变**：AC-67 的 PASS 挂在「可用凭据 0」与「白名单兜底」上，不依赖这 1 行说明性文本。本节记的是 **2026-11-01 本轮**的快照。

**③ 产物侧：前端字节 ≠ 二进制 `strings`（本轮改账）**

```console
$ grep -rac "service_role" dist/
dist//index.html:0
dist//assets/index-DjAB6kqC.css:0
dist//assets/index-BRnvPgOX.js:0
（三行都是 0，grep 退出码 1 = 无命中）

# 正控：同一个 dist 扫描必须能看见嵌进去的前端标记，否则「0 命中」等于没验
$ grep -aoc "sb_publishable_" dist/assets/*.js
1        # 用通配：重建会换 hash，写死文件名下次直接 No such file

# 压缩嵌入实证：「未配置同步」在 dist 有 1 处，在 .app 二进制里 0 处
$ grep -rac "未配置同步" dist/
dist//index.html:0
dist//assets/index-DjAB6kqC.css:0
dist//assets/index-BRnvPgOX.js:1

$ strings "…/Contents/MacOS/todo" | grep -c "未配置同步"
0
$ strings "…/Contents/MacOS/todo" | grep -c "service_role"
0
```

**读法（这条是本轮最重要的口径修正）**：Tauri 把前端资源**压缩后**嵌进 `.app`，`strings` 只能看见 Rust 层与未压缩资源——上面「未配置同步」在 `dist/` 有 1 处、在二进制里 0 处，就是这个事实的直接实证。所以：

- 「产物 `strings` 0 命中」**不能**单独写成「整个 `.app` 已逐字扫过」；
- **前端侧的真判据是 `dist/`**（`dist/` 正是被嵌进产物里的那份字节），且必须带**正控**（`sb_publishable_` = 1 才能证明扫描器读到了 JS 里的字符串）；
- 二进制 `strings` 仍有价值，但只覆盖 **Rust 层 + 未压缩资源**。
- **复核时正控请用通配**（`grep -aoc "sb_publishable_" dist/assets/*.js`）：每次重建都会换文件 hash，写死 `index-BRnvPgOX.js` 下次就 `No such file`——A-12 那条 `Contents/MacOS/日程待办` 的教训同源。

**账**：**前端字节 0（带正控）/ Rust 与未压缩层 0 / 可用凭据 0 / 值位说明性文本 1**。

**判定：PASS（账：凭据 0 / 文本 1）。** **不得**写成「三处均无命中」——裸 grep 必命中两位数行数、值位 1 行；「三处均无命中」等于用一个必然失败的判据冒充证据。AC-67 原文这一句按实测应读作「**凭据 0 命中 / 说明性文本 1 处**」。

**④ 运行期兜底：S1 白名单已闭环（2026-11-01 复跑）**

- **代码**（`src/sync/config.ts`）：`:63-66` 的 `isAcceptableAnonKey()` 只放行 ① legacy JWT 且 `jwtRole === 'anon'`、② `sb_publishable_` 前缀；`:98` 调用它，**旧的黑名单分支（`if (role && role !== 'anon')`）已删除**。`jwtRole` 要求 3 段、读不出 role 返回 `''`，故「无 role / 非 JWT」一律落到拒绝支。
- **我自己的矩阵调用**（不引用开发侧贴的输出，直接 import 源文件跑）：

```console
$ node --input-type=module -e '…parseSyncConfig 八种形态…'
true   legacy JWT role=anon           OK
true   sb_publishable_ 前缀            OK
false  sb_secret_ (新版服务端)          只接受 anon 角色的 JWT 或 sb_publishable_ 前缀的密钥
false  legacy JWT role=service_role   只接受 anon 角色的 JWT 或 sb_publishable_ 前缀的密钥
false  legacy JWT role=supabase_admin 只接受 anon 角色的 JWT 或 sb_publishable_ 前缀的密钥
false  JWT 无 role 声明                 只接受 anon 角色的 JWT 或 sb_publishable_ 前缀的密钥
false  任意非 JWT 串                    只接受 anon 角色的 JWT 或 sb_publishable_ 前缀的密钥
false  空串                            缺少 base URL 或 anon key
```

- **脚本断言**：`node scripts/check-sync.mjs` → **78 项断言 PASS**（75 → 78，新增 3 条即上表的 `sb_secret_` 拒绝 / 拒绝须给原因 / `sb_publishable_` 放行），原始输出见 §13.17-c。
- **边界（写死，不许漂移）**：`sb_publishable_` 是**前缀放行**，任何该前缀的串都会 `enabled = true`。这**不是漏洞**（公开密钥无权限提升，服务端会拒无效 key），但白名单边界必须写成「**只有这两个形态**」，**不得**扩成「任意 `sb_` 前缀」或「任意 JWT」。
- **残留**：无。S1 由此从「欠账」转为**已闭环**；AC-67 的 PASS 现在覆盖「静态凭据账 + 前端字节 + 白名单形态矩阵（2 放行 / 3 拒绝）」。

### 13.11 AC-01 ~ AC-56 不回归登记（只登记同步改动是否破坏既有 AC）

**判断原则**：同步层是纯新增（`src/sync/**`、`src/stores/sync.ts`、`src/components/layout/SyncPanel.vue`、`src-tauri/migrations/0003_*.sql` + `lib.rs` 的 v3 注册），既有 56 条 AC 的判定与证据全部复用 S7；本段只核对「同步改动是否让某条旧 AC 失效」。

| 旧 AC | 同步改动是否触碰 | 复核命令 / 证据 | 结论 |
| --- | --- | --- | --- |
| AC-01 | 构建链路新增 14 个模块 | `npm run build` exit 0、`vue-tsc --noEmit` 零错误、`✓ 73 modules transformed` | **未破坏** |
| AC-02 | 无 | dev server 仍 `strictPort` 1420，同步套件与主套件共用同一 webServer | **未破坏** |
| AC-03 | **同步断言全部隔离到 `e2e-sync/`** | `npx playwright test` **6 passed**、视频 6 / trace 0；`e2e/*.spec.ts` 无新增 `test()` | **未破坏（回归红线守住）** |
| AC-04 | 无 | 本轮两次独立跑主套件（主套件一次、全量一次）均 6 passed | **未破坏** |
| AC-05 | 巡览产物重新生成 | `screenshots/` 14 张 + `videos/` 1 个 webm（用例 6 通过） | **未破坏** |
| AC-06 ~ AC-33 | 三模块代码未改（只在 `App.vue` 加了 `initSync` 调用） | 主套件用例 1~5 全绿；`check-data-layer.mjs` 9 组断言 PASS；`check-db-parity.mjs` 13 步对拍 PASS（含 `fetchTodos` / `ByDate` / `ByMonth` / `DailyPicks`） | **未破坏** |
| AC-34 | `todos` 增 3 列 | 真实库 `.tables` 两表齐、5 行、`daily_picks` 四列未变（§13.9）；桌面 UI 新建一条的变体仍 **BLOCKED**（TCC） | **未破坏**（UI 变体另记 BLOCKED） |
| AC-35 | 无（E2E 不碰 SQLite） | 真实库 mtime `05:35` 早于本轮 E2E，行数 5 未变 | **未破坏** |
| AC-36 | v3 迁移 | 真实库 5 行「升级前 · …」仍在，`_sqlx_migrations` 1/2/3 `success=1`，`daily_picks` 记录未丢 | **未破坏** |
| AC-37 | **v3 引入 `ALTER TABLE … ADD COLUMN`** | 按 PRD **v1.5 附录 B.7 三段式**复核（§13.17）：`src-tauri/src/lib.rs` 无 `DROP` / `ALTER`（`LIB.RS CLEAN`）、`src-tauri/migrations/` 无 `DROP TABLE` / `DROP INDEX` / `RENAME TO`（`MIGRATIONS CLEAN`）、`CREATE TABLE` 均带 `IF NOT EXISTS`（`CREATE OK`） | **判定未破坏**（`ADD COLUMN` 在 v1.5 里是**允许项**，不是违约；见 §14 判定含义注） |
| AC-38 | 无 | S7 结论复用（删 `.app` 重装数据仍在）；本段未重跑破坏性用例 | **未破坏** |
| AC-39 / AC-40 | 产物加了同步代码 | `.app` 仍存在、`Contents/MacOS/todo` 可 `strings` 检索（**注意**：前端字符串压缩嵌入，`strings` 不覆盖前端层，见 §13.10 ③） | **未破坏** |
| AC-41 | 同步在断网时必须降级 | 浏览器侧 S2 + stub 侧断网降级 PASS；桌面端「关 Wi-Fi 走三模块」仍 **BLOCKED**（TCC） | **未破坏**（桌面取证 BLOCKED） |
| AC-42 | **未新增任何依赖** | `DEPENDENCY CLEAN`；deps 仍为 `@tauri-apps/api` / `@tauri-apps/plugin-sql` / `dayjs` / `vue`（同步用原生 `fetch`，没引 `@supabase/supabase-js`） | **未破坏** |
| AC-43 | 同步改的是 `src/` | 按 v1.4 重判 PASS（§13.7） | **未破坏（并已重判）** |
| AC-44 / AC-56 | 新增同步入口 | 同步套件 S3：`.side-nav nav .nav-item` 计数 3、nav 文本无「登录」/「同步」；入口在 `SyncPanel`（`<nav>` 之外） | **未破坏** |
| AC-45 ~ AC-55 | 无 | 复用 S7 判定；`check-cases.mjs` PASS、`check-permutation.mjs` 7/7、`check-db-parity.mjs` PASS | **未破坏** |

**56 条旧判定：0 条被推翻、0 条需降级。** 唯一的条文级冲突见「观察 1」（是 PRD 内部口径问题，不是实现缺陷）。

### 13.12 NOT-VERIFIED 清单（无 anon key，等人类提供后必须补跑）

| 项 | 为什么现在判不了 | 补跑步骤（拿到 key 后照此执行） |
| --- | --- | --- |
| **AC-65 / TC-078** 真实云端读写 | 无 anon key；`supabase/schema.sql` **未在云端执行** | 建 Supabase 项目 → 在 SQL Editor 执行 `supabase/schema.sql` → 填 `sync.config.json` → 桌面版登录 → 新建 / 编辑 / 删除各 1 条 → 云端 `select count(*) from todos` 对账 |
| **TC-064** 真实 GitHub OAuth 往返 | 需项目侧启用 GitHub provider + 回调白名单 | 项目 Authorization → Providers → GitHub 配 Client ID/Secret；回调白名单加 `http://127.0.0.1:*/**`；桌面版点「GitHub 登录」走完整往返 |
| **AC-66② / TC-079②** 云侧 RLS 越权不可见 | 需要两个真实用户会话 | 用 A、B 两个账号各写 1 条 → 用 A 的 token 查全表，应只看到 A 的 1 行 |
| **桌面钥匙串 + 回环监听的实机链路** | 自动化只到注入层；真机需 key | 登录成功后 `security find-generic-password -s com.poisson.todo.sync` 能查到条目；授权回调能回跳 |
| **TC-062 的「真实已登录状态下重开状态区」截图** | 无 key，浏览器恒「未配置」 | 登录成功后：开面板 → 关 → 重开 → 截图「已登录 + 上次同步 x月x日 xx:xx:xx · 成功」 |

> 这五项**一律不计入 PASS**；`supabase/schema.sql` 未在云端执行这件事随报告交付（云端表结构、RLS、策略均为「代码已写、未验证」）。

### 13.13 BLOCKED 清单（S7.5 补跑后：屏幕录制已解除，辅助功能仍未授权）

> 产物身份：S7.5（2026-11-01 10:25）的取证对象是 **10:00 构建**（`src-tauri/target/release/bundle/macos/日程待办.app`，
> `todo` 6 232 576 B / `md5 383e6d52…e4b1`）；下表其余历史项仍是 **03:17 构建**（§4.0）。
> 完整命令与失败动作见 `docs/verification/desktop/S7.5-evidence.md`。

```console
$ swift scripts/mac-desktop-probe.swift          # S7.5 实测
PROBE tcc.accessibility = false
PROBE tcc.screen-recording = true                # ← S7 时为 false，本轮已授权
PROBE app.running = true
PROBE app.pid = 76903
PROBE app.bundle-id = com.poisson.todo
PROBE app.name = 日程待办
PROBE app.path = /Users/zachary/Desktop/work/todo/src-tauri/target/release/bundle/macos/日程待办.app
PROBE app.activation = regular
PROBE window.count = 1
PROBE window.number = 165000
PROBE window.bounds = 1100x721
PROBE window.title = BLOCKED (AX error -25211)
PROBE menubar.items = BLOCKED (AX error -25211)
```

**S7.5 解除的（有像素证据）**：

| 对象 | 新判定 | 证据 |
| --- | --- | --- |
| M-01 首启拦截框 | **PASS（该子项）** | `docs/verification/desktop/M-01-a-gatekeeper-dialog.png`：带 quarantine 的副本 → 「已损坏，无法打开」 |
| M-01 `xattr` 处置 | **PASS（该子项）** | `M-01-b-gatekeeper-cleared-launch.png`：清隔离属性后正常启动（PID 77855） |
| M-04 菜单栏项 | **PASS（该子项）** | `M-04-a-menubar.png`：`日程待办 / File / Edit / View / Window / Help`（框架默认英文） |
| M-10 Dock 图标 | **PASS** | `M-10-a-dock.png`：应用自己的黄/青双环图标 + 运行指示点，非默认 Tauri 占位 |
| 桌面渲染基线 | **PASS** | `M-00-desktop-calendar.png`：1100×721 窗口，Retina 2200×1442，日历默认视图 |

**仍 BLOCKED 的**：

| 对象 | 状态 | 说明 |
| --- | --- | --- |
| **AC-41**（断网后走完三模块，桌面） | **BLOCKED**（未变） | 仍需关 Wi-Fi（须人类批准）+ 桌面 UI 操作 |
| **AC-34** 的「桌面 UI 新建一条 → `count(*)=1`」变体 | **BLOCKED**（未变） | 卡在「+ 新建待办」那一次点击；建库建表与落行已由 §13.9 证明 |
| **AC-55** 的「桌面 UI 六步对拍」 | **BLOCKED**（未变） | 六步全是点击；数据层对拍已 PASS（`check-db-parity.mjs`） |
| M-02 / M-03 / M-05 / M-06 | **BLOCKED**（未变） | 卡在「无法合成点击」：`click at` → `-25211`；`CGEvent(.cghidEventTap)` 与 `CGEvent.postToPid` 均只出 hover、点击不生效 |
| M-07 / M-08 | **BLOCKED**（未变） | 卡在「打开编辑器需要一次点击」；M-08 仍是硬项 |
| M-09 | **BLOCKED**（未变） | 不擅自断网 |
| M-11 | **BLOCKED**（未变） | 卡在「切到 `5w2h` 需要一次点击」；按键也发不出（`-1002`），无法注入滚动；仍是硬项 |
| M-01 的「右键 → 打开」 | **BLOCKED**（S7.5 记录） | 无法合成点击；当时对话框为「已损坏」变体，**没有「打开」按钮**（根因：`Sealed Resources=none`、无 `_CodeSignature/`、`codesign --verify` exit 1）。**S7.6 已消除「已损坏」**：新产物弹的是「Apple 无法检查…包含恶意软件」（在访达中显示 / 好），但右键路径仍需辅助功能，**未实测** |
| M-04 的 `⌘Q` / `⌘C` / `⌘V` | **BLOCKED** | 无法发送按键：`keystroke` → `-1002` |

**没有口头签过任何一条**：辅助功能仍为 `false`；AC-41 / AC-34 / AC-55 与 8 项人工 checklist 继续按 `BLOCKED` 记。
**硬项 M-01 / M-08 / M-11 仍未签署**（S7.5 时 M-01 只到 PARTIAL）。
> **S7.6 补注**：M-01 已在 S7.6 回填 **PASS**（ad-hoc 封条 + quarantine 复测，§0.4）；M-08 / M-11 仍是硬项、
> 仍 BLOCKED。上表「S7.5 解除的」是第三轮快照，最新状态以 §6 为准。

### 13.14 观察与风险（不影响本段 PASS 结论，但必须写明）

| # | 观察 | 处置 |
| --- | --- | --- |
| 1 | **AC-37 的条文与 v3 迁移曾冲突**：旧字面「所有迁移 SQL … 无 `DROP` / `ALTER`」，而 v3 必然要 `ALTER TABLE todos ADD COLUMN` | **已由 PRD v1.5 收窄结案**：附录 B.7 改为三段式（`lib.rs` 查 `DROP`/`ALTER`；`migrations/` 允许 `ADD COLUMN`、禁 `DROP`/重建/改名；`CREATE` 必须 `IF NOT EXISTS`）；本轮实跑三段全净（§13.17-a）。实现**不违约**，判据也不再永真 |
| 2 | `sync.config.example.json` 的占位值含 `service_role` 字样（§13.10） | 账写作「**凭据 0 / 文本 1**」；非凭据，不判 FAIL。S1 白名单整改（§13.10-③）是另一件事，**已升为发布前必修** |
| 3 | **5 秒窗口内退出应用不 flush**（OPEN-02 默认口径） | 与 PRD §16.4 一致：未到期变更随退出丢弃，本地库已写；本段未发现「丢数据」行为，不判失败 |
| 4 | R-T-13 / R-SYNC-01：LWW 用客户端时钟，快 6 小时的设备会一直胜出 | 规则不改（D-18），脚本每次运行都会打印该风险行 |
| 5 | R-SYNC-02：会话写入钥匙串时 token 会出现在 `security` 子进程参数中一次 | 本期不做加固；token 不落明文、不进 localStorage（`check-sync.mjs` 有对应断言） |
| 6 | 同步套件 `video: 'off'`，`test-results-sync/` 无录屏 | 该套件以断言与 stub 记账为证据；录屏不是 AC-57~AC-67 的判据 |
| 7 | AC-68 的 CI 结果不可观察 | 只判三条静态证据，CI 结果 `NOT-VERIFIED`（§13.8） |
| 8 | **未签名的 bundle 首启被判「已损坏」，不是「未验证开发者」**：`Sealed Resources=none`、无 `_CodeSignature/`、`codesign --verify` exit 1 → 带 quarantine 的副本只给「移到废纸篓 / 取消」，README §2 情形①（右键 → 打开）对它不适用（S7.5 实测，`M-01-a`） | **S7.6 已按「补封条」处置**：`signingIdentity = "-"` + 重建后 `verify` exit 0，弹框变为「Apple 无法检查…」（§0.4）；README 走 `xattr -dr` 路线，右键路径标注未实测。原「本轮不改产品代码」的约束只适用于 S7.5 |

### 13.15 本段改动（changed files）

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `docs/test/ZACHTD-2-test-report.md` | **修改** | 新增本章（§13）+ 同步/AC-68 相关计数与口径回改 |
| `docs/test/ZACHTD-2-test-plan.md` | **修改** | v1.3 增量：68 条、TC-055 换 B.10 并挂 AC-68、TC-057 双路径、TC-062 补关闭不丢会话、TC-065/066 写死 fake timer 推进方法、TC-080 限定检索范围、TC-076 改真实库 |
| `scripts/check-sync-extra.mjs` | **新增** | 登出 / 断网降级 / 状态区关闭不丢会话 / 防抖时间线（37 项断言） |
| `scripts/check-sync-console.mjs` | **新增** | AC-57「日志无错误堆栈」探针（零控制台错误 + 零云端请求） |
| `scripts/check-cases-negative.mjs` | **新增** | TC-036 负向自证（四种篡改各自使 `check-cases.mjs` 退出码 ≠ 0） |
| `test-results/**`、`test-results-sync/**` | 运行产物 | 主套件 6 视频；同步套件无录屏（未跟踪） |

**未改动**：`src/**`、`src-tauri/**`、`e2e/**`、`e2e-sync/**`、`package.json`、`supabase/**`、`README.md`。**未新增任何 `test()`**，**未放宽任何断言**。

### 13.16 TC-036 负向复跑（Reviewer 留的「永真脚本」风险项）

```console
$ node scripts/check-cases-negative.mjs
✓ 未篡改副本 → exit=0
✓ ① 删掉 1 条方法（65 → 64） → exit=1
      ✗ 方法总数应为 65，实际 64
      ✗ 分类 thinking 应为 17 条，实际 16 条
      ✗ CATEGORY_COUNTS.thinking 应为 17，实际 16
      ✗ case.type practice 应为 18 条，实际 17 条
✓ ② 造一条 steps = 1 → exit=1
      ✗ first-principles steps 只有 1 项，少于 2 项
✓ ③ case.type 改成非法值 → exit=1
      ✗ first-principles case.type 非法：anecdote
      ✗ case.type practice 应为 18 条，实际 17 条
✓ ④ 案例正文截到 100 字 → exit=1
      ✗ first-principles 案例正文长度 100 不在 126–240 区间

TC-036 PASS：四种篡改各自使脚本退出码 ≠ 0，未篡改副本退出码 0
```

**结论**：`check-cases.mjs` 不是永真脚本；AC-27 的正向（65 条 / 分布 / 长度）与负向（四种篡改）双向成立。

### 13.17 口径复核与证据刷新（ZACHTD-14 · 第二轮）

> 本轮口径：**只改口径与证据，不改任何判定**。三段复核都落成**本轮自己跑出来的原始输出**，不引用开发侧贴的结论：
> - (a) 静态只读（`grep`）：AC-37 按 PRD v1.5 三段式；
> - (b) 静态只读（`git grep` / `wc` / `strings`）：AC-67 的「凭据 / 文本」分账 + 产物侧前端字节与二进制 `strings` 的分账；本轮把追踪扫描从 `grep $(git ls-files)` 换成 `git grep`（原因与 stderr 见该节）；
> - (c) **复跑 `node scripts/check-sync.mjs`**：S1 白名单闭环后的证据刷新（**这是证据刷新，不是 TC 复跑**——TC-080 的判定不因断言数变化而改，改的只是它引用的证据强度）。

**（a）AC-37 · PRD v1.5 附录 B.7 三段式**

```console
$ grep -nE "DROP |ALTER " src-tauri/src/lib.rs && echo "FOUND FORBIDDEN SQL" || echo "LIB.RS CLEAN"
LIB.RS CLEAN

$ grep -rnE "DROP (TABLE|INDEX)|RENAME TO" src-tauri/migrations/ && echo "FOUND DESTRUCTIVE SQL" || echo "MIGRATIONS CLEAN"
MIGRATIONS CLEAN

$ grep -rn "CREATE TABLE" src-tauri/migrations/ | grep -v "IF NOT EXISTS" && echo "FOUND BAD CREATE" || echo "CREATE OK"
CREATE OK
```

**读法**：第 ① 段的 `"DROP |ALTER "`（带尾空格）只能作用于 `lib.rs`；**把它扩到 `migrations/` 就会命中 v3 的 `ADD COLUMN`**，那正是旧口径两头都不对的地方（扫太窄 → 永真；扫太宽 → 必然红）。三段各自的禁止对象是「改写历史迁移 / `DROP` / 重建 / 改名 / 裸 `CREATE TABLE`」，`ALTER TABLE … ADD COLUMN` 是**明确允许**的。

**（b）AC-67 · 凭据 / 文本分账（tracked 全量 + 产物）**

```console
$ git grep -n -E "service_role|SUPABASE_SERVICE"
…（命中行不计数——随本报告自身增长；命中文件 7 个，不逐行贴）
$ git grep -l -E "service_role|SUPABASE_SERVICE" | wc -l
7
$ git grep -n -E "service_role|SUPABASE_SERVICE" -- sync.config.example.json
sync.config.example.json:5:  "anonKey": "<在这里填 anon public key（legacy JWT 且 role 为 anon，或 sb_publishable_ 前缀）；其它形态一律被拒并停在「未配置」，这是预期行为，绝不要填 service_role>"
$ git grep -n -E "eyJ[A-Za-z0-9_-]{10,}"
scripts/check-sync.mjs:218:const ADMIN_ROLE_KEY = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
$ git ls-files | grep -iE "\.env|secret|credential|\.pem|\.key$" | wc -l
0
```

**stderr（照贴）**：以上五条命令的 `stderr` **均为空**——`git grep` 只搜 tracked 内容、自己处理路径引用，不会出现下面那种报错。

**为什么换命令（上一轮的证据卫生问题，必修）**：旧写法 `grep -rnI "…" $(git ls-files)` 有两个洞，实测输出：

```console
$ grep -rnI "service_role\|SUPABASE_SERVICE" $(git ls-files) 2>&1 >/dev/null | head
grep: CLAUDE.md: No such file or directory
grep: "videos/日程待办-产品功能巡览.webm": No such file or directory
```

1. `$(...)` 展开后中文路径**带引号**进参数，`grep` 把它当字面文件名 → 那个跟踪文件（`videos/` 里的 webm）被**静默跳过**，所以「tracked 全量」实际**漏 1 个文件**；
2. `CLAUDE.md` 在盘上是删除态（`git status` = `D`），再报一次 `No such file`。

结论不受影响（漏的是视频二进制，里面不可能有密钥），但**「全量」二字和"把 stderr 洗掉"这两点都不诚实**——上一轮的贴法把这两行吞了。改用 `git grep` 后同一口径得到 **7 文件**（与 Leader 复跑一致），且 `stderr` 为空可以如实写。`CLAUDE.md` 的删除态属 S9 提交清单要单独决定的事项，本报告只把它当作"已不在盘上"的事实，不再作为命令输入。

```console
$ grep -rac "service_role" dist/
dist//index.html:0
dist//assets/index-DjAB6kqC.css:0
dist//assets/index-BRnvPgOX.js:0
$ grep -aoc "sb_publishable_" dist/assets/*.js
1
$ strings "…/日程待办.app/Contents/MacOS/todo" | grep -c "未配置同步"
0
$ strings "…/日程待办.app/Contents/MacOS/todo" | grep -c "service_role"
0
```

**账**：**凭据 0 / 文本 1**。

| 计数 | 值 | 说明 |
| --- | --- | --- |
| 裸 grep（tracked 全量） | **两位数行 / 7 文件（不给绝对值，不作判据）** | 行数随本报告自身增长（本轮实测 39 → 43）；差异全来自文档编辑。命中文件固定为 README / PRD / 设计 / 计划 / 验证文档 / 本报告 |
| 值位命中 | **1**（`sync.config.example.json:5`） | 占位说明「绝不要填 `service_role`」 |
| JWT 形态命中 | 1（`scripts/check-sync.mjs:218`） | **负向夹具**：`role: supabase_admin`、签名段字面量 `sig`，不可用。行号未变，「§13.10 引用行号」仍成立 |
| 前端字节（`dist/`，真判据） | **0**，带正控 | 正控 `sb_publishable_` = 1，证明扫描器确实读到了 JS 里的字符串，不是空扫 |
| 二进制 `strings` | 0 | 只覆盖 **Rust 层 + 未压缩资源**；对照实验：「未配置同步」在 `dist/` = 1、在二进制 = 0，证明前端字符串是压缩嵌入的 |
| 密钥文件 | 0 | — |
| **可用凭据** | **0** | — |

**（c）S1 白名单 · 已闭环（2026-11-01 复跑，本轮自己跑）**

```console
$ node scripts/check-sync.mjs
── ① 5 秒防抖推送（TC-065 / TC-066 / TC-067）
   ✓ ① 5 秒防抖推送（TC-065 / TC-066 / TC-067） PASS（23 项断言）
── ② 启动拉取合并 / 登录后立即拉取（TC-068 / TC-069）
   ✓ ② 启动拉取合并 / 登录后立即拉取（TC-068 / TC-069） PASS（4 项断言）
── ③ LWW 与同毫秒稳定序（TC-070 / TC-071 / TC-072）
   · R-T-13 已登记：updated_at_ms 取客户端时钟，快 6 小时的设备会一直胜出
   ✓ ③ LWW 与同毫秒稳定序（TC-070 / TC-071 / TC-072） PASS（8 项断言）
── ④ 墓碑终结与软删除（TC-073 / TC-074 / TC-075）
   ✓ ④ 墓碑终结与软删除（TC-073 / TC-074 / TC-075） PASS（9 项断言）
── ⑤ 401 失效 → 刷新重试 / 刷新失败重登（AC-58 会话语义）
   ✓ ⑤ 401 失效 → 刷新重试 / 刷新失败重登（AC-58 会话语义） PASS（9 项断言）
── ⑥ 未配置时零请求（AC-57）
   ✓ ⑥ 未配置时零请求（AC-57） PASS（2 项断言）
── v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列）
   ✓ v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列） PASS（20 项断言）

✓ 同步自检 PASS：78 项断言，六组路径 + v3 迁移结构证据全部通过
  NOT-VERIFIED：真实 Supabase 读写、真实 GitHub OAuth 往返、云侧 RLS 越权不可见
```

**断言数怎么从 75 变成 78**：新增的 3 条是配置白名单的前置断言（`sb_secret_…` 必须被拒 / 拒绝时必须给原因 / `sb_publishable_` 必须放行）。它们写在模块顶部、**只在失败时抛错、通过时不出行**，所以尾部输出里看不到——所以我另外用一次矩阵调用把各类形态的可读证据补上（§13.10 ④，八行「放行 / 拒绝 + 原因」；下表摘其中的判定口径行）。

**白名单形态（2 放行 / 3 拒绝，证据口径写死）**

| 形态 | 期望 | 实测 |
| --- | --- | --- |
| legacy JWT 且 `role === 'anon'` | 放行（`enabled = true`） | ✅ `true … OK` |
| `sb_publishable_` 前缀 | 放行 | ✅ `true … OK` |
| `sb_secret_…`（新版服务端密钥，非 JWT） | 拒绝 + 给原因 | ✅ `false … 只接受 anon 角色的 JWT 或 sb_publishable_ 前缀的密钥` |
| `service_role` / `supabase_admin` 角色的 legacy JWT | 拒绝 | ✅ 同上 |
| JWT 无 `role` 声明 / 任意非 JWT 串 | 拒绝 | ✅ 同上 |

**边界（不许漂移）**：`sb_publishable_` 是**前缀放行**——任何该前缀的串都会 `enabled = true`。这不是漏洞（公开密钥无权限提升，服务端会拒无效 key），但边界必须写成「**只有这两个形态**」，不得扩成「任意 `sb_` 前缀」或「任意 JWT」。

**其它脚本复跑（顺带确认报告引用的数字没变）**：`node scripts/check-sync-extra.mjs` → 37 项断言 PASS；`node scripts/check-deleted-filter.mjs` → 扫描 33 个源文件、5 条读取语句（4 条为同步网关全量读取）PASS。

---

## 14. AC-01 ~ AC-68 统一判定台账（68 行）

> 本节是 **M2 台账统一**的产物（ZACHTD-14）：把 §3（S7，AC-01~56）与 §13（S10.5，AC-43 重判 + AC-57~68）两段结论**并成一张可逐条引用的账**。**一行都没有改判**；只修了附录 A.2 的重复计数，并新增两条「判定含义注」。
>
> 本轮边界：只改测试文档，**不动 `src/`、不 commit、不 push、不重跑任何用例**（§13.17 的三条只读复核不计为 TC 复跑）。

**读这张表之前先读四条口径**

1. **68 = 56 + 12**：AC-01 ~ AC-56（56 条）+ AC-57 ~ AC-68（12 条）。**AC-43 是 AC-01~56 段内的重判，不是第 13 条**，在 68 条里只计一次。合计 = 55 PASS + 1 BLOCKED（AC-41）+ 11 PASS + 1 NOT-VERIFIED（AC-65）= **66 / 0 / 1 / 1**。
2. **`66 PASS` ≠ 66 条都有完整证据。** 其中 **4 条是「主判 PASS + 子项 `NOT-VERIFIED`」**：**AC-58**（TC-062 真实已登录态截图）、**AC-59**（TC-064 真实 GitHub OAuth 往返）、**AC-66②**（云侧 RLS 越权）、**AC-68**（CI 实际运行结果）。Leader 本轮点名的是 AC-66② 与 AC-68 CI 两条；AC-58 / AC-59 是同一形态，一并列明——**口径不能比事实窄**，否则这张表比不写更危险。（AC-65 是**整条** NOT-VERIFIED，不计入 PASS。）
3. **AC-67 的账是「凭据 0 / 文本 1」**（§13.10 / §13.17-b），不是「三处均无命中」；**产物侧分两笔**（前端字节看 `dist/` 带正控，二进制 `strings` 只覆盖 Rust 与未压缩层）。**S1 白名单已闭环**（`config.ts:63-66/98` + `check-sync.mjs` 78 项断言；2 放行 / 3 拒绝的形态矩阵见 §13.17-c）。
4. **「主判 PASS + 辅助项 BLOCKED」不减判**：AC-15 / AC-19 / AC-23 / AC-29 / AC-34 / AC-40 / AC-47 / AC-55 等桌面取证项按 §0 判定纪律记 `BLOCKED（环境：TCC 未授权）`，不改变 AC 判定；主 TC 完全依赖人工桌面操作时才判 BLOCKED（本轮唯一一条：AC-41）。

| AC | 判定 | 证据段落 | 用例号（主 / 辅） |
| --- | --- | --- | --- |
| AC-01 | **PASS** | §2.1 · §3 | TC-001 / TC-002 |
| AC-02 | **PASS** | §3 | TC-003 / TC-004 |
| AC-03 | **PASS** | §2.4 · §13.3 | TC-005 / — |
| AC-04 | **PASS** | §2.4 · §3 | TC-006 / TC-007 |
| AC-05 | **PASS** | §3 | TC-008 / — |
| AC-06 | **PASS** | §3 | TC-009 / TC-010 |
| AC-07 | **PASS** | §3 | TC-011 / — |
| AC-08 | **PASS** | §3 | TC-012 / — |
| AC-09 | **PASS** | §3 | TC-013 / — |
| AC-10 | **PASS** | §3 | TC-014 / — |
| AC-11 | **PASS** | §3 | TC-015 / — |
| AC-12 | **PASS** | §3 | TC-016 / — |
| AC-13 | **PASS** | §3 | TC-017 / TC-018（桌面点击段 BLOCKED） |
| AC-14 | **PASS** | §3 | TC-019 / TC-020 |
| AC-15 | **PASS** | §3 | TC-021 / TC-022（BLOCKED） |
| AC-16 | **PASS** | §3 | TC-023 / — |
| AC-17 | **PASS** | §3 | TC-024 / — |
| AC-18 | **PASS** | §3 | TC-025 / — |
| AC-19 | **PASS** | §3 | TC-026 / TC-027 |
| AC-20 | **PASS** | §3 | TC-028 / — |
| AC-21 | **PASS** | §3 | TC-029 / — |
| AC-22 | **PASS** | §4.3 | TC-030 / — |
| AC-23 | **PASS** | §3 · §4.3 | TC-031 / — |
| AC-24 | **PASS** | §2.3 | TC-032 / — |
| AC-25 | **PASS** | §3 | TC-033 / — |
| AC-26 | **PASS** | §2.2 · §3 | TC-034 / TC-035 |
| AC-27 | **PASS** | §2.2 · §13.16 | TC-035 / TC-036（负向，§13.16） |
| AC-28 | **PASS** | §3 | TC-037 / — |
| AC-29 | **PASS** | §3 | TC-038 / TC-039 · TC-040（桌面 BLOCKED） |
| AC-30 | **PASS** | §3 | TC-041 / — |
| AC-31 | **PASS** | §3 | TC-042 / — |
| AC-32 | **PASS** | §3 | TC-043 / — |
| AC-33 | **PASS** | §3 | TC-044 / — |
| AC-34 | **PASS** | §4.1 · §13.9 | TC-045 / — |
| AC-35 | **PASS** | §2.5 · §3 | TC-046 / — |
| AC-36 | **PASS** | §4.2 | TC-047 / — |
| AC-37 | **PASS** | §13.17-a（v1.5 三段式）· §3 | TC-048 / — |
| AC-38 | **PASS**（取证对象 03:17 构建 · 已入废纸篓） | §4.4 · §4.0 | TC-049 / — |
| AC-39 | **PASS**（形态按 **07:21/07:22 构建**复测；S7.6 重建后数字见 §0.4） | §4.5 · §4.0 · §0.4 | TC-050 / TC-051 |
| AC-40 | **PASS**（取证对象 03:17 构建 · 已入废纸篓） | §3 · §4.0 | TC-052 / — |
| AC-41 | **BLOCKED** | §7.2 · §13.13 | TC-053 / — |
| AC-42 | **PASS** | §3 · §13.11 | TC-054 / — |
| AC-43 | **PASS**（重判，S7 结论作废） | §13.7 | TC-055 ①② / — |
| AC-44 | **PASS** | §3 | TC-056 / — |
| AC-45 | **PASS** | §3 | TC-013 / — |
| AC-46 | **PASS** | §3 | TC-015 / — |
| AC-47 | **PASS** | §3 | TC-019 / — |
| AC-48 | **PASS** | §3 | TC-026 / — |
| AC-49 | **PASS** | §3 | TC-026 / — |
| AC-50 | **PASS** | §3 | TC-016 / — |
| AC-51 | **PASS** | §3 | TC-028 / — |
| AC-52 | **PASS** | §3 | TC-037 / — |
| AC-53 | **PASS** | §3 | TC-041 / — |
| AC-54 | **PASS** | §3 | TC-043 / — |
| AC-55 | **PASS** | §2.5 · §3 | TC-046 / — |
| AC-56 | **PASS** | §3 | TC-056 / — |
| AC-57 | **PASS** | §13.5 · §13.6 路径 1/8 | TC-057 / TC-058 · TC-059 · TC-060 |
| AC-58 | **PASS**（子项 NV：TC-062 真实登录态截图） | §13.4（S3/S4）· §13.6.2 ③ | TC-061 / TC-062 |
| AC-59 | **PASS**（子项 NV：TC-064 真实 OAuth 往返） | §13.5 · §13.6 | TC-063 / TC-064 |
| AC-60 | **PASS** | §13.6.2 ④ · §13.6.1 ① | TC-065 / TC-066 · TC-067 |
| AC-61 | **PASS** | §13.6.1 ② | TC-068 / TC-069 |
| AC-62 | **PASS** | §13.6.1 ③ | TC-070 / TC-071 · TC-072 |
| AC-63 | **PASS** | §13.6.1 ④ | TC-073 / TC-074 · TC-075 |
| AC-64 | **PASS** | §13.9 · §13.6.1 迁移段 | TC-076 / TC-077 |
| AC-65 | **NOT-VERIFIED** | §13.12 | TC-078 / — |
| AC-66 | **PASS**（①；② 子项 NV） | §13.5 · `supabase/schema.sql:31/36/41/45/46/50` | TC-079 ① / TC-079 ② |
| AC-67 | **PASS**（账：凭据 0 / 文本 1；S1 已闭环） | §13.10 · §13.17-b · §13.17-c | TC-080 / — |
| AC-68 | **PASS**（静态三证；CI 结果 NV） | §13.8 | TC-055 扩展断言 ③④⑤ / — |

**小计（与附录 A 对得上）**：68 行 → **66 PASS / 0 FAIL / 1 BLOCKED / 1 NOT-VERIFIED**；其中 4 条 PASS 带子项 NV（AC-58 / AC-59 / AC-66② / AC-68）。

### 14.1 判定含义注（两条，防止把判据读成永真）

- **AC-37 · PASS 的含义是「没有改写历史迁移、没有破坏性动作」，不是「文件里不出现 `ALTER`」。** 按 PRD v1.5 附录 B.7 三段式：① `src-tauri/src/lib.rs` 内 v1/v2 内联迁移无 `DROP` / `ALTER`（`LIB.RS CLEAN`）；② `src-tauri/migrations/` **允许** `ALTER TABLE … ADD COLUMN`，禁止 `DROP TABLE` / `DROP INDEX` / `RENAME TO`（`MIGRATIONS CLEAN`）；③ 新增迁移里的 `CREATE TABLE` 必须带 `IF NOT EXISTS`（`CREATE OK`）。所以「v3 加了 `ADD COLUMN`」**不构成违约**；反过来，把判据缩到只扫 `lib.rs` 又会让这条 AC 变成**永真**——两头都不是合格的判据。
- **AC-43 · PASS 的含义是「没有无归属的 Windows 残留」，不是「出现 `nsis` 就算错」。** `nsis` / `msi` / `%APPDATA%` / `currentUser` 出现在 `tauri.windows.conf.json`、`.github/workflows/build.yml`、`scripts/check-bundle-config.mjs` 与交付说明里**是应有内容**（正向断言归 AC-68）；被禁的只是它们出现在**基础配置**（`tauri.conf.json`）与**运行时代码**（`src/`、`e2e/`）里。判断残留时要看「**这个平台专属词有没有归属**」，不是看「这个词有没有出现」。

### 14.2 三轮改动（台账统一 / 口径复核 / 收尾对齐）

| 轮次 | 文件 | 改了什么 |
| --- | --- | --- |
| **第一轮**（M2 台账统一） | `docs/test/ZACHTD-2-test-report.md` | 新增 §14（68 行台账 + 两条判定含义注 + 四条口径）、§13.17；改 §0.1 算术口径、§3 AC-37 行、§13.5 TC-080 行、§13.10、§13.11 AC-37 行、§13.14 观察 1·2、附录 A.1/A.2/A.3（A.2 从「13 条」改「12 条新增」，A.1+A.2 = 68） |
| **第二轮**（口径与证据） | 同上 | ① 新增 **§4.0 产物身份与时效**（03:17 / 05:41 / 07:21 三份构建谁验了什么）；② **§4.5 按 07:21/07:22 构建重测**（dmg `3285579` → **`3309469`**，附 md5 对比）；③ §13.10 重写为「源码值位 / tracked 分账 / **产物两笔账（`dist/` 带正控 vs `strings`）** / **S1 白名单已闭环**」；④ §13.17-c 补 `check-sync.mjs` **78 项断言**原始输出与白名单形态矩阵（2 放行 / 3 拒绝）；⑤ 行数口径去绝对化（**不给行数**——本轮实测 39 → 43、随文档自增；判据只挂「值位 1 行 / 凭据 0」）；⑥ §3 AC-38/AC-39/AC-40 行、§13.2 产物行、§12 偏差表两行、§0.1、A.2 断言数（75 → 78）、§14 口径 3 与三行台账同步 |
| **第三轮**（收尾五件，本轮） | 同上 | ① §13.10 ① / §13.17-b 按实际重贴 `sync.config.example.json:5` 的新文案（值位仍 **1 行**，「凭据 0 / 文本 1」不变）；② §4.0 重写：03:17 与 `todo.app`（00:10）**已入废纸篓**、`/Applications` 与 `bundle` 现为同一份 07:21 字节（md5 相同）、05:41 已被覆盖；口径 3 改成「旧两份已入废纸篓，验收时倒掉」并如实标注「Trash 目录我列不了」；③ 报告头部与附录 A.3 的判定基线 **v1.5 → v1.6**；④ 证据卫生：追踪扫描改 `git grep -n -E`（旧 `grep $(git ls-files)` 会漏带引号的中文路径、并对已删除的 `CLAUDE.md` 报错），**stderr 照贴**，行数不再作判据；⑤ `supabase/schema.sql:10` 换占位后复核策略行号（31/36/41/45/46/50 未变）；⑥ §4.5 补 dmg md5、§13.2 产物行与 §3 AC-38/AC-40 的构建身份同步 |
| **第四轮**（S7.5 / S7.6，`ZACHTD-15` / `ZACHTD-16`） | 同上 + `README.md` / `src-tauri/tauri.macos.conf.json` / `scripts/check-bundle-config.mjs` / `docs/verification/**` | ① 新增 §0.3 / §0.4 与 `desktop/S7.5-evidence.md`、`desktop/S7.6-evidence.md`、`M-00/M-01-a/M-01-b/M-01-c/M-04-a/M-10-a` 六张截图；② §1 签名行、§4.0 构建表、§4.5 时效说明按 **10:35 / 10:36** 重建结果同步；③ §6 回填 **M-01 PASS / M-14 PASS**，小计改为 PASS 5 · PARTIAL 1 · BLOCKED 8；④ §7.2 / §13.13 / §13.14-8 补「S7.6 已处置」注；⑤ README §2 按实测现象重写 Gatekeeper 三情形、分发源字节数 / md5 更新为 10:35 构建。**AC 判定一条未变**（66 / 0 / 1 / 1） |

**未改动（第一~三轮的范围）**：`src/**`、`src-tauri/**`、`e2e/**`、`e2e-sync/**`、`scripts/**`、`package.json`、`README.md`、`supabase/**` 一行未动。**S7.6 起本条需要按轮次读**：第四轮只改 `src-tauri/tauri.macos.conf.json`（加 `signingIdentity: "-"`）、`README.md`、`scripts/check-bundle-config.mjs`（新增一条断言）与验证文档，业务代码、E2E 断言未动。任何 AC 判定未变：68 行仍是 66 PASS / 0 FAIL / 1 BLOCKED / 1 NOT-VERIFIED。

> 前三轮的收口说明：计划文档的 A-12、PRD 的版本号与 changelog、README、示例文件、`supabase/schema.sql` 的注释占位、`/Applications` 的产物收口，**均已由开发侧在 S12 完成**；本报告只按改完的事实回填证据（不替开发侧写结论）。

---

## 附录 · 判定计数速查

### A.1 S7 段（AC-01 ~ AC-56）

| 维度 | 数量 |
| --- | --- |
| 本段 AC 总数 | 56（AC-01 ~ AC-56） |
| PASS | **55** |
| FAIL | **0** |
| BLOCKED | **1**（AC-41） |
| NOT-VERIFIED | **0**（AC 级；Windows 3 项另计） |
| 观察（不可达） | 0 条 AC（2 个半句观察项） |
| 通过率 | **55 ÷ 56 = 98.2%**（可判定 56 条；排除 BLOCKED 后 55/55） |
| 其中 AC-43 | 按 PRD v1.4 / v1.5 收窄口径**重判 PASS**（§13.7，S7 旧结论作废）——**是本段内的重判，不新增条目、不另计一条** |
| 人工 checklist | PASS 3 / BLOCKED 10 / 记录 2（M-15/16）（**S7 当时**；S7.5 补跑后 = PASS 3 / PARTIAL 3 / BLOCKED 8 / 记录 2，见 §6） |
| 回归命令 | 4 组全绿（build / check-cases / check-permutation / playwright 6 passed） |

### A.2 S10.5 段新增（AC-57 ~ AC-68）

> **口径修正（ZACHTD-14 · M2）**：本表只覆盖 **AC-57 ~ AC-68 这 12 条新增 AC**。AC-43 是 AC-01~56 段内的**重判**（已计入 A.1 的 55 PASS），**不得**在这里再算一次——旧版 A.2 写「13 条 = AC-43 重判 + AC-57~AC-68」，导致 A.1 + A.2 = 69，与 A.3 的 68 对不上。数字结论本来就是对的，错的是附录口径。

| 维度 | 数量 |
| --- | --- |
| 本段**新增** AC 总数 | **12**（AC-57 ~ AC-68）；AC-43 不属本表（重判，见 A.1） |
| PASS | **11**（AC-57 ~ AC-64 = 8、AC-66① = 1、AC-67 = 1、AC-68 静态三证 = 1） |
| FAIL | **0** |
| NOT-VERIFIED | **1**（AC-65）；另有**子项 NV 4 条**：AC-58（TC-062 真实登录态截图）、AC-59（TC-064 真实 OAuth 往返）、AC-66②（云侧越权）、AC-68 的 CI 实际结果——子项不计入 AC 级 NV |
| BLOCKED | **0 条 AC**（AC-41 / M-09 / M-11 / AC-34·AC-55 的桌面 UI 变体仍按 §13.13 记 BLOCKED，不计入本段 AC） |
| 同步用例 | TC-057 ~ TC-080：PASS **21** / FAIL **0** / NOT-VERIFIED **3**（TC-064 / TC-078 / TC-079②） |
| 同步套件 | `npx playwright test -c playwright.sync.config.ts` → **4 passed**（主套件另计 6 passed） |
| stub 断言 | `check-sync.mjs` **78 项**（S1 前 75，+3 条白名单断言）+ `check-sync-extra.mjs` **37 项**，全部通过 |
| 通过率 | **11 ÷ 12 = 91.7%**（排除 NOT-VERIFIED 后 11/11 = 100%） |
| 与 A.1 的合计 | 56 + 12 = **68**，与 A.3 一致（不再出现 69） |

### A.3 全量合计（68 条）

| 维度 | 数量 |
| --- | --- |
| AC 总数 | **68**（AC-01 ~ AC-68，PRD **v1.6**；条数自 v1.4 起未变） |
| 组成 | **56（AC-01 ~ AC-56）+ 12（AC-57 ~ AC-68）= 68**；AC-43 只计一次（重判） |
| PASS | **66**（= 55 + 11） |
| FAIL | **0** |
| BLOCKED | **1**（AC-41） |
| NOT-VERIFIED | **1**（AC-65） |
| 带子项 NV 的 PASS | **4 条**（AC-58 / AC-59 / AC-66② / AC-68 CI）——`66 PASS` **不等于** 66 条都有完整证据（§14 口径 2） |
| 通过率 | **66 ÷ 68 = 97.1%**（排除 BLOCKED 与 NOT-VERIFIED 后 66/66 = 100%） |
| AC-01 ~ AC-56 是否回归 | **0 条被推翻、0 条降级**（§13.11） |
| 四组回归 | 两轮全绿（§2 与 §13.3）；同步套件单独 4 passed（§13.4） |
