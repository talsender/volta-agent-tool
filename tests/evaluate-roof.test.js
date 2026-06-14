const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_ROOF_CONFIG } = require('../config.js');
const { evaluateRoof } = require('../wizard.js');

const cfg = DEFAULT_ROOF_CONFIG;

test('concrete 80 alone → ok', () => {
  const r = evaluateRoof([{ materialId: 'concrete', size: 80 }], cfg);
  assert.strictEqual(r.outcome, 'ok');
  assert.strictEqual(r.flags.length, 0);
});

test('total below borderline → stop', () => {
  const r = evaluateRoof([{ materialId: 'concrete', size: 40 }], cfg);
  assert.strictEqual(r.outcome, 'stop');
  assert.match(r.stopReason, /קטן מדי/);
});

test('total in borderline band → warn with flag', () => {
  const r = evaluateRoof([{ materialId: 'concrete', size: 65 }], cfg);
  assert.strictEqual(r.outcome, 'warn');
  assert.ok(r.flags.length >= 1);
});

test('light building base-action forces stop regardless of size', () => {
  const r = evaluateRoof([{ materialId: 'light', size: 200 }], cfg);
  assert.strictEqual(r.outcome, 'stop');
  assert.match(r.stopReason, /בנייה קלה/);
});

test('insulated panel escalates', () => {
  const r = evaluateRoof([{ materialId: 'insulated', size: 90 }], cfg);
  assert.strictEqual(r.outcome, 'escalate');
  assert.match(r.escalateNote, /אישור מנהל/);
});

test('concrete 60 + pergola 20 → warn (non-blocking pergola note), flag collected', () => {
  const r = evaluateRoof([
    { materialId: 'concrete', size: 60 },
    { materialId: 'pergola', size: 20 },
  ], cfg);
  // pergola baseAction 'flag' is a non-blocking note → warn (maps to go-notes),
  // not a hard ok. Total 80 ≥ good, so size alone is fine.
  assert.strictEqual(r.outcome, 'warn');
  assert.ok(r.flags.some(f => /פרגולה/.test(f)));
  assert.strictEqual(r.perMaterial.length, 2);
});

test('worst outcome wins: stop beats escalate', () => {
  const r = evaluateRoof([
    { materialId: 'insulated', size: 90 },
    { materialId: 'light', size: 90 },
  ], cfg);
  assert.strictEqual(r.outcome, 'stop');
});
