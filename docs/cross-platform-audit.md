# 跨平台审计清单（Windows / macOS）

> 这份清单是本项目**判断跨平台风险的基线**。
> 详细取证与逐条证据见 [`docs/test/ZACHTD-2-test-report.md`](./test/ZACHTD-2-test-report.md) §13.28（2026-11-22 全平台审计）。
>
> **用法**：新增任何跨平台相关代码后，对照本表逐项确认；
> 改完跑 `npm run check:platform`（守护脚本，见文末）。

## 为什么要有这份清单

跨平台的问题有三个特性，使得「靠审阅发现」必然有漏：

1. **编译期合法**——`/usr/bin/open` 只是个字符串字面量，交叉编译不会报错；
2. **CI 抓不到**——CI 只验证「能出包」，不验证「双击有反应」「点了登录真能存进去」；
3. **错法各不相同**——路径、编码、输入法、进程窗口、超时……每一类的表现都不一样。

所以做法是：**穷尽分类 + 每类有断言守护**，而不是「想到一个修一个」。

## ⚠️ 守护脚本能查什么、不能查什么

`check-platform-portability.mjs` 只能判定**「这条调用是不是平台专有的、且被 `#[cfg]` 保护了」**。

它**判定不了**「这条调用在该平台上**行为**是否正确」——后者只能靠实机或选对系统 API。
v0.2.3 的教训正卡在这里：`cmd /C start` 是 Windows 专有的、被正确地 `#[cfg]` 保护了，
守护脚本全绿，但实机上它**把 URL 当文件路径找**，报「找不到文件 'https://...'」。

所以新增跨平台调用时的判断是：

1. **先查有没有更标准的系统 API**（Windows 的 `ShellExecuteW`、macOS 的 `NSWorkspace`）——
   优先用**官方插件**（如 `tauri-plugin-opener`）而不是自己拼命令；
2. 自己拼命令时，必须问「这条命令在该平台上的**语义**对吗」，而不只是「它在不在」；
3. 涉及行为的部分，只能靠实机验证——**但可以先把不依赖平台的部分抽成纯函数做单测**。

## 一、运行时依赖

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| A1 | WebView2 Runtime 缺失 | ✅ 已修：建窗前预检 + 原生消息框 + 启动日志 | `src-tauri/src/startup.rs` |
| A2 | WebView2 最低版本 | ⚠️ 未声明（即不检查）；`embedBootstrapper` 装的是最新版，暂不构成风险 | — |
| A3 | 系统级凭据存储 | ✅ macOS 钥匙串 / Windows 凭据管理器（DPAPI）/ 其它平台明确不支持 | `src-tauri/src/lib.rs` |
| A4 | SQLite 是否有外部依赖 | ✅ 无（`libsqlite3-sys` 静态编译） | — |

## 二、路径与文件系统

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| B1 | 应用数据目录一致性 | ✅ Rust 侧用 `app_config_dir()`，日志侧用 `dirs::config_dir()`（与 Tauri 内部同一函数） | `check-bundle-config.mjs` 的字面量扫描 |
| B2 | UTF-8 BOM | ✅ 配置读取剥除 BOM（Windows 记事本默认带 BOM，会让 `JSON.parse` 抛错） | `strip_bom()` + 单测 |
| B3 | 路径分隔符 / 中文路径 | ✅ 无问题 | — |
| B4 | 换行符 CRLF/LF | ✅ **已修（v0.3.0）**：仓库原本没锁换行符，而 `actions/checkout` 在 Windows 上把 `core.autocrlf` 设成 true → checkout 出来全是 CRLF；任何「按 `\n` 找边界」的代码与脚本在 Windows 上失配而 macOS 完全正常 | `.gitattributes`（`* text=auto eol=lf`）+ 脚本改成换行符无关 |
| B5 | 文件锁 / 原子写 | ✅ 落盘失败有 try/catch；`fs::rename` 在 Windows 带 `MOVEFILE_REPLACE_EXISTING`，会覆盖而非失败 | — |
| B6 | 目录权限 / 自动创建 | ✅ `create_dir_all` 兜底 | — |

## 三、进程与命令

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| C1 | macOS 专有命令（`security` 钥匙串） | ✅ 平台分派；**开浏览器已改用官方 opener 插件**，不再自己分派 | `check-platform-portability.mjs` |
| C2 | ~~`cmd /C start` 的 URL 转义~~ | ✅ **已作废**：Windows 上 `start` 会把 URL 当**文件路径**去找（报「找不到文件」）。改用 opener 插件走 `ShellExecuteW` | — |
| C3 | ~~Windows 上 spawn 闪黑色控制台窗口~~ | ✅ **已作废**：不再自己 spawn，opener 内部处理 | — |
| C4 | 外部命令的 PATH 依赖 | ✅ **已修（v0.3.0）**：① `sqlite3` 命令行**只在 macOS 有**，windows-latest 镜像里没有 → 改走统一后端（有 Python 标准库退路）；② `npm` 在 Windows 上是 `npm.cmd`，`spawn` 不带 shell 时只找 `npm.exe` → ENOENT | `scripts/sqlite-backend.mjs`；守护规则 S1/S1b/S2 |
| C5 | 平台专有调用缺少守护 | ✅ 已加守护脚本（13 条产品代码规则 + 3 条 scripts/ 外部命令规则） | `npm run check:platform` |
| C6 | **验证脚本自身的跨平台风险** | ⚠️ **这是最容易漏的一层**：自检脚本在 Windows 上失败，会让 Windows job **在第一个失败脚本处中断**，后面的脚本**一次都跑不到**——于是「Windows 上没报错」不等于「Windows 上没问题」，而只等于「第一个失败点被修掉了」 | CI 自检**逐个脚本独立成 step**（10 个 step），失败点一眼可见；本机另做 CRLF / 缺命令的**全量仿真** |

## 四、UI 与交互

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| D1 | 键盘绑定硬编码 `metaKey` | ✅ 无问题：只用 enter / space 语义键 | — |
| D2 | **输入法 composition** | ✅ 已修：中文选词时也会派发 Enter，需判 `isComposing` | `TodoEditor` / `DailyMethodView` / `DailyMethodMini` |
| D3 | 滚动与渐隐 | ✅ 两平台都有 `@scroll`；已设 `overscroll-behavior: contain` | — |
| D4 | 字体栈 | ✅ 已含 `PingFang SC` / `Microsoft YaHei` / `Segoe UI` | — |
| D5 | 高 DPI | ✅ Tauri 用逻辑像素，两平台一致 | — |
| D6 | 窗口默认尺寸 | ⚠️ 遗留：1100×720 在 1366×768 屏上偏大（产品决策）；最小 900×600 已验证不溢出 | — |

## 五、同步链路

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| E1 | 系统浏览器拉起 | ✅ 官方 `tauri-plugin-opener`（Windows `ShellExecuteW` / macOS `NSWorkspace` / Linux `xdg-open`） | — |
| E2 | 会话存储 | ✅ 见 A3 | 守护脚本 |
| E3 | **请求超时** | ✅ 已修：`fetch` 默认永不超时 → 挂住则 UI 永久停在「同步中」且走不到重试；现为 30s + `AbortController` | 自检第⑩组路径 |
| E4 | 网络错误 vs HTTP 错误的分类 | ✅ 已加 `SyncNetworkError`：网络故障值得退避重试，HTTP 明确拒绝不值得 | `check-sync.mjs` |
| E5 | OAuth 回环 HTTP 响应 | ✅ 标准 `HTTP/1.1 200 OK` + `Content-Length` | — |
| E6 | 浏览器授权等待超时 | ✅ 180s | — |
| E7 | 系统代理 / TLS 证书 | ✅ 用浏览器 `fetch`，自动走系统代理与证书库 | — |

## 六、构建与打包

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| F1 | 三份 conf 的平台中立 | ✅ 一个平台不写死另一端的产物形态 | `check-bundle-config.mjs`（54 条） |
| F2 | WebView2 安装模式 | ✅ `embedBootstrapper`（`offlineInstaller` 会让 artifact 涨到 418MB，已实测放弃） | `check-bundle-config.mjs` |
| F3 | tag 与 `tauri.conf.json` 版本号一致 | ✅ 两处同源（CI 用它命名 Release 资产） | 发版流程 |
| F4 | NSIS / WiX 语言与安装模式 | ✅ `currentUser` + `SimpChinese`/`English`，允许中文安装路径 | — |
| F5 | 代码签名 | ⚠️ 遗留：CI 产物未签名 → Windows SmartScreen 拦截；本期无证书不做签名 | — |
| F6 | CI 的 Windows 步骤真出包 | ✅ 真跑 `npx tauri build` + `if-no-files-found: error` | CI 本身 |

## 已确认的跨平台机制（源码级，供以后查阅）

| 机制 | 结论 | 依据 |
| --- | --- | --- |
| **打开 URL** | Windows 走 `ShellExecuteExW`、macOS 走 `NSWorkspace`、Linux 走 `xdg-open` | `tauri-plugin-opener` → `open` crate 5.4.5 `that_detached()` |
| **Rust 侧调用插件要不要 capability** | **不要**——ACL 只拦前端 JS 的 invoke 路径 | Tauri 2.12.5 的 `resolve_access` 只出现在 `webview/mod.rs`；opener 的 Rust API 直接调 `crate::open::open`，不经过 `run_plugin_api` |
| **WebCrypto 在 Tauri 自定义协议下可用吗** | 可用——Windows 上是 `http://tauri.localhost`，Chromium 把 `*.localhost` 视为 secure context | `tauri/src/protocol/asset.rs`；`crypto.randomUUID` 另有 `getRandomValues` 降级（不依赖 secure context） |
| **`fs::rename` 在 Windows 上会失败吗** | 不会——Rust 的实现带 `MOVEFILE_REPLACE_EXISTING`，是「覆盖」而非「失败」 | Rust `std::fs` 的 Windows 实现 |
| **前端有 XSS 面吗** | 没有——全部走 Vue 插值（自动转义），无 `v-html` / `innerHTML` / `eval` | `grep` 全量扫描 |

## 遗留边界（明确不改，只记录）

1. **WebView2 最低版本未声明**——不声明即不检查；装的是最新版，暂不构成风险。
2. **窗口默认尺寸偏大**——属默认值的产品决策，改小牺牲日常体验；最小尺寸已验证。
3. **CI 产物未签名**——本期无证书不做签名；README 写明 SmartScreen 放行方式。
4. **SQLite 位于 `%APPDATA%` 漫游目录**——域漫游环境下可能被同步到多机引发锁冲突；
   改它属**架构变更**（PRD 的数据目录契约）。
5. **Windows 的真实登录流程未实机验证**——本机无 Windows 环境；
   CI 只能证明「能编译」，证明不了「调用序列对」。

## 守护脚本

```bash
npm run check:platform
```

**第一部分：产品代码**（扫 `src/` 与 `src-tauri/src/`）
判定**平台专有调用必须落在带平台限定的 `#[cfg(...)]` 分支内**。
13 条规则覆盖：macOS 的 `/usr/bin/`、`osascript`、`security`；Linux 的 `xdg-open`；
Windows 的 `powershell`、`cmd.exe`、`cmd` 进程、`cmd /C` 参数、
`CredWriteW`/`CredReadW`/`CredDeleteW`/`CredFree`、`MessageBoxW`、`FormatMessageW`、
`GetLastError`、`CommandExt`。

**第二部分：scripts/ 的外部命令依赖**（扫 `scripts/*.mjs`）
这类问题在产品代码里没有，但**同样只在另一端炸**：

| 规则 | 内容 | 对应的真实故障 |
| --- | --- | --- |
| S1 | 不得直接 `spawn/exec` 字面量 `'npm'` | Windows 上 npm 是 `npm.cmd` → ENOENT |
| S1b | 用了 `npmCmd` 就必须真的写 `.cmd` 分支 | 换了个写法，坑还在 |
| S2 | 除 `scripts/sqlite-backend.mjs` 外不得直接调 `'sqlite3'` | windows-latest 镜像没有 sqlite3.exe → ENOENT |

**脚本本身是用「故意注入回归」验证的**：每个缺陷都是靠注入一个真实回归逼出来的，
产品代码部分共修过 5 轮（cfg 嵌套括号解析、越过 item 边界、链式调用缩进、局部 const 误判、
顶层与嵌套 item 未区分、只覆盖字符串 token 漏掉 API 名），当前 **7 个注入点全部判红，
且还原后无误报**；scripts/ 部分 3 条规则（S1 / S1b / S2）同样逐条注入验证过。

> 改这个脚本时，请一并重跑注入回归矩阵——否则很容易把守护改成一个**永远绿**的摆设。

## 验证脚本的跨平台验证（比守护脚本更靠后的一层）

守护脚本只能证明「写法合规」，证明不了「在另一个平台上真能跑」。所以还要做**仿真**：

| 仿真 | 怎么造 | 证明什么 |
| --- | --- | --- |
| **CRLF checkout** | 把仓库整份复制一份，所有文本文件转成 CRLF，在副本上跑全部 10 个自检 | Windows 上 `core.autocrlf=true` 的真实效果 |
| **缺 sqlite3 CLI** | 在 PATH 前面放一个退非零的 `sqlite3` 桩 | Windows runner 镜像的真实条件 |
| **缺 node:sqlite** | 把 `import('node:sqlite')` 换成导入一个不存在的模块 | Node 官方说明 `node:sqlite` 不支持 Windows |

三种仿真可以叠加。**每一个都必须实际跑一遍，不能靠推断**——
v0.2.7 那次「修 `node:sqlite`」就是**推断**出来的（当时日志要登录才能看），
结果真正的第一个失败点在三个脚本之前。
