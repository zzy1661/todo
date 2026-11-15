//! 启动期的可诊断性（Windows 上「双击 exe 没反应」的根因排查）。
//!
//! 为什么需要这一层：
//!
//! Windows 的 release 构建带 `#![windows_subsystem = "windows"]`，**没有控制台**。
//! 于是只要启动阶段崩了（最常见的原因是系统缺 Microsoft Edge WebView2 Runtime），
//! 用户双击 exe 之后看到的就是「什么也没发生」——进程悄悄退出，屏幕上什么都没有。
//! 这类问题在没有日志、没有弹窗的情况下几乎无法自助定位。
//!
//! 这一层做三件事：
//!
//! 1. **panic hook**：panic / abort 的信息落盘到应用数据目录的 `startup.log`；
//! 2. **WebView2 预检**：在创建窗口**之前**先探一次运行时，缺失就弹窗说清楚该怎么装，
//!    而不是让用户对着一个「没反应」的 exe 发愁；
//! 3. **`fatal()`**：写日志 + 弹窗（Windows 用 `MessageBoxW`，macOS 用 `osascript`）。

use std::fs;
use std::path::PathBuf;

/// 应用标识符，与 `tauri.conf.json` 的 `identifier` 保持一致。
///
/// 这里的应用数据目录是**手算**的，不走 `tauri::Manager::path()`——
/// 因为 panic hook 与预检都发生在 `AppHandle` 存在之前，拿不到 manager。
const APP_IDENTIFIER: &str = "com.poisson.todo";

/// 启动日志文件名。放在应用数据目录（目录规则见 `data_dir()`，各端由 identifier 决定）。
const LOG_FILE: &str = "startup.log";

/// 应用数据目录。
///
/// 用「平台约定的数据目录根 + `identifier`」拼出，与 Tauri 的 `app_data_dir()`
/// 同一套规则（`dirs::data_dir()` 在各端分别落到各自约定的位置）。
///
/// **刻意不写死任一端的路径字面量**：数据落盘位置只由 `identifier` 决定，
/// 两端各自遵循平台约定（BR 的数据路径中立约束，`scripts/check-bundle-config.mjs`
/// 会对源码做字面量扫描）。
pub fn data_dir() -> PathBuf {
    match dirs::data_dir() {
        Some(root) => root.join(APP_IDENTIFIER),
        None => std::env::temp_dir().join(APP_IDENTIFIER),
    }
}

/// 启动日志的完整路径（供错误提示里告诉用户去哪儿看）。
pub fn log_path() -> PathBuf {
    data_dir().join(LOG_FILE)
}

/// 追加一行到启动日志。写失败不抛错——诊断手段不该把应用搞崩。
pub fn write_log(line: &str) {
    let dir = data_dir();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join(LOG_FILE);
    let result = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "[{}] {}", timestamp(), line)
        });
    let _ = result;
}

/// 装 panic hook：panic 信息先落盘、再弹窗，最后交给默认 hook。
///
/// 注意 release profile 是 `panic = "abort"`，hook 仍然会在 abort 之前执行。
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = format!("panic: {info}");
        write_log(&message);
        show_dialog("日程待办 启动失败", &message);
        previous(info);
    }));
}

/// 致命错误：写日志 + 弹窗告知用户，然后由调用方退出。
pub fn fatal(title: &str, detail: &str) {
    write_log(&format!("[fatal] {title} / {detail}"));
    show_dialog(title, detail);
}

/// 当前时间（HH:MM:SS）。不引第三方时间库，够定位问题即可。
fn timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let day = secs % 86_400;
    format!(
        "{:02}:{:02}:{:02}",
        day / 3600,
        (day % 3600) / 60,
        day % 60
    )
}

/// Windows：原生消息框。release 无控制台，这是用户唯一能看见的反馈渠道。
#[cfg(target_os = "windows")]
fn show_dialog(title: &str, detail: &str) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    fn wide(value: &str) -> Vec<u16> {
        std::ffi::OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    // SAFETY：宽字符串以 NUL 结尾且生命周期覆盖整个调用；空 HWND 表示无父窗口。
    unsafe {
        MessageBoxW(
            std::ptr::null_mut() as HWND,
            wide(detail).as_ptr(),
            wide(title).as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

/// macOS：用系统自带的 `osascript` 弹窗，不引入额外依赖。
#[cfg(target_os = "macos")]
fn show_dialog(title: &str, detail: &str) {
    use std::process::Command;

    fn escape(value: &str) -> String {
        value.replace('\\', "\\\\").replace('"', "\\\"")
    }

    let script = format!(
        "display dialog \"{}\" with title \"{}\" with icon stop buttons {{\"好\"}} default button 1",
        escape(detail),
        escape(title)
    );
    let _ = Command::new("osascript").args(["-e", &script]).spawn();
}

/// 其他平台：只写 stderr（无控制台的场景下以日志为准）。
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn show_dialog(title: &str, detail: &str) {
    eprintln!("[{title}] {detail}");
}
