/**
 * 平台可移植性自证脚本（v1.10 新增）。
 *
 * 为什么需要它：
 *
 * 2026-11-02 收到实机反馈「Windows 上装完双击 exe 没反应」，排查出一处
 * `sync_open_url` 硬编码 `/usr/bin/open` 的跨平台缺陷。那类问题的特点是：
 *
 * - **编译期完全合法**（它只是一个字符串字面量），所以 `cargo xwin check` 抓不到；
 * - **CI 也抓不到**——CI 的 Windows job 只验证「能出包」，不验证「双击有反应」；
 * - 只能靠**逐行审阅**发现，而逐行审阅必然有漏。
 *
 * 所以这里把「平台专有调用必须被 `#[cfg(...)]` 保护」变成一条**可执行的断言**：
 * 以后再有人写了 `/usr/bin/xxx`、`osascript` 之类而忘了加 cfg，脚本直接判红。
 *
 * 判定口径：
 * - 扫 `src/`（前端）与 `src-tauri/src/`（Rust）——**只扫产品代码**，
 *   自证脚本自身与文档不在范围内；
 * - 命中平台专有 token 时，要求它落在某个 `#[cfg(target_os = "...")]`
 *   （或 `#[cfg(unix)]` / `#[cfg(windows)]`）保护的代码块内；
 * - 用**缩进**判定块范围：Rust 代码经 rustfmt 格式化后，
 *   cfg 属性所在行之后、缩进回到同级或更浅的行，都属于该分支。
 *
 * 用法：node scripts/check-platform-portability.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 平台专有 token → 允许出现在哪些平台的 cfg 分支里。
 *
 * 只收录**辨识度高、误报少**的 token：`cmd` / `start` 这类常见词不收，
 * 否则中文注释里都能命中。
 */
const PLATFORM_TOKENS = [
  { pattern: /\/usr\/bin\//, platforms: ['macos', 'unix'], label: '/usr/bin/ 下的命令' },
  { pattern: /\bosascript\b/, platforms: ['macos'], label: 'osascript' },
  { pattern: /\bxdg-open\b/, platforms: ['linux', 'unix'], label: 'xdg-open' },
  { pattern: /\bpowershell\b/i, platforms: ['windows'], label: 'powershell' },
  { pattern: /\bcmd\.exe\b/i, platforms: ['windows'], label: 'cmd.exe' },
  // Windows 侧的两个特征：单独记 `cmd` 会误报（中文注释与普通词都可能命中），
  // 所以只认「真的在起 cmd 进程」和「真的在传 /C」这两种写法。
  { pattern: /Command::new\(\s*"cmd"/, platforms: ['windows'], label: 'cmd 进程调用' },
  { pattern: /\.args\(\[\s*"\/C"/, platforms: ['windows'], label: 'cmd /C 参数' },
];

/**
 * 取出 `#[cfg(...)]` 里的内容。
 *
 * 不能用正则的 `[^)]*`——`all(unix, not(target_os = "macos"))` 是**嵌套括号**，
 * 简单正则会在第一个 `)` 处截断，把 `not(...)` 的右括号吃掉，
 * 导致否定语义解析不出来（这会让合法代码被误判为违规）。
 * 这里手动做括号配平。
 */
function extractCfgBody(line) {
  const start = line.indexOf('#[cfg(');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start + 5; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return line.slice(start + 6, i);
    }
  }
  return null;
}

/**
 * 解析一个 cfg 表达式允许的平台集合。
 *
 * 要正确处理否定语义：`all(unix, not(target_os = "macos"))` 的意思是
 * 「unix 且非 macos」——如果只按 `target_os = "macos"` 取值就会判反。
 *
 * 规则：
 * - `target_os = "X"` 记为正向平台 X；若同一个 X 出现在 `not(...)` 里，则从正向集合移除；
 * - 移除后正向集合为空、但存在否定项时，语义是「除这些之外」（记为宽泛的 `*`）；
 * - 出现 `unix` 关键字则加入 `unix`（覆盖所有 unix 系平台）。
 */
function platformsOf(cfgBody) {
  const positives = new Set();
  const negated = new Set();

  const allOs = cfgBody.matchAll(/target_os\s*=\s*"([a-z0-9]+)"/g);
  for (const m of allOs) positives.add(m[1]);

  const notOs = cfgBody.matchAll(/not\s*\(\s*target_os\s*=\s*"([a-z0-9]+)"\s*\)/g);
  for (const m of notOs) negated.add(m[1]);

  for (const p of negated) positives.delete(p);

  const result = new Set(positives);
  if (negated.size > 0 && positives.size === 0) {
    result.add('*'); // 「除这些平台之外」——视为不限平台
  }
  if (/\bunix\b/.test(cfgBody)) result.add('unix');
  if (/\bwindows\b/.test(cfgBody)) result.add('windows');
  if (/\blinux\b/.test(cfgBody)) result.add('linux');
  return result;
}

/** 要扫描的目录（只扫产品代码） */
const ROOTS = ['src', 'src-tauri/src'];
const SCAN_EXT = /\.(ts|vue|rs)$/;

/** 收集待扫描文件 */
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (SCAN_EXT.test(entry)) files.push(full);
  }
}
for (const root of ROOTS) {
  try {
    walk(root);
  } catch {
    /* 目录不存在则跳过 */
  }
}

/** 缩进宽度：按制表符也算一格 */
const indentOf = (line) => {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 1;
    else break;
  }
  return n;
};

const errors = [];

/**
 * 判断某一行是否落在平台 cfg 分支内。
 *
 * 做法：
 * 1. 向上找到该行所属 **item 的头部**——第一个含 `fn` / `const` / `static` /
 *    `impl` / `struct` / `enum` / `trait` / `mod` 关键字的行；
 * 2. 再从 item 头部**往上**收集连续的 `#[...]` 属性行，取其中所有
 *    带平台限定的 `cfg`（多个 cfg 是 AND 关系，取交集）。
 *
 * 两个曾经的坑：
 * - 「向上找最近的 cfg」会越过 item 边界——上一个块残留的属性会让
 *   **下一个没受保护的 item** 被误判为已保护（守护形同虚设）；
 * - 「按缩进找 item 头」会被**链式调用**骗到——rustfmt 会把
 *   `ProcessCommand::new("cmd").args([...])` 折成多行，中间那段的缩进
 *   比函数头深、比函数体首行浅，于是被当成了 item 头。
 *   用**语法关键字**定位 item 头则对链式调用完全免疫。
 */
const ITEM_HEAD_RE = /\b(fn|const|static|impl|struct|enum|trait|mod)\b/;

function cfgProtects(lineIndex, lines, token) {
  // ① 定位 item 头部
  //
  // 要求 item 头的缩进**严格小于**目标行：嵌套 item（如函数里定义的辅助 fn）
  // 继承外层函数的 cfg 保护，所以要跳过它们，继续往上找真正带 cfg 的那一层。
  const lineIndent = indentOf(lines[lineIndex]);
  let itemHead = -1;
  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === '') continue;
    if (t.startsWith('//')) continue;
    if (t.startsWith('#[')) continue; // 属性行：属于 item 头部的一部分
    if (!ITEM_HEAD_RE.test(t)) continue;
    if (indentOf(raw) >= lineIndent) continue; // 嵌套 item：继承外层保护，继续往上
    itemHead = i;
    break;
  }
  if (itemHead === -1) return false;

  // ② 收集 item 头部上方的连续属性行里的 cfg
  const cfgBodies = [];
  for (let j = itemHead - 1; j >= 0; j -= 1) {
    const p = lines[j].trim();
    if (p === '') continue;
    if (p.startsWith('//')) continue;
    if (!p.startsWith('#[')) break; // 不是属性行 → 收集中断
    const body = extractCfgBody(p);
    if (body !== null) cfgBodies.unshift(body);
  }
  if (cfgBodies.length === 0) return false;

  // ③ 多个 cfg 取交集
  let allowed = null;
  for (const body of cfgBodies) {
    const set = platformsOf(body);
    allowed = allowed === null ? set : new Set([...allowed].filter((x) => set.has(x)));
  }
  if (allowed.size === 0) return false;
  if (allowed.has('*') || allowed.has('unix')) return true;
  return token.platforms.some((p) => allowed.has(p));
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const { pattern, platforms, label } of PLATFORM_TOKENS) {
      if (!pattern.test(line)) continue;
      // 注释行不算调用（注释里说明「这是 macOS 专有」是合理的）
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      if (cfgProtects(index, lines, { platforms })) continue;
      errors.push(
        `${file}:${index + 1} 命中平台专有调用「${label}」，但不在 #[cfg(...)] 分支内` +
          `（只允许出现在 ${platforms.join(' / ')} 的 cfg 分支里）`
      );
    }
  });
}

console.log('平台可移植性校验（scripts/check-platform-portability.mjs）');
console.log(`  扫描文件数    ${files.length}（src/ + src-tauri/src/）`);
console.log(`  守护规则      ${PLATFORM_TOKENS.length} 条（平台专有调用必须被 #[cfg(...)] 保护）`);
console.log(`  违规          ${errors.length}`);

if (errors.length > 0) {
  console.error('');
  console.error(`校验失败，共 ${errors.length} 项：`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('');
console.log('PASS');
