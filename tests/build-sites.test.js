const test = require('node:test');
const assert = require('node:assert');
const { buildSites } = require('../globe.js');

const statusClass = s => s === 'מתקינים' ? 'yes' : s === 'לא מתקינים' ? 'no' : 'unknown';

test('buildSites merges coords and skips unknown-coord settlements', () => {
  const all = [
    { name: 'רעננה', status: 'מתקינים', installCount: 4 },
    { name: 'גדרה',  status: 'לא מתקינים', installCount: 0 },
    { name: 'בלי-קואורדינטה', status: 'מתקינים', installCount: 1 },
  ];
  const coords = { 'רעננה': [32.18, 34.87], 'גדרה': [31.81, 34.78] };
  const sites = buildSites(all, coords, statusClass);
  assert.strictEqual(sites.length, 2);
  const raanana = sites.find(s => s.name === 'רעננה');
  assert.strictEqual(raanana.cls, 'yes');
  assert.strictEqual(raanana.lat, 32.18);
  assert.strictEqual(raanana.lon, 34.87);
  assert.strictEqual(raanana.installCount, 4);
});

test('buildSites returns empty for missing inputs', () => {
  assert.deepStrictEqual(buildSites(null, {}, statusClass), []);
  assert.deepStrictEqual(buildSites([], null, statusClass), []);
});
