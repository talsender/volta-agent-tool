const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_ROOF_CONFIG } = require('../config.js');
const { buildSimState } = require('../sim-state.js');

const cfg = DEFAULT_ROOF_CONFIG;

test('area shares are proportional', () => {
  const s = buildSimState({ materials: [{ id: 'concrete', size: 60 }, { id: 'pergola', size: 20 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  assert.strictEqual(s.totalArea, 80);
  const concrete = s.parts.find(p => p.id === 'concrete');
  const pergola = s.parts.find(p => p.id === 'pergola');
  assert.ok(Math.abs(concrete.areaShare - 0.75) < 1e-9);
  assert.ok(Math.abs(pergola.areaShare - 0.25) < 1e-9);
});

test('geometry comes from roofConfig', () => {
  const s = buildSimState({ materials: [{ id: 'tiles', size: 50 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  assert.strictEqual(s.parts[0].geometry, 'pitched');
});

test('zero total area is safe (no NaN shares)', () => {
  const s = buildSimState({ materials: [{ id: 'concrete', size: 0 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  assert.strictEqual(s.totalArea, 0);
  assert.strictEqual(s.parts.length, 0); // size 0 is dropped
});

test('sun direction: south is +z, north is -z, both above horizon', () => {
  const south = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  assert.ok(south.sun.dir.z > 0.3);
  assert.ok(south.sun.dir.y > 0.5);
  const north = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 0, shading: 'none', propertyType: 'private' }, cfg);
  assert.ok(north.sun.dir.z < -0.3);
});

test('east azimuth points sun +x', () => {
  const east = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 90, shading: 'none', propertyType: 'private' }, cfg);
  assert.ok(east.sun.dir.x > 0.3);
});

test('shading maps to obstacle counts', () => {
  const none = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  const partial = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'partial', propertyType: 'private' }, cfg);
  const heavy = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'heavy', propertyType: 'private' }, cfg);
  assert.strictEqual(none.obstacles.length, 0);
  assert.strictEqual(partial.obstacles.length, 1);
  assert.ok(heavy.obstacles.length >= 2);
});

test('obstacles sit on the sun side (same sign z as sun for south)', () => {
  const s = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'partial', propertyType: 'private' }, cfg);
  assert.ok(s.obstacles[0].z > 0); // sun is +z, obstacle between sun and house
});

test('condo gets 2 stories, private gets 1', () => {
  const condo = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'condo-private' }, cfg);
  const priv = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  assert.strictEqual(condo.house.stories, 2);
  assert.strictEqual(priv.house.stories, 1);
});
