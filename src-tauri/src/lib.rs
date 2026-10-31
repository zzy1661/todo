use std::fs;
use tauri::Manager;
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

/// 数据库文件所在目录：Tauri 的 app config dir。
///
/// macOS 上为 `~/Library/Application Support/com.poisson.todo/`，
/// plugin-sql 会把 `sqlite:todo.db` 解析到该目录下的 `todo.db`。
///
/// 首次启动时该目录可能不存在（plugin-sql 只在连接时创建），
/// 因此在 setup 阶段显式 `create_dir_all`，保证「首次启动自动建库建表，无需手工准备文件」（FR-DB-06）。
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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            Builder::new()
                .add_migrations("sqlite:todo.db", migrations())
                .build(),
        )
        .setup(|app| {
            // 迁移执行失败时不启动业务界面，避免半迁移状态（EX-03）。
            // plugin-sql 在首次连接该库时按版本号顺序执行迁移，
            // 迁移失败会让连接失败，上层据此阻断界面。
            ensure_app_data_dir(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
