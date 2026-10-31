import { METHODS } from './methods.ts';

const rows = METHODS.map(m => ({
  id: m.id,
  steps: m.steps.length,
  stepChars: m.steps.reduce((a, s) => a + s.length, 0),
  maxStep: Math.max(...m.steps.map(s => s.length)),
  summary: m.summary.length,
  when: m.when.length,
  action: m.action.length,
  caseLen: m.case ? m.case.content.length : 0,
  total: m.steps.reduce((a, s) => a + s.length, 0) + m.summary.length + m.when.length + m.action.length + (m.case ? m.case.content.length : 0),
}));

const byTotal = [...rows].sort((a, b) => b.total - a.total).slice(0, 5);
const bySteps = [...rows].sort((a, b) => b.steps - a.steps).slice(0, 5);
const maxStepText = [...rows].sort((a, b) => b.maxStep - a.maxStep).slice(0, 3);
console.log(JSON.stringify({ byTotal, bySteps, maxStepText }, null, 2));
