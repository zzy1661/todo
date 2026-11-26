/**
 * 软删除读取路径的静态断言（PRD FR-SYNC-13 / RISK-14 / AC-63）。
 *
 * 为什么要有这条脚本：`deleted` 列一旦漏过滤，用户就会看到「已删待办复活」，
 * 且只在特定月份 / 特定列表出现，人工很难穷举。这里把「漏一处即缺陷」变成
 * 一条可复跑的机械断言：
 *
 * 1. `src/**` 中每一行 `FROM todos` 必须带 `deleted = 0`，
 *    唯一例外是显式带 `-- sync-all-rows` 标记的同步网关语句（含墓碑的读取）；
 * 2. 不得出现物理删除 `DELETE FROM todos`（NEG-03：删除必须走软删除）；
 * 3. 浏览器路径的三个 `localFetch*` 读取必须走 `readLiveTodos()`，
 *    不得直接调 `readAllLocalTodos()`（那条会带出墓碑）。
 *
 * 用法：node scripts/check-deleted-filter.mjs   （违规即以非零码退出）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCAN_DIR = path.join(ROOT, 'src');

const EXTS = new Set(['.ts', '.vue', '.js', '.mjs']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = walk(SCAN_DIR);
const problems = [];
let scannedStatements = 0;
let markedStatements = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (!/\bFROM\s+todos\b/i.test(line)) return;
    // 注释行可能只是在说明规则（例如「逐行检索 FROM todos」），不参与判定
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    scannedStatements += 1;
    const hasFilter = /deleted\s*=\s*0/i.test(line);
    const isMarked = /sync-all-rows/.test(line);
    if (isMarked) markedStatements += 1;
    if (!hasFilter && !isMarked) {
      problems.push(
        `${rel}:${index + 1} 读取 todos 未带 deleted = 0 也未标注 -- sync-all-rows：${line.trim()}`
      );
    }
    if (hasFilter && isMarked) {
      problems.push(`${rel}:${index + 1} 同一语句既过滤又标注为全量读取，语义冲突`);
    }
    if (/\bDELETE\s+FROM\s+todos\b/i.test(line)) {
      problems.push(`${rel}:${index + 1} 出现物理删除（NEG-03 要求软删除）：${line.trim()}`);
    }
  });
}

// ---- 浏览器路径：localFetch* 必须走 readLiveTodos() -------------------------

const dbFile = path.join(SCAN_DIR, 'db', 'database.ts');
const dbSource = fs.readFileSync(dbFile, 'utf8');

if (!/const readLiveTodos\s*=\s*\(\)\s*:\s*Todo\[\]\s*=>\s*readAllLocalTodos\(\)\.filter\(\(t\)\s*=>\s*!t\.deleted\)/.test(dbSource)) {
  problems.push('readLiveTodos 未按「readAllLocalTodos().filter(!deleted)」实现');
}

const functionBodies = [...dbSource.matchAll(/async function (localFetchTodo\w*)\([\s\S]*?\n\}/g)];
if (functionBodies.length === 0) {
  problems.push('未找到任何 localFetch* 读取函数，脚本可能已失效');
}
for (const match of functionBodies) {
  const name = match[1];
  const body = match[0];
  if (!/readLiveTodos\(\)/.test(body)) {
    problems.push(`${name} 未走 readLiveTodos()，已删条目会漏进界面`);
  }
  if (/readAllLocalTodos\(\)/.test(body)) {
    problems.push(`${name} 直接读了含墓碑的全量数据（readAllLocalTodos）`);
  }
}

// ---- 同步网关的全量读取标记：必须是**块注释** -----------------------------

// **为什么这条要单列**：标记 `sync-all-rows` 写在 `TODOS_ALL` 常量里，
// 而 `TODOS_ALL` 是**前缀**，后面还要接 `WHERE uuid = ?` 之类的条件。
//
// 用**行注释** `--` 时，SQL 会变成：
//   `SELECT … FROM todos -- sync-all-rows WHERE uuid = ?`
// **WHERE 整段落进注释** ⇒ 查询变成「查全部行」，绑定值被**静默忽略**。
//
// 在桌面驱动（sqlx + SQLite）上这**不报错**，只是安静地算错：
// `applyRemoteTodos` 拿到的 `existing[0]` 是**另一条无关的行**，
// 于是每一次合并判定都用错了对象 ⇒ 云端的数据永远合不进来，
// 状态区却报「已是最新 N 条」（2026-11-25 实机反馈的原话）。
//
// 块注释 `/* … */` 不吞行尾，后缀条件照样生效。
const todosAllMatch = dbSource.match(/const TODOS_ALL\s*=\s*`([^`]*)`/);
if (!todosAllMatch) {
  problems.push('未找到 TODOS_ALL 常量（同步网关的全量读取入口）');
} else {
  const definition = todosAllMatch[1];
  if (/--\s*sync-all-rows/.test(definition)) {
    problems.push(
      'TODOS_ALL 的 sync-all-rows 标记用了行注释 `--`：行注释会吞掉后面拼上的 WHERE 条件' +
        '（查询变成「查全部行」、绑定值被静默忽略），必须改成块注释 /* sync-all-rows */'
    );
  }
  if (!/\/\*\s*sync-all-rows\s*\*\//.test(definition)) {
    problems.push(
      'TODOS_ALL 缺少块注释形式的 sync-all-rows 标记：/* sync-all-rows */'
    );
  }
}

// ---- 结果 ------------------------------------------------------------------

console.log(
  `扫描 ${files.length} 个源文件：${scannedStatements} 条 todos 读取语句，其中 ${markedStatements} 条为同步网关的全量读取（-- sync-all-rows）`
);
if (problems.length > 0) {
  console.error(`✗ 软删除过滤检查失败 ${problems.length} 项：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('✓ 软删除过滤检查 PASS：所有读取路径都带 deleted = 0，删除不做物理 DELETE');
