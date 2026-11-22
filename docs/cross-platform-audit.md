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
| B4 | 换行符 CRLF/LF | ✅ 无影响（JSON） | — |
| B5 | 文件锁 / 原子写 | ✅ 落盘失败有 try/catch；`fs::rename` 在 Windows 带 `MOVEFILE_REPLACE_EXISTING`，会覆盖而非失败 | — |
| B6 | 目录权限 / 自动创建 | ✅ `create_dir_all` 兜底 | — |

## 三、进程与命令

| # | 检查项 | 结论 | 守护 |
| --- | --- | --- | --- |
| C1 | macOS 专有命令（`/usr/bin/open`、`osascript`、`security`） | ✅ 三平台分派 | `check-platform-portability.mjs` |
| C2 | `cmd /C start` 的 URL 转义 | ✅ 已加引号（`&` `|` `^` 是 cmd 的命令分隔符） | 守护脚本 |
| C3 | **Windows 上 spawn 闪黑色控制台窗口** | ✅ 已修：`creation_flags(CREATE_NO_WINDOW)` | 守护脚本 |
| C4 | 外部命令的 PATH 依赖 | ✅ 无问题 | — |
| C5 | 平台专有调用缺少守护 | ✅ 已加守护脚本（13 条规则） | `npm run check:platform` |

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
| E1 | 系统浏览器拉起 | ✅ 三平台分派 | 守护脚本 |
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

扫 `src/` 与 `src-tauri/src/`，判定**平台专有调用必须落在带平台限定的 `#[cfg(...)]` 分支内**。
13 条规则覆盖：macOS 的 `/usr/bin/`、`osascript`、`security`；Linux 的 `xdg-open`；
Windows 的 `powershell`、`cmd.exe`、`cmd` 进程、`cmd /C` 参数、
`CredWriteW`/`CredReadW`/`CredDeleteW`/`CredFree`、`MessageBoxW`、`FormatMessageW`、
`GetLastError`、`CommandExt`。

**脚本本身是用「故意注入回归」验证的**：每个缺陷都是靠注入一个真实回归逼出来的，
共修过 5 轮（cfg 嵌套括号解析、越过 item 边界、链式调用缩进、局部 const 误判、
顶层与嵌套 item 未区分、只覆盖字符串 token 漏掉 API 名）。当前 **7 个注入点全部判红，
且还原后无误报**。

> 改这个脚本时，请一并重跑注入回归矩阵——否则很容易把守护改成一个**永远绿**的摆设。
