const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_ROOF_CONFIG } = require('../config.js');
const { validateRoofConfig, RoofStore } = require('../roof-store.js');

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

function withLocalStorage(fn) {
  const old = global.localStorage;
  const store = new Map();
  global.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  try { return fn(store); }
  finally { global.localStorage = old; }
}

async function withLocalStorageAsync(fn) {
  const old = global.localStorage;
  const store = new Map();
  global.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  try { return await fn(store); }
  finally { global.localStorage = old; }
}

test('RoofStore save/get persists valid config locally', () => withLocalStorage(() => {
  const c = clone(DEFAULT_ROOF_CONFIG);
  c.totalSizeThresholds.good = 88;
  const res = RoofStore.save(c);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(RoofStore.get().totalSizeThresholds.good, 88);
}));

test('RoofStore saveAsync writes remote when VoltaDB is ready', async () => {
  await withLocalStorageAsync(async () => {
    const oldDb = global.VoltaDB;
    let remote = null;
    global.VoltaDB = {
      ready: () => true,
      saveRoofConfig: async cfg => { remote = cfg; },
    };
    try {
      const c = clone(DEFAULT_ROOF_CONFIG);
      c.totalSizeThresholds.good = 91;
      const res = await RoofStore.saveAsync(c);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(remote.totalSizeThresholds.good, 91);
      assert.ok(remote.updatedAt);
    } finally {
      global.VoltaDB = oldDb;
    }
  });
});
