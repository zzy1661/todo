# S10 同步层 · 验证证据（本地 stub，无 key 期间）

> 记录日期：2026-11-01 · 机器：macOS 14.1 / Apple Silicon（arm64）· Node v22.21.1
> 结论：**本地可判定项全部 PASS；云端真实连通全部 `NOT-VERIFIED`（无 anon key）**。
> 本文件只记录可复跑的命令与真实输出，不包含任何 key 内容。

## 1. 构建与回归

```bash
$ npm run build
> vue-tsc --noEmit && vite build
✓ built in 156ms          # 类型检查 0 error，构建 0 error

$ npx playwright test      # 主套件（AC-03 回归红线）
6 passed (10.3s)

$ npx playwright test -c playwright.sync.config.ts   # 同步套件（e2e-sync/，独立 testDir）
4 passed (2.4s)

$ cd src-tauri && cargo test --test migration_guard
4 passed; 0 failed        # 含 v3 结构 / 幂等回填 / 迁移只增不改
```

## 2. 同步五组路径（本地 stub）

```bash
$ node scripts/check-sync.mjs
── ① 5 秒防抖推送（TC-065 / TC-066 / TC-067）
   ✓ PASS（23 项断言）      # 3 次变更 → 1 次推送、4.9s 无请求 / 5.0s 一次、payload 只含变更条目、删除推 deleted=1
── ② 启动拉取合并 / 登录后立即拉取（TC-068 / TC-069）
   ✓ PASS（4 项断言）       # 启动拉 1 次、登录后立即拉 1 次、本地原有不丢、拉取结果不推送
── ③ LWW 与同毫秒稳定序（TC-070 / TC-071 / TC-072）
   ✓ PASS（8 项断言）       # 100/200 双向、同毫秒两种到达顺序逐字节一致、6 小时偏移按 LWW
   · R-T-13 已登记：updated_at_ms 取客户端时钟，快 6 小时的设备会一直胜出
── ④ 墓碑终结与软删除（TC-073 / TC-074 / TC-075）
   ✓ PASS（9 项断言）       # 远端 deleted=1 落库、三个读取路径均不可见、更旧/更新的非删除记录都不复活、本地删除推 deleted=1 且行仍在库
── ⑤ 401 失效 → 刷新重试 / 刷新失败重登
   ✓ PASS（9 项断言）       # 401 → refresh_token → 重试成功；刷新失败 → 清会话、置未登录、10s 内零请求
── ⑥ 未配置时零请求（AC-57）
   ✓ PASS（2 项断言）       # rest/v1 与 auth/v1 均 0 次
── v3 迁移结构证据（TC-076 / AC-64，只给 todos 加列）
   ✓ PASS（20 项断言）
✓ 同步自检 PASS：78 项断言，六组路径 + v3 迁移结构证据全部通过   # S1 白名单整改后 75 → 78（+3 条密钥形态断言）
  NOT-VERIFIED：真实 Supabase 读写、真实 GitHub OAuth 往返、云侧 RLS 越权不可见
```

stub 端点（`scripts/mock-supabase.mjs`）：`/auth/v1/authorize`（校验 `code_challenge` + `s256`，302 回
`redirect_to?code=&state=`）、`/auth/v1/token?grant_type=pkce|refresh_token`（校验 `code_verifier` 的 S256）、
`/auth/v1/logout`、`GET|POST /rest/v1/todos`。每个请求都记账，断言基于真实请求记录与真实落库结果。

## 3. 软删除读取路径的静态断言

```bash
$ node scripts/check-deleted-filter.mjs
扫描 33 个源文件：5 条 todos 读取语句，其中 4 条为同步网关的全量读取（-- sync-all-rows）
✓ 软删除过滤检查 PASS：所有读取路径都带 deleted = 0，删除不做物理 DELETE
```

## 4. 真实桌面库的 v2 → v3 升级（本机实测）

升级前（`todo.db.bak`，S6 交付时的 v2 结构）：

```
0|id|INTEGER|0||1
1|title|TEXT|1||0
...
7|updated_at|TEXT|1|datetime('now','localtime')|0
```

启动含 v3 迁移的 `.app` 后：

```
$ diff before.txt after.txt
8a9,11
> 8|uuid|TEXT|0||0
> 9|updated_at_ms|INTEGER|0||0
> 10|deleted|INTEGER|1|0|0
```

```
$ sqlite3 todo.db "select count(*), count(distinct uuid), sum(deleted) from todos;"
5|5|0                       # 5 条历史数据一条没丢，uuid 唯一非空，deleted 默认 0

$ sqlite3 todo.db "select version, description from _sqlx_migrations order by version;"
1|create_todos_table
2|create_daily_picks_table
3|add_sync_columns_to_todos
```

二次启动后 uuid 组串逐字相同（`uuid 相同: YES`），行数仍为 5 → 回填幂等（AC-64）。

## 5. 打包产物

```
lipo -archs  src-tauri/target/release/bundle/macos/日程待办.app/Contents/MacOS/todo  →  arm64
plutil -extract CFBundleIdentifier raw …        →  com.poisson.todo
plutil -extract CFBundleShortVersionString raw …→  0.1.0
plutil -extract LSMinimumSystemVersion raw …    →  12.0
codesign -dv                                     →  Signature=adhoc / TeamIdentifier=not set（未签名，预期）

日程待办.app                                    6.2M
日程待办_0.1.0_aarch64.dmg                      3.2M
strings -a <binary> | grep -acE "service_role|SUPABASE_SERVICE" → 0   # 必须带 -E：不带 -E 时 `|` 是字面量，恒为 0（永真陷阱）
```

## 6. 密钥边界

```bash
$ grep -rn "service_role\|SUPABASE_SERVICE" src/ src-tauri/src src-tauri/migrations scripts/*.mjs
（无输出）
$ strings -a "…/Contents/MacOS/todo" | grep -c "service_role\|SUPABASE_SERVICE"
0
$ strings -a "…/Contents/MacOS/todo" | grep -c "bbaspdboyysqmjhqhdhj"
0                      # 项目 URL 也只来自运行期配置，不在产物里
$ git ls-files | grep -E "(^|/)\.env|sync\.config\.json$"
（无输出）              # 真实配置与 .env 均未入库，仓库只有 sync.config.example.json
```

> **这条 `strings` 证据的边界（2026-11-01 补充）**：Tauri 会把前端资源压缩后嵌入 `.app`，
> 二进制 `strings` 看不到 JS 字符串（实测「未配置同步」在 `dist/` 有、在二进制里就是 0 命中）。
> 所以「产物 0 命中」只覆盖 **Rust 层与未压缩部分**；前端侧等价判据是 `grep -rac "service_role" dist/`
> ——`dist/` 正是被嵌入的那份字节。别把它读成「整个 .app 已逐字扫过」。

## 7. NOT-VERIFIED（等 anon key 后由 S10.5 补跑）

| 项 | 原因 |
| --- | --- |
| 真实 Supabase 读写（云端建表 / upsert / 拉取） | 无 anon key；`/auth/v1/health` 401 属预期 |
| 真实 GitHub OAuth 往返（含 GitHub 侧回调配置） | 无 anon key，且需项目侧启用 GitHub provider |
| 云侧 RLS 越权不可见（A 用户 token 读 B 用户数据） | 需要两个真实会话 |
| 桌面端钥匙串写入 / 回环监听的真实点击链路 | 代码已接入，自动化只到注入层；需 key 后实机点一次 |

## 8. 已知风险

| 编号 | 风险 | 处置 |
| --- | --- | --- |
| R-SYNC-01 / R-T-13 | LWW 用客户端时钟，快 6 小时的设备会一直胜出 | 规则不改（D-18）；设计 §12.7 明确「仍用客户端时钟」并说明不采用服务端 now / max 的理由 |
| R-SYNC-02 | 会话写入钥匙串时 token 出现在 `security` 子进程参数里一次 | token 不落明文、不进日志、不进 localStorage；加固需引入 `security-framework` crate，本期不做 |
| R-SYNC-03 | 云端能力长期未验证 | 本文件 §7 与交付评论单列 NOT-VERIFIED，不计入通过率 |
