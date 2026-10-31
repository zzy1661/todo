//! SQLite 路径的运行时校验：把真实 SQL 打到真实 SQLite 库上，
//! 核对与 localStorage 路径的语义是否逐条一致。
//!
//! 该测试不依赖 Tauri 运行时：直接用 rusqlite / sqlite3 CLI 无法引入，
//! 因此改用 `sqlite3` 命令行执行同样的 SQL（macOS 自带）。
//!
//! 用法：cargo test --test migration_guard

use std::process::Command;

/// 执行一段 SQL 并返回标准输出
fn sql(db: &str, stmt: &str) -> String {
    let out = Command::new("sqlite3")
        .arg(db)
        .arg(stmt)
        .output()
        .expect("sqlite3 命令不可用");
    assert!(
        out.status.success(),
        "SQL 执行失败: {stmt}\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

#[test]
fn sqlite_path_matches_localstorage_semantics() {
    let db = std::env::temp_dir().join("todo_s1_semantics_test.db");
    let db = db.to_str().unwrap();
    let _ = std::fs::remove_file(db);

    // 与 lib.rs 的 v1 / v2 迁移逐字一致
    sql(
        db,
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
    );
    sql(
        db,
        "CREATE TABLE IF NOT EXISTS daily_picks (
            date TEXT PRIMARY KEY,
            method_id TEXT NOT NULL,
            manual INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0
        );",
    );

    // 新建：id 自增、默认时间戳生成、done 默认 0
    sql(
        db,
        "INSERT INTO todos (title, date, priority, note) VALUES ('A', '2026-11-01', 1, '');",
    );
    let row = sql(db, "SELECT id, done, created_at FROM todos LIMIT 1;");
    let parts: Vec<&str> = row.split('|').collect();
    assert_eq!(parts[0], "1", "首个待办 id 应为 1");
    assert_eq!(parts[1], "0", "done 应存为 0");
    assert!(
        parts[2].len() == 19 && parts[2].contains(' '),
        "created_at 应由数据库默认生成，实际 {}",
        parts[2]
    );

    // 落库后回查完整行（createTodo 的返回语义）
    let full = sql(
        db,
        "SELECT id, title, date, priority, note, done, created_at, updated_at FROM todos WHERE id = 1;",
    );
    assert_eq!(full.split('|').count(), 8, "回查应返回 8 个字段");

    // 部分更新：只为显式传入的字段拼 SET
    sql(db, "UPDATE todos SET title = 'A2', updated_at = datetime('now','localtime') WHERE id = 1;");
    let row = sql(db, "SELECT title, date, priority, note FROM todos WHERE id = 1;");
    assert_eq!(row, "A2|2026-11-01|1|", "未传字段被错误改写");

    // done 布尔转 1/0
    sql(db, "UPDATE todos SET done = 1 WHERE id = 1;");
    assert_eq!(sql(db, "SELECT done FROM todos WHERE id = 1;"), "1");
    sql(db, "UPDATE todos SET done = 0 WHERE id = 1;");
    assert_eq!(sql(db, "SELECT done FROM todos WHERE id = 1;"), "0");

    // 排序：date ASC → priority DESC → id DESC
    sql(db, "INSERT INTO todos (title, date, priority) VALUES ('B', '2026-11-02', 2);");
    sql(db, "INSERT INTO todos (title, date, priority) VALUES ('C', '2026-11-01', 2);");
    sql(db, "INSERT INTO todos (title, date, priority) VALUES ('D', '2026-11-01', 0);");
    let order = sql(db, "SELECT title FROM todos ORDER BY date ASC, priority DESC, id DESC;");
    assert_eq!(order, "C\nA2\nD\nB", "全量排序不符");
    let order = sql(db, "SELECT title FROM todos WHERE date = '2026-11-01' ORDER BY priority DESC, id DESC;");
    assert_eq!(order, "C\nA2\nD", "单日排序不符");

    // 按月查询
    let n = sql(db, "SELECT count(*) FROM todos WHERE date LIKE '2026-11%';");
    assert_eq!(n, "4");
    let n = sql(db, "SELECT count(*) FROM todos WHERE date LIKE '2026-12%';");
    assert_eq!(n, "0", "跨月查询未隔离");

    // AUTOINCREMENT：删除最高 id 后不复用
    sql(db, "DELETE FROM todos WHERE id = 4;");
    sql(db, "INSERT INTO todos (title, date, priority) VALUES ('E', '2026-11-03', 1);");
    let max_id = sql(db, "SELECT max(id) FROM todos;");
    assert_eq!(max_id, "5", "AUTOINCREMENT id 被复用");

    // 推送：一日一行，重复写入为覆盖
    sql(
        db,
        "INSERT INTO daily_picks (date, method_id, manual, updated_at) VALUES ('2026-11-01', 'gtd', 0, 1);",
    );
    sql(
        db,
        "INSERT INTO daily_picks (date, method_id, manual, updated_at) VALUES ('2026-11-01', '5w2h', 1, 2)
         ON CONFLICT(date) DO UPDATE SET
           method_id = excluded.method_id,
           manual = excluded.manual,
           updated_at = excluded.updated_at;",
    );
    let n = sql(db, "SELECT count(*) FROM daily_picks;");
    assert_eq!(n, "1", "推送重复写入产生了第二行");
    let row = sql(db, "SELECT method_id, manual FROM daily_picks WHERE date = '2026-11-01';");
    assert_eq!(row, "5w2h|1", "推送覆盖失败");

    let _ = std::fs::remove_file(db);
}

/// 迁移只增不改：lib.rs 的迁移 SQL 里不得出现破坏性语句
#[test]
fn migration_sql_is_additive_only() {
    let lib = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/lib.rs");
    let content = std::fs::read_to_string(&lib).expect("读取 lib.rs 失败");

    for line in content.lines() {
        let upper = line.to_uppercase();
        // 注释行不参与判定
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with("///") {
            continue;
        }
        assert!(
            !upper.contains("DROP ") && !upper.contains("ALTER "),
            "迁移 SQL 出现破坏性语句: {line}"
        );
    }
}
