/**
 * 仓库密钥守卫（AC-67 的静态兜底，与 `check-bundle-config.mjs` 同一层）。
 *
 * 目的：把「真实 key 只能出现在运行期配置」这条铁律变成一条可执行断言 ——
 * 只要有人把 Supabase 密钥粘进源码、测试夹具或打包配置，本脚本就非零退出，
 * 拦在任何 commit / push / 出包之前。
 *
 * 扫描范围（刻意收窄到会进产物或进仓库的输入）：
 *   src/、src-tauri/、e2e/、package.json、sync.config.example.json
 * 排除：node_modules / target / gen / dist 与二进制资源（png、icns、ico …）；
 * `src-tauri/target` 是构建产物目录，扫它既慢又会命中依赖里的随机 base64。
 *
 * 命中的三类形态：
 *   1. `sb_publishable_` —— 新版浏览器端公开密钥；合法值也**只能**放在 app data
 *      目录的 sync.config.json 里。源码里若要判断这个前缀，必须拼接构造（见
 *      `src/sync/config.ts` 的 PUBLISHABLE_PREFIX），不得写成字面量。
 *   2. `sb_secret_` —— 新版服务端密钥，客户端出现即事故。
 *   3. `eyJ[A-Za-z0-9_-]{10,}` —— legacy JWT（anon 或 service_role）。
 *
 * 不需要白名单：示例文件只放占位文案（`<project-ref>`、`<在这里填 …>`），
 * 不含任何真实 URL 或密钥；若将来确有必须保留的示例字面量，请在这一行下方
 * 加一个显式的 { file, reason } 条目并写明理由，而不是悄悄放宽正则。
 *
 * 用法：node scripts/check-no-secrets.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** 会进仓库或进产物的前端 / Rust 输入 */
const TARGETS = ['src', 'src-tauri', 'e2e', 'package.json', 'sync.config.example.json'];

/** 构建产物与依赖目录：不是本仓库的输入，且含大量无关二进制 */
const SKIP_DIRS = new Set(['node_modules', 'target', 'gen', 'dist', '.git', 'test-results', 'test-results-sync']);

/** 二进制资源：icon / 图片 / 动态库，按文本扫只会产生假阳性 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.svgz',
  '.dmg', '.app', '.zip', '.gz', '.pdf',
  '.so', '.dylib', '.a', '.o', '.rlib', '.bin', '.db', '.sqlite',
]);

const PATTERNS = [
  { label: '新版公开密钥（publishable）', regex: /sb_publishable_/g },
  { label: '新版服务端密钥（secret）', regex: /sb_secret_/g },
  { label: 'legacy JWT', regex: /eyJ[A-Za-z0-9_-]{10,}/g },
];

const failures = [];
let files = 0;

function scanFile(absPath) {
  const text = readFileSync(absPath, 'utf8');
  files += 1;
  const shown = relative(ROOT, absPath);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { label, regex } of PATTERNS) {
      regex.lastIndex = 0;
      if (!regex.test(line)) continue;
      // 只报位置与形态，绝不回显命中内容（否则日志本身成了泄露点）
      failures.push(`${shown}:${index + 1} —— 命中 ${label}`);
    }
  });
}

function walk(absPath) {
  const stats = statSync(absPath);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(absPath)) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(join(absPath, entry));
    }
    return;
  }
  if (BINARY_EXTENSIONS.has(extname(absPath).toLowerCase())) return;
  scanFile(absPath);
}

console.log('密钥守卫：扫描源码与打包输入');
for (const target of TARGETS) {
  walk(join(ROOT, target));
}

if (failures.length === 0) {
  console.log(`  ✓ 扫描 ${files} 个文件，0 处密钥形态命中（AC-67）`);
  console.log('check-no-secrets: PASS');
  process.exit(0);
}

console.log(`  ✗ 命中 ${failures.length} 处密钥形态：`);
for (const failure of failures) console.log(`    ${failure}`);
console.log('');
console.log('真实 key 只能写在 app data 目录的 sync.config.json（未入库、不打包）。');
console.log('check-no-secrets: FAIL');
process.exit(1);
