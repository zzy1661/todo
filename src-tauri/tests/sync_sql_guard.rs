//! 同步网关 SQL 的**占位符**守卫（v0.3.9 新增）。
//!
//! # 这条测试守护的是什么
//!
//! 2026-11-26 实机故障：**桌面端（Windows / macOS 桌面版）的同步从来没有生效过**。
//! 根因在 `src/db/database.ts` 的同步网关读语句：
//!
//! ```text
//! const TODOS_ALL = `SELECT … FROM todos -- sync-all-rows`;   // ← 行注释
//! … db.select(`${TODOS_ALL} WHERE uuid = ?`, [uuid])           // ← 拼在后面
//! ```
//!
//! `--` 是**行注释**，会吞掉该行剩下的全部内容。拼出来的是
//!
//! ```sql
//! SELECT … FROM todos -- sync-all-rows WHERE uuid = ?
//! ```
//!
//! **`WHERE` 整段落进了注释** ⇒ 查询变成「查全部行」，绑定值被**静默忽略**。
//!
//! # 后果：不是报错，是**静默地算错**
//!
//! 在桌面驱动（sqlx + SQLite）上，这条语句**不报错**，而是：
//!
//! - `fetchTodoSyncRows([uuid])` ⇒ 返回**全部**行，而不是那一条；
//! - `applyRemoteTodos` 里 `existing[0]` 被当成本机同 uuid 的那一行 ⇒
//!   **每一次合并的判定都是拿另一个无关的行算出来的**；
//!   本机那一行的时间戳比云端新 ⇒ 判成 `lww-local` ⇒ **保持本地不变** ⇒
//!   **云端的数据永远合不进来**。
//!
//! 状态区于是报出「远端 8 行、新增 0 条、更新 0 条、**已是最新 8 条**」，
//! 而界面上一条都不显示 —— **正是 2026-11-25 实机反馈的原话**。
//!
//! 浏览器路径不拼 SQL，所以 E2E 与同步层断言全绿也照样漏了过去。
//!
//! # 为什么用 Rust / sqlx 写这条断言
//!
//! 桌面端真正跑的是 **sqlx + SQLite**（`tauri-plugin-sql` 用的就是它）。
//! 这里用**同一个驱动**把两种写法都真跑一遍：
//!
//! - 行注释写法：**过滤条件必须失效**（锁住故障形态）；
//! - 块注释写法：**过滤条件必须生效**（锁住修法）。
//!
//! 修法在 TypeScript 侧（`/* sync-all-rows */`），这条测试是它的**行为等价物**。
//!
//! ⚠️ 注意：Node 侧的 `node:sqlite` 在同样情况下会**报错**
//! （`column index out of range`），而桌面驱动是**静默忽略**。
//! **同一个根因，两种表现** —— 这也是它能一路躲过测试的原因：
//! 浏览器路径根本不拼 SQL，Node 路径会报错因而能抓到，只有桌面路径会静默出错。

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::sync::atomic::{AtomicU64, Ordering};

/// 临时库文件名：标签 + 进程号 + 纳秒 + 原子计数器（四段唯一，
/// 与 `migration_guard.rs` 同一套规则 —— 并行测试撞名会把已打开的库移走）。
fn temp_db_path(tag: &str) -> std::path::PathBuf {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("系统时间早于 Unix 纪元")
        .as_nanos();
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "todo_s1_{tag}_{}_{nanos}_{seq}.db",
        std::process::id()
    ))
}

async fn open(db: &std::path::Path) -> SqlitePool {
    let options = SqliteConnectOptions::new()
        .filename(db)
        .create_if_missing(true);
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .expect("打开临时 SQLite 库失败")
}

/// 建一张与 v3 迁移后一致的 todos 表，塞**两行**（过滤生效时只应命中一行）
async fn seed(pool: &SqlitePool) {
    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 1,
            note TEXT NOT NULL DEFAULT '',
            done INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at_ms INTEGER NOT NULL DEFAULT 0,
            deleted INTEGER NOT NULL DEFAULT 0
        );",
    )
    .execute(pool)
    .await
    .expect("建表失败");
    sqlx::raw_sql(
        "INSERT INTO todos (uuid, title, date, priority, note, done, created_at, updated_at, updated_at_ms, deleted)
         VALUES ('u-1', '标题一', '2026-11-16', 1, '', 0, '2026-11-16 10:00:00', '2026-11-16 10:00:00', 1, 1);
         INSERT INTO todos (uuid, title, date, priority, note, done, created_at, updated_at, updated_at_ms, deleted)
         VALUES ('u-2', '标题二', '2026-11-17', 2, '', 0, '2026-11-17 10:00:00', '2026-11-17 10:00:00', 2, 0);",
    )
    .execute(pool)
    .await
    .expect("插入失败");
}

const COLUMNS: &str =
    "id, uuid, title, date, priority, note, done, created_at, updated_at, updated_at_ms, deleted";

/// 行注释写法（**故障形态**）：`WHERE` 落在注释里 ⇒ 过滤条件失效 ⇒ 查回**全部**行
#[test]
fn line_comment_marker_drops_the_where_clause() {
    tauri::async_runtime::block_on(async {
        let pool = open(&temp_db_path("linecomment")).await;
        seed(&pool).await;

        let sql = format!("SELECT {COLUMNS} FROM todos -- sync-all-rows WHERE uuid = ?");
        let rows = sqlx::query(&sql)
            .bind("u-2")
            .fetch_all(&pool)
            .await
            .expect("行注释写法在桌面驱动上不报错（这正是它危险的地方）");

        assert_eq!(
            rows.len(),
            2,
            "行注释写法应当把过滤条件丢掉、查回全部 2 行；\
             若这里只有 1 行，说明 SQLite 的行为变了，故障形态需要重新审"
        );
        // 绑定值被静默忽略 ⇒ 查不到任何「按 uuid 过滤」的语义
        let uuids: Vec<String> = rows.iter().map(|r| r.get::<String, _>("uuid")).collect();
        assert!(
            uuids.contains(&"u-1".to_string()) && uuids.contains(&"u-2".to_string()),
            "应当两张都查得到（过滤失效），实际：{uuids:?}"
        );
    });
}

/// 块注释写法（**修法**）：`WHERE` 生效 ⇒ 只查回匹配的那一行
#[test]
fn block_comment_marker_keeps_the_where_clause() {
    tauri::async_runtime::block_on(async {
        let pool = open(&temp_db_path("blockcomment")).await;
        seed(&pool).await;

        let sql = format!("SELECT {COLUMNS} FROM todos /* sync-all-rows */ WHERE uuid = ?");
        let rows = sqlx::query(&sql)
            .bind("u-2")
            .fetch_all(&pool)
            .await
            .expect("块注释写法应当能正常执行并绑上占位符");

        assert_eq!(rows.len(), 1, "过滤必须生效：只应命中 u-2");
        let uuid: String = rows[0].get::<String, _>("uuid");
        assert_eq!(uuid, "u-2");
        // 含墓碑的读取必须真的能读到墓碑行（deleted = 1），否则同步网关看不到删除记录
        let deleted: i64 = rows[0].get::<i64, _>("deleted");
        assert_eq!(deleted, 0, "u-2 是活行");
    });
}

/// 块注释写法在**批量**条件（`IN (?, ?, …)`）下同样成立
///
/// 同步网关的 `loadByUuids` 用的就是 `WHERE uuid IN (?, …)` ——
/// 它与单条查询是**同一种**「前缀 + 条件」拼法，必须一起被守住。
#[test]
fn block_comment_marker_works_with_in_clause() {
    tauri::async_runtime::block_on(async {
        let pool = open(&temp_db_path("inblock")).await;
        seed(&pool).await;

        let sql = format!("SELECT {COLUMNS} FROM todos /* sync-all-rows */ WHERE uuid IN (?, ?)");
        let rows = sqlx::query(&sql)
            .bind("u-1")
            .bind("u-2")
            .fetch_all(&pool)
            .await
            .expect("IN 条件应当能正常执行");

        assert_eq!(rows.len(), 2, "两个 uuid 都存在，应当查到 2 行");
    });
}

/// 墓碑行必须能被同步网关读出来（`deleted = 1` 也查得到）
///
/// `TODOS_ALL` 的用途就是「含墓碑的读取」——过滤条件生效之后，
/// 墓碑行**必须**在里面，否则墓碑终结就无从判断。
#[test]
fn tombstone_rows_are_readable_through_the_sync_gateway_query() {
    tauri::async_runtime::block_on(async {
        let pool = open(&temp_db_path("tombread")).await;
        seed(&pool).await;

        let sql = format!("SELECT {COLUMNS} FROM todos /* sync-all-rows */ WHERE uuid = ?");
        let rows = sqlx::query(&sql)
            .bind("u-1")
            .fetch_all(&pool)
            .await
            .expect("应当能正常执行");

        assert_eq!(rows.len(), 1);
        let deleted: i64 = rows[0].get::<i64, _>("deleted");
        assert_eq!(deleted, 1, "u-1 是墓碑行，必须能被同步网关读到");
    });
}
