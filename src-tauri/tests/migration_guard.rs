//! SQLite 路径的运行时校验：把真实 SQL 打到真实 SQLite 库上，
//! 核对与 localStorage 路径的语义是否逐条一致。
//!
//! # 为什么不用 `sqlite3` 命令行
//!
//! 原实现用 `sqlite3` 命令行执行 SQL，注释里也写明了「**macOS 自带**」——
//! 但**没有做任何平台分支**。而 `sqlite3` 命令**只有 macOS 自带**：
//! windows-latest 的 runner 镜像里没有（镜像的 Database Systems 一节
//! 只有 PostgreSQL 与 MongoDB；Git for Windows 内部链接 libsqlite3 但**不提供命令行**）。
//!
//! 结果就是：这个集成测试在 Windows 上**必然失败**——
//! 「无法执行 sqlite3 命令（macOS 自带）：program not found」。
//!
//! （2026-11-23：**Rust 测试第一次进 CI**，当场抓到。此前 Rust 侧断言从未进 CI，
//! 所以这个「只在 macOS 成立」的假设一直没人看见。）
//!
//! 现在改用 **sqlx**（本来就在依赖树里，`tauri-plugin-sql` 也用它）：
//! 两端行为一致、**不依赖任何外部命令**。
//!
//! 用法：cargo test --test migration_guard

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow};
use sqlx::{Row, SqlitePool};
use std::sync::atomic::{AtomicU64, Ordering};

/// 打开（或创建）一个 SQLite 库。
///
/// 用 `SqliteConnectOptions::filename()` 而不是拼 `sqlite:` 连接串：
/// 前者直接吃路径，**不会**被 URL 解析规则影响（Windows 的盘符 `C:\` 在 URL 语境下
/// 会被当成 scheme）。
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

/// 执行一段 SQL（**可以含多条语句**与 `--` 注释），不取结果。
async fn exec(pool: &SqlitePool, stmt: &str) {
    sqlx::raw_sql(stmt)
        .execute(pool)
        .await
        .unwrap_or_else(|e| panic!("SQL 执行失败: {stmt}\n{e}"));
}

/// 执行一条查询，返回每行的 `|` 分隔文本（**与 sqlite3 CLI 的 list 模式一致**：
/// 值用 `|` 分隔、一行一条记录、NULL 输出空串），多行之间用换行。
async fn query(pool: &SqlitePool, stmt: &str) -> String {
    let rows = sqlx::query(stmt)
        .fetch_all(pool)
        .await
        .unwrap_or_else(|e| panic!("查询失败: {stmt}\n{e}"));
    rows.iter()
        .map(row_to_text)
        .collect::<Vec<String>>()
        .join("\n")
}

/// 取一列的文本形态（与 `sqlite3` CLI 的 list 模式一致）。
///
/// sqlx 的类型检查是**严格**的：INTEGER 列按 `String` 解会直接报
/// 「mismatched types; Rust type `Option<String>` (as SQL type `TEXT`) is not
/// compatible with SQL type `INTEGER`」。
///
/// 而 SQLite 本身提供 `sqlite3_value_text` —— **任何类型都能转成文本**，CLI 就是这么做的。
/// sqlx 没把那个入口暴露成公开 API，所以这里按「文本 → 整数 → 实数」的顺序依次尝试，
/// 取第一个能解出来的（NULL 在任何类型下都解成 `None` → 空串）。
///
/// 本测试用到的列只有 TEXT 与 INTEGER 两种，所以这条链与 CLI 的输出逐字一致。
fn cell_text(row: &SqliteRow, index: usize) -> String {
    if let Ok(value) = row.try_get::<Option<String>, _>(index) {
        return value.unwrap_or_default();
    }
    if let Ok(value) = row.try_get::<Option<i64>, _>(index) {
        return value.map(|number| number.to_string()).unwrap_or_default();
    }
    if let Ok(value) = row.try_get::<Option<f64>, _>(index) {
        return value.map(|number| number.to_string()).unwrap_or_default();
    }
    String::new()
}

/// 把一行渲染成 `|` 分隔的文本。
///
/// 刻意与 `sqlite3` CLI 的 list 模式对齐（NULL 输出空串、整数按十进制），
/// 这样断言里的期望值与之前完全一致，不需要改测试语义。
fn row_to_text(row: &SqliteRow) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(row.len());
    for index in 0..row.len() {
        parts.push(cell_text(row, index));
    }
    parts.join("|")
}

/// 造一个本次运行独有的临时库文件名，避免并行跑测试时互相覆盖
///
/// **为什么不能只靠时间戳**：`SystemTime::now().as_nanos()` **不保证唯一**——
/// 系统时钟粒度可能粗到微秒级，同一时刻取两次完全可能拿到同一个值；
/// 而 `cargo test` 默认并行跑多个测试，于是两个测试会拿到**同一个文件名**。
/// 后启动的那个会执行 `remove_file` 把**另一个测试已经打开的库文件删掉**，
/// SQLite 随即报 `attempt to write a readonly database`
/// （扩展码 `SQLITE_READONLY_DBMOVED` = 库文件在打开期间被移走）。
///
/// （2026-11-25 实例：macOS CI 上 `migration_guard` **偶发**失败，Windows 上不复现——
/// 两端时钟粒度不同，撞名概率也不同。测试代码一个字没改，v0.3.4 还是全绿，
/// 所以这个坑只在 CI 上偶尔露头，肉眼极难发现。）
///
/// 现在文件名由四段组成：**测试标签 + 进程号 + 纳秒 + 原子计数器**。
/// 计数器保证**同一进程内绝不重复**（这正是撞名的场景），标签让不同测试互不干扰，
/// 进程号再隔离并发跑的多个进程。
///
/// `temp_db_paths_are_unique_under_concurrency` 是这条不变量的回归守卫。
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

#[test]
fn sqlite_path_matches_localstorage_semantics() {
    tauri::async_runtime::block_on(async {
        let db_path = temp_db_path("semantics");
        // **不再先删一次**：文件名已经唯一，删它只会误伤同名文件（见 temp_db_path 注释）
        let pool = open(&db_path).await;

        // 与 lib.rs 的 v1 / v2 迁移逐字一致
        exec(
            &pool,
            "CREATE TABLE IF NOT EXISTS todos (
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
        )
        .await;
        exec(
            &pool,
            "CREATE TABLE IF NOT EXISTS daily_picks (
            date TEXT PRIMARY KEY,
            method_id TEXT NOT NULL,
            manual INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        );",
        )
        .await;

        // 新建：id 自增、默认时间戳生成、done 默认 0
        exec(
            &pool,
            "INSERT INTO todos (title, date, priority, note) VALUES ('A', '2026-11-01', 1, '');",
        )
        .await;
        let row = query(&pool, "SELECT id, done, created_at FROM todos LIMIT 1;").await;
        let parts: Vec<&str> = row.split('|').collect();
        assert_eq!(parts[0], "1", "首个待办 id 应为 1");
        assert_eq!(parts[1], "0", "done 应存为 0");
        assert!(
            parts[2].len() == 19 && parts[2].contains(' '),
            "created_at 应由数据库默认生成，实际 {}",
            parts[2]
        );

        // 落库后回查完整行（createTodo 的返回语义）
        let full = query(
            &pool,
            "SELECT id, title, date, priority, note, done, created_at, updated_at FROM todos WHERE id = 1;",
        )
        .await;
        assert_eq!(full.split('|').count(), 8, "回查应返回 8 个字段");

        // 部分更新：只为显式传入的字段拼 SET
        exec(
            &pool,
            "UPDATE todos SET title = 'A2', updated_at = datetime('now','localtime') WHERE id = 1;",
        )
        .await;
        let row = query(&pool, "SELECT title, date, priority, note FROM todos WHERE id = 1;").await;
        assert_eq!(row, "A2|2026-11-01|1|", "未传字段被错误改写");

        // done 布尔转 1/0
        exec(&pool, "UPDATE todos SET done = 1 WHERE id = 1;").await;
        assert_eq!(query(&pool, "SELECT done FROM todos WHERE id = 1;").await, "1");
        exec(&pool, "UPDATE todos SET done = 0 WHERE id = 1;").await;
        assert_eq!(query(&pool, "SELECT done FROM todos WHERE id = 1;").await, "0");

        // 排序：date ASC → priority DESC → id DESC
        exec(&pool, "INSERT INTO todos (title, date, priority) VALUES ('B', '2026-11-02', 2);").await;
        exec(&pool, "INSERT INTO todos (title, date, priority) VALUES ('C', '2026-11-01', 2);").await;
        exec(&pool, "INSERT INTO todos (title, date, priority) VALUES ('D', '2026-11-01', 0);").await;
        let order = query(
            &pool,
            "SELECT title FROM todos ORDER BY date ASC, priority DESC, id DESC;",
        )
        .await;
        assert_eq!(order, "C\nA2\nD\nB", "全量排序不符");
        let order = query(
            &pool,
            "SELECT title FROM todos WHERE date = '2026-11-01' ORDER BY priority DESC, id DESC;",
        )
        .await;
        assert_eq!(order, "C\nA2\nD", "单日排序不符");

        // 按月查询
        let n = query(&pool, "SELECT count(*) FROM todos WHERE date LIKE '2026-11%';").await;
        assert_eq!(n, "4");
        let n = query(&pool, "SELECT count(*) FROM todos WHERE date LIKE '2026-12%';").await;
        assert_eq!(n, "0", "跨月查询未隔离");

        // AUTOINCREMENT：删除最高 id 后不复用
        exec(&pool, "DELETE FROM todos WHERE id = 4;").await;
        exec(&pool, "INSERT INTO todos (title, date, priority) VALUES ('E', '2026-11-03', 1);").await;
        let max_id = query(&pool, "SELECT max(id) FROM todos;").await;
        assert_eq!(max_id, "5", "AUTOINCREMENT id 被复用");

        // 推送：一日一行，重复写入为覆盖
        exec(
            &pool,
            "INSERT INTO daily_picks (date, method_id, manual, updated_at) VALUES ('2026-11-01', 'gtd', 0, 1);",
        )
        .await;
        exec(
            &pool,
            "INSERT INTO daily_picks (date, method_id, manual, updated_at) VALUES ('2026-11-01', '5w2h', 1, 2)
         ON CONFLICT(date) DO UPDATE SET
           method_id = excluded.method_id,
           manual = excluded.manual,
           updated_at = excluded.updated_at;",
        )
        .await;
        let n = query(&pool, "SELECT count(*) FROM daily_picks;").await;
        assert_eq!(n, "1", "推送重复写入产生了第二行");
        let row = query(
            &pool,
            "SELECT method_id, manual FROM daily_picks WHERE date = '2026-11-01';",
        )
        .await;
        assert_eq!(row, "5w2h|1", "推送覆盖失败");

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    });
}

/// 临时库文件名必须真的唯一：并发取名不得撞名
///
/// 这是 `temp_db_path` 的回归守卫。曾经的实现只用 `as_nanos()` 做后缀，
/// 撞名后两个测试互相删库，CI 上偶发
/// `attempt to write a readonly database`（SQLITE_READONLY_DBMOVED）。
///
/// 这里用 8 个线程各取 250 个名字（共 2000 个）验证「一个都不重复」——
/// 旧实现在时钟粒度粗的机器上会成片重复，新实现靠原子计数器保证唯一。
#[test]
fn temp_db_paths_are_unique_under_concurrency() {
    let handles: Vec<_> = (0..8)
        .map(|_| {
            std::thread::spawn(|| {
                (0..250)
                    .map(|_| temp_db_path("uniq").to_string_lossy().into_owned())
                    .collect::<Vec<String>>()
            })
        })
        .collect();

    let mut all: Vec<String> = Vec::new();
    for handle in handles {
        all.extend(handle.join().expect("取名线程 panic"));
    }

    let total = all.len();
    all.sort();
    all.dedup();
    assert_eq!(
        total,
        all.len(),
        "临时库文件名出现重复（取 {total} 个，去重后 {} 个）",
        all.len()
    );
}

/// 迁移只增不改：lib.rs 的迁移 SQL 里不得出现破坏性语句
///
/// BR-08 禁止的不只是 DROP / ALTER，还有对既有表的 DELETE / UPDATE。
#[test]
fn migration_sql_is_additive_only() {
    let lib = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs");
    let content = std::fs::read_to_string(&lib).expect("读取 lib.rs 失败");

    for line in content.lines() {
        // 注释行不参与判定
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with("///") {
            continue;
        }
        let upper = line.to_uppercase();
        for forbidden in ["DROP ", "ALTER ", "DELETE ", "UPDATE "] {
            assert!(
                !upper.contains(forbidden),
                "迁移 SQL 出现破坏性语句（{forbidden}）: {line}"
            );
        }
    }
}

/// v3 迁移：只给 todos 加 uuid / updated_at_ms / deleted，并幂等回填（AC-64 / TC-076）
///
/// 这个测试跑在真实 SQLite 上，用的 SQL 与 Rust 侧 `include_str!` 进来的是同一个文件。
#[test]
fn v3_migration_adds_sync_columns_to_todos_only() {
    tauri::async_runtime::block_on(async {
        let db_path = temp_db_path("v3columns");
        // **不再先删一次**：文件名已经唯一，删它只会误伤同名文件（见 temp_db_path 注释）
        let pool = open(&db_path).await;

        // v2 结构（与 lib.rs 的 v1 / v2 逐字一致）
        exec(
            &pool,
            "CREATE TABLE IF NOT EXISTS todos (
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
        )
        .await;
        exec(
            &pool,
            "CREATE TABLE IF NOT EXISTS daily_picks (
            date TEXT PRIMARY KEY,
            method_id TEXT NOT NULL,
            manual INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        );",
        )
        .await;
        exec(
            &pool,
            "INSERT INTO todos (title, date, priority) VALUES ('历史甲', '2026-11-01', 1), ('历史乙', '2026-11-02', 2);",
        )
        .await;

        let v3 = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations/0003_sync_columns.sql"),
        )
        .expect("读取 v3 迁移文件失败");
        exec(&pool, &v3).await;

        // 三列存在，且 daily_picks 未被加列（D-19）
        let todo_cols = query(
            &pool,
            "SELECT group_concat(name, ',') FROM pragma_table_info('todos');",
        )
        .await;
        for required in ["uuid", "updated_at_ms", "deleted"] {
            assert!(
                todo_cols.split(',').any(|name| name == required),
                "todos 缺少 {required} 列，实际 {todo_cols}"
            );
        }
        let pick_cols = query(
            &pool,
            "SELECT group_concat(name, ',') FROM pragma_table_info('daily_picks');",
        )
        .await;
        for forbidden in ["uuid", "updated_at_ms", "deleted"] {
            assert!(
                !pick_cols.split(',').any(|name| name == forbidden),
                "daily_picks 不应出现 {forbidden}，实际 {pick_cols}"
            );
        }

        // 回填：uuid 唯一非空、deleted 默认 0、updated_at_ms 为正
        assert_eq!(
            query(
                &pool,
                "SELECT count(*) FROM todos WHERE uuid IS NULL OR uuid = '';"
            )
            .await,
            "0",
            "历史行 uuid 未回填"
        );
        assert_eq!(
            query(&pool, "SELECT count(DISTINCT uuid) FROM todos;").await,
            query(&pool, "SELECT count(*) FROM todos;").await,
            "回填的 uuid 出现重复"
        );
        assert_eq!(
            query(&pool, "SELECT sum(deleted) FROM todos;").await,
            "0",
            "deleted 默认应为 0"
        );
        assert!(
            query(&pool, "SELECT min(updated_at_ms) FROM todos;")
                .await
                .parse::<i64>()
                .expect("updated_at_ms 不是整数")
                > 0,
            "updated_at_ms 未回填"
        );

        // 幂等：再次执行回填语句不改变已有 uuid
        let before = query(&pool, "SELECT group_concat(uuid) FROM todos ORDER BY id;").await;
        exec(
            &pool,
            "UPDATE todos SET updated_at_ms = CAST(strftime('%s', updated_at, 'utc') AS INTEGER) * 1000
         WHERE updated_at_ms IS NULL;",
        )
        .await;
        assert_eq!(
            query(&pool, "SELECT group_concat(uuid) FROM todos ORDER BY id;").await,
            before,
            "重复执行回填改变了已有 uuid"
        );

        // 软删除：行仍在库
        exec(&pool, "UPDATE todos SET deleted = 1 WHERE id = 1;").await;
        assert_eq!(
            query(&pool, "SELECT count(*) FROM todos;").await,
            "2",
            "软删除后行数不应变化"
        );
        assert_eq!(
            query(&pool, "SELECT deleted FROM todos WHERE id = 1;").await,
            "1"
        );

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    });
}

/// v3 迁移文件本身只允许 ADD COLUMN：不得 DROP、不得改 daily_picks
#[test]
fn v3_migration_is_additive_only() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("migrations/0003_sync_columns.sql");
    let content = std::fs::read_to_string(&path).expect("读取 v3 迁移文件失败");

    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("--") {
            continue; // 注释里可以出现「绝不 DROP」这类说明
        }
        let upper = line.to_uppercase();
        assert!(
            !upper.contains("DROP "),
            "v3 迁移出现 DROP: {line}"
        );
        assert!(
            !upper.contains("DELETE "),
            "v3 迁移出现 DELETE: {line}"
        );
        assert!(
            !upper.contains("DAILY_PICKS"),
            "v3 迁移不得改动 daily_picks（D-19）: {line}"
        );
        if upper.contains("ALTER ") {
            assert!(
                upper.contains("ALTER TABLE TODOS ADD COLUMN"),
                "v3 迁移只允许 ALTER TABLE todos ADD COLUMN: {line}"
            );
        }
    }
}
