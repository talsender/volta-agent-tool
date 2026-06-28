const test = require('node:test');
const assert = require('node:assert');
const { sunDirAt, sunSteps, rate, combine, exposurePct } = require('../shading.js');

test('noon sun is high and from the south (+z)', () => {
  const d = sunDirAt(0.5);
  assert.ok(d.y > 0.8, 'high elevation at noon');
  assert.ok(d.z > 0.3, 'from south (+z)');
  assert.ok(Math.abs(d.x) < 1e-6, 'no east/west at noon');
});

test('morning sun is from the east (+x), evening from the west (-x)', () => {
  assert.ok(sunDirAt(0.12).x > 0.2, 'morning east');
  assert.ok(sunDirAt(0.88).x < -0.2, 'evening west');
});

test('sun is above the horizon all day (y>0 in the sampled range)', () => {
  for (let t = 0.12; t <= 0.88; t += 0.1) assert.ok(sunDirAt(t).y > 0, 't=' + t);
});

test('sunSteps returns n weighted steps, heaviest near noon', () => {
  const s = sunSteps(7);
  assert.strictEqual(s.length, 7);
  s.forEach(x => assert.ok(x.weight > 0));
  const noon = s[3]; // middle
  assert.ok(noon.weight >= s[0].weight && noon.weight >= s[6].weight);
});

test('rate thresholds', () => {
  assert.strictEqual(rate(90).label, 'מצוין');
  assert.strictEqual(rate(75).label, 'טוב');
  assert.strictEqual(rate(60).label, 'בינוני');
  assert.strictEqual(rate(30).label, 'נמוך');
});

test('combine multiplies orientation yield by exposure', () => {
  assert.strictEqual(combine(100, 84), 84);
  assert.strictEqual(combine(95, 80), 76);
  assert.strictEqual(combine(62, 100), 62);
});

test('exposurePct: full sun, full shade, and weighted average', () => {
  assert.strictEqual(exposurePct([{ weight: 1, unshaded: 1 }, { weight: 1, unshaded: 1 }]), 100);
  assert.strictEqual(exposurePct([{ weight: 1, unshaded: 0 }, { weight: 2, unshaded: 0 }]), 0);
  // noon (weight 2) fully lit, morning (weight 1) fully shaded → 2/3 ≈ 67%
  assert.strictEqual(exposurePct([{ weight: 1, unshaded: 0 }, { weight: 2, unshaded: 1 }]), 67);
  assert.strictEqual(exposurePct([]), 100); // no data → full sun
});
