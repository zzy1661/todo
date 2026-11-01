# S9 · git 交付记录（ZACHTD-11）

本次交付把 macOS 移植版整条分支推到远端，并用新内容替换 `master` 上的旧 demo。
旧 demo（Windows 时代的 Tauri/Vue demo）由人类明确授权删除，删除前先打备份 tag。

| 项 | 值 |
| --- | --- |
| 远端 | `git@github.com:zzy1661/todo.git`（**SSH**） |
| 传输说明 | 本机 HTTPS 到 github.com 超时，只有 SSH 可用；remote 因此是 SSH URL，未使用任何 token |
| 交付分支 | `release/ZACHTD-2-macos-port` |
| 分支 URL | https://github.com/zzy1661/todo/tree/release/ZACHTD-2-macos-port |
| 备份 tag | `pre-macos-port-backup` → `a1435304bb0143e0992dcdf9bd556d54b4ee076e`（旧 master） |
| master 强推前 | `a1435304bb0143e0992dcdf9bd556d54b4ee076e` |
| master 强推后 | 与分支 HEAD **同一个提交**：`git rev-parse origin/master` == `git rev-parse origin/release/ZACHTD-2-macos-port` |
| 未触碰的分支 | `dva`（`c584079c…`）、`test1`（`e8533833…`）、`test-redux-router`（`cf7bb0f1…`）；tag `version2` 保留 |
| CI（`macos-latest` / `windows-latest`） | **`NOT-VERIFIED`** —— 本机看不到 GitHub Actions 结果，见 §4 |

> **为什么不把分支 HEAD 的 SHA 写死在本文里**：本文自身也是一个提交，写死就等于写下一个
> 必然过期一版的自引用值。HEAD 的实际 SHA 在 ZACHTD-11 的回帖里，也可用
> `git ls-remote origin refs/heads/release/ZACHTD-2-macos-port` 现场取。
> 本文下面「提交清单」列的是**本条分支相对旧 master 的全部交付提交**，SHA 永久有效。

## 1. 提交清单（`00fa1b6..HEAD`，旧 master 之上）

| # | commit | 标题 | 文件数 |
| --- | --- | --- | --- |
| 1 | `445dcd5765d13460ad95d6f019890522a9c17162` | `feat(sync): whitelist the anon key and guard the repo against secrets` | 11 |
| 2 | `2e67ccd5e4d98ebd9aa16c93f210d61796c6ef80` | `docs(requirements): land PRD v1.6, test plan v1.3 and the AC-68 ledger` | 4 |
| 3 | `aa3f2732ea3763ed6ccc3819b087083d91109be8` | `docs(delivery): refresh the README for install, platform limits and docs` | 18 |
| 4 | `7c8ae761248a36fafb2fb1ac1ba6f59612536373` | `chore: drop the Windows-era agent instructions` | 1 |
| 5 | `ece09b593b231741074b54e3a3836658dce5012a` | `chore: stop tracking the Multica runtime state` | 2 |

本次之前的 S10 提交（同一条分支的历史）：`ef23869` 同步层 → `f02c892` 设计增量 →
`650b1b3` 证据刷新 → `bae0e63` 初始化与 PKCE 收敛 → `eb57701` PRD v1.2/v1.3 →
`40d3cce` 软删除广播修正 → `00fa1b6` S10 stub 证据与 v2→v3 迁移实跑。

**提交前闸门（全部实跑，均绿）**

```console
$ npm run check:no-secrets
  ✓ 扫描 59 个文件，0 处密钥形态命中（AC-67）
check-no-secrets: PASS

$ npm run build
✓ 73 modules transformed ... ✓ built in 237ms        # 0 error

$ npx playwright test
  6 passed (10.4s)

$ npx playwright test -c playwright.sync.config.ts
  4 passed (2.4s)
```

产物仍在（S6 产物沿用，未重新构建）：`src-tauri/target/release/bundle/macos/日程待办.app`、
`src-tauri/target/release/bundle/dmg/日程待办_0.1.0_aarch64.dmg`（3.3 MB）。

## 2. 推送顺序（先非破坏性，后破坏性）

```bash
# ① 分支：非破坏性
git push -u origin release/ZACHTD-2-macos-port

# ② 备份旧 master：必须早于 ③，且要在远端确认 ref 已存在
git tag pre-macos-port-backup a1435304bb0143e0992dcdf9bd556d54b4ee076e
git push origin pre-macos-port-backup
git ls-remote origin 'refs/tags/pre-macos-port-backup'   # 有输出才继续

# ③ 用新内容替换 master（人类已授权删除旧 demo）
git push origin HEAD:master --force-with-lease=refs/heads/master:a1435304bb0143e0992dcdf9bd556d54b4ee076e
```

`--force-with-lease` 绑定了旧 master 的 SHA：万一远端在这期间被别人改过，推送会被拒绝，
不会覆盖别人的提交。`dva` / `test1` / `test-redux-router` 与 tag `version2` 完全没碰。

## 3. 回滚

任何时刻都可以把旧 demo 原样放回 `master`（备份 tag 在远端）：

```bash
git fetch origin --tags
git push origin pre-macos-port-backup:master --force-with-lease=refs/heads/master:$(git rev-parse origin/master)
```

只想撤退分支、保留 master：`git push origin --delete release/ZACHTD-2-macos-port`。

## 4. CI 状态：`NOT-VERIFIED`

`.github/workflows/build.yml` 的触发条件是 `push: branches: [master, 'release/**']`、
`pull_request` 与手动 `workflow_dispatch`，所以本次推送**会**触发两条 job
（`macos-latest` / `windows-latest`，Windows job 真的执行 `npx tauri build`）。

但本机既看不到结果，也无法观察：HTTPS 到 github.com 不通、`gh` 未安装。
因此这里**只记 `NOT-VERIFIED`**，不写「CI 已通过」。
`windows-latest` 的结论尤其重要：README 里「Windows 侧交付可构建能力」是**静态三证**
（`check-bundle-config.mjs` 44 条断言 + matrix 真跑 `tauri build` + 交付说明标注未本机验证），
不是构建成功的实测。等 GitHub 上跑完，以实际结论复核这一句。
查看入口：`https://github.com/zzy1661/todo/actions`。

## 5. 推送后的只读复核

```bash
git ls-remote origin
```

判据三条：① `refs/heads/master` == `refs/heads/release/ZACHTD-2-macos-port`（同一提交）；
② `refs/tags/pre-macos-port-backup` 存在且指向旧 master `a1435304…`；
③ `dva` / `test1` / `test-redux-router` / `version2` 的 SHA 与推送前一致。

## 6. 入库与不入库

**入库**：`src/`、`src-tauri/`、`e2e/`、`e2e-sync/`、`scripts/`、`supabase/`、`docs/**`、
`screenshots/**`、`videos/**`、`README.md`、`.github/workflows/build.yml`。

**不入库**（`.gitignore`）：`node_modules/`、`dist/`、`test-results*/`、`src-tauri/target/`、
`src-tauri/gen/`、`sync.config.json`、`.env*`、`.multica/`、`.opencode/`、`AGENTS.md`、
`_ctx/`（新增临时脚本一律忽略；早前已入库的 `_ctx/SPEC.md` 等 Windows 基线参考件保持不变）、
`result.md`。

## 7. 交付前的密钥闸（最后一次实跑）

```console
$ git grep -n "<project-ref>"               # 真实 project ref（此处不写字面，避免文档自命中）
（无输出）
$ git grep -nE "sb_secret_|eyJ[A-Za-z0-9_-]{10,}"     # 只剩负向夹具与说明文本
$ npm run check:no-secrets
  ✓ 扫描 59 个文件，0 处密钥形态命中（AC-67）
check-no-secrets: PASS
```

**第一次闸门没过**：`git grep` 当时命中 3 行——PRD 的 DEP-06 / 需求来源两处写了真实
project ref，`docs/verification/s10/sync-evidence.md` 的 `strings` 命令把 ref 当检索串。
本仓库的 `.gitignore` 拦不住「已经写进文档的字符串」，所以这 3 处改成 `<project-ref>` 占位，
并在 PRD 对应单元格与证据行注明「真实 project ref 不入库，交付前已脱敏」。
`supabase/schema.sql` 的同类写法则在本次提交里一并改成占位（见提交 1）。

> project ref 不是密钥，但它指向真实云端实例的地址，按交付口径同样不写进版本库；
> `sync.config.json`（运行期放 anon key 的那份）始终被 `.gitignore` 排除，仓库只有 `.example`。

