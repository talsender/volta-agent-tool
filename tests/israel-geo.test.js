const test = require('node:test');
const assert = require('node:assert');
const Geo = require('../israel-geo.js');

test('BOUNDS derived from OUTLINE', () => {
  assert.ok(Geo.BOUNDS.minLat < 30 && Geo.BOUNDS.maxLat > 33);
  assert.ok(Geo.BOUNDS.minLon < 34.6 && Geo.BOUNDS.maxLon > 35.5);
});

test('project maps north above Eilat, inside the box', () => {
  const view = { W: 200, H: 380, pad: 12, zoom: 1, panX: 0, panY: 0 };
  const north = Geo.project(35.1, 33.2, view);
  const south = Geo.project(34.92, 29.55, view);
  assert.ok(north.y < south.y, 'north renders above south');
  assert.ok(north.x >= 0 && north.x <= 200);
  assert.ok(south.y > 300, 'Eilat near bottom of a 380px box');
});

test('zoom magnifies distance from center', () => {
  const base = { W: 200, H: 380, pad: 12, panX: 0, panY: 0 };
  const p1 = Geo.project(35.5, 33.0, { ...base, zoom: 1 });
  const p2 = Geo.project(35.5, 33.0, { ...base, zoom: 2 });
  const cx = 100, cy = 190;
  assert.ok(Math.hypot(p2.x - cx, p2.y - cy) > Math.hypot(p1.x - cx, p1.y - cy));
});
