const test = require('node:test');
const assert = require('node:assert');
const { normName, reindexCoords, buildSites } = require('../globe.js');

test('normName unifies ktiv male/haser (קרית == קריית)', () => {
  assert.strictEqual(normName('קרית ים'), normName('קריית ים'));
  assert.strictEqual(normName('קרית מוצקין'), normName('קריית מוצקין'));
  // collapses doubled vav too
  assert.strictEqual(normName('זכרון'), normName('זכרוון'));
});

test('reindexCoords lets a single-yod name hit a double-yod coord key', () => {
  // coord store keyed in the older "קריית" spelling
  const raw = { 'קרייתים': [32.8502, 35.0703] };
  const idx = reindexCoords(raw);
  // a CSV name in "קרית" spelling now resolves through the re-indexed map
  assert.deepStrictEqual(idx[normName('קרית ים')], [32.8502, 35.0703]);
});

test('buildSites matches קרית-spelled names against re-indexed קריית coords', () => {
  const all = [{ name: 'קרית ים', status: 'מתקינים', installCount: 2 }];
  const idx = reindexCoords({ 'קרייתים': [32.8502, 35.0703] });
  const sc = s => (s === 'מתקינים' ? 'yes' : 'unknown');
  const sites = buildSites(all, idx, sc);
  assert.strictEqual(sites.length, 1);
  assert.strictEqual(sites[0].lat, 32.8502);
  assert.strictEqual(sites[0].lon, 35.0703);
});
