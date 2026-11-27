/**
 * 跨平台的 SQLite 执行后端。
 *
 * ## 为什么需要它
 *
 * `scripts/check-sync.mjs` 的「v3 迁移结构证据」要**真的建库、真的跑迁移、真的查表**。
 * 原来直接 `execFileSync('sqlite3', ...)`：
 *
 * - macOS 自带 `/usr/bin/sqlite3` → 能跑；
 * - **windows-latest 的 runner 镜像里没有 sqlite3.exe**（镜像清单的 Database Systems
 *   一节只有 PostgreSQL 与 MongoDB；Git for Windows 内部链接 libsqlite3 但**不提供
 *   命令行**）→ `execFileSync` 抛 ENOENT → 整个自检脚本失败。
 *
 * 2026-11-23 复查 CI 历史才发现：**Windows job 从 v0.2.6 起就卡在自检链的第一个失败
 * 脚本上，后面的 7 个脚本在 Windows 上一次都没跑过** —— 修完 CRLF 之后，
 * `check-sync` 会立刻暴露这个问题。所以两个后端都留，且要求它们**逐字节等价**。
 *
 * ## 退路顺序（顺序有讲究）
 *
 * 1. `sqlite3` 命令行 —— macOS 自带，输出格式天然就是我们要的；
 * 2. `python3` / `python` —— **标准库自带 sqlite3**，windows-latest 与 macOS runner
 *    都带 Python，用它跑同一批 SQL；
 * 3. 都没有 → 返回 `null`，由调用方**明确跳过**并说明原因（措辞上区分
 *    「跳过（不具备技术条件）」与「通过」）。
 *
 * macOS 上永远走 ①，所以 **macOS 的行为与改造前逐字节一致**；Windows 上落��� ②。
 *
 * ## 两类操作要分开
 *
 * - `run()`   —— 只执行（DDL / DML），**可以含多条语句**；
 * - `query()` —— 取结果，**只接受单条 SELECT / PRAGMA**。
 *
 * 分开的原因：`sqlite3` 命令行与 Python 的 `executescript` / `execute` 在
 * 「多语句」与「要结果」上能力不同，分开后两边都不需要写 SQL 分词器，
 * 也就不会有「分词器把字符串里的分号当语句边界」这类坑。
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Python 退路用的执行器（与本文件同目录） */
const PY_RUNNER = fileURLToPath(new URL('./sqlite-run.py', import.meta.url));

/**
 * 探测一个命令能不能用。
 *
 * **要真的跑一次最小命令**，而不是只看 PATH 里有没有 —— `node` 在任何 Node 环境里
 * 都「存在」，但 `import sqlite3` 未必成功；同理 python3 可能是个坏掉的壳。
 */
function probe(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

/** 命令行后端：跑一段 SQL，输出原样返回 */
function cliRun(dbPath, sql) {
  const result = spawnSync('sqlite3', [dbPath], { encoding: 'utf8', input: sql });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 退出码 ${result.status}：${(result.stderr || '').trim()}`);
  }
  return result.stdout.trim();
}

/** 找出可用的 Python 解释器（Windows 上通常是 `python`，macOS 上是 `python3`） */
function detectPythonCommand() {
  for (const cmd of ['python3', 'python']) {
    if (probe(cmd, ['-c', 'import sqlite3'])) return cmd;
  }
  return null;
}

/** Python 后端：执行一段 SQL（可含多条语句） */
function pythonRun(cmd, dbPath, sql) {
  const result = spawnSync(cmd, [PY_RUNNER, 'run', dbPath], { encoding: 'utf8', input: sql });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} 退出码 ${result.status}：${(result.stderr || '').trim()}`);
  }
  return '';
}

/** Python 后端：查一条语句 */
function pythonQuery(cmd, dbPath, sql) {
  const result = spawnSync(cmd, [PY_RUNNER, 'query', dbPath], { encoding: 'utf8', input: sql });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} 退出码 ${result.status}：${(result.stderr || '').trim()}`);
  }
  return result.stdout.trim();
}

function makePythonBackend(cmd) {
  return {
    kind: 'python',
    label: `${cmd} 标准库 sqlite3`,
    run: (dbPath, sql) => pythonRun(cmd, dbPath, sql),
    query: (dbPath, sql) => pythonQuery(cmd, dbPath, sql),
  };
}

/** 只探测命令行后端（用于「两个后端对拍」） */
export function detectCliBackend() {
  if (!probe('sqlite3', ['-version'])) return null;
  return {
    kind: 'cli',
    label: 'sqlite3 命令行',
    run: (dbPath, sql) => cliRun(dbPath, sql),
    query: (dbPath, sql) => cliRun(dbPath, sql),
  };
}

/** 只探测 Python 后端（用于「两个后端对拍」） */
export function detectPythonBackend() {
  const cmd = detectPythonCommand();
  return cmd ? makePythonBackend(cmd) : null;
}

/**
 * 选一个能用的后端：优先命令行，其次 Python。
 * 两个都没有时返回 `null` —— 调用方必须**明确跳过**并说明原因，不许静默通过。
 */
export function detectSqliteBackend() {
  return detectCliBackend() ?? detectPythonBackend();
}
