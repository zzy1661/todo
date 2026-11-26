/**
 * 自检聚合器（v0.2.8 起替代 `&&` 串联）。
 *
 * 为什么不用 `&&` 串联：
 * 1. **失败即中断**——十个脚本里第一个失败，后面的全都没跑，
 *    CI 只告诉你「失败了」，不告诉你是哪个、也不告诉你其它几个是否也有问题；
 * 2. **shell 差异**——`&&` 在 bash / pwsh / cmd 下的语义与转义并不一致，
 *    聚合步骤就成了「跨平台差异」的活靶子（它本身不该有平台差异）。
 *
 * 这个聚合器的行为：
 * - **逐个跑，失败不中断**，全部跑完；
 * - 每个脚本的完整 stdout/stderr 都收进日志文件；
 * - 最后打印一张「通过 / 失败 / 跳过」汇总表，并给出总退出码。
 *
 * 日志同时写到 `verify/unit-checks.log`，CI 会把它当 artifact 上传，
 * 这样**失败时不必本地复现也能看到每一个脚本的真实输出**。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 要跑的自检脚本（顺序即执行顺序） */
const CHECKS = [
  ['check-cases', '内容库契约：总数 / 分类分布 / case 分布 / 正文长度 / id 唯一'],
  ['check-permutation', '推送确定性：与 PRD 附录 A 的参考实现逐位一致'],
  ['check-cases-negative', '负向篡改：四种篡改各自必须让校验脚本判红'],
  ['check-sync', '同步层自检：十五组路径（含双端回路与墓碑死锁）'],
  ['check-sync-extra', '同步补充：登出 / 断网降级 / 防抖时间线'],
  ['check-data-layer', '数据层：localStorage 路径'],
  ['check-db-parity', '双后端等价性对拍（需 node:sqlite，Windows 会明确跳过）'],
  ['check-db-sync', 'SQLite 路径的同步网关真跑一遍（拉取 / 合并 / 复活 / 前端可见性）'],
  ['check-deleted-filter', '软删除过滤：所有读取路径都带 deleted = 0'],
  ['check-bundle-config', '打包配置：三份 conf 合规 + 平台中立 + 数据路径中立'],
  ['check-platform-portability', '平台可移植性：平台专有调用必须被 #[cfg] 保护'],
  ['check-ui-text', '界面文案：模板正文不得出现 Markdown 强调标记与反引号'],
];

const results = [];
const chunks = [];

for (const [name, desc] of CHECKS) {
  const script = join('scripts', `${name}.mjs`);
  process.stdout.write(`\n▶ ${name} — ${desc}\n`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const status = result.status === 0 ? 'PASS' : `FAIL(exit=${result.status})`;
  const skipped = output.includes('⊘ 跳过');
  results.push({ name, status, seconds, skipped, output });
  chunks.push(`\n${'='.repeat(72)}\n▶ ${name} — ${desc}\n${'='.repeat(72)}\n${output}`);
  process.stdout.write(`  → ${status}  (${seconds}s)\n`);
  if (result.status !== 0) {
    process.stdout.write(output.split('\n').slice(-12).map((l) => `    ${l}\n`).join(''));
  }
}

const failed = results.filter((r) => r.status !== 'PASS');
const skipped = results.filter((r) => r.skipped);

const summary = [
  '',
  '─'.repeat(72),
  '自检汇总',
  '─'.repeat(72),
  ...results.map((r) => `  ${r.skipped ? '⊘' : r.status.startsWith('PASS') ? '✓' : '✗'} ${r.name.padEnd(28)} ${r.status.padEnd(14)} ${r.seconds}s`),
  '',
  `  通过 ${results.length - failed.length} / ${results.length}${skipped.length ? `（其中 ${skipped.length} 项在本平台明确跳过：${skipped.map((s) => s.name).join(', ')}）` : ''}`,
  failed.length ? `  失败 ${failed.length} 项：${failed.map((f) => f.name).join(', ')}` : '  无失败项',
  '',
].join('\n');

console.log(summary);

const logPath = join(ROOT, 'verify', 'unit-checks.log');
try {
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, chunks.join('\n') + '\n' + summary, 'utf8');
  console.log(`  日志已写入 verify/unit-checks.log`);
} catch (error) {
  console.error(`  日志写入失败：${error instanceof Error ? error.message : String(error)}`);
}

process.exit(failed.length > 0 ? 1 : 0);
