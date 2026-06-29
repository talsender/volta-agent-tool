const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_ROOF_CONFIG } = require('../config.js');
const { buildSimState, deriveShadingSeverity } = require('../sim-state.js');

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

test('deriveShadingSeverity: empty=none, light=partial, building/3+=heavy', () => {
  assert.strictEqual(deriveShadingSeverity([]), 'none');
  assert.strictEqual(deriveShadingSeverity(['tree']), 'partial');
  assert.strictEqual(deriveShadingSeverity(['antenna', 'chimney']), 'partial');
  assert.strictEqual(deriveShadingSeverity(['building']), 'heavy');
  assert.strictEqual(deriveShadingSeverity(['tree', 'antenna', 'chimney']), 'heavy');
});

test('obstacles input maps each selected type to a rendered obstacle', () => {
  const s = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, obstacles: ['tree', 'equipment', 'antenna'], propertyType: 'private' }, cfg);
  assert.strictEqual(s.obstacles.length, 3);
  assert.deepStrictEqual(s.obstacles.map(o => o.type).sort(), ['antenna', 'equipment', 'tree']);
});

test('roof-mounted obstacles are flagged onRoof; ground ones are not', () => {
  const s = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, obstacles: ['equipment', 'antenna', 'chimney', 'tree', 'building'], propertyType: 'private' }, cfg);
  const onRoof = t => s.obstacles.find(o => o.type === t).onRoof;
  assert.strictEqual(onRoof('equipment'), true);
  assert.strictEqual(onRoof('antenna'), true);
  assert.strictEqual(onRoof('chimney'), true);
  assert.strictEqual(onRoof('tree'), false);
  assert.strictEqual(onRoof('building'), false);
});

test('ground obstacles sit on the sun side (south → +z)', () => {
  const s = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, obstacles: ['tree'], propertyType: 'private' }, cfg);
  assert.ok(s.obstacles[0].z > 0);
});

test('state exposes the derived shading severity from obstacles', () => {
  const heavy = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, obstacles: ['building'], propertyType: 'private' }, cfg);
  const partial = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, obstacles: ['antenna'], propertyType: 'private' }, cfg);
  assert.strictEqual(heavy.shading, 'heavy');
  assert.strictEqual(partial.shading, 'partial');
});

test('legacy shading string still maps to obstacles (back-compat)', () => {
  const none = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  const partial = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'partial', propertyType: 'private' }, cfg);
  const heavy = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'heavy', propertyType: 'private' }, cfg);
  assert.strictEqual(none.obstacles.length, 0);
  assert.strictEqual(partial.obstacles.length, 1);
  assert.ok(heavy.obstacles.length >= 2);
});

test('condo gets 2 stories, private gets 1', () => {
  const condo = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'condo-private' }, cfg);
  const priv = buildSimState({ materials: [{ id: 'concrete', size: 80 }], azimuth: 180, shading: 'none', propertyType: 'private' }, cfg);
  assert.strictEqual(condo.house.stories, 2);
  assert.strictEqual(priv.house.stories, 1);
});
