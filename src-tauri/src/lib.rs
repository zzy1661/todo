use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command as ProcessCommand;
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

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

/// 绑定 `127.0.0.1:<随机端口>` 等待 OAuth 回调，返回端口（PRD FR-SYNC-03）
///
/// 只接受一次连接，读第一行请求行取出 query（`code=…&state=…`），
/// 回一个「可以关闭此页面」的极简页面，然后把 query 交给 `sync_oauth_wait`。
/// 不用隐式流程，不解析 fragment —— 授权码只在 query 里。
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
            let body = "<!doctype html><meta charset=\"utf-8\"><title>日程待办</title>\
                        <p style=\"font:14px -apple-system;padding:24px\">授权已完成，请关闭此页面回到「日程待办」。</p>";
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
#[tauri::command]
fn sync_open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("只允许打开 http(s) 链接".to_string());
    }
    ProcessCommand::new("/usr/bin/open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("打开浏览器失败: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            Builder::new()
                .add_migrations("sqlite:todo.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            sync_config_read,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
