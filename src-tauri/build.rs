use std::path::PathBuf;

/// 把迁移 SQL **归一化成 LF** 后写入 `OUT_DIR`，供 `include_str!` 使用。
///
/// ## 为什么必须归一化
///
/// sqlx 用 `SHA-384(sql 的字节)` 给每个迁移记账（存进 `_sqlx_migrations.checksum`），
/// 每次启动都会校验；对不上就报
/// `migration N was previously applied but has been modified`，**迁移被拒绝执行**。
///
/// 关键差别在于两种 SQL 来源：
///
/// | 来源 | 换行符处理 | 结果 |
/// | --- | --- | --- |
/// | Rust **内联字符串字面量** | 编译器把 CRLF **归一化成 LF** | 各平台字节一致 → checksum 永远相同 |
/// | **`include_str!` 读文件** | **原样嵌入文件字节**（CRLF 就是 CRLF） | checksum **随 checkout 的换行符变化** |
///
/// 本项目 v1 / v2 是内联字面量（安全），**v3 是 `include_str!` 读 `.sql` 文件**
/// —— 它是唯一会因平台而变的迁移。
///
/// ## 事故经过（2026-11-23）
///
/// - v0.3.0 之前仓库**没有 `.gitattributes`**，而 GitHub Actions 的 `actions/checkout`
///   在 Windows 上会把 `core.autocrlf` 设成 true → 检出为 **CRLF**；
/// - 于是 v0.2.0 – v0.2.5 的 Windows 安装包内嵌的是 **CRLF 版** v3 SQL，
///   它们创建的数据库记下的是 **CRLF 版 checksum**；
/// - v0.3.0 起有了 `.gitattributes`（`* text=auto eol=lf`）→ 新包算出的是 **LF 版 checksum**；
/// - 两者对不上 → sqlx 拒绝迁移 → sql 插件初始化失败 → **应用起不来**。
///
/// 这里在**编译期**归一化，保证每个平台嵌入的字节完全一致，
/// checksum 从此永久稳定（且与旧库的差异由 `migrate_repair` 一次性纠正）。
fn main() {
    tauri_build::build();

    let source = std::path::Path::new("migrations/0003_sync_columns.sql");
    println!("cargo:rerun-if-changed={}", source.display());

    let text = std::fs::read_to_string(source).expect("读取 v3 迁移 SQL 失败");
    let normalized = text.replace("\r\n", "\n");

    // 归一化必须**真的生效**：产物里不能残留 CR，否则 checksum 仍会随平台变化。
    // 这一条是**编译期**断言 —— 在任何平台上都成立（包括本来就只有 LF 的 macOS），
    // 而运行期的断言在 macOS 上是恒真的，守不住。
    assert!(
        !normalized.contains('\r'),
        "v3 迁移 SQL 归一化后仍含 CR：源文件里有单独的 CR 字符，无法用 CRLF→LF 消除"
    );

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR 未设置"));
    let out = out_dir.join("0003_sync_columns.sql");
    std::fs::write(&out, normalized).expect("写出归一化后的 v3 迁移 SQL 失败");
}
