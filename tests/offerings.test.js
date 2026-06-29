const test = require('node:test');
const assert = require('node:assert');
const Offerings = require('../offerings.js');

const CAT = [
  { id: 'system-traditional', appliesTo: ['concrete','tiles'], minArea: 70 },
  { id: 'system-apollo', appliesTo: ['light','corrugated'], minArea: null },
  { id: 'leasing', appliesTo: 'all', minArea: 100 },
  { id: 'pergola-unikit', appliesTo: ['pergola'], minArea: 40 },
];

test('matchForRoof: concrete 80 → traditional eligible + leasing not eligible', () => {
  const r = Offerings.matchForRoof(['concrete'], 80, CAT);
  const ids = r.map(o => o.id);
  assert.deepStrictEqual(ids.sort(), ['leasing','system-traditional']);
  assert.strictEqual(r.find(o => o.id === 'system-traditional').eligible, true);
  const lease = r.find(o => o.id === 'leasing');
  assert.strictEqual(lease.eligible, false);
  assert.match(lease.reason, /100/);
});

test('matchForRoof: concrete 120 → leasing eligible', () => {
  const r = Offerings.matchForRoof(['concrete'], 120, CAT);
  assert.strictEqual(r.find(o => o.id === 'leasing').eligible, true);
});

test('matchForRoof: light construction → apollo, not traditional', () => {
  const ids = Offerings.matchForRoof(['light'], 50, CAT).map(o => o.id);
  assert.ok(ids.includes('system-apollo'));
  assert.ok(!ids.includes('system-traditional'));
});

test('matchForRoof: pergola 45 → unikit eligible', () => {
  const u = Offerings.matchForRoof(['pergola'], 45, CAT).find(o => o.id === 'pergola-unikit');
  assert.strictEqual(u.eligible, true);
});

test('matchForRoof: asbestos → only the appliesTo:all leasing', () => {
  const ids = Offerings.matchForRoof(['asbestos'], 80, CAT).map(o => o.id);
  assert.deepStrictEqual(ids, ['leasing']);
});
