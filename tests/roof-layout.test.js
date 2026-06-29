const test = require('node:test');
const assert = require('node:assert');
const RoofLayout = require('../roof-layout.js');

const cfg = { materials: [
  { id: 'concrete', label: 'בטון', geometry: 'flat' },
  { id: 'pergola', label: 'פרגולה', geometry: 'pergola' },
], totalSizeThresholds: { good: 70, borderline: 60 } };
const inputs = { materials: [{ id: 'concrete', size: 60 }, { id: 'pergola', size: 20 }], azimuth: 180, propertyType: 'private', obstacles: [] };

test('buildLayout: one segment per material, positive house dims, default door', () => {
  const L = RoofLayout.buildLayout(inputs, cfg);
  assert.strictEqual(L.segments.length, 2);
  assert.ok(L.house.width > 0 && L.house.depth > 0);
  assert.strictEqual(L.house.stories, 1);
  assert.deepStrictEqual(L.house.door, { side: 'S', t: 0.5 });
  const seg = L.segments.find(s => s.materialId === 'concrete');
  assert.strictEqual(seg.geometry, 'flat');
  assert.ok(seg.w > 0 && seg.d > 0);
});

test('layoutToSimState: maps segments to parts with placement, keeps obstacles', () => {
  const L = RoofLayout.buildLayout(inputs, cfg);
  L.obstacles = [{ id: 'o1', type: 'tree', x: 5, z: 5, height: 4, onRoof: false }];
  const s = RoofLayout.layoutToSimState(L);
  assert.strictEqual(s.parts.length, 2);
  const p = s.parts[0];
  ['id','geometry','cx','cz','w','d','rotDeg'].forEach(k => assert.ok(k in p, 'missing ' + k));
  assert.strictEqual(s.obstacles.length, 1);
  assert.ok(typeof s.house.orientationRad === 'number');
});

test('alignToDoor: N and S differ by 180', () => {
  const L = RoofLayout.buildLayout(inputs, cfg);
  L.house.door.side = 'S'; const sDeg = RoofLayout.alignToDoor(L);
  L.house.door.side = 'N'; const nDeg = RoofLayout.alignToDoor(L);
  assert.strictEqual(sDeg, 180);
  assert.strictEqual(nDeg, 0);
});

test('segmentArea = w*d', () => {
  assert.strictEqual(RoofLayout.segmentArea({ w: 6, d: 5 }), 30);
});
