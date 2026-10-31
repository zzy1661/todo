import { METHODS, CATEGORY_META, METHOD_MAP, CATEGORY_COUNTS } from './methods.ts';

const byCat = {};
const caseDist = { practice: 0, story: 0, none: 0 };
const stepDist = {};
const over = [];
const badLen = [];
const lens = [];
const ids = new Set();
let dup = 0;
const missing = [];

for (const m of METHODS) {
  byCat[m.category] = (byCat[m.category] || 0) + 1;
  if (m.case) caseDist[m.case.type] = (caseDist[m.case.type] || 0) + 1;
  else caseDist.none++;
  const n = Array.isArray(m.steps) ? m.steps.length : -1;
  stepDist[n] = (stepDist[n] || 0) + 1;
  if (n > 4) over.push(`${m.id}:${n}`);
  if (ids.has(m.id)) dup++;
  ids.add(m.id);
  for (const f of ['id', 'name', 'category', 'source', 'summary', 'steps', 'when', 'action']) {
    if (m[f] === undefined || m[f] === null || m[f] === '') missing.push(`${m.id}.${f}`);
  }
  if (m.case) {
    const len = m.case.content.length;
    lens.push(len);
    if (len < 126 || len > 240) badLen.push(`${m.id}:${len}`);
  }
}

const sum = lens.reduce((a, b) => a + b, 0);
console.log(JSON.stringify({
  total: METHODS.length,
  byCat,
  caseDist,
  stepDist,
  over,
  dup,
  missingCount: missing.length,
  missing: missing.slice(0, 5),
  caseLenMin: Math.min(...lens),
  caseLenMax: Math.max(...lens),
  caseLenAvg: +(sum / lens.length).toFixed(1),
  badLen,
  catMetaKeys: Object.keys(CATEGORY_META),
  methodMapSize: METHOD_MAP.size ?? Object.keys(METHOD_MAP).length,
  categoryCounts: CATEGORY_COUNTS,
  longestCaseContent: METHODS.filter(m => m.case).map(m => ({ id: m.id, len: m.case.content.length })).sort((a, b) => b.len - a.len).slice(0, 3),
}, null, 2));
