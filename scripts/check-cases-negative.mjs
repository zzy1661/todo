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

/** 删掉一条方法：从 `  {\n    id: '<id>',` 到方法自身收尾的 `\n  },\n` */
function dropMethod(source, id) {
  const start = source.indexOf(`    id: '${id}',`);
  if (start < 0) throw new Error(`未找到方法 ${id}`);
  const blockStart = source.lastIndexOf('  {\n', start);
  const blockEnd = source.indexOf('\n  },\n', start);
  if (blockStart < 0 || blockEnd < 0) throw new Error(`无法定位方法 ${id} 的边界`);
  return source.slice(0, blockStart) + source.slice(blockEnd + '\n  },\n'.length);
}

const cases = [
  ['baseline', '未篡改副本', null, 0],
  [
    'drop-one',
    '① 删掉 1 条方法（65 → 64）',
    (src) => dropMethod(src, 'first-principles'),
    1,
  ],
  [
    'steps-one',
    '② 造一条 steps = 1',
    (src) => src.replace(/steps: \[[\s\S]*?\n    \],/, "steps: ['只有一步'],"),
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
    (src) => src.replace(/content:\n        '[\s\S]*?',/, `content:\n        '${'截'.repeat(100)}',`),
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
