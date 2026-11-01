# S6 桌面取证 · 人工 checklist · 数据复核

> 执行日期：2026-11-01（CST）
> 执行环境：macOS 14.1（23B2073）/ Apple Silicon（arm64）/ Node 22.21.1 / Rust 1.92.0 / Swift 5.10
> 关联任务：T-15（打包）、T-16（交付说明）、T-17（桌面取证）、T-18（数据复核）、T-19（自检）
> 关联 AC：AC-34 / AC-36 / AC-38 / AC-39 / AC-40 / AC-41 / AC-43 / AC-44

**一句话结论**：打包、产物形态、启动、数据落盘与升级不丢数据**已在本机实测通过**；
需要像素或手势的人工项（M-02/03/04/05/06/07/08/09/11 等）**被 macOS TCC 挡住**
（本进程 `AXIsProcessTrusted=false`、`CGPreflightScreenCaptureAccess=false`），
按任务要求标 **BLOCKED + 复现命令**，不冒充「已验证」。Windows 产物**未在本机验证**。

---

## 1. TCC 授权现状（所有 BLOCKED 的根因）

```console
$ swift scripts/mac-desktop-probe.swift
PROBE tcc.accessibility = false
PROBE tcc.screen-recording = false
PROBE app.running = true
PROBE app.pid = 35986
PROBE app.bundle-id = com.poisson.todo
PROBE app.name = 日程待办
PROBE app.path = /Applications/日程待办.app
PROBE app.activation = regular
PROBE window.count = 1
PROBE window.number = 164241
PROBE window.bounds = 1100x720
PROBE window.title = BLOCKED (AX error -25211)
PROBE menubar.items = BLOCKED (AX error -25211)
```

两种失败的表现与含义（**不是应用缺陷**）：

| 能力 | 未授权时的表现 | 影响的人工项 |
| --- | --- | --- |
| 屏幕录制 | `screencapture -l<窗口号>` → `could not create image from window`；全屏抓图只剩壁纸，窗口内容被系统抹掉 | M-01 拦截截图、M-08 模糊、M-11 渐隐、M-10 Dock、M-07 原生控件 |
| 辅助功能（AX） | `osascript ... System Events` → `-1719 / -1728`；AX 读取窗口标题、菜单栏 → `-25211` | M-02/03/05/06 手势与失焦、M-04 菜单栏与快捷键、M-09 断网操作 |

抓图失败的真实输出：

```console
$ bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/01-launch.png
窗口号: 164241
could not create image from window
BLOCKED: screencapture 无法从窗口 164241 取图 —— 通常是系统未授予「屏幕录制」权限。
         确认命令: swift scripts/mac-desktop-probe.swift | grep tcc.screen-recording
```

> 因此本阶段**不产出桌面窗口截图**，也不把浏览器（Chromium）截图冒充桌面截图。
> 桌面渲染的像素级证据仍是未完成项，补跑路径见 §7。

---

## 2. 产物证据（AC-39）

```console
$ npm run tauri build
    Finished `release` profile [optimized] target(s) in 54.38s
    Bundling 日程待办.app (.../bundle/macos/日程待办.app)
    Bundling 日程待办_0.1.0_aarch64.dmg (.../bundle/dmg/日程待办_0.1.0_aarch64.dmg)
    Finished 2 bundles at:
        .../bundle/macos/日程待办.app (6.11 MiB)
        .../bundle/dmg/日程待办_0.1.0_aarch64.dmg (3.13 MiB)
```

绝对路径（本机）：

| 产物 | 路径 |
| --- | --- |
| `.app` | `/Users/zachary/Desktop/work/todo/src-tauri/target/release/bundle/macos/日程待办.app` |
| `.dmg` | `/Users/zachary/Desktop/work/todo/src-tauri/target/release/bundle/dmg/日程待办_0.1.0_aarch64.dmg` |

DMG 内容实证（证明交付说明里「拖入 Applications」这条路径是真的，不是照抄模板）：

```console
$ hdiutil attach -nobrowse -readonly "…/日程待办_0.1.0_aarch64.dmg"
/dev/disk13s1  Apple_HFS  /Volumes/日程待办
$ ls -la "/Volumes/日程待办"
drwxr-xr-x  … 日程待办.app
lrwxr-xr-x  … Applications -> /Applications
-rw-r--r--  … .VolumeIcon.icns
```

产物形态与最低版本（`lipo` / `plutil`）：

```console
$ lipo -archs "…/日程待办.app/Contents/MacOS/todo"
arm64

$ plutil -p "…/日程待办.app/Contents/Info.plist" | grep -E 'LSMinimumSystemVersion|CFBundleIdentifier|CFBundleDisplayName'
  "CFBundleDisplayName" => "日程待办"
  "CFBundleIdentifier" => "com.poisson.todo"
  "LSMinimumSystemVersion" => "12.0"
```

> 可执行文件名为 `todo`（来自 `Cargo.toml` 的 package name，ASCII 名更安全），
> 窗口与 Finder 里显示的名字取自 `CFBundleDisplayName` / `CFBundleName` = 「日程待办」。

图标（`npx tauri icon` 生成全套：`icon.icns` / `icon.ico` / 32·64·128·128@2x png 与 Windows Square* 族）。
源图是仓库原有的 `src-tauri/icons/icon.png`（512×512，矢量风格图形），先用 `sips -z 1024 1024`
放大到 **1024×1024** 再喂给 `tauri icon`（`tauri icon` 要求 1024 源；放大不做重绘，图形本身未改动）。
`.app` 内图标与生成结果同源：

```console
$ shasum -a 256 "/Applications/日程待办.app/Contents/Resources/icon.icns" src-tauri/icons/icon.icns
fb62842f…d709  /Applications/日程待办.app/Contents/Resources/icon.icns
fb62842f…d709  src-tauri/icons/icon.icns
```

签名与 Gatekeeper（**预期就是 rejected**）：

```console
$ codesign -dv "/Applications/日程待办.app" 2>&1 | grep -E 'Identifier|Signature|Format|TeamIdentifier'
Identifier=todo-00813bc1339b37e6
Format=app bundle with Mach-O thin (arm64)
Signature=adhoc
TeamIdentifier=not set

$ spctl --assess -vv "/Applications/日程待办.app"
/Applications/日程待办.app: code has no resources but signature indicates they must be present
$ echo $?
1

$ xattr -l "/Applications/日程待办.app"   # 本机构建，无 quarantine 属性
（空）
```

撤销隔离属性的命令在临时副本上实测可用（不真去打开被隔离的副本，避免弹出需要人工确认的系统对话框）：

```console
$ xattr -w com.apple.quarantine "0081;1793474323;Safari;" "$TMP/日程待办.app"
$ xattr -p com.apple.quarantine "$TMP/日程待办.app"
0081;1793474323;Safari;
$ xattr -dr com.apple.quarantine "$TMP/日程待办.app"
$ xattr -p com.apple.quarantine "$TMP/日程待办.app"
xattr: …: No such xattr: com.apple.quarantine
```

---

## 3. 启动证据（AC-40）

```console
$ ditto "…/bundle/macos/日程待办.app" "/Applications/日程待办.app"
$ open -a "/Applications/日程待办.app"
$ pgrep -lf "/Applications/日程待办.app/Contents/MacOS/todo"
35986 /Applications/日程待办.app/Contents/MacOS/todo

$ swift scripts/mac-window-id.swift 日程待办
窗口号	layer	尺寸		属主	标题
164241	0	1100×720	日程待办	
```

可断言的事实：进程存活、**有一个 1100×720 的普通窗口（layer 0）**、窗口属主显示名为「日程待办」、
bundle id `com.poisson.todo`、`activationPolicy = regular`（系统按普通 GUI 应用对待）。
**窗口标题文本、界面是否全中文、默认是否停在日历模块**需要 AX / 截图，均被 TCC 挡住 → 见 M-04 / M-07 / §7。

---

## 4. 人工 checklist M-01 ~ M-14 执行结果

> 口径（Leader 2026-11-01）：M-01 ~ M-14 本阶段真机执行；M-15 / M-16 属同步侧，留 S10.5，
> **本文不判 PASS / FAIL**。状态取值：`PASS`（机器证据）/ `PARTIAL`（部分可验，列出缺哪一半）/
> `BLOCKED`（系统权限挡住，附复现命令）/ `未执行`（需要人来做，非权限问题）。
> 硬项为 M-01 / M-08 / M-11：M-08 与 M-11 目前是 **BLOCKED**，因此本次**不签署**「人工 checklist 全通过」。

> **状态时效（S7.6 补注）**：本表是 S6 的快照。S7.5（屏幕录制授权）与 S7.6（ad-hoc 签名 + quarantine 复测）
> 之后的最新状态以 `docs/test/ZACHTD-2-test-report.md` §6 为准：**M-01 PASS**、**M-10 PASS（Dock 部分）**、
> **M-04 PARTIAL**、**M-14 PASS**，其余 BLOCKED 不变。原始输出见 `desktop/S7.5-evidence.md` 与
> `desktop/S7.6-evidence.md`。

| # | 检查项 | 状态 | 证据 / 说明 |
| --- | --- | --- | --- |
| M-01 | Gatekeeper 首启与 `xattr` 处置 | **PARTIAL** | 已验：`spctl --assess` → `rejected`（预期）、`codesign` → `adhoc`、`xattr -dr com.apple.quarantine` 在副本上实测可清除属性。未验：**首次双击被拦的系统对话框**（本机构建无 quarantine 属性，且对话框需人工点「打开」，见 §7 步骤 3） |
| M-02 | Control + 点击打开菜单 | **BLOCKED** | 需要合成点击（AX / CGEvent 均需「辅助功能」授权，本机 `false`）；且任务禁止坐标合成点击 |
| M-03 | 双指点按打开菜单 | **BLOCKED** | 同上；还需读取「辅助点按」系统设置（AX） |
| M-04 | 系统菜单栏项与 `⌘Q` / `⌘C` / `⌘V` | **BLOCKED** | `menubar.items = BLOCKED (AX error -25211)`；菜单栏为框架默认英文已写入交付说明（README 一·3），但**未能用像素证据确认** |
| M-05 | 菜单在窗口失焦时关闭 | **BLOCKED** | 需要真实切到别的应用（AX / 合成点击） |
| M-06 | 改变窗口尺寸时菜单关闭 | **BLOCKED** | 需要拖动窗口（AX / 合成点击） |
| M-07 | WKWebView 下 `<input type="date">` 渲染与取值 | **PARTIAL** | 代码层已确认使用原生 `<input type="date" data-field="date">`，E2E 断言落库为 `YYYY-MM-DD`；WKWebView 下的**外观**需截图 → BLOCKED |
| M-08 | 编辑器遮罩 `backdrop-filter` 模糊生效（硬项） | **BLOCKED** | 代码层已确认构建产物含 `-webkit-backdrop-filter`（`grep -o -- "-webkit-backdrop-filter" dist/assets/*.css` 命中 1 处）；**真机模糊效果需截图**，本阶段无法签署 |
| M-09 | 断网后完整走一遍三模块 | **未执行** | 需人工关闭 Wi-Fi/以太网并操作；可观侧面证据：`dist/` 内无外部请求地址（仅 XML 命名空间与 `vuejs.org` 报错链接字样），桌面资源全部内嵌，不依赖网络 |
| M-10 | Dock 图标 / Launchpad 收录 | **PARTIAL** | 已验：`activationPolicy = regular`、bundle 位于 `/Applications`、`Contents/Resources/icon.icns` 与生成的源图标 sha256 一致（不是默认 Tauri 占位图，Q-03 关闭）。未验：Dock / 启动台的**视觉**确认 → BLOCKED |
| M-11 | `5w2h` / `rice-scoring` 桌面版内部滚动与渐隐（硬项） | **BLOCKED** | 需在 WKWebView 里滚动并截图对比；Chromium 侧由 E2E 用例 3 覆盖，但**不能替代**桌面签署 |
| M-12 | 桌面版数据落盘路径与 `sqlite3` 复核 | **PASS** | 见 §5：路径、两表、迁移记录、删 `.app` 重装后数据保留，全部有终端输出 |
| M-13 | 中文路径引用（`.app` / `.dmg` 名含中文） | **PASS** | 本次全部命令直接使用含中文的 `"日程待办.app"` / `"日程待办_0.1.0_aarch64.dmg"`，`ditto` / `open -a` / `lipo` / `plutil` / `sqlite3` / `xattr` 均无编码错误 |
| M-14 | 交付说明与实现一致 | **PASS** | 逐条核对见 §6 |
| M-15 / M-16 | 同步侧 | 不判 | 按 Leader 口径留 S10.5；本版不含同步入口 |

---

## 5. 数据复核（AC-34 / AC-36 / AC-38）

### 5.1 路径与两表结构（AC-34）

```console
$ DB="$HOME/Library/Application Support/com.poisson.todo/todo.db"
$ ls -l "$DB"
-rw-r--r--@ 1 zachary  staff  32768 … /Users/zachary/Library/Application Support/com.poisson.todo/todo.db

$ sqlite3 "$DB" ".tables"
_sqlx_migrations  daily_picks       todos

$ sqlite3 "$DB" "PRAGMA table_info(todos);"
0|id|INTEGER|0||1
1|title|TEXT|1||0
2|date|TEXT|1||0
3|priority|INTEGER|1|1|0
4|note|TEXT|1|''|0
5|done|INTEGER|1|0|0
6|created_at|TEXT|1|datetime('now','localtime')|0
7|updated_at|TEXT|1|datetime('now','localtime')|0

$ sqlite3 "$DB" "PRAGMA table_info(daily_picks);"
0|date|TEXT|0||1
1|method_id|TEXT|1||0
2|manual|INTEGER|1|0|0
3|updated_at|INTEGER|1|0|0

$ sqlite3 "$DB" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
1|create_todos_table|1
2|create_daily_picks_table|1
```

迁移版本只为 1、2，**只增不改**；结构里没有任何 `DROP` / `ALTER` 的痕迹（迁移 SQL 静态检查见
`src-tauri/tests/migration_guard.rs` 与 `cargo test --test migration_guard`）。

### 5.2 升级不丢数据 · 双构建法（AC-36）

做法：0.1.0 构建 → 造 5 条待办（跨日期 / 跨月 / 含完成态）+ 1 条 `manual=1` 的 `daily_picks`
→ 版本升到 0.1.1 重新构建 → **覆盖安装**（`ditto` 覆盖 `/Applications/日程待办.app`）→ 启动 → 退出
→ `sqlite3` 快照 `diff`。

```console
# 升级前（0.1.0 安装版，快照已存 docs/verification/data/todos-before-0.1.0.txt）
1|2026-11-01|2|0|升级前 · 今天高优先级
2|2026-11-01|0|1|升级前 · 今天已完成
3|2026-10-31|1|0|升级前 · 昨天
4|2026-11-02|1|0|升级前 · 明天
5|2026-10-15|0|1|升级前 · 上月

# 覆盖安装 0.1.1（plutil 确认版本已变）
$ plutil -p "/Applications/日程待办.app/Contents/Info.plist" | grep CFBundleShortVersionString
  "CFBundleShortVersionString" => "0.1.1"
$ open -a "/Applications/日程待办.app" && sleep 7 && pgrep -lf "/Applications/日程待办.app/Contents/MacOS/todo"
34687 /Applications/日程待办.app/Contents/MacOS/todo
$ sqlite3 "$DB" "SELECT count(*) FROM todos;"
5

# 升级后 diff
$ diff docs/verification/data/todos-before-0.1.0.txt docs/verification/data/todos-after-0.1.1.txt && echo "TODOS UNCHANGED ACROSS UPGRADE"
TODOS UNCHANGED ACROSS UPGRADE
$ diff docs/verification/data/picks-before-0.1.0.txt docs/verification/data/picks-after-0.1.1.txt && echo "PICKS UNCHANGED ACROSS UPGRADE"
PICKS UNCHANGED ACROSS UPGRADE

# 迁移记录在升级后仍为 1、2，未出现任何降级/重建
$ sqlite3 "$DB" "SELECT version, description, success FROM _sqlx_migrations ORDER BY version;"
1|create_todos_table|1
2|create_daily_picks_table|1
```

复核完成后把版本改回 0.1.0 重新构建最终产物（交付版本仍是 0.1.0）。

### 5.3 删除 `.app` 重装数据保留（AC-38）

```console
$ rm -rf "/Applications/日程待办.app"
$ ditto "…/bundle/macos/日程待办.app" "/Applications/日程待办.app" && echo REINSTALLED
REINSTALLED
$ open -a "/Applications/日程待办.app" && sleep 7 && pgrep -lf "/Applications/日程待办.app/Contents/MacOS/todo"
35986 /Applications/日程待办.app/Contents/MacOS/todo
$ sqlite3 "$DB" "SELECT count(*) FROM todos;"
5
$ sqlite3 "$DB" "SELECT date, method_id, manual FROM daily_picks ORDER BY date;"
2026-10-31|mece|1
2026-11-01|conclusion-argument-recommendation|0
```

### 5.4 桌面 SQLite 专项：`daily_picks` 换一条后重启是否同一条（S5 判门追加第 2 条）

**状态：BLOCKED（点击部分）**。要触发「换一条」必须在 WKWebView 里点按钮，本机 `AXIsProcessTrusted=false`，
`osascript` 报 `-1719（不允许辅助访问）`，无法完成真实点击；任务同时禁止坐标合成点击。
缺口与证据严格分开记录：

- **拿不到的证据**：桌面版里点「换一条」→ 退出 → 重启 → 同一条 的**完整操作链**。
- **已拿到的等价证据**（证明「桌面版读写的是同一个库、且重启不改写既有选择」）：
  1. 应用自己写过 `daily_picks`：`2026-11-01|conclusion-argument-recommendation|0` 是桌面版首启时自动落库的行（`manual=0`）；
  2. 该行在**至少 6 次启动/退出、2 次覆盖安装、1 次删除重装**后**整行未变**（`method_id` / `manual` / `updated_at`
     全部不变：`1793474031463` 是首次落库时间，之后每次启动都不会重写它），即启动路径**读而不改**；
  3. 另一条 `2026-10-31|mece|1`（模拟「换一条」后的 `manual=1` 状态）同样在重启与升级后原样保留，
     说明应用启动时**不会**重置用户手动选择的那一条。
- 补跑命令（授权后）：

```bash
# 1) 系统设置 → 隐私与安全性 → 辅助功能 / 屏幕录制，勾选运行本脚本的终端
sqlite3 "$DB" "SELECT date,method_id,manual FROM daily_picks ORDER BY date;" > /tmp/picks-prev.txt
open -a "/Applications/日程待办.app"     # 2) 在「每日工作法」点一次「换一条」
osascript -e 'tell application "System Events" to keystroke "q" using command down'
sleep 2
sqlite3 "$DB" "SELECT date,method_id,manual FROM daily_picks ORDER BY date;" > /tmp/picks-next.txt
diff /tmp/picks-prev.txt /tmp/picks-next.txt   # 期望只有今天那一行的 method_id 变成排列里的下一条，manual=1
open -a "/Applications/日程待办.app"     # 3) 重启后应仍是同一条（manual 保持 1）
```

---

## 6. M-14：交付说明与实现一致性核对

| README 的陈述 | 实现 / 证据 | 结论 |
| --- | --- | --- |
| `.dmg` 拖入 Applications 安装 | `ditto` 安装 + `open -a` 启动成功；DMG 内含 app 与 Applications 快捷方式布局（conf 的 `dmg.appPosition` / `applicationFolderPosition`） | 一致 |
| Gatekeeper 三种情形；`spctl` 返回 `rejected` 属预期 | §2 的 `codesign` / `spctl` / `xattr` 实测输出 | 一致（首启对话框未复现，已在 M-01 声明） |
| 系统菜单栏为框架默认英文（Q-01） | Tauri 默认菜单未自定义；`menubar.items` 读取被 AX 挡住，属未完全验证的边界声明 | 声明保守、无夸大 |
| 空库起步、不迁移 Windows 历史数据（OP-02） | 代码无任何迁移/导入路径；`ensure_app_data_dir` 只 `create_dir_all` + 建表 | 一致 |
| 数据路径 macOS / Windows 两端各自正确，代码不写死 | `check-bundle-config.mjs` 断言源码无任一端路径字面量；`app_config_dir()` 由 identifier 决定 | 一致 |
| Windows 安装包**未在本机验证**，验证路径是 CI | 本机无 Windows 产物；`tauri.windows.conf.json` + workflow 已交付 | 一致，无夸大 |
| E2E 基线 6 passed | 打包前后各跑一次都是 `6 passed`（见 §8） | 一致 |
| 不含同步 / 登录入口 | 侧边导航只有 3 项；无相关组件与网络调用 | 一致 |

---

## 7. 补齐 BLOCKED 项的操作路径（需要人来做）

1. 打开「系统设置 → 隐私与安全性」：给运行本仓库脚本的终端 / 应用勾选 **辅助功能** 与 **屏幕录制**；
2. 重新执行探针，确认两项为 `true`：

```bash
swift scripts/mac-desktop-probe.swift | grep tcc
```

3. 抓图（顺序：**先在应用里完成点击，再抓图** —— `osascript` 点击会抢焦点触发 blur 关掉菜单）：

```bash
bash scripts/mac-capture-window.sh 日程待办 docs/verification/desktop/02-calendar.png
```

4. 按 §4 逐项补 M-01（首次双击的拦截对话框）/ M-02 / M-03 / M-04 / M-05 / M-06 / M-07 / M-08 / M-09 / M-11 / M-10 的截图，
   并把结果回填本文与 `docs/verification/desktop/`。
5. M-08 / M-11 是**硬项**：未签署前，人工 checklist 不得判「全通过」。

---

## 8. E2E 基线（打包前 / 打包后各一次）

```console
# 打包前（进入 tauri build 之前）
$ npx playwright test
  6 passed (10.2s)

# 打包后，.app 已在 /Applications 运行中，再复跑一次（含巡览截图与录屏重生成）
$ npx playwright test
  ✓ 6 [chromium] › e2e/tour.spec.ts:72:1 › 6 · 巡览: 14 screenshots + one continuous recording (1.9s)
  6 passed (10.2s)
$ ls -l screenshots/01-calendar-default.png videos/日程待办-产品功能巡览.webm
-rw-r--r--@ 1 zachary  staff   67848 Nov  1 03:19 screenshots/01-calendar-default.png
-rw-r--r--@ 1 zachary  staff  630334 Nov  1 03:19 videos/日程待办-产品功能巡览.webm
```

两次都用 `tauri build` 时现场执行 `npm run build` 产出的同一份 `dist`（`beforeBuildCommand`），
因此巡览截图与 `.app` 里的前端是同一套源码产物。

---

## 9. 依赖克制与 Windows 残留自检（T-19）

```console
$ npm ls --depth=0
todo@0.1.0
+-- @playwright/test@1.64.1
+-- @tauri-apps/api@2.12.4
+-- @tauri-apps/cli@2.12.4
+-- @tauri-apps/plugin-sql@2.6.0
+-- @vitejs/plugin-vue@6.0.10
+-- dayjs@1.11.23
+-- typescript@6.0.3
+-- vite@8.3.5
+-- vue-tsc@3.3.14
`-- vue@3.5.44
```

无 Pinia / Vuex / UI 组件库 / 路由库 / vitest / 第二套日期库。（AC-42 / BR-13）

Windows 残留检索（每项给出结论）：

> 口径说明：AC-43 的原文是「交付物中不存在 NSIS 配置 / `%APPDATA%` 字样」。本轮人类授权把
> **Windows 打包**纳入范围，因此这一条按新范围解释为：**基础配置与运行时代码**里不得残留 Windows 专属实现，
> 而 Windows overlay、CI 与交付说明里出现 NSIS / `%APPDATA%` 属**应有内容**。逐项结论如下。

| 检索项 | 命中 | 结论 |
| --- | --- | --- |
| `.ps1` 文件 | 0 个（`find . -name "*.ps1"` 无输出） | 无残留 |
| `NSIS` | `src-tauri/tauri.windows.conf.json` 的 `targets`、`scripts/check-bundle-config.mjs` 的断言、`README` 的 Windows 一节 | **合法**：Windows overlay 与自检脚本本就该出现；基础 `tauri.conf.json` 内为 0 |
| `%APPDATA%` | `README.md` 的路径表、`scripts/check-bundle-config.mjs` 的禁用词表、`description.md`（原始 Windows 基线材料，非交付物） | **合法**：交付说明必须写清 Windows 路径；代码内为 0（脚本断言） |
| `msedge` / `channel: 'msedge'` | `description.md` / `quick-create-attachments/`（原始材料，且后者已被 `.gitignore` 排除） | **已替换**：`playwright.config.ts` 用自带 Chromium，无 `channel` |
| `currentUser` | `src-tauri/tauri.windows.conf.json`、`scripts/check-bundle-config.mjs` | **合法**：Windows NSIS 安装模式 |
| `PrintWindow` | 仅 `description.md` / `quick-create-attachments/`（原始材料） | **已替换**：macOS 侧改为 `screencapture -l<窗口号>` |
| `PowerShell` | 仅 `description.md`、`quick-create-attachments/`、`AGENTS.md`（运行时说明） | **不属交付物**：无 `.ps1`、无 PowerShell 调用链 |

`node scripts/check-bundle-config.mjs` 的 44 条断言（三份 conf 合并 / schema / 平台中立 / 数据路径中立 /
workflow 结构）结果见 §10。

---

## 10. 打包配置自检输出

```console
$ node scripts/check-bundle-config.mjs
  ✓ 基础 + macOS 合并结果 通过 config.schema.json 校验
  ✓ 基础 + Windows 合并结果 通过 config.schema.json 校验
  ✓ 基础配置不写死 bundle.targets
  ✓ 基础配置不含 macOS / windows 平台块
  ✓ macOS 合并 targets = [app, dmg]
  ✓ macOS minimumSystemVersion = 12.0
  ✓ macOS hardenedRuntime = false（本期不签名）
  ✓ Windows 合并 targets = [nsis, msi]
  ✓ Windows nsis.installMode = currentUser
  ✓ Windows wix.language 含 zh-CN
  ✓ 源码中无任一端的数据目录字面量（路径只由 identifier 决定）
  ✓ Windows job 真的调 npx tauri build（不是占位注释）
  ✓ 步骤顺序：装依赖 → 前端构建 → 装浏览器 → E2E → tauri build
  …
断言通过 44 条，失败 0 条
PASS（三份 conf 合并 + schema + 平台中立 + 数据路径中立 + workflow 结构）
```

补一条「Tauri CLI 自己也能读这份配置」的证据（CLI 解析的是合并后的配置；WiX Upgrade Code 由
`productName` 推导，因此它同时验证了中文 `productName` 在打包工具链里能被正确处理）：

```console
$ npx tauri inspect wix-upgrade-code
        Info Default WiX Upgrade Code, derived from 日程待办: 752e615b-2665-5707-bd98-29f0712ef780
```

---

## 11. Windows 侧的明确状态

| 项 | 状态 |
| --- | --- |
| `tauri.windows.conf.json`（nsis + msi / currentUser / SimpChinese / zh-CN / WebView2 bootstrapper） | 已交付，本地 schema + 键值断言通过 |
| `.github/workflows/build.yml` 的 `windows-latest` job | 已交付，YAML 可解析、matrix 与步骤顺序有断言 |
| Windows 安装包（`.exe` / `.msi`） | **未产出**（macOS 无交叉编译能力） |
| Windows 上的 E2E 与实机运行 | **NOT-VERIFIED**，唯一验证路径是 push 后的 CI；本阶段不写「CI 已通过」 |
