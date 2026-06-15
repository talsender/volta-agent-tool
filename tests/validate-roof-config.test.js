const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_ROOF_CONFIG } = require('../config.js');
const { validateRoofConfig } = require('../roof-store.js');

const clone = o => JSON.parse(JSON.stringify(o));

test('the shipped default config is valid', () => {
  assert.strictEqual(validateRoofConfig(DEFAULT_ROOF_CONFIG).ok, true);
});

test('borderline must be <= good', () => {
  const c = clone(DEFAULT_ROOF_CONFIG); c.totalSizeThresholds.borderline = 90;
  assert.strictEqual(validateRoofConfig(c).ok, false);
});

test('duplicate material ids are rejected', () => {
  const c = clone(DEFAULT_ROOF_CONFIG); c.materials[1].id = c.materials[0].id;
  const r = validateRoofConfig(c);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => /ייחודי|unique|כפול/.test(e)));
});

test('empty material id is rejected', () => {
  const c = clone(DEFAULT_ROOF_CONFIG); c.materials[0].id = '';
  assert.strictEqual(validateRoofConfig(c).ok, false);
});

test('stop base action requires a stop reason', () => {
  const c = clone(DEFAULT_ROOF_CONFIG);
  const m = c.materials.find(x => x.id === 'light'); m.messages.stopReason = '';
  assert.strictEqual(validateRoofConfig(c).ok, false);
});

test('sizeRules upTo values must ascend (nulls last)', () => {
  const c = clone(DEFAULT_ROOF_CONFIG);
  c.materials[0].sizeRules = [{ upTo: 40, outcome: 'ok', message: '' }, { upTo: 20, outcome: 'ok', message: '' }];
  assert.strictEqual(validateRoofConfig(c).ok, false);
});

test('invalid outcome is rejected', () => {
  const c = clone(DEFAULT_ROOF_CONFIG);
  c.materials[0].sizeRules = [{ upTo: null, outcome: 'maybe', message: '' }];
  assert.strictEqual(validateRoofConfig(c).ok, false);
});

test('empty materials array is rejected', () => {
  const c = clone(DEFAULT_ROOF_CONFIG); c.materials = [];
  assert.strictEqual(validateRoofConfig(c).ok, false);
});
