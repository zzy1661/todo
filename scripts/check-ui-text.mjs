/**
 * 界面文案自检（v0.3.7 新增）。
 *
 * 为什么需要它：Vue 模板**不解析 Markdown**，所以正文里的 `**强调**`
 * 会以字面文本显示给用户（星号原样露出来）。
 * 这类问题编译期查不出来（`vue-tsc` 只管类型）、单元测试也测不到
 * （断言的是引擎产出的文案，不是模板正文）——**只能靠一条机械断言**。
 *
 * （2026-11-26 实例：同步面板里写了「撤销**本机**的删除记录」，
 *   界面上真的显示了星号。）
 *
 * 规则：
 * 1. `.vue` 文件的**模板正文**（注释之外）不得出现 `**` / `__` 强调标记；
 * 2. 模板正文里的中文文案不得出现 Markdown 风格的行内代码反引号
 *    （代码片段要用 `<code>` 标签，界面不该露出反引号）。
 *
 * 用法：node scripts/check-ui-text.mjs   （违规即以非零码退出）
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

/** 递归收集 .vue 文件 */
function collectVueFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...collectVueFiles(full));
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

/**
 * 去掉 Vue 插值 `{{ … }}`。
 *
 * **不能用简单正则**：插值里常有嵌套的模板字符串，例如
 * `{{ cond ? a : `${b} ${c}` }}` —— 花括号是**嵌套**的，
 * `[^}]*` 会在第一个 `}` 处截断，把尾巴当成了正文。
 * 所以这里手动数括号，找到配对的 `}}`。
 */
function stripInterpolations(text) {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('{{', index);
    if (start === -1) {
      out += text.slice(index);
      break;
    }
    out += text.slice(index, start);
    let depth = 0;
    let cursor = start + 1;
    while (cursor < text.length) {
      const ch = text[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          cursor += 1; // 连第二个 '}' 一起吃掉
          break;
        }
      }
      cursor += 1;
    }
    index = cursor;
  }
  return out;
}

/**
 * 取出模板正文：`<template>…</template>` 去掉 HTML 注释。
 *
 * 只看模板是对的——`<script>` 里的 JSDoc 注释本来就该用 Markdown 记述，
 * 那是给开发者看的，不是界面文案。
 */
function extractTemplateBody(source) {
  const start = source.indexOf('<template>');
  if (start === -1) return '';
  const end = source.indexOf('</template>', start);
  if (end === -1) return '';
  return source
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*$/, '');
}

const files = collectVueFiles(SRC);
const problems = [];
let checkedLines = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const body = extractTemplateBody(fs.readFileSync(file, 'utf8'));
  body.split('\n').forEach((line, index) => {
    const text = line.trim();
    // 去掉**代码**，只看真正显示给用户的文字：
    // ① 插值 `{{ … }}`；② 属性绑定（`:class="…"`, `v-if="…"`）——
    //    里面的反引号是 JavaScript 模板字符串，**不是**界面文案；
    // ③ 标签本身。
    const textNodes = stripInterpolations(text)
      .replace(/(?:^|\s)[@:v][\w.:-]*\s*=\s*"[^"]*"/g, '')
      .replace(/(?:^|\s)[@:v][\w.:-]*\s*=\s*'[^']*'/g, '')
      .replace(/<[^>]*>/g, '')
      .trim();
    if (textNodes === '') return;
    checkedLines += 1;
    if (/\*\*|__/.test(textNodes)) {
      problems.push(
        `${rel}:${index + 1} 模板正文出现 Markdown 强调标记（界面不解析 Markdown，会原样显示星号）：${text.slice(0, 80)}`
      );
    }
    if (/`[^`]+`/.test(textNodes)) {
      problems.push(
        `${rel}:${index + 1} 模板正文出现反引号（代码片段请用 <code> 标签）：${text.slice(0, 80)}`
      );
    }
  });
}

console.log(
  `扫描 ${files.length} 个 .vue 文件：${checkedLines} 行含界面文案（已排除 HTML 注释与标签）`
);
if (problems.length > 0) {
  console.error(`✗ 界面文案自检失败 ${problems.length} 项：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('PASS（模板正文没有 Markdown 强调标记与反引号）');
