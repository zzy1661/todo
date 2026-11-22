/**
 * TC-036（AC-27 负向）：证明 `scripts/check-cases.mjs` 的断言不是「永真脚本」。
 *
 * 做法：把 `scripts/check-cases.mjs` + `src/` 复制到临时目录，对副本做四种篡改，
 * 每次单独跑一遍副本脚本，要求退出码 ≠ 0 且报出对应错误；未篡改的副本必须退出码 0。
 *
 * 用法：node scripts/check-cases-negative.mjs
 * 只读写临时目录，不碰仓库里的 src/ 与 scripts/。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tc036-'));

function makeCopy(name) {
  const dir = path.join(work, name);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/check-cases.mjs'), path.join(dir, 'scripts/check-cases.mjs'));
  return dir;
}

function run(dir) {
  const result = spawnSync(process.execPath, ['scripts/check-cases.mjs'], {
    cwd: dir,
    encoding: 'utf8',
  });
  return {
    code: result.status,
    errors: (result.stderr || '')
      .split('\n')
      .filter((line) => line.trim().startsWith('✗') || line.trim().startsWith('-'))
      .slice(0, 4),
    tail: (result.stdout || '').trim().split('\n').slice(-1)[0] ?? '',
  };
}

const methodsPath = (dir) => path.join(dir, 'src/data/methods.ts');

/**
 * 删掉一条方法：从块首 `  {` 到块尾 `\n  },`。
 *
 * **换行符必须无关**：GitHub Actions 的 `actions/checkout` 在 **Windows 上会把
 * `core.autocrlf` 设为 true**，checkout 出来的文本文件全是 **CRLF**。
 * 原实现硬编码 `'  {\n'` / `'\n  },\n'` 去 `indexOf` —— 在 CRLF 下**永远匹配不到**，
 * 于是抛「无法定位方法 xxx 的边界」，脚本直接失败。
 * （2026-11-22：CI 在 macOS 上通过、Windows 上失败，就是这一处。）
 */
function dropMethod(source, id) {
  const start = source.indexOf(`    id: '${id}',`);
  if (start < 0) throw new Error(`未找到方法 ${id}`);
  // 块首：往回找最近的 `  {`（不带换行符要求）
  const blockStart = source.lastIndexOf('  {', start);
  // 块尾：`\n  },` —— 允许 CRLF
  const endMatch = /\r?\n  \},\r?\n/.exec(source.slice(start));
  if (blockStart < 0 || !endMatch) throw new Error(`无法定位方法 ${id} 的边界`);
  const blockEnd = start + endMatch.index + endMatch[0].length;
  return source.slice(0, blockStart) + source.slice(blockEnd);
}

/**
 * 四种篡改用的正则**必须对换行符不敏感**。
 *
 * 为什么：篡改是在**副本**上做的，副本的换行符取决于 checkout 时的 git 配置 ——
 * Windows 上 `actions/checkout` 会把 `core.autocrlf` 设成 true，副本全是 CRLF。
 * 若正则在 `\n` 前要求紧邻的固定字符（如 `content:\n`），CRLF 下中间夹了个 `\r`
 * 就**匹配不到** → 篡改静默失效 → 脚本抛「篡改没有生效」→ 整个自检失败。
 *
 * （2026-11-23：CRLF 全量仿真实测抓到 —— ④「案例正文截到 100 字」在 CRLF 下失效。）
 */
const cases = [
  ['baseline', '未篡改副本', null, 0],
  [
    'drop-one',
    '① 删掉 1 条方法（146 → 145）',
    (src) => dropMethod(src, 'first-principles'),
    1,
  ],
  [
    'steps-one',
    '② 造一条 steps = 1',
    (src) => src.replace(/steps: \[[\s\S]*?\r?\n    \],/, "steps: ['只有一步'],"),
    1,
  ],
  [
    'bad-case-type',
    '③ case.type 改成非法值',
    (src) => src.replace("type: 'practice',", "type: 'anecdote',"),
    1,
  ],
  [
    'short-content',
    '④ 案例正文截到 100 字',
    // 用捕获组把原换行符原样带回来，避免在 CRLF 副本里混进 LF
    (src) =>
      src.replace(
        /(content:\r?\n        ')[\s\S]*?(',)/,
        `$1${'截'.repeat(100)}$2`
      ),
    1,
  ],
];

let failures = 0;
for (const [name, label, tamper, expectedNonZero] of cases) {
  const dir = makeCopy(name);
  if (tamper) {
    const file = methodsPath(dir);
    const before = fs.readFileSync(file, 'utf8');
    const after = tamper(before);
    if (after === before) throw new Error(`${name}：篡改没有生效`);
    fs.writeFileSync(file, after);
  }
  const result = run(dir);
  const ok = expectedNonZero ? result.code !== 0 : result.code === 0;
  if (!ok) failures += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${label} → exit=${result.code}` +
      (result.errors.length ? `\n    ${result.errors.join('\n    ')}` : '')
  );
}
fs.rmSync(work, { recursive: true, force: true });
console.log(failures === 0 ? '\nTC-036 PASS：四种篡改各自使脚本退出码 ≠ 0，未篡改副本退出码 0' : `\nTC-036 FAIL：${failures} 项不符合预期`);
process.exit(failures === 0 ? 0 : 1);
void execFileSync;
