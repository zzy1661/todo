/**
 * S6 打包配置自证脚本（T-15 / T-19）。
 *
 * macOS 机器上能做、也必须做的校验：
 *   1. 三份 conf（基础 + macOS overlay + Windows overlay）按 Tauri 的合并语义
 *      （对象递归合并、数组整体替换）合并后，用 `config.schema.json` 做 schema 断言；
 *   2. 合并结果的键值断言：identifier / productName / 窗口尺寸 / targets /
 *      minimumSystemVersion / hardenedRuntime / NSIS installMode / WiX 语言 / 图标集合；
 *   3. 平台中立断言：基础配置里**不得**出现 dmg / nsis / macOS / windows 任一平台块，
 *      否则「一个平台写死另一个平台的产物形态」；
 *   4. 数据落盘路径中立断言：`src/` 与 `src-tauri/src/` 不得出现任一端的数据目录字面量；
 *   5. `.github/workflows/build.yml` 的 YAML 语法（ruby 的 psych）+ matrix + 步骤顺序自检；
 *   5.1 发布通道自检：tag 触发（`tags: ['v*']`）+ 顶层 `permissions.contents: write`
 *      + 只在 tag 时执行的 Release 资产发布步骤（产物名为 ASCII）。
 *
 * 这个脚本**不**证明 Windows 安装包可用 —— Windows 产物的唯一验证路径是 CI 的
 * `windows-latest` job（本机无交叉编译）。它证明的是：配置是合法的、两端不互相污染、
 * 流水线结构正确。
 *
 * 用法：node scripts/check-bundle-config.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const failures = [];
let passed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? `（${detail}）` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------- 1. 合并（Tauri 语义） */

/** 对象递归合并、数组整体替换、`null` 表示删除 —— 与 Tauri `Config::merge` 的语义一致。 */
function merge(base, overlay) {
  if (overlay === null) return undefined;
  if (Array.isArray(overlay) || typeof overlay !== 'object') return overlay;
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      delete out[key];
      continue;
    }
    out[key] = key in out ? merge(out[key], value) : value;
  }
  return out;
}

const base = readJson('src-tauri/tauri.conf.json');
const macosOverlay = readJson('src-tauri/tauri.macos.conf.json');
const windowsOverlay = readJson('src-tauri/tauri.windows.conf.json');
const schema = readJson('node_modules/@tauri-apps/cli/config.schema.json');

const mac = merge(base, macosOverlay);
const win = merge(base, windowsOverlay);

/* ------------------------------------------------- 2. 迷你 schema 校验 */

/**
 * 只覆盖本仓库实际用到的 JSON Schema 子集：$ref / type / enum / const /
 * properties / required / additionalProperties / items / allOf / anyOf / oneOf。
 * 够用即可，不做全量实现。
 */
function validate(value, node, path, errors) {
  if (!node || typeof node !== 'object') return;
  if (node.$ref) {
    const target = node.$ref.replace(/^#\/definitions\//, '');
    validate(value, schema.definitions?.[target], path, errors);
    return;
  }
  if (node.allOf) for (const sub of node.allOf) validate(value, sub, path, errors);
  if (node.anyOf && !node.anyOf.some((sub) => trial(value, sub, path))) {
    errors.push(`${path}: 不满足 anyOf 任一分支`);
  }
  if (node.oneOf && node.oneOf.filter((sub) => trial(value, sub, path)).length !== 1) {
    errors.push(`${path}: 不满足 oneOf 恰好一个分支`);
  }
  const types = node.type ? (Array.isArray(node.type) ? node.type : [node.type]) : null;
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (types && !types.some((t) => (t === 'integer' ? Number.isInteger(value) : t === actual))) {
    errors.push(`${path}: 类型应为 ${types.join('|')}，实际 ${actual}`);
    return;
  }
  if (node.enum && !node.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    errors.push(`${path}: 值 ${JSON.stringify(value)} 不在枚举 ${JSON.stringify(node.enum)} 内`);
  }
  if (node.const !== undefined && JSON.stringify(node.const) !== JSON.stringify(value)) {
    errors.push(`${path}: 值应为常量 ${JSON.stringify(node.const)}`);
  }
  if (actual === 'object' && node.properties) {
    for (const [key, sub] of Object.entries(node.properties)) {
      if (key in value) validate(value[key], sub, `${path}.${key}`, errors);
    }
    for (const key of node.required ?? []) {
      if (!(key in value)) errors.push(`${path}: 缺少必填键 ${key}`);
    }
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in node.properties)) errors.push(`${path}: 未定义键 ${key}`);
      }
    }
  }
  if (actual === 'array' && node.items) {
    value.forEach((item, index) => validate(item, node.items, `${path}[${index}]`, errors));
  }
}

function trial(value, node, path) {
  const errors = [];
  validate(value, node, path, errors);
  return errors.length === 0;
}

function schemaCheck(label, config) {
  const errors = [];
  validate(config, schema, label, errors);
  check(`${label} 通过 config.schema.json 校验`, errors.length === 0, errors.slice(0, 3).join(' | '));
}

schemaCheck('基础 + macOS 合并结果', mac);
schemaCheck('基础 + Windows 合并结果', win);

/* ------------------------------------------------- 3. 基础配置平台中立 */

const baseBundle = base.bundle ?? {};
check('基础配置 identifier = com.poisson.todo', base.identifier === 'com.poisson.todo');
check('基础配置 productName = 日程待办', base.productName === '日程待办');
check('基础配置窗口标题 = 日程待办', base.app?.windows?.[0]?.title === '日程待办');
check(
  '基础配置窗口尺寸 1100×720 / 最小 900×600',
  base.app?.windows?.[0]?.width === 1100 &&
    base.app?.windows?.[0]?.height === 720 &&
    base.app?.windows?.[0]?.minWidth === 900 &&
    base.app?.windows?.[0]?.minHeight === 600,
);
check('基础配置不写死 bundle.targets', !('targets' in baseBundle), JSON.stringify(baseBundle.targets));
check('基础配置不含 macOS 平台块', !('macOS' in baseBundle));
check('基础配置不含 windows 平台块', !('windows' in baseBundle));
check(
  '基础配置不含 dmg / nsis / msi 字样',
  !JSON.stringify(baseBundle).match(/dmg|nsis|msi/i),
  JSON.stringify(baseBundle).match(/dmg|nsis|msi/i)?.[0] ?? '',
);
check('基础配置 sql preload = sqlite:todo.db', base.plugins?.sql?.preload?.[0] === 'sqlite:todo.db');

/* ------------------------------------------------- 4. 两端合并结果 */

check('macOS 合并 targets = [app, dmg]', JSON.stringify(mac.bundle?.targets) === '["app","dmg"]');
check('macOS minimumSystemVersion = 12.0', mac.bundle?.macOS?.minimumSystemVersion === '12.0');
check('macOS hardenedRuntime = false（ad-hoc 签名，不启用运行时加固）', mac.bundle?.macOS?.hardenedRuntime === false);
check(
  'macOS signingIdentity = "-"（ad-hoc 封条；缺失会让 bundle 被判「已损坏」）',
  mac.bundle?.macOS?.signingIdentity === '-',
);
check(
  'macOS dmg 布局保留（app 180,170 / Applications 480,170 / 660×400）',
  mac.bundle?.macOS?.dmg?.appPosition?.x === 180 &&
    mac.bundle?.macOS?.dmg?.applicationFolderPosition?.x === 480 &&
    mac.bundle?.macOS?.dmg?.windowSize?.width === 660,
);
check('macOS 合并结果不含 nsis / msi', !JSON.stringify(mac.bundle?.targets).match(/nsis|msi/i));

check('Windows 合并 targets = [nsis, msi]', JSON.stringify(win.bundle?.targets) === '["nsis","msi"]');
check('Windows nsis.installMode = currentUser', win.bundle?.windows?.nsis?.installMode === 'currentUser');
check(
  'Windows nsis.languages 含 SimpChinese',
  (win.bundle?.windows?.nsis?.languages ?? []).includes('SimpChinese'),
  JSON.stringify(win.bundle?.windows?.nsis?.languages),
);
check('Windows wix.language 含 zh-CN', JSON.stringify(win.bundle?.windows?.wix?.language).includes('zh-CN'));
// 2026-11-02：downloadBootstrapper → embedBootstrapper。
// 起因是实机反馈「Windows 上装完双击 exe 没反应」。
//
// 为什么是 embedBootstrapper 而不是 offlineInstaller：
// - offlineInstaller 把完整 WebView2 运行时打进安装包（Tauri 官方注记 +127MB/个，
//   NSIS 与 MSI 各一份 → 实测 artifact 从 5.2MB 涨到 418MB），代价太大；
// - embedBootstrapper 只把 ~1.8MB 的引导程序嵌进去，安装时不必**先联网下载**
//   引导程序（少一个失败点），本体仍由引导程序联网拉取；
// - 真正解决「用户看不到任何提示」的是**启动期的可诊断层**（预检弹窗 + panic 弹窗
//   + 启动日志，见 src-tauri/src/startup.rs），缺 WebView2 时会明确告知并给下载地址。
//
// 断言写成「引导程序必须内嵌」而不是钉死字面量，意图更清楚。
check(
  'Windows webviewInstallMode = embedBootstrapper（引导程序内嵌，包体不膨胀）',
  win.bundle?.windows?.webviewInstallMode?.type === 'embedBootstrapper',
  JSON.stringify(win.bundle?.windows?.webviewInstallMode),
);
check('Windows 合并结果不含 dmg / app 目标', !JSON.stringify(win.bundle?.targets).match(/dmg/i));
check('Windows 合并结果不含 macOS 平台块', !('macOS' in (win.bundle ?? {})));

for (const [label, config] of [
  ['macOS', mac],
  ['Windows', win],
]) {
  const icons = config.bundle?.icon ?? [];
  check(`${label} 图标含 icon.icns`, icons.some((i) => i.endsWith('icon.icns')));
  check(`${label} 图标含 icon.ico`, icons.some((i) => i.endsWith('icon.ico')));
  check(
    `${label} 图标含 32/128/128@2x png`,
    ['32x32.png', '128x128.png', '128x128@2x.png'].every((name) => icons.some((i) => i.endsWith(name))),
  );
}

/* ------------------------------------------------- 5. 数据落盘路径中立 */

const FORBIDDEN = [/Library\/Application Support/, /%APPDATA%/i, /com\.poisson\.todo\/todo\.db/];
const scanned = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(ts|vue|rs|mjs|js)$/.test(entry)) scanned.push(full);
  }
}
walk('src');
walk('src-tauri/src');

check('扫描到前端 + Rust 源文件', scanned.length > 0, `${scanned.length} 个文件`);
const offenders = [];
for (const file of scanned) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of FORBIDDEN) if (pattern.test(text)) offenders.push(`${file} 命中 ${pattern}`);
}
check(
  '源码中无任一端的数据目录字面量（路径只由 identifier 决定）',
  offenders.length === 0,
  offenders.slice(0, 3).join(' | '),
);

/* ------------------------------------------------- 6. workflow 自检 */

/**
 * workflow 自检需要把 YAML 解析成 JSON，原实现借 **ruby 的 psych**（macOS 自带 ruby）。
 *
 * **为什么要探测而不是直接调**：windows-latest 的 runner 镜像**带 ruby**（Ruby 3.3.10），
 * 但这不是「Windows 自带 ruby」——镜像里有 ruby 不代表**每个**环境都有，
 * 更不代表路径里能找到（`spawn` 在 Windows 上只会尝试 `ruby.exe`）。
 * 一旦找不到，`execFileSync` 抛 ENOENT → **整个自检脚本失败** → Windows job 在此中断。
 *
 * **而且这里本来就是「可跳过」的**：workflow 文件**与平台无关**（同一个
 * `.github/workflows/build.yml` 被两个 job 共用），workflow 的合规性由 macOS 上
 * 那一遍完整覆盖即可。Windows 上跳过**不丢证据**，但不能让它把 CI 打断。
 *
 * 措辞上要区分「跳过（不具备技术条件）」与「通过」。
 */
const WORKFLOW = '.github/workflows/build.yml';

function loadWorkflowYaml() {
  // 探测：ruby 能不能跑（真的跑一次，而不是只看 PATH 里有没有）
  const probe = spawnSync('ruby', ['-e', 'exit 0'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    return { ok: false, reason: '本平台找不到可用的 ruby（YAML 解析器）' };
  }
  try {
    const yaml = execFileSync('ruby', [
      '-ryaml',
      '-rjson',
      '-e',
      `puts YAML.load_file('${WORKFLOW}').to_json`,
    ]).toString();
    return { ok: true, workflow: JSON.parse(yaml) };
  } catch (error) {
    // ruby 在、但解析失败 —— 这是**真问题**（workflow 写坏了），必须判失败
    return { ok: false, fatal: true, reason: error instanceof Error ? error.message : String(error) };
  }
}

const loaded = loadWorkflowYaml();

if (!loaded.ok && loaded.fatal) {
  check(`workflow YAML 可被解析（ruby psych）`, false, loaded.reason);
} else if (!loaded.ok) {
  console.log(`⊘ 跳过 workflow 自检：${loaded.reason}。`);
  console.log('  这不是「workflow 合规」，而是「本平台不具备解析 YAML 的技术条件」——');
  console.log('  workflow 文件与平台无关，其合规性由 macOS 上那一遍完整覆盖。');
} else {
  const workflow = loaded.workflow;

  check('workflow YAML 可被解析（ruby psych）', typeof workflow === 'object' && workflow !== null);
  check('workflow 定义 build job', Boolean(workflow.jobs?.build));

const matrixOs = (workflow.jobs.build.strategy?.matrix?.include ?? []).map((entry) => entry.os);
check('matrix 含 macos-latest', matrixOs.includes('macos-latest'), matrixOs.join(','));
check('matrix 含 windows-latest', matrixOs.includes('windows-latest'), matrixOs.join(','));

const steps = workflow.jobs.build.steps ?? [];
const byName = (needle) => steps.findIndex((step) => (step.name ?? '').toLowerCase().includes(needle));
const installIndex = byName('install dependencies');
const npmBuildIndex = byName('build frontend');
const pwInstallIndex = byName('install playwright');
const pwTestIndex = byName('e2e baseline');
const tauriBuildIndex = steps.findIndex((step) => /tauri build/i.test(step.name ?? ''));

check('步骤含 npm ci', /npm ci/.test(steps[installIndex]?.run ?? ''));
check('步骤含 npm run build', /npm run build/.test(steps[npmBuildIndex]?.run ?? ''));
check(
  'Playwright 安装步骤区分 macOS 与 Windows',
  steps.some((s) => /playwright install --with-deps chromium/.test(s.run ?? '')) &&
    steps.filter((s) => /playwright install/.test(s.run ?? '')).length === 2,
);
check('步骤含 npx playwright test', /npx playwright test/.test(steps[pwTestIndex]?.run ?? ''));
check(
  'Windows job 真的调 npx tauri build（不是占位注释）',
  steps.some((s) => s.if === "runner.os == 'Windows'" && /npx tauri build/.test(s.run ?? '')),
);
check(
  '步骤顺序：装依赖 → 前端构建 → 装浏览器 → E2E → tauri build',
  installIndex >= 0 &&
    installIndex < npmBuildIndex &&
    npmBuildIndex < pwInstallIndex &&
    pwInstallIndex < pwTestIndex &&
    pwTestIndex < tauriBuildIndex,
  `install=${installIndex} build=${npmBuildIndex} pwInstall=${pwInstallIndex} pwTest=${pwTestIndex} tauriBuild=${tauriBuildIndex}`,
);
check(
  '上传产物步骤存在且 if-no-files-found: error',
  steps.some((s) => /upload/i.test(s.uses ?? '') && s.with?.['if-no-files-found'] === 'error'),
);

const entryFor = (os) => (workflow.jobs.build.strategy?.matrix?.include ?? []).find((e) => e.os === os);
check('macOS 产物路径含 dmg 与 .app', (() => {
  const paths = entryFor('macos-latest')?.bundlePaths ?? '';
  return /dmg\/\*\.dmg/.test(paths) && /macos\/\*\.app/.test(paths);
})());
check('Windows 产物路径含 nsis exe 与 msi', (() => {
  const paths = entryFor('windows-latest')?.bundlePaths ?? '';
  return /nsis\/\*\.exe/.test(paths) && /msi\/\*\.msi/.test(paths);
})());

/* --------------------------------------- 6.1 发布通道（tag → GitHub Release） */

// YAML 1.1 里裸 `on:` 会被 ruby psych 解析成布尔 true，所以两个键都取。
const trigger = workflow.on ?? workflow[true] ?? {};
const pushTrigger = trigger.push ?? {};

check(
  'workflow push 触发包含 tags: ["v*"]',
  JSON.stringify(pushTrigger.tags ?? []) === JSON.stringify(['v*']),
  JSON.stringify(pushTrigger.tags),
);
check(
  'workflow push 触发保留原有 branches',
  JSON.stringify(pushTrigger.branches ?? []) === JSON.stringify(['master', 'release/**']),
  JSON.stringify(pushTrigger.branches),
);
check(
  'workflow 顶层 permissions.contents = write（创建 Release 必需）',
  workflow.permissions?.contents === 'write',
  JSON.stringify(workflow.permissions),
);

// 发布步骤：现在自己用 gh CLI 发布（不再用 softprops/action-gh-release），
// 理由见 workflow 注释：第三方 action 对 GitHub API 的 500 没有兜底，
// v0.3.5 实测「连返 3 次 500 → Too many retries → Windows 资产全丢」。
const releaseSteps = steps.filter((s) => /gh release (upload|create)/.test(s.run ?? ''));
check('存在发布 Release 资产的步骤（gh release）', releaseSteps.length > 0);
check(
  '发布步骤只在 tag 推送时执行',
  releaseSteps.length > 0 &&
    releaseSteps.every((s) => /startsWith\(github\.ref, 'refs\/tags\/v'\)/.test(s.if ?? '')),
  releaseSteps.map((s) => s.if ?? '').join(' | '),
);
check(
  '发布步骤同时具备 upload 与 create 两条路径（另一端 job 可能已创建 Release）',
  releaseSteps.length > 0 &&
    releaseSteps.every(
      (s) => /gh release upload/.test(s.run ?? '') && /gh release create/.test(s.run ?? '')
    ),
);
// 重试次数要**明确够多**：只匹配「有 for attempt in」会把 `for attempt in 1;`
// 这种「只试一次」的写法放过——那正是 v0.3.5 的失败形态（4 秒内试 3 次就放弃）。
const attemptCounts = releaseSteps.map((s) => {
  const matched = (s.run ?? '').match(/for attempt in\s+([0-9\s]+);/);
  return matched ? matched[1].trim().split(/\s+/).filter(Boolean).length : 0;
});
check(
  '发布步骤的退避重试至少尝试 3 次（GitHub API 偶发 500 时不能一次就放弃）',
  releaseSteps.length > 0 && attemptCounts.every((count) => count >= 3),
  attemptCounts.join(' | '),
);
check(
  '发布步骤的重试之间有退避等待（≥ 15 秒）',
  releaseSteps.length > 0 &&
    releaseSteps.every((s) => /sleep\s+(?:1[5-9]|[2-9]\d|\d{3,})/.test(s.run ?? '')),
);
check(
  '发布步骤在产物缺失时直接失败（不再静默少挂一个资产）',
  releaseSteps.length > 0 &&
    releaseSteps.every((s) => /产物缺失/.test(s.run ?? '') && /exit 1/.test(s.run ?? '')),
);
const releaseFiles = releaseSteps.map((s) => s.run ?? '').join('\n');
check(
  '发布资产覆盖 dmg / app.zip / exe / msi 四类产物',
  ['.dmg', '.app.zip', '.exe', '.msi'].every((ext) => releaseFiles.includes(ext)),
  releaseFiles.replace(/\s+/g, ' ').slice(0, 120),
);
// 只看**资产名**本身必须是 ASCII（脚本里的中文提示与说明不影响资产名），
// 断言的是「Release 资产 URL 里不会出现百分号编码的中文」。
const assetNameTokens = releaseFiles.match(/ScheduleTodo-[^"'\s]*/g) ?? [];
check(
  '发布资产名统一为 ASCII 前缀 ScheduleTodo-',
  assetNameTokens.length > 0 && assetNameTokens.every((name) => !/[^\x00-\x7F]/.test(name)),
  assetNameTokens.join(' | '),
);
check(
  '存在把产物改名为 ASCII 的步骤',
  steps.some((s) => /mv\b/.test(s.run ?? '') && /ScheduleTodo-/.test(s.run ?? '')),
);

// 核对 job：发布完必须确认四个资产都在（缺一个就是红的）。
const verifyJob = workflow.jobs?.['verify-release'];
check('存在 verify-release job（核对四个资产都在）', Boolean(verifyJob));
check('verify-release 依赖 build job（两个平台都发完才核对）', verifyJob?.needs === 'build');
check(
  'verify-release 只在 tag 推送时执行',
  /startsWith\(github\.ref, 'refs\/tags\/v'\)/.test(verifyJob?.if ?? ''),
  verifyJob?.if ?? '',
);
const verifyRun = (verifyJob?.steps ?? []).map((s) => s.run ?? '').join('\n');
check(
  'verify-release 逐个核对 dmg / app.zip / exe / msi 四个资产名',
  ['-macos-arm64.dmg', '-macos-arm64.app.zip', '-windows-x64-setup.exe', '-windows-x64.msi'].every(
    (name) => verifyRun.includes(name)
  ),
);
check(
  'verify-release 缺资产时判失败',
  /exit 1/.test(verifyRun) && /missing/.test(verifyRun),
);

/* ------------------------------- 6.2 E2E 套件是否真的进 CI（不只是「本地跑过」） */

// **为什么要这一组**：2026-11-22 的实机故障（「登录了但没有同步到数据」）
// 之所以能一路漏到实机，正是因为**同步侧的断言只存在于本机**。
// 同理，`e2e-sync/` 这一整套同步 E2E **从未进过 CI** ——
// 2026-11-25 的实机故障恰恰是「界面没把同步结果说出来」，
// 而那一组断言（状态区表达、墓碑死锁的「找回」出口）正是为它准备的。
//
// 「本地跑过」不等于「有防护」：只有断言进了 CI，改坏了才会当场被拦。
const e2eRuns = steps.map((s) => s.run ?? '').join('\n');
check(
  '主套件 E2E 进 CI（npx playwright test）',
  /npx playwright test/.test(e2eRuns),
);
check(
  '同步套件 E2E 进 CI（npm run test:sync）',
  /npm run test:sync/.test(e2eRuns),
);
check(
  'Rust 侧断言进 CI（cargo test --release）',
  /cargo test --release/.test(e2eRuns),
);
} // ← workflow 自检（ruby 可用时才做）

/* ------------------------------------------------- 7. 结果 */

console.log('\n----------------------------------------');
console.log(`断言通过 ${passed} 条，失败 ${failures.length} 条`);
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\nFAIL');
  process.exit(1);
}
console.log('PASS（三份 conf 合并 + schema + 平台中立 + 数据路径中立 + workflow 结构）');
