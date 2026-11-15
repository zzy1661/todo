use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command as ProcessCommand;
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

mod startup;

/// 数据库文件所在目录：Tauri 的 app config dir。
///
/// 该目录**由 `identifier` 决定，两端各自落到平台约定的位置**（macOS 与 Windows
/// 的具体路径见 README「数据存放」；此处不写死任一端，避免把某一端的路径带进代码）。
/// plugin-sql 会把 `sqlite:todo.db` 解析到该目录下的 `todo.db`。
///
/// 实测（2026-11-01）：plugin-sql 在 `auto_create` 为真时（默认值）会自行
/// `create_dir_all` 该目录 —— 删掉整个目录后冷启动，目录与 todo.db 仍会被重建。
/// 这里的显式 `create_dir_all` 是幂等的兜底：保证「首次启动自动建库建表，
/// 无需手工准备文件」（FR-DB-06）在插件行为变化时依然成立。
fn ensure_app_data_dir(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建应用数据目录失败 {}: {e}", dir.display()))?;
    Ok(())
}

/// 迁移列表。
///
/// **铁律：迁移只增不改（BR-08）。**
/// 新增能力一律追加更高版本号的迁移，SQL 只允许 `CREATE TABLE IF NOT EXISTS`
/// 与 `CREATE INDEX IF NOT EXISTS`，绝不 `DROP` / `ALTER` / 删除或改写既有表与既有数据。
/// 版本号与 Windows 基线对齐（v1 = todos，v2 = daily_picks），后续只增不减。
///
/// v3 起同步字段以独立文件 `migrations/0003_sync_columns.sql` 引入（`include_str!`）：
/// 该文件只做 `ADD COLUMN` 与幂等回填，v1 / v2 的 SQL 逐字未动（AC-64 / TC-077）。
fn migrations() -> Vec<Migration> {
    vec![
        // v1：待办表
        Migration {
            version: 1,
            description: "create_todos_table",
            sql: "CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 1,
                note TEXT NOT NULL DEFAULT '',
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_todos_date ON todos(date);",
            kind: MigrationKind::Up,
        },
        // v2：每日推送表（纯新增表，不修改 / 不删除既有 todos 表与其中的数据）
        Migration {
            version: 2,
            description: "create_daily_picks_table",
            sql: "CREATE TABLE IF NOT EXISTS daily_picks (
                date TEXT PRIMARY KEY,
                method_id TEXT NOT NULL,
                manual INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT 0
            );",
            kind: MigrationKind::Up,
        },
        // v3：同步字段（uuid / updated_at_ms / deleted）+ 幂等回填，只给 todos 加列
        Migration {
            version: 3,
            description: "add_sync_columns_to_todos",
            sql: include_str!("../migrations/0003_sync_columns.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

// ---------------------------------------------------------------------------
// 同步层：运行期配置 / 会话存储 / OAuth 回环
// ---------------------------------------------------------------------------

/// 钥匙串条目的服务名与账户名（只有本应用使用，不含任何密钥内容）
const KEYCHAIN_SERVICE: &str = "com.poisson.todo.sync";
const KEYCHAIN_ACCOUNT: &str = "supabase-session";

/// 运行期同步配置文件名：放在 app data 目录，**不入库**（仓库只有 `.example`）
const SYNC_CONFIG_FILE: &str = "sync.config.json";

/// 定时同步状态文件名：与配置同目录（PRD FR-SYNC-17）。
///
/// 为什么是独立文件而不是 SQLite 第三张表：`todos` / `daily_picks` 两表固定
/// （BR-07），迁移只增不改（BR-08），加表会同时踩两条红线。
/// 文件里**只有时间戳**，没有任何凭据，不需要像会话那样进钥匙串。
const SYNC_STATE_FILE: &str = "sync.state.json";

/// 读定时同步状态（缺失即返回 None，前端据此按「首次建立周期」处理）
#[tauri::command]
fn sync_state_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    let path = dir.join(SYNC_STATE_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("读取 {} 失败: {err}", path.display())),
    }
}

/// 写定时同步状态（原子替换：先写临时文件再 rename，避免半截文件被读到）
#[tauri::command]
fn sync_state_write(app: tauri::AppHandle, blob: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建应用数据目录失败 {}: {e}", dir.display()))?;
    let path = dir.join(SYNC_STATE_FILE);
    let tmp = dir.join(format!("{SYNC_STATE_FILE}.tmp"));
    fs::write(&tmp, blob.as_bytes()).map_err(|e| format!("写入 {} 失败: {e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| format!("替换 {} 失败: {e}", path.display()))?;
    Ok(())
}

/// 清除定时同步状态（下次启动按「首次建立周期」重新起算）
#[tauri::command]
fn sync_state_clear(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    let path = dir.join(SYNC_STATE_FILE);
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("删除 {} 失败: {err}", path.display())),
    }
}

/// 读运行期配置（缺失即返回 None，前端据此 `sync.enabled = false` 并短路所有云端调用）
#[tauri::command]
fn sync_config_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    let path = dir.join(SYNC_CONFIG_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("读取 {} 失败: {err}", path.display())),
    }
}

/// 会话写入 macOS 登录钥匙串（PRD 任务书 §1：不得写进 localStorage / 日志 / 明文文件）
#[tauri::command]
fn sync_session_save(blob: String) -> Result<(), String> {
    let output = ProcessCommand::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
            &blob,
        ])
        .output()
        .map_err(|e| format!("调用 security 失败: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "写入钥匙串失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

/// 读钥匙串中的会话；不存在返回 None（视为未登录）
#[tauri::command]
fn sync_session_load() -> Result<Option<String>, String> {
    let output = ProcessCommand::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
        ])
        .output()
        .map_err(|e| format!("调用 security 失败: {e}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if value.is_empty() { None } else { Some(value) })
}

/// 清除会话（退出登录 / 令牌失效）
#[tauri::command]
fn sync_session_clear() -> Result<(), String> {
    let output = ProcessCommand::new("/usr/bin/security")
        .args([
            "delete-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
        ])
        .output()
        .map_err(|e| format!("调用 security 失败: {e}"))?;
    // 条目不存在时 security 以非零退出，这不算错误
    let _ = output;
    Ok(())
}

/// 回环监听的结果：主线程生成的 channel 接收端
static OAUTH_RX: OnceLock<Mutex<Option<mpsc::Receiver<String>>>> = OnceLock::new();

/// 回调页文案（纯函数，便于单测）：按回调结果渲染，**不写死「授权已完成」**。
///
/// 三条分支：
/// - 带 `error` → 显示 `error` 与 `error_description`（都已 HTML 转义）；
/// - 既无 `code` 也无 `error` → 「回调缺少授权码，请回应用重试」；
/// - 否则 → 「授权已完成，请关闭此页面回到『日程待办』」。
///
/// **不把 `code` / `state` 的值写进页面**：页面是浏览器里的普通 HTML，
/// 只按「有没有 / 是不是错误」决定文案。
pub fn oauth_callback_page(query: &str) -> String {
    let mut has_code = false;
    let mut error = String::new();
    let mut error_description = String::new();
    for pair in query.split('&') {
        let (key, raw_value) = match pair.split_once('=') {
            Some((key, value)) => (key, value),
            None => (pair, ""),
        };
        let value = percent_decode(raw_value);
        match key {
            "code" => has_code = !value.is_empty(),
            "error" => error = value,
            "error_description" => error_description = value,
            _ => {}
        }
    }

    let body = if !error.is_empty() {
        let description = if error_description.is_empty() {
            String::new()
        } else {
            format!(
                "<p style=\"font:13px -apple-system;color:#555;margin:8px 0 0\">{}</p>",
                escape_html(&error_description)
            )
        };
        format!(
            "<p style=\"font:14px -apple-system;color:#b00020;margin:0\">授权失败：{}</p>{description}",
            escape_html(&error)
        )
    } else if !has_code {
        "<p style=\"font:14px -apple-system;margin:0\">回调缺少授权码，请回应用重试。</p>".to_string()
    } else {
        "<p style=\"font:14px -apple-system;margin:0\">授权已完成，请关闭此页面回到「日程待办」。</p>"
            .to_string()
    };

    format!(
        "<!doctype html><meta charset=\"utf-8\"><title>日程待办</title>\
         <div style=\"padding:24px;line-height:1.5\">{body}</div>"
    )
}

/// 百分号解码 + `+` → 空格（query 串语义；只用于展示层）
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

/// HTML 转义：回调参数来自外部输入（浏览器地址栏），不转义就是注入点
fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    out
}

/// 绑定 `127.0.0.1:<随机端口>` 等待 OAuth 回调，返回端口（PRD FR-SYNC-03）
///
/// 只接受一次连接，读第一行请求行取出 query（`code=…&state=…`），
/// 回一个按结果渲染的极简页面（成功 / 失败 / 缺 code 三种文案），然后把 query 交给
/// `sync_oauth_wait`。不用隐式流程，不解析 fragment —— 授权码只在 query 里。
#[tauri::command]
fn sync_oauth_listen() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("无法绑定回环端口: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("无法读取回环端口: {e}"))?
        .port();
    let (tx, rx) = mpsc::channel::<String>();
    {
        let slot = OAUTH_RX.get_or_init(|| Mutex::new(None));
        let mut guard = slot.lock().map_err(|_| "回环状态锁失效".to_string())?;
        *guard = Some(rx);
    }
    std::thread::spawn(move || {
        if let Ok((mut stream, _addr)) = listener.accept() {
            let mut buf = [0u8; 8192];
            let read = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..read]).to_string();
            let target = request
                .lines()
                .next()
                .unwrap_or("")
                .split_whitespace()
                .nth(1)
                .unwrap_or("")
                .to_string();
            let query = target
                .split_once('?')
                .map(|(_, q)| q.to_string())
                .unwrap_or_default();
            // 页面按回调结果渲染（成功 / 失败 / 缺 code），且绝不回显 code / state 的值
            let body = oauth_callback_page(&query);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                 Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            let _ = tx.send(query);
        }
    });
    Ok(port)
}

/// 等待回环回调的 query；超时返回 None（不阻塞主流程，前端按超时提示）
#[tauri::command]
fn sync_oauth_wait(timeout_ms: u64) -> Result<Option<String>, String> {
    let slot = OAUTH_RX.get_or_init(|| Mutex::new(None));
    let receiver = {
        let mut guard = slot.lock().map_err(|_| "回环状态锁失效".to_string())?;
        guard.take()
    };
    let Some(rx) = receiver else {
        return Ok(None);
    };
    match rx.recv_timeout(Duration::from_millis(timeout_ms)) {
        Ok(query) => Ok(Some(query)),
        Err(_) => Ok(None),
    }
}

/// 用系统默认浏览器打开授权页（只允许 http/https，避免被当成命令执行）
///
/// 各平台用各自的开户方式：macOS 是 `open`、Windows 是 `cmd /C start`、
/// 其余 Unix 是 `xdg-open`。**不能只写 macOS 那一套**——`/usr/bin/open`
/// 在 Windows 上不存在，命令会直接失败（表现为「点了没反应」）。
#[tauri::command]
fn sync_open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("只允许打开 http(s) 链接".to_string());
    }
    open_in_browser(&url).map_err(|e| format!("打开浏览器失败: {e}"))?;
    Ok(())
}

/// 用系统默认浏览器打开一个 URL。
#[cfg(target_os = "macos")]
fn open_in_browser(url: &str) -> std::io::Result<()> {
    ProcessCommand::new("/usr/bin/open").arg(url).spawn().map(|_| ())
}

/// Windows：没有 `open`，用 `cmd /C start`。
///
/// `start` 的第一个参数被当作窗口标题，所以要传一个空串占位，
/// 否则 URL 会被当成标题、浏览器不会被拉起。
#[cfg(target_os = "windows")]
fn open_in_browser(url: &str) -> std::io::Result<()> {
    ProcessCommand::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
}

/// 其余 Unix（Linux / BSD）。
#[cfg(all(unix, not(target_os = "macos")))]
fn open_in_browser(url: &str) -> std::io::Result<()> {
    ProcessCommand::new("xdg-open").arg(url).spawn().map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动期的可诊断性（详见 startup.rs）：
    // Windows release 没有控制台，任何静默失败对用户都是「双击没反应」。
    startup::install_panic_hook();
    startup::write_log("==== 应用启动 ====");

    // WebView2 预检：缺运行时时 Tauri 会在建窗口阶段直接失败。
    // 这里提前探一次，缺了就弹窗说清楚怎么装，然后退出——而不是静默退出。
    match tauri::webview_version() {
        Ok(version) => startup::write_log(&format!("WebView2 就绪：{version:?}")),
        Err(err) => {
            startup::fatal(
                "缺少 Microsoft Edge WebView2 Runtime",
                &format!(
                    "本应用靠 WebView2 运行时显示界面，当前系统未安装或版本过低。\n\n\
                     请安装 WebView2 Runtime 后重新启动：\n\
                     https://developer.microsoft.com/microsoft-edge/webview2/\n\n\
                     详细信息：{err}"
                ),
            );
            return;
        }
    }

    let result = tauri::Builder::default()
        .plugin(
            Builder::new()
                .add_migrations("sqlite:todo.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            sync_config_read,
            sync_state_read,
            sync_state_write,
            sync_state_clear,
            sync_session_save,
            sync_session_load,
            sync_session_clear,
            sync_oauth_listen,
            sync_oauth_wait,
            sync_open_url
        ])
        .setup(|app| {
            // 迁移在插件 setup 阶段执行（tauri.conf.json 的 plugins.sql.preload），
            // 早于窗口创建：迁移失败会让 build() 直接返回错误，
            // 业务界面根本不会启动，避免半迁移状态（EX-03）。
            ensure_app_data_dir(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!());

    // 不用 expect：Windows release 没有控制台，panic 对用户就是「双击没反应」。
    // 这里显式兜底——弹窗说清楚原因，并告诉用户日志在哪。
    if let Err(err) = result {
        startup::fatal(
            "日程待办 启动失败",
            &format!(
                "应用初始化未完成：\n\n{err}\n\n\
                 详细信息已写入日志：\n{}",
                startup::log_path().display()
            ),
        );
    }
}

#[cfg(test)]
mod callback_page_tests {
    use super::oauth_callback_page;

    #[test]
    fn success_page_when_code_present() {        let page = oauth_callback_page("code=abc123&state=9b28ae17-cc1f-437d-bf8c-843f0890d4f5");
        assert!(page.contains("授权已完成，请关闭此页面回到「日程待办」。"));
        // 页面不得回显 code / state 的值
        assert!(!page.contains("abc123"), "回调页不得写出 code");
        assert!(!page.contains("9b28ae17"), "回调页不得写出 state");
    }

    #[test]
    fn error_page_shows_error_and_escaped_description() {
        let page = oauth_callback_page(
            "error=bad_oauth_state&error_description=OAuth+state+%3Cscript%3Ealert(1)%3C%2Fscript%3E",
        );
        assert!(page.contains("授权失败"));
        assert!(page.contains("bad_oauth_state"));
        assert!(page.contains("OAuth state"));
        assert!(
            page.contains("&lt;script&gt;"),
            "error_description 必须 HTML 转义，实际：{page}"
        );
        assert!(!page.contains("<script>"), "未转义的标签会构成注入点");
    }

    #[test]
    fn missing_code_page_when_neither_code_nor_error() {
        let page = oauth_callback_page("state=9b28ae17-cc1f-437d-bf8c-843f0890d4f5");
        assert!(page.contains("回调缺少授权码，请回应用重试"));
        assert!(!page.contains("授权已完成"));
    }

    /// 真实回环一次：证明监听器返回的就是按结果渲染的页面（不是只在纯函数里成立）
    #[test]
    fn serves_error_page_over_loopback() {
        use std::io::{Read, Write};
        use std::net::TcpStream;

        let port = super::sync_oauth_listen().expect("回环监听应成功");
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("连接回环应成功");
        stream
            .write_all(
                b"GET /?error=bad_oauth_state&error_description=OAuth+state+parameter+is+invalid                   HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            )
            .expect("写请求应成功");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("读响应应成功");

        assert!(response.starts_with("HTTP/1.1 200 OK"), "实际响应：{response}");
        assert!(response.contains("授权失败：bad_oauth_state"));
        assert!(response.contains("OAuth state parameter is invalid"));
        assert!(!response.contains("授权已完成"), "失败时不得再写「授权已完成」");
    }
}
