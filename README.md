# 日程待办 · Schedule Todo

基于 Tauri 2 + Vue 3 + TypeScript 的**本地优先**日程与待办应用。数据保存在本机 SQLite，
开箱即用、不要求登录、默认不发起任何网络请求。多设备同步是**可选层**（Supabase），
未配置 key 时与本地版完全一致。

> **当前阶段：S9 上传 git 与最终交付（S10 同步层已实现，云端真实连通待 key）**
> macOS 侧已产出 `.app` + `.dmg`；Windows 侧交付的是**可构建能力**（配置 + CI），
> **安装包未在本机产出**（Tauri 无交叉编译），详见「Windows」一节。
> 同步逻辑（登录登出、5 秒防抖推送、启动/登录后拉取、LWW、软删除、RLS SQL）已落地并用本地
> stub 验证；**真实 Supabase / GitHub OAuth / 云侧 RLS 一律 `NOT-VERIFIED`**（无 key），
> 见「五、同步（可选）」与「已知边界」。

---

## 一、安装与首次打开（macOS）

### 1. 安装

1. 打开 `日程待办_0.1.0_aarch64.dmg`；
2. 把「日程待办」拖到左侧的 **Applications**（即 `/Applications`）；
3. 在「启动台」或「应用程序」里点开「日程待办」。

也可以直接把 `日程待办.app` 拖进 `/Applications`，效果相同。
**卸载** = 退出应用后把 `/Applications/日程待办.app` 拖进废纸篓；数据不会被删除（见第五节）。

**产物怎么来**（仓库里**不含**安装包，`src-tauri/target/` 被 `.gitignore` 排除）：

- 本机构建：`npm ci` → `npm run tauri build`，产物落在
  `src-tauri/target/release/bundle/macos/日程待办.app` 与 `.../bundle/dmg/日程待办_0.1.0_aarch64.dmg`；
- CI 产物：`.github/workflows/build.yml` 的 `build` job（push `master` / `release/**` 或手动
  `workflow_dispatch`）跑完后，下载 artifact `todo-macos`，内容与上者同构。

**平台要求**：仅 **Apple Silicon**（arm64，构建目标 `aarch64-apple-darwin`）；
系统最低 **macOS 12.0**（`minimumSystemVersion` 声明值，实机只在 macOS 14.1 上验证过，
见「已知边界」）。Intel Mac 与 macOS 12.0 以下**未验证**，不承诺可用。

> **分发源只有一个（2026-11-01 10:35 收口）**：`src-tauri/target/release/bundle/macos/日程待办.app`
> 与其同批的 `src-tauri/target/release/bundle/dmg/日程待办_0.1.0_aarch64.dmg` 是**唯一分发字节**
> （10:35 / 10:36 构建，`Contents/MacOS/todo` **6 250 704 B**，md5 `4db99e8c…`，dmg md5 `a90ec0e8…`）。
> 这一版起 bundle 有**完整封条**（ad-hoc 签名，见下一节），**本轮之前的任何构建（07:21 / 10:00 等）
> 都只有链接器签名、没有封条**，双击会被判「已损坏」，不要拿去分发或演示。认身份用 **mtime + 字节数 + md5**，
> 不要用 `strings`——前端资源是压缩嵌入的，新旧构建在二进制里都看不到 JS 字符串。
> 本机 `/Applications` 里那份已删除，本轮**没有**重新安装（安装与否由使用者决定）。

- **Dock**：应用以 regular（普通 GUI）策略注册，运行时会出现在 Dock，右键有「退出 / 保留在 Dock」等标准项。
- **启动台**：`/Applications` 下的应用会被启动台自动收录（首次索引可能有几秒延迟）。

### 2. Gatekeeper：三种情形（本版 ad-hoc 签名、未公证，属预期）

本期**不做 Apple 开发者签名与公证**（PRD OP-05），只做 **ad-hoc 签名**（`signingIdentity = "-"`）：
它能让 bundle 带完整封条、不再被系统判「已损坏」，但**不能**让 Gatekeeper 放行，所以首次打开仍会被拦一次。
下面三种情形都是 2026-11-01 在 macOS 14.1 / Apple Silicon 上对**带 quarantine 的新 dmg 副本**实测的：

| 情形 | 现象 | 处理 |
| --- | --- | --- |
| ① 双击（实测现象） | 弹框「**无法打开"日程待办.app"，因为 Apple 无法检查其是否包含恶意软件**」，正文下方是「"Safari" 于未知日期创建了此文件」，按钮只有 **在访达中显示 / 好**。**不再是「已损坏，无法打开」**（那是有签名但无封条的旧构建才会出现的判定） | 点「好」关掉。想放行见情形 ② / ③ |
| ② 命令行去隔离（**本版实测可用**，推荐给命令行用户） | 同上 | `xattr -dr com.apple.quarantine "/Applications/日程待办.app"`，之后可直接双击，不再弹框 |
| ③ `spctl` 返回 `rejected` | `spctl --assess -vv "/Applications/日程待办.app"` 输出 `rejected` | **这是未公证应用的正常结果，不是安装失败**。判定「应用可用」请看它能否启动，不要看 `spctl` 的返回码 |

**「右键 → 打开」在本版未实测**：验证环境只有「屏幕录制」权限、没有「辅助功能」，无法合成右键点击，
也就没法把「右键 → 打开 → 再点『打开』」这条放行路径跑一遍。系统设置里「隐私与安全性 → 仍要打开」
同样是点击操作，未实测。**在有辅助功能的环境里补测前，不要把它写成「已验证」**；
命令行用户直接用情形 ② 即可（已实测能启动）。

本机实测（2026-11-01，macOS 14.1 / Apple Silicon，10:35 构建）：
`codesign -dv` 显示 `Signature=adhoc`、`Sealed Resources version=2 rules=13 files=1`、`Info.plist entries=15`、
`TeamIdentifier=not set`；`codesign --verify --deep --strict` **退出码 0**（旧构建是 `code has no resources but
signature indicates they must be present`、退出码 1）；`spctl --assess` 仍返回 `rejected`（未公证，预期）。
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
>
> **Windows 上同步入口不可用**：会话存储（`/usr/bin/security` 钥匙串）与浏览器拉起
> （`/usr/bin/open`）都是 macOS 实现，Windows 上登录必然失败、状态区停在「未登录」；
> 本地功能不受影响。Windows 只交付**可构建能力**，不是「可用的同步端」。

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

## 五、同步（可选）：填 key 才启用，不填就是纯本地

同步是加在本地版之上的**可选层**：没有配置、没有登录、断网时，应用与本地版**完全一致**，
且**不发起任何 `rest/v1` / `auth/v1` 请求**（`sync.enabled = false` 时整个同步层短路）。

### 1. 如何填 key 开启同步

Anon key 只在**运行期**读取，不会打进安装包、也不进仓库：

1. 复制 `sync.config.example.json`，改名为 `sync.config.json`；
2. 把 `supabaseUrl` 里的 `<project-ref>` 换成你自己的 Supabase 项目 ref（`https://<project-ref>.supabase.co`）；
3. 把 `anonKey` 换成 Supabase 项目里的 **anon public key**（或新版 `sb_publishable_…`）；
   **绝不要填管理员密钥或 `sb_secret_…`**——密钥走白名单，非 anon 形态一律被拒并保持「未配置」
   （示例文件原样照抄也是未配置，这是故意的；注释里写明了）；
4. 放到应用数据目录：

   ```bash
   cp sync.config.json "$HOME/Library/Application Support/com.poisson.todo/sync.config.json"
   ```

5. **先在云端建表**（否则登录后同步会报 `404 PGRST205`：`Could not find the table 'public.todos' in the schema cache`）：
   打开 Supabase 控制台 → SQL Editor → 粘贴仓库里的 `supabase/schema.sql` 全部内容并执行一次。
   这一步用项目管理员身份做，**不需要**把任何 service key 交给应用；
6. 重启应用 → 侧栏底部出现「同步 · 未登录」→ 点开 → **GitHub 登录**；
7. 首次登录会在系统里打开浏览器做 GitHub 授权，回调地址是 `http://127.0.0.1:<随机端口>`
   （loopback + PKCE，不用隐式流程）；授权完成后浏览器页面会按结果显示
   「授权已完成，请关闭此页面」或错误原因，回到应用即已登录。
   **`state` 由 GoTrue 托管**（authorize 阶段会被换成它自己的 flow UUID），客户端照发但**不做等值校验**；
   登录可信性由 **PKCE `code_verifier`** 绑定——verifier 只留在本机进程内，别人的 code 换不出会话。

云端表结构与 RLS 策略见 `supabase/schema.sql`（`enable row level security` + `auth.uid() = user_id`）。
执行完可以用一条只读探测确认（读本机 `sync.config.json`，不打印 key）：

```bash
node scripts/check-remote-schema.mjs   # 表就绪 → ✓；未部署 → ✗ 并给出建表步骤（404 PGRST205）
```

### 2. 未配置 / 未登录 / 断网时

| 情形 | 表现 |
| --- | --- |
| 未配置 key | 状态区显示「未配置」，GitHub 登录按钮禁用；功能与本地版完全一致，云端请求 0 次 |
| 已配置但未登录 | 状态区显示「未登录」；不拉取、不推送；本地功能照常 |
| 断网 | 本地功能完整可用；同步失败只反映在状态区，**不弹阻断式错误、不回滚本地数据** |
| 启动 | 直接进日历：**没有登录页、没有全屏遮罩、没有强制登录** |

### 3. 同步失败时的降级表现

- 推送失败：按 **1s → 2s → 4s → 8s → 16s** 退避重试，期间界面照常可用；
  五次都失败后状态区显示「同步失败，可手动重试」，点「立即重试」再试一次。
- 拉取失败：本地数据保持不动，状态区提示「拉取失败，本地数据不受影响」。
- 登录过期（401）：自动用刷新令牌续期并重试一次；续期也失败则退到「未登录，请重新登录」，
  不会反复重试、不会阻塞任何操作。
- 上次同步时间与结果会一直显示在状态区；状态区**关闭只是隐藏**，重新打开不会丢登录态。

### 4. 同步规则（一眼看完）

- 触发：任意数据变更后 **5 秒防抖**推送一次，窗口内的多次改动合并；启动时拉取一次，登录成功后立即再拉一次。
- 冲突：`last-write-wins`（`updated_at_ms` 大者胜；同毫秒按 `uuid` 字典序，结果与到达顺序无关）；
  落败值只丢弃，**不回写云端**。
- 删除：软删除（`deleted = 1`）；**墓碑终结**——已删条目不会被任何非删除记录复活。
- 范围：**只同步 `todos`**；`daily_picks`（今天推了哪条方法）是本机状态，不同步。
- 密钥：只接受 **anon 角色的 JWT** 或 **`sb_publishable_` 前缀**的密钥（白名单），其余一律拒绝、
  保持「未配置」；**管理员（服务端）角色密钥**与 `sb_secret_…` 不在客户端代码、仓库、打包产物任何一处出现。
  **白名单边界只认这两个形态**——不是任意 `sb_` 前缀，也不是任意 JWT。
  复核命令（口径 = PRD v1.6：只看代码与配置值位，说明性文本不计入判定）：

  ```bash
  npm run check:no-secrets              # 扫 src/ src-tauri/ e2e/ package.json sync.config.example.json
  git grep -nE "sb_secret_|eyJ[A-Za-z0-9_-]{10,}"   # legacy JWT 形态；唯一命中应是负向夹具
  grep -rac "sb_secret_" dist/          # 前端产物（Tauri 压缩嵌入 .app，二进制 strings 看不到）
  ```

  legacy JWT 的唯一命中是 `scripts/check-sync.mjs` 的**负向夹具**（签名段为字面量 `sig`），
  不是可用凭据；管理员角色密钥属于 legacy JWT，被同一正则覆盖，运行期还会被白名单拒绝。

### 5. 自证命令

```bash
node scripts/check-sync.mjs            # 本地 stub：防抖 / 拉取合并 / LWW / 墓碑 / 401 / PGRST205 + v3 迁移结构
node scripts/check-deleted-filter.mjs  # 软删除静态断言
node scripts/check-remote-schema.mjs   # 真实项目只读探测：public.todos 是否已部署
npx playwright test -c playwright.sync.config.ts   # 同步 E2E（零云端请求 / 无登录拦截 / 状态区）
```

> **NOT-VERIFIED**：真实 Supabase 读写、真实 GitHub OAuth 往返、云侧 RLS 越权不可见。
> 这三项要等 anon key 到位后由 S10.5 补跑，**不计入通过率**。

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
node scripts/check-sync.mjs          # S10 同步自检：防抖/拉取/LWW/墓碑/401 五组路径 + v3 迁移结构（78 条断言，含密钥白名单负向断言）
node scripts/check-deleted-filter.mjs # S10 软删除静态断言：FROM todos 未带 deleted = 0 即失败
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
npx playwright test -c playwright.sync.config.ts   # 同步套件（e2e-sync/，4 用例，与主套件隔离）
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
├─ sync/                       同步核心（全部依赖注入，可在 Node stub 上真跑）
│  ├─ engine.ts                防抖推送 / 拉取合并 / 重试退避 / 401 重登
│  ├─ merge.ts                 LWW + 墓碑终结（规则唯一实现处）
│  ├─ api.ts / oauth.ts        Supabase REST 客户端 / loopback + PKCE
│  ├─ config.ts                运行期配置校验（白名单：anon 角色 JWT / sb_publishable_ 前缀）
│  ├─ clock.ts / timers.ts     可注入时间源与定时器（FR-SYNC-15）
│  └─ events.ts                数据层写操作 → 引擎的变更总线
├─ stores/
│  ├─ todo.ts                  待办状态 + 优先级元数据
│  ├─ sync.ts                  同步状态区状态与登录/重试动作（C-16）
│  └─ dailyMethod.ts           每日推送状态 + 确定性排列算法
└─ components/
   ├─ layout/SideNav.vue       侧边导航（注册表驱动，底部「数据本地存储」+ C-16 同步区）
   ├─ layout/SyncPanel.vue     C-16 同步状态与登录区（v-show 收起，不丢会话）
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
├─ src/lib.rs                  SQL 迁移定义（v1 todos / v2 daily_picks / v3 同步列）+ 同步用的 Rust 命令
├─ migrations/0003_sync_columns.sql  v3：todos 加 uuid / updated_at_ms / deleted + 幂等回填
├─ tauri.conf.json             平台中立基线：productName 日程待办 / identifier com.poisson.todo
├─ tauri.macos.conf.json       macOS overlay：app+dmg / 最低 12.0 / ad-hoc 签名（`-`）/ DMG 布局
├─ tauri.windows.conf.json     Windows overlay：nsis+msi / currentUser / zh-CN
├─ icons/                      全套图标（由 1024×1024 源图经 `npx tauri icon` 生成：icns / ico / png 族）
└─ capabilities/default.json   窗口权限（core:default + sql:default + sql:allow-execute）

.github/workflows/build.yml    CI：macOS + Windows 双平台打包（含 E2E 前置门禁）
scripts/                       校验脚本（含 check-sync.mjs / mock-supabase.mjs）+ macOS 桌面取证脚本
e2e/                           Playwright：todo.spec.ts（5 功能）/ tour.spec.ts（巡览）/ support/ / COVERAGE.md
e2e-sync/                      同步套件（4 用例，独立目录，不并入主套件）
playwright.config.ts           主套件配置（自带 Chromium、workers 1、video on、trace 失败留存）
playwright.sync.config.ts      同步套件配置（testDir e2e-sync/、产物落 test-results-sync/）
supabase/schema.sql            云表结构与 RLS 策略（auth.uid() = user_id）
sync.config.example.json       运行期同步配置样板（真实 sync.config.json 不入库）
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
| 同步状态区（C-16） | `.sync-area[data-region="C-16"]` | `[data-sync-entry]`、`.sync-panel`、`.sync-state[data-phase=…]`、`.sync-login`、`.sync-logout`、`.sync-retry`、`.sync-close`、`.sync-last` |
| 编辑器 | `.editor[data-editor-mode="create"｜"edit"]` | `.editor-card`、`.editor-title`、`input[data-field="title"]`、`input[data-field="date"]`、`textarea[data-field="note"]`、`.priority-option[data-priority=…]`、`.priority-option.active`、`.editor-cancel[data-action="cancel"]`、`.editor-save[data-action="save"]` |

## 表结构与迁移

迁移由 `src-tauri/src/lib.rs` 的 `Migration` 列表管理，按版本号递增顺序执行：

| 版本 | 迁移 | 内容 |
| --- | --- | --- |
| 1 | `create_todos_table` | 待办表 `todos`（含 `AUTOINCREMENT` 主键与日期索引） |
| 2 | `create_daily_picks_table` | 每日推送记录表 `daily_picks` |
| 3 | `add_sync_columns_to_todos` | `todos` 增列 `uuid` / `updated_at_ms` / `deleted`（`src-tauri/migrations/0003_sync_columns.sql`），幂等回填历史行 |

v1 / v2 **逐字未动**；v3 只对 `todos` 做 `ADD COLUMN` + 回填 + 建索引，**没有** `DROP`、没有重建表，
`daily_picks` 不加列（它不参与同步）。版本号只增不减，插件记录版本号，二次启动不会重复回填
（uuid 不会被重新生成）。升级（覆盖安装）与卸载重装都不会丢数据，复核结果见
`docs/verification/mac-desktop.md`。

**软删除**：`deleteTodo` 只写 `deleted = 1`，行留在库里（跨设备才能传播删除）。
所有本地读取路径（当日面板 / 全部待办 / 月历圆点 / 统计与完成率 / 往期回顾）都经数据层的
`deleted = 0` 过滤；`node scripts/check-deleted-filter.mjs` 逐行扫描 `FROM todos`，
漏一处即非零退出（唯一的例外是同步网关带 `-- sync-all-rows` 标记的含墓碑读取）。

## 已知边界与遗留

| 项 | 说明 |
| --- | --- |
| 代码签名 / 公证 | 只做 **ad-hoc 签名**（`signingIdentity = "-"`，bundle 封条完整）；**不做 Apple 开发者签名、不做公证**（OP-05）。首次打开按「一、2」三种情形处理；`spctl` 返回 `rejected` 属预期 |
| 最低系统版本 | 声明 `macOS 12.0`，但**只在 macOS 14.1 / Apple Silicon 实机验证过**，更低版本未实测（PRD OP-04） |
| 架构 | 仅 arm64；不产出 universal 二进制，Intel Mac 不在本期范围 |
| 系统菜单栏 | 框架默认英文（Q-01），见「一、3」 |
| Windows 产物 | **未在本机验证**（无交叉编译），验证路径是 CI 的 `windows-latest` job |
| Windows 上的同步 | **不可用**：会话存储（`/usr/bin/security` 钥匙串）与浏览器拉起（`/usr/bin/open`）都是 macOS 实现，Windows 上登录必失败、状态区停在「未登录」；本地功能不受影响。Windows 只交付**可构建能力** |
| 桌面人工 checklist | M-01 ~ M-14 的执行情况见 `docs/verification/mac-desktop.md`；受 TCC 权限限制的项已标 BLOCKED 并给出复现命令 |
| 同步（可选） | 逻辑已交付并用本地 stub 验证；**真实 Supabase 读写 / GitHub OAuth 往返 / 云侧 RLS 均未验证**（无 anon key），见「五、同步（可选）」 |
| 待推改动不会自动补推 | 退出应用时未到 5 秒防抖窗口的改动、以及未登录期间产生的改动，**只留在本地库**：启动只做拉取、不扫描待推队列，因此不会补推——**只有该行下次被编辑时才会重新排队上云**（OPEN-02 默认口径） |
| 同步的时钟前提 | `updated_at_ms` 取客户端时钟；某台设备时钟偏快会「永远胜出」（PRD R-T-13 / RISK-13，规则不因此改动） |

## 文档

| 文档 | 内容 |
| --- | --- |
| `docs/requirements/ZACHTD-2-macos-prd.md` | PRD（需求唯一口径） |
| `docs/design/ZACHTD-2-macos-design.md` | 技术设计与实施规划 |
| `docs/test/ZACHTD-2-test-plan.md` | 测试计划 |
| `docs/test/ZACHTD-2-test-report.md` | 测试报告：AC-01 ~ AC-68 逐条台账（§14 统一表）、S7 / S10.5 分段证据、NOT-VERIFIED 清单 |
| `docs/verification/mac-desktop.md` | S6 桌面取证、人工 checklist M-01~M-14、数据复核（升级 / 重装 / 迁移） |
| `docs/verification/s10/sync-evidence.md` | S10 同步层：stub 证据、v2 → v3 迁移实跑、密钥边界分账 |
| `docs/verification/git-delivery.md` | S9 git 交付：远端 / 分支 / commit / 备份 tag / 强推前后 master SHA / 回滚命令 / CI 状态 |
| `docs/verification/data/` | 数据复核的原始快照（`sqlite3` 导出文本） |
