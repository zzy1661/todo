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
  // Windows 专有的 Win32 API：**函数名本身**就是平台专有信号。
  // （v4 补上这组是因为注入回归发现「去掉 #[cfg(windows)] 后脚本没报」——
  //   之前的规则只覆盖字符串形式的 token，漏掉了 API 调用这一类。）
  { pattern: /\bCred(Write|Read|Delete)W\b/, platforms: ['windows'], label: 'Windows 凭据管理器 API' },
  { pattern: /\bCredFree\b/, platforms: ['windows'], label: 'Windows 凭据管理器 API' },
  { pattern: /\bMessageBoxW\b/, platforms: ['windows'], label: 'Windows 消息框 API' },
  { pattern: /\bFormatMessageW\b/, platforms: ['windows'], label: 'Windows 错误消息 API' },
  { pattern: /\bGetLastError\b/, platforms: ['windows'], label: 'Windows 错误码 API' },
  { pattern: /\bCommandExt\b/, platforms: ['windows'], label: 'Windows 进程扩展 API' },
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
/**
 * item 头的关键字。
 *
 * **刻意不含 `const` / `static`**：函数体里的**局部 const 声明**
 * （如 `const CREATE_NO_WINDOW: u32 = ...;`）不是 item 头——把它当成 item 头
 * 会让脚本向上找错锚点，从而**误判**「明明在 `#[cfg]` 分支里却没保护」。
 * 这正是本脚本的第三个修正（前两个：cfg 嵌套括号、链式调用缩进）。
 */
const ITEM_HEAD_RE = /\b(fn|impl|struct|enum|trait|mod)\b/;

/** 取 item 头部上方连续的 `#[...]` 属性行里，所有带平台限定的 cfg */
function collectCfgBodies(lines, itemHead) {
  const bodies = [];
  for (let j = itemHead - 1; j >= 0; j -= 1) {
    const p = lines[j].trim();
    if (p === '') continue;
    if (p.startsWith('//')) continue;
    if (!p.startsWith('#[')) break; // 不是属性行 → 收集中断
    const body = extractCfgBody(p);
    if (body !== null) bodies.unshift(body);
  }
  return bodies;
}

/** 多个 cfg 是 AND 关系，取交集 */
function intersectCfg(bodies) {
  let allowed = null;
  for (const body of bodies) {
    const set = platformsOf(body);
    allowed = allowed === null ? set : new Set([...allowed].filter((x) => set.has(x)));
  }
  return allowed ?? new Set();
}

/**
 * 判断某一行是否落在平台 cfg 分支内。
 *
 * 做法：
 * 1. 向上找该行所属 **item 的头部**——含 `fn` / `impl` / `struct` / `enum` /
 *    `trait` / `mod` 关键字、且缩进**小于**目标行的行；
 * 2. 取该 item 头部上方的 cfg 属性组，算出它允许的平台集合；
 * 3. **若该 item 没有自己的 cfg**：它是**嵌套 item**（如函数体内定义的辅助 fn），
 *    保护来自**外层** item —— 继续向上找；
 * 4. **若该 item 有 cfg 但平台不匹配**：说明它明确限定在别的平台 → 直接判不保护。
 *
 * 曾经的三个坑（每轮都用「故意注入回归」逼出来）：
 * - 「向上找最近的 cfg」会越过 item 边界 → 注入的回归漏报；
 * - 按**缩进**定位 item 头会被**链式调用**骗到 → `cmd /C` 误报；
 * - item 头判定若含 `const`/`static` → **函数体内的局部 const**被误当成 item 头 → 误报；
 * - 且**嵌套 item**（函数体内定义的辅助 fn）必须**继续向上**找外层的 cfg，
 *   否则会误判「不在 cfg 分支内」。
 */
function cfgProtects(lineIndex, lines, token) {
  const lineIndent = indentOf(lines[lineIndex]);

  for (let i = lineIndex - 1; i >= 0; i -= 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (t === '') continue;
    if (t.startsWith('//')) continue;
    if (t.startsWith('#[')) continue; // 属性行：属于 item 头部的一部分
    if (!ITEM_HEAD_RE.test(t)) continue;
    if (indentOf(raw) >= lineIndent) continue; // 同级或更深：不是外层 item

    const cfgBodies = collectCfgBodies(lines, i);
    if (cfgBodies.length === 0) {
      // 没有自己的 cfg：
      // - **缩进 > 0** → 这是**嵌套 item**（函数体内定义的辅助 fn、impl 内的方法），
      //   保护来自外层 item → 继续往上找；
      // - **缩进 == 0** → 这是**顶层 item**，和上方的 item **没有继承关系**，
      //   没有 cfg 就是「没受保护」→ 直接判定失败（不能再往上找，
      //   否则会误把「上一个同级 item 的 cfg」当成本 item 的保护）。
      if (indentOf(raw) === 0) return false;
      continue;
    }
    const allowed = intersectCfg(cfgBodies);
    if (allowed.size === 0) return false;
    if (allowed.has('*') || allowed.has('unix')) return true;
    return token.platforms.some((p) => allowed.has(p));
  }
  return false;
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

/* ------------------------------------------- scripts/ 的外部命令依赖（另一类地雷） */

/**
 * 守护「自检脚本依赖的外部命令必须在两端都可用（或有退路）」。
 *
 * 这类问题**本地永远看不到**：
 * - macOS 自带 `/usr/bin/sqlite3`，**windows-latest 的 runner 镜像里没有 sqlite3.exe**
 *   （镜像的 Database Systems 一节只有 PostgreSQL 与 MongoDB）；
 * - `npm` 在 Windows 上是 **`npm.cmd`**，而 `spawn` 默认 `shell: false`，
 *   CreateProcess 只会尝试 `npm.exe` → ENOENT。
 *
 * 两者都是「macOS 正常、Windows 静默失败」。
 *
 * 2026-11-23 的教训：Windows job 从 v0.2.6 起就卡在自检链的**第一个**失败脚本上，
 * 后面的 7 个脚本在 Windows 上**一次都没跑过** —— 其中就有依赖 sqlite3 的那个。
 * 静态规则在这里比「等 CI 报出来」便宜得多。
 */
const SCRIPT_DIR = 'scripts';
const scriptFiles = [];
try {
  for (const entry of readdirSync(SCRIPT_DIR)) {
    if (entry.endsWith('.mjs')) scriptFiles.push(join(SCRIPT_DIR, entry));
  }
} catch {
  /* 目录不存在则跳过 */
}

const SCRIPT_RULES = [
  {
    id: 'S1',
    // 命令名写成字面量 'npm'（而不是变量）→ 违规
    pattern: /(?:spawn|spawnSync|execFileSync|execSync)\(\s*'npm'/,
    message: (file) =>
      `${file} 直接 spawn/exec 了 'npm'：Windows 上 npm 是 npm.cmd，` +
      `CreateProcess 只会尝试 npm.exe → ENOENT。必须先按平台选出可执行文件名` +
      `（process.platform === 'win32' ? 'npm.cmd' : 'npm'）再传进去`,
  },
  {
    id: 'S1b',
    // 用了 npmCmd 这个变量，就必须真的写了 .cmd 分支，否则只是换了个写法
    pattern: /\bnpmCmd\b/,
    require: (text) => text.includes("'npm.cmd'"),
    message: (file) =>
      `${file} 用了 npmCmd 变量，却没出现 'npm.cmd' —— Windows 上仍会 ENOENT`,
  },
  {
    id: 'S2',
    pattern: /(?:spawn|spawnSync|execFileSync|execSync)\(\s*'sqlite3'/,
    // 只有统一后端模块里可以直接调 sqlite3（那里有 Python 退路）
    allow: (file) => file === join(SCRIPT_DIR, 'sqlite-backend.mjs'),
    message: (file) =>
      `${file} 直接调用了 'sqlite3' 命令：windows-latest 的 runner 镜像没有 sqlite3.exe → ENOENT。` +
      `必须走 scripts/sqlite-backend.mjs（有 Python 标准库退路，且两个后端有等价断言）`,
  },
  {
    id: 'S3',
    // 外部命令可能**只存在于部分环境**（windows-latest 的镜像有 ruby，
    // 但 ruby 不是「Windows 自带」，镜像里有不代表每个环境 PATH 里都能找到）。
    // 不探测就 execFileSync，一旦找不到就抛 ENOENT → 整个自检中断 → CI 在此停住。
    pattern: /execFileSync\(\s*'ruby'/,
    require: (text) => /spawnSync\(\s*'ruby'/.test(text),
    message: (file) =>
      `${file} 直接用了 ruby 却没有先探测：外部命令可能只存在于部分环境，` +
      `找不到时 execFileSync 抛 ENOENT 会让整个自检中断。应先用 spawnSync 探测，` +
      `缺失时明确跳过（措辞上要与「通过」区分）。`,
  },
];

for (const rule of SCRIPT_RULES) {
  for (const file of scriptFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const text = lines.join('\n');
    if (!rule.pattern.test(text)) continue;
    if (rule.allow?.(file, text)) continue;
    // `require` 返回 true = **要求已满足**（例如确实写了 'npm.cmd' 分支）→ 不算违规
    if (rule.require?.(text)) continue;
    // 命中行里要**排除注释**——文档里引用 `execFileSync('sqlite3', ...)` 讲清楚
    // 「为什么不能这么写」是必要的，不能因为提了一句就判违规。
    const hitLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        const t = line.trim();
        return (
          !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && rule.pattern.test(line)
        );
      })
      .map(({ index }) => index + 1);
    if (hitLines.length === 0) continue;
    errors.push(`[${rule.id}] ${rule.message(file)}（第 ${hitLines.join('、')} 行）`);
  }
}

/* --------------------------------------------- Rust 侧（含 tests/）的外部命令依赖 */

/**
 * Rust 侧也可能在**测试**里依赖只在单一平台存在的命令。
 *
 * 2026-11-23 的实例：`src-tauri/tests/migration_guard.rs` 用 `sqlite3` 命令行跑真实 SQL，
 * 注释里还写着「**macOS 自带**」—— 但没有平台分支。而 `sqlite3` 命令只有 macOS 有
 * （windows-latest 的 runner 镜像里没有）。于是这个集成测试在 Windows 上**必然失败**：
 * 「无法执行 sqlite3 命令（macOS 自带）：program not found」。
 *
 * 它之所以一直没被发现：**Rust 测试此前从未进 CI**。
 * 补上 `cargo test` 步骤后，第一次跑就当场暴露。
 *
 * 修法：改用 **sqlx**（本来就在依赖树里），两端一致、不依赖外部命令。
 */
const RUST_EXTERNAL_COMMANDS = [
  {
    command: 'sqlite3',
    note: 'sqlite3 命令只有 macOS 自带；windows-latest 的 runner 镜像里没有。请改用 sqlx（已在依赖树里）。',
  },
];

const rustRoots = ['src-tauri/src', 'src-tauri/tests'];
const rustFiles = [];
for (const root of rustRoots) {
  const walkRust = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkRust(full);
      else if (entry.endsWith('.rs')) rustFiles.push(full);
    }
  };
  walkRust(root);
}

for (const { command, note } of RUST_EXTERNAL_COMMANDS) {
  const pattern = new RegExp(`Command::new\\(\\s*"${command}"\\s*\\)`);
  for (const file of rustFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      errors.push(
        `${file}:${index + 1} 调用了只在单一平台存在的命令 '${command}'：${note}`
      );
    });
  }
}

console.log('平台可移植性校验（scripts/check-platform-portability.mjs）');
console.log(`  扫描文件数    ${files.length}（src/ + src-tauri/src/）`);
console.log(
  `  守护规则      ${PLATFORM_TOKENS.length} 条（平台专有调用必须被 #[cfg(...)] 保护）` +
    ` + ${SCRIPT_RULES.length} 条（scripts/ 的外部命令依赖）` +
    ` + ${RUST_EXTERNAL_COMMANDS.length} 条（Rust 侧的外部命令依赖）`
);
console.log(`  违规          ${errors.length}`);

if (errors.length > 0) {
  console.error('');
  console.error(`校验失败，共 ${errors.length} 项：`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('');
console.log('PASS');
