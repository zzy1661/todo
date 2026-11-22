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
        // **去掉 UTF-8 BOM**：Windows 记事本（及部分编辑器）默认存 UTF-8 with BOM，
        // 而前端 `JSON.parse` 遇到 BOM 会直接抛 `Unexpected token ﻿`——
        // 表现是「配置明明写了却仍显示未配置」，极难自查。BOM 在这里没有任何语义，
        // 直接剥掉即可。
        Ok(text) => Ok(Some(strip_bom(&text).to_string())),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("读取 {} 失败: {err}", path.display())),
    }
}

/// 会话写入系统钥匙串（PRD 任务书 §1：不得写进 localStorage / 日志 / 明文文件）
///
/// **只有 macOS 实现了系统钥匙串**。其它平台返回一句人话，
/// 而不是去执行一个并不存在的 `/usr/bin/security`、再把
/// 「No such file or directory」这种底层错误抛给用户。
#[tauri::command]
fn sync_session_save(blob: String) -> Result<(), String> {
    keychain_save(&blob)
}

/// macOS：写入登录钥匙串。
#[cfg(target_os = "macos")]
fn keychain_save(blob: &str) -> Result<(), String> {
    // 上限校验与平台无关，走共享的纯函数（可在本机单测）。
    check_session_blob_size(blob)?;
    let output = ProcessCommand::new("/usr/bin/security")
        .args([
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_ACCOUNT,
            "-w",
            blob,
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
    keychain_load()
}

/// macOS：读钥匙串中的会话。
#[cfg(target_os = "macos")]
fn keychain_load() -> Result<Option<String>, String> {
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
    keychain_clear()
}

/// macOS：清除钥匙串中的会话。
#[cfg(target_os = "macos")]
fn keychain_clear() -> Result<(), String> {
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

/// 非 macOS：没有系统钥匙串实现。
///
/// 这三个函数是**明确的「不支持」**，而不是「假装成功」——
/// `load` 返回「未登录」，`save` 返回一句人话，`clear` 直接成功。
/// 这样 Windows 用户点「登录」时看到的是「当前平台暂不支持安全会话存储」，
/// 而不是「调用 security 失败: No such file or directory」。
// ---------------------------------------------------------------- Windows 凭据管理器

/// Windows：用**凭据管理器**（Credential Manager）存会话——Windows 版的「钥匙串」。
///
/// 与 macOS 钥匙串一一对应：条目名用 `TARGET`，类型用通用凭据，持久化到本机
/// （`CRED_PERSIST_LOCAL_MACHINE`：跟着当前 Windows 用户走，不随漫游配置同步到别的机器）。
/// 凭据内容由 **DPAPI** 加密存放，其它用户 / 其它进程拿不到明文——与 macOS 钥匙串同等级别。
#[cfg(target_os = "windows")]
fn keychain_save(blob: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    // 上限校验与平台无关，走共享的纯函数（可在本机单测）。
    check_session_blob_size(blob)?;

    let target: Vec<u16> = std::ffi::OsStr::new(KEYCHAIN_SERVICE)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let user: Vec<u16> = std::ffi::OsStr::new(KEYCHAIN_ACCOUNT)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut blob_bytes = blob.as_bytes().to_vec();
    let mut credential: CREDENTIALW = unsafe { std::mem::zeroed() };
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = target.as_ptr() as *mut u16;
    credential.CredentialBlobSize = blob_bytes.len() as u32;
    credential.CredentialBlob = blob_bytes.as_mut_ptr();
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    credential.UserName = user.as_ptr() as *mut u16;

    // SAFETY：`credential` 的各字段在调用期间均有效（target / user / blob_bytes 都在栈上活着，
    // 且 `blob_bytes` 不会被移动，因为它的指针被存进了 credential）。
    let ok = unsafe { CredWriteW(&credential, 0) };
    if ok == 0 {
        return Err(format!(
            "写入 Windows 凭据管理器失败: {}",
            last_error_message()
        ));
    }
    Ok(())
}

/// Windows：读凭据管理器里的会话；不存在返回 None（视为未登录）。
#[cfg(target_os = "windows")]
fn keychain_load() -> Result<Option<String>, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::ERROR_NOT_FOUND;
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CRED_TYPE_GENERIC,
    };

    let target: Vec<u16> = std::ffi::OsStr::new(KEYCHAIN_SERVICE)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut raw: *mut windows_sys::Win32::Security::Credentials::CREDENTIALW = std::ptr::null_mut();
    // SAFETY：`raw` 是合法的输出参数；`target` 在调用期间有效。
    let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) };
    if ok == 0 {
        let err = last_error_code();
        if err == ERROR_NOT_FOUND {
            return Ok(None);
        }
        return Err(format!("读取 Windows 凭据管理器失败: {}", last_error_message()));
    }
    if raw.is_null() {
        return Ok(None);
    }

    // SAFETY：`raw` 是 CredReadW 成功返回的凭据，字段按文档有效。
    let (blob_ptr, blob_size) = unsafe {
        (
            (*raw).CredentialBlob,
            (*raw).CredentialBlobSize as usize,
        )
    };
    let value = if blob_ptr.is_null() || blob_size == 0 {
        String::new()
    } else {
        // SAFETY：blob 指向 CredReadW 分配的 blob_size 字节有效内存。
        let bytes = unsafe { std::slice::from_raw_parts(blob_ptr, blob_size) };
        String::from_utf8_lossy(bytes).to_string()
    };
    // SAFETY：释放 CredReadW 分配的内存（必须用 CredFree，不能用 free）。
    unsafe { CredFree(raw.cast()) };

    Ok(if value.trim().is_empty() {
        None
    } else {
        Some(value)
    })
}

/// Windows：清除凭据管理器里的会话（退出登录 / 令牌失效）。
#[cfg(target_os = "windows")]
fn keychain_clear() -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::ERROR_NOT_FOUND;
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

    let target: Vec<u16> = std::ffi::OsStr::new(KEYCHAIN_SERVICE)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // SAFETY：`target` 在调用期间有效。
    let ok = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if ok == 0 {
        let err = last_error_code();
        // 条目不存在时不算错误（与 macOS 的 security 行为一致）。
        if err == ERROR_NOT_FOUND {
            return Ok(());
        }
        return Err(format!(
            "删除 Windows 凭据管理器条目失败: {}",
            last_error_message()
        ));
    }
    Ok(())
}

/// Windows：取最近的 Win32 错误码。
#[cfg(target_os = "windows")]
fn last_error_code() -> u32 {
    // SAFETY：`GetLastError` 无参数无副作用。
    unsafe { windows_sys::Win32::Foundation::GetLastError() }
}

/// Windows：把最近的 Win32 错误码转成人话。
#[cfg(target_os = "windows")]
fn last_error_message() -> String {
    let code = last_error_code();
    // 用 `FormatMessageW` 把系统消息取出来；失败就退回错误码本身。
    let mut buffer = [0u16; 512];
    use windows_sys::Win32::System::Diagnostics::Debug::{
        FormatMessageW, FORMAT_MESSAGE_FROM_SYSTEM, FORMAT_MESSAGE_IGNORE_INSERTS,
    };
    // SAFETY：`buffer` 是合法的输出缓冲；长度已按参数传入。
    let len = unsafe {
        FormatMessageW(
            FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
            std::ptr::null(),
            code,
            0,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            std::ptr::null_mut(),
        )
    };
    if len == 0 {
        return format!("错误码 {code}");
    }
    let text = String::from_utf16_lossy(&buffer[..len as usize]);
    let text = text.trim();
    if text.is_empty() {
        format!("错误码 {code}")
    } else {
        format!("{text}（错误码 {code}）")
    }
}

/// 其它平台（Linux / BSD）：仍无系统级密钥串实现。
///
/// Windows 与 macOS 都已实现，这里只剩 Linux 等平台——保持「明确说不支持」，
/// 而不是悄悄落到明文文件里（那会破坏「会话不得明文落盘」的约束）。
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn keychain_save(_blob: &str) -> Result<(), String> {
    Err(UNSUPPORTED_KEYCHAIN.to_string())
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn keychain_load() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn keychain_clear() -> Result<(), String> {
    Ok(())
}

/// 尚未实现系统密钥串的平台上的会话存储提示。
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
const UNSUPPORTED_KEYCHAIN: &str =
    "当前平台暂不支持安全会话存储（macOS 用系统钥匙串、Windows 用凭据管理器）；本地功能不受影响。";

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
/// **用官方 `tauri-plugin-opener` 打开，不再自己分派平台命令。**
///
/// 为什么不能自己分派：Windows 上没有「打开 URL」的命令——`cmd /C start` 会把
/// URL 当成**文件路径**去找，直接报「找不到文件 'https://...'」（实机反馈）。
/// opener 插件内部走 `ShellExecuteW`（Windows）/ `NSWorkspace`（macOS）/
/// `xdg-open`（Linux），是系统**唯一正确**的打开 URL 的方式，
/// 而且顺带省掉了三平台分派与随之而来的转义问题。
#[tauri::command]
fn sync_open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_allowed_open_url(&url) {
        return Err("只允许打开 http(s) 链接".to_string());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("打开浏览器失败: {e}"))
}

/// 允许打开的 URL：只认 `http://` 与 `https://`。
///
/// 纯函数，便于单测。**不能放宽**：这个命令会把 URL 交给系统去打开，
/// 放行 `file://` 之类等于让外部输入去碰本地文件系统。
fn is_allowed_open_url(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
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
        .plugin(tauri_plugin_opener::init())
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

/// 会话 blob 的体积上限。
///
/// 取 **Windows 凭据管理器的 `CRED_MAX_CREDENTIAL_BLOB_SIZE`**（2560 字节）。
/// 两平台共用同一个更保守的上限：macOS 钥匙串的密码项上限更宽（4096），
/// 但用统一值好过让「能写进 macOS 却写不进 Windows」的会话在两端表现不同。
///
/// 为什么要有上限：超限时系统 API 会**直接失败**，而静默截断会得到一段坏 JSON，
/// 表现为「读不到会话」这种极难查的问题。所以写入前就明确报错。
const SESSION_BLOB_MAX_BYTES: usize = 5 * 512;

/// 剥掉 UTF-8 BOM（U+FEFF）。
///
/// Windows 记事本等编辑器默认存 **UTF-8 with BOM**，而 JSON 解析器不认这个前缀——
/// `JSON.parse` 会抛 `Unexpected token ﻿`。BOM 在配置文件里没有任何语义，
/// 剥掉即可。纯函数，便于单测。
fn strip_bom(text: &str) -> &str {
    text.trim_start_matches('\u{feff}')
}

/// 校验会话 blob 是否放得进系统凭据存储。
///
/// 纯函数，**不依赖平台**，所以在 macOS 上也能跑单测——
/// 这正是「跨平台代码里最容易出错的那部分」应该有的形状。
fn check_session_blob_size(blob: &str) -> Result<(), String> {
    if blob.len() > SESSION_BLOB_MAX_BYTES {
        return Err(format!(
            "会话过大（{} 字节，上限 {SESSION_BLOB_MAX_BYTES}）",
            blob.len()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod session_blob_tests {
    use super::{check_session_blob_size, SESSION_BLOB_MAX_BYTES};

    #[test]
    fn normal_session_fits() {
        // 真实会话就是一小段 JSON，远低于上限
        let blob = r#"{"userId":"u-1","accessToken":"tok","refreshToken":"rt"}"#;
        assert!(check_session_blob_size(blob).is_ok());
    }

    #[test]
    fn oversized_session_is_rejected_with_explicit_error() {
        let blob = "x".repeat(SESSION_BLOB_MAX_BYTES + 1);
        let err = check_session_blob_size(&blob).unwrap_err();
        assert!(err.contains("会话过大"), "错误信息要说清原因：{err}");
        assert!(err.contains(&SESSION_BLOB_MAX_BYTES.to_string()));
    }

    #[test]
    fn exactly_at_limit_is_accepted() {
        // 边界：正好等于上限要放过（上限是「含」的）
        let blob = "x".repeat(SESSION_BLOB_MAX_BYTES);
        assert!(check_session_blob_size(&blob).is_ok());
    }

    #[test]
    fn bom_is_stripped_from_config_text() {
        // Windows 记事本默认存 UTF-8 with BOM；带 BOM 的 JSON 必须能被解析
        use super::strip_bom;
        let with_bom = "\u{feff}{\"enabled\":true}";
        assert_eq!(strip_bom(with_bom), "{\"enabled\":true}");
        // 不带 BOM 时原样返回
        assert_eq!(strip_bom("{\"enabled\":true}"), "{\"enabled\":true}");
        // 多个 BOM 也要剥干净（个别编辑器会写多个）
        assert_eq!(strip_bom("\u{feff}\u{feff}x"), "x");
    }

    #[test]
    fn limit_matches_windows_credential_manager_constant() {
        // CRED_MAX_CREDENTIAL_BLOB_SIZE = 5 * CRED_MAX_USERNAME_LENGTH(256)
        assert_eq!(SESSION_BLOB_MAX_BYTES, 2560);
    }
}

#[cfg(test)]
mod open_url_tests {
    use super::is_allowed_open_url;

    #[test]
    fn http_and_https_are_allowed() {
        assert!(is_allowed_open_url("https://example.com/auth?code=1"));
        assert!(is_allowed_open_url("http://127.0.0.1:51734/?code=abc&state=xyz"));
    }

    #[test]
    fn non_http_schemes_are_rejected() {
        // 这几种若放行，等于让外部输入去碰本地文件系统或执行任意程序
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<script>1</script>",
            "ms-settings:developers",
            "",
            "   https://example.com",
        ] {
            assert!(
                !is_allowed_open_url(url),
                "必须拒绝：{url:?}"
            );
        }
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
