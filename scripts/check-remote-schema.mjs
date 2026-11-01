/**
 * 云端 schema 就绪检查（S7.9 补充，针对 `404 PGRST205`）。
 *
 * `PGRST205 = Could not find the table 'public.todos' in the schema cache`
 * 的含义是 **部署缺失**，不是网络故障：项目的 `supabase/schema.sql` 还没执行过。
 * 本脚本只读地打一次 `GET /rest/v1/todos?select=uuid&limit=1`：
 *   - 200 → 表存在（RLS 下 anon 看不到行，返回空数组也算通过）；
 *   - 404 + PGRST205 → 明确退出码 1，并给出下一步；
 *   - 其他 → 打印状态码与错误体，便于区分 key / 网络 / 权限问题。
 *
 * 配置来源（先仓库、再 macOS app data 目录），**只读不写**，
 * 任何情况下都不打印 key。
 *
 * 用法：node scripts/check-remote-schema.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const candidates = [
  path.join(process.cwd(), 'sync.config.json'),
  path.join(os.homedir(), 'Library', 'Application Support', 'com.poisson.todo', 'sync.config.json'),
];

let configPath = '';
let config = null;
for (const candidate of candidates) {
  try {
    config = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    configPath = candidate;
    break;
  } catch {
    /* 换下一个候选路径 */
  }
}

if (!config) {
  console.error('✗ 没找到 sync.config.json（仓库根目录或 app data 目录都没有）');
  console.error('  先把 sync.config.example.json 复制成 sync.config.json 并填好 url / anon key。');
  process.exit(1);
}

const baseUrl = String(config.supabaseUrl ?? '').replace(/\/+$/, '');
const anonKey = String(config.anonKey ?? '');
if (!baseUrl || !anonKey) {
  console.error(`✗ ${configPath} 缺少 supabaseUrl 或 anonKey`);
  process.exit(1);
}

const response = await fetch(`${baseUrl}/rest/v1/todos?select=uuid&limit=1`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
});
const body = await response.text();

if (response.ok) {
  console.log(`✓ 云端 schema 就绪：public.todos 可访问（HTTP ${response.status}）`);
  console.log(`  探测地址 ${baseUrl}/rest/v1/todos（不打印 key）`);
  process.exit(0);
}

if (response.status === 404 && body.includes('PGRST205')) {
  console.error('✗ 云端缺少 public.todos 表（404 PGRST205）——schema 还没部署');
  console.error('  下一步：打开 Supabase 控制台 → SQL Editor → 粘贴并执行仓库里的');
  console.error('          supabase/schema.sql（建表 + 开启 RLS + 四条本人策略）');
  console.error('  执行完重跑本脚本，或在应用里点「立即重试」。');
  process.exit(1);
}

console.error(`✗ 探测失败：HTTP ${response.status}`);
console.error(`  ${body.slice(0, 300)}`);
process.exit(1);
