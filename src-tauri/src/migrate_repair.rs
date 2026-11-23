//! 迁移记账修复：把「**只因换行符**而对不上」的 checksum 纠正回来。
//!
//! # 背景（2026-11-23 实机反馈「启动报错·数据对不上·部分数据已经执行过了」）
//!
//! sqlx 给每个迁移记账：`_sqlx_migrations.checksum = SHA-384(该迁移 SQL 的字节)`。
//! 每次启动都校验，对不上就报
//! `migration N was previously applied but has been modified`，
//! **迁移被拒绝执行** → sql 插件初始化失败 → 应用起不来。
//!
//! 而「SQL 的字节」有两个来源，行为完全不同：
//!
//! | 来源 | 换行符 | 结果 |
//! | --- | --- | --- |
//! | Rust **内联字符串字面量** | 编译器把 CRLF **归一化成 LF** | 各平台字节一致 → checksum 恒定 |
//! | **`include_str!` 读文件** | **原样嵌入**（CRLF 就是 CRLF） | checksum **随 checkout 换行符变化** |
//!
//! 本项目 v1 / v2 是内联字面量（安全）；**v3 来自 `.sql` 文件** —— 唯一会变的迁移。
//! v0.3.0 之前没有 `.gitattributes`，Windows 检出是 CRLF → 旧 Windows 安装包内嵌
//! CRLF 版 v3 SQL → 它们的库记下 **CRLF 版 checksum**；v0.3.0 起 `.gitattributes`
//! 把检出锁成 LF → 新包算 **LF 版 checksum** → 对不上 → 应用起不来。
//!
//! # 这里做的事
//!
//! 在 **sql 插件的迁移校验之前**，检查库里记的 checksum：
//!
//! - 与当前一致 → 什么都不做；
//! - **恰好等于「当前 SQL 换成 CRLF 后」的 checksum** → 断定这**不是内容被改过**，
//!   只是换行符不同 → 先取 schema 证据（证明那次迁移真的执行过），
//!   再把记账行改成当前 checksum；
//! - 其它情况 → **不碰**，让 sqlx 报出准确的原始错误。
//!
//! **只改记账，不动 schema、不动数据。**

use sha2::{Digest, Sha384};
use sqlx::{Row, SqlitePool};
use tauri_plugin_sql::Migration;

/// 每个迁移执行完后**必须存在**的 schema 元素。
///
/// 用途：证明「那次迁移真的执行过」——只有拿到 schema 证据才允许改写记账。
/// 写法 `表.列` 表示列；只写 `表` 表示表存在即可。
const MIGRATION_EXPECTATIONS: &[(i64, &[&str])] = &[
    (1, &["todos.id", "todos.title", "todos.date"]),
    (2, &["daily_picks.date", "daily_picks.method_id"]),
    (3, &["todos.uuid", "todos.updated_at_ms", "todos.deleted"]),
];

/// 一次修复的结果（供启动日志与测试断言用）。
#[derive(Debug, Default)]
pub struct RepairReport {
    /// 被纠正的迁移：`(版本, 说明)`
    pub fixed: Vec<(i64, String)>,
    /// 记账里 `success = false`（迁移执行到一半）的迁移版本。
    /// 这种不能靠改 checksum 解决（v3 的 `ADD COLUMN` 不幂等，重跑会报「duplicate column」），
    /// 所以只**记录**下来，由启动错误提示人工处理。
    pub partial: Vec<i64>,
}

impl RepairReport {
    pub fn is_empty(&self) -> bool {
        self.fixed.is_empty() && self.partial.is_empty()
    }

    pub fn summary(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        for (version, note) in &self.fixed {
            parts.push(format!("迁移 {version}：{note}"));
        }
        for version in &self.partial {
            parts.push(format!(
                "迁移 {version}：记账显示 success = false（执行到一半），需人工处理"
            ));
        }
        if parts.is_empty() {
            "无需修复".to_string()
        } else {
            parts.join("；")
        }
    }
}

/// SHA-384 —— 与 sqlx 记账用的是同一个算法与同一个字节。
fn checksum_of(bytes: &[u8]) -> Vec<u8> {
    Sha384::digest(bytes).to_vec()
}

/// sql 插件把 `sqlite:todo.db` 解析成的实际文件路径。
///
/// **必须与插件的规则完全一致**（插件的 `wrapper.rs::path_mapper`：
/// `app_config_dir()` + 连接串里 `sqlite:` 之后的部分）。
/// 我们自己另算一套，就有可能「修的是另一个库」——那比不修更糟。
pub fn database_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("取应用配置目录失败：{e}"))?;
    Ok(dir.join("todo.db"))
}

/// 对**真实数据库文件**执行修复。
///
/// 返回 `Ok(None)` 表示「没有可修的」（全新库 / 从未应用过迁移 / 一切正常）。
pub async fn repair_database<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    migrations: &[Migration],
) -> Result<Option<RepairReport>, String> {
    let path = database_path(app)?;
    if !path.exists() {
        return Ok(None); // 首次启动：还没有库
    }
    let path_str = path
        .to_str()
        .ok_or_else(|| "数据库路径不是合法 UTF-8".to_string())?;
    // 与插件用同样的连接串形态（`sqlite:<绝对路径>`）
    let pool = SqlitePool::connect(&format!("sqlite:{path_str}"))
        .await
        .map_err(|e| format!("打开数据库失败：{e}"))?;
    let result = repair_pool(&pool, migrations).await;
    pool.close().await;
    result
}

/// 在给定连接上纠正「只因换行符而对不上」的迁移记账。
pub async fn repair_pool(
    pool: &SqlitePool,
    migrations: &[Migration],
) -> Result<Option<RepairReport>, String> {
    let has_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("查询迁移记账表失败：{e}"))?;
    if has_table == 0 {
        return Ok(None); // 全新库：还没有记账
    }

    let rows = sqlx::query("SELECT version, checksum, success FROM _sqlx_migrations")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("读取迁移记账失败：{e}"))?;

    let mut report = RepairReport::default();
    for row in rows {
        let version: i64 = row.get("version");
        let stored: Vec<u8> = row.get("checksum");
        let success: bool = row.get("success");

        if !success {
            // 执行到一半：不能靠改 checksum 解决（v3 的 ADD COLUMN 不幂等）
            report.partial.push(version);
            continue;
        }

        let Some(migration) = migrations.iter().find(|m| m.version == version) else {
            // 本版本不再携带的迁移：交给 sqlx 自己报错，不要擅自改
            continue;
        };

        let expected = checksum_of(migration.sql.as_bytes());
        if stored == expected {
            continue; // 一致
        }

        // 差异是否**只来自换行符**？
        //   旧 Windows 包内嵌 CRLF 版 SQL → 记账是 CRLF 版 checksum
        //   当前包内嵌 LF 版 SQL        → 记账应是 LF 版 checksum
        // 只有「记账 == CRLF 版 checksum」时，才能断定这不是内容被改过。
        let lf = migration.sql.replace("\r\n", "\n");
        let crlf = lf.replace('\n', "\r\n");
        if checksum_of(crlf.as_bytes()) != stored {
            continue; // 真的是内容变了 → 不碰
        }

        // 取 schema 证据：证明那次迁移真的执行过
        let expectations = MIGRATION_EXPECTATIONS
            .iter()
            .find(|(v, _)| *v == version)
            .map(|(_, items)| *items)
            .unwrap_or(&[]);
        let mut applied = true;
        for item in expectations {
            if !schema_has(pool, item).await? {
                applied = false;
                break;
            }
        }
        if !applied {
            continue; // 没有 schema 证据 → 不敢改
        }

        sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = ?")
            .bind(&expected[..])
            .bind(version)
            .execute(pool)
            .await
            .map_err(|e| format!("更新迁移 {version} 的记账失败：{e}"))?;

        report.fixed.push((
            version,
            "记账 checksum 因换行符不一致，已按当前 SQL 纠正（schema 与数据未改动）".to_string(),
        ));
    }

    if report.is_empty() {
        Ok(None)
    } else {
        Ok(Some(report))
    }
}

/// schema 里是否存在某个表（或表的某列）。
async fn schema_has(pool: &SqlitePool, item: &str) -> Result<bool, String> {
    match item.split_once('.') {
        Some((table, column)) => {
            let n: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?",
            )
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("检查 {item} 失败：{e}"))?;
            Ok(n > 0)
        }
        None => {
            let n: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
            )
            .bind(item)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("检查 {item} 失败：{e}"))?;
            Ok(n > 0)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_sql::MigrationKind;

    /// 建一个「迁移已执行」的最小库：v3 的三列都在，记账表按 sqlx 的真实结构建。
    async fn seeded_pool(stored_checksum: Vec<u8>) -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE todos (
                id INTEGER PRIMARY KEY, title TEXT, date TEXT,
                uuid TEXT, updated_at_ms INTEGER, deleted INTEGER
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE _sqlx_migrations (
                version BIGINT PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES (3, 'add_sync_columns_to_todos', 1, ?, 0)",
        )
        .bind(stored_checksum)
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn migration_with(sql: &'static str) -> Migration {
        Migration {
            version: 3,
            description: "add_sync_columns_to_todos",
            sql,
            kind: MigrationKind::Up,
        }
    }

    /// 回归：旧 Windows 包记下的是 **CRLF 版 checksum**，修复应把它纠正回来。
    #[test]
    fn repairs_checksum_differing_only_by_line_endings() {
        tauri::async_runtime::block_on(async {
            let lf_sql = "ALTER TABLE todos ADD COLUMN uuid TEXT;\n-- 注释\n";
            let crlf_sql = lf_sql.replace('\n', "\r\n");
            let pool = seeded_pool(checksum_of(crlf_sql.as_bytes())).await;

            let report = repair_pool(&pool, &[migration_with(lf_sql)])
                .await
                .unwrap()
                .expect("应当修复了一处");

            assert_eq!(report.fixed.len(), 1);
            assert_eq!(report.fixed[0].0, 3);

            let stored: Vec<u8> =
                sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = 3")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stored, checksum_of(lf_sql.as_bytes()));
        });
    }

    /// 负向：内容真的被改过（不只是换行符）时**不许**改记账。
    #[test]
    fn leaves_untouched_when_content_really_changed() {
        tauri::async_runtime::block_on(async {
            let current = "ALTER TABLE todos ADD COLUMN uuid TEXT;\n";
            let old = "ALTER TABLE todos ADD COLUMN uuid TEXT; DROP TABLE todos;\n";
            let pool = seeded_pool(checksum_of(old.as_bytes())).await;

            let report = repair_pool(&pool, &[migration_with(current)]).await.unwrap();
            assert!(report.is_none(), "内容变更不得被当成换行符差异而修复");

            let stored: Vec<u8> =
                sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = 3")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stored, checksum_of(old.as_bytes()), "记账不应被改动");
        });
    }

    /// 负向：没有 schema 证据（迁移其实没跑过）时**不许**改记账。
    #[test]
    fn leaves_untouched_without_schema_evidence() {
        tauri::async_runtime::block_on(async {
            let lf_sql = "ALTER TABLE todos ADD COLUMN uuid TEXT;\n";
            let crlf_sql = lf_sql.replace('\n', "\r\n");
            let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
            // 只建记账表，**不建 todos** → 没有 schema 证据
            sqlx::query(
                "CREATE TABLE _sqlx_migrations (
                    version BIGINT PRIMARY KEY,
                    description TEXT NOT NULL,
                    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN NOT NULL,
                    checksum BLOB NOT NULL,
                    execution_time BIGINT NOT NULL
                )",
            )
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
                 VALUES (3, 'x', 1, ?, 0)",
            )
            .bind(checksum_of(crlf_sql.as_bytes()))
            .execute(&pool)
            .await
            .unwrap();

            let report = repair_pool(&pool, &[migration_with(lf_sql)]).await.unwrap();
            assert!(report.is_none(), "缺少 schema 证据时不得改记账");
        });
    }

    /// 不变量：**每个迁移的 SQL 都不得含 CR**。
    ///
    /// 这是本次事故的根本防线 —— SQL 里一旦有 CR，checksum 就会随平台变化。
    /// v3 的字节由 `build.rs` 归一化产出，所以这里在**任何平台**上都必须为真。
    #[test]
    fn migration_sql_contains_no_carriage_return() {
        for migration in crate::migrations() {
            assert!(
                !migration.sql.contains('\r'),
                "迁移 {} 的 SQL 里含 CR —— checksum 会随 checkout 的换行符变化，各平台对不上",
                migration.version
            );
        }
    }

    /// 不变量：**内嵌的 v3 SQL 必须等于「源文件归一化成 LF 后」的内容**。
    ///
    /// 与上一条互补：上一条在 **CRLF 平台**（Windows）才咬得住；
    /// 这一条在**任何平台**都成立 —— 它证明「内嵌的字节与源文件的换行符无关」。
    #[test]
    fn migration_sql_is_independent_of_source_line_endings() {
        let source = std::fs::read_to_string("migrations/0003_sync_columns.sql")
            .expect("读取 v3 迁移 SQL 失败");
        let normalized = source.replace("\r\n", "\n");
        let embedded = crate::migrations()
            .iter()
            .find(|m| m.version == 3)
            .expect("应存在 v3 迁移")
            .sql;
        assert_eq!(
            embedded, normalized,
            "内嵌的 v3 SQL 与「源文件归一化后」不一致 —— 它仍然随源文件的换行符变化"
        );
    }
}
