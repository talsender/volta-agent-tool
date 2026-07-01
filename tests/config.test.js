const test = require('node:test');
const assert = require('node:assert');
const { CONFIG, DEFAULT_ROOF_CONFIG } = require('../config.js');

test('auth mode is explicit and uses a supported value', () => {
  assert.ok(['legacy', 'firebase'].includes(CONFIG.AUTH_MODE));
});

test('legacy auth remains the local default until Firebase Auth migration is complete', () => {
  assert.strictEqual(CONFIG.AUTH_MODE, 'legacy');
});

test('Firebase config contains the expected public client fields only', () => {
  const allowed = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  assert.deepStrictEqual(Object.keys(CONFIG.FIREBASE_CONFIG).sort(), allowed.sort());
  for (const field of allowed) {
    assert.strictEqual(typeof CONFIG.FIREBASE_CONFIG[field], 'string');
    assert.ok(CONFIG.FIREBASE_CONFIG[field].trim(), `${field} should not be empty`);
  }
  assert.ok(!('privateKey' in CONFIG.FIREBASE_CONFIG));
  assert.ok(!('clientEmail' in CONFIG.FIREBASE_CONFIG));
});

test('Firebase config fields point to one consistent project', () => {
  const cfg = CONFIG.FIREBASE_CONFIG;
  assert.match(cfg.apiKey, /^AIza[0-9A-Za-z_-]{20,}$/);
  assert.match(cfg.projectId, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
  assert.strictEqual(cfg.authDomain, `${cfg.projectId}.firebaseapp.com`);
  assert.ok(
    cfg.storageBucket === `${cfg.projectId}.appspot.com` ||
    cfg.storageBucket === `${cfg.projectId}.firebasestorage.app`,
    'storageBucket should belong to the configured Firebase project',
  );
  assert.match(cfg.appId, new RegExp(`^1:${cfg.messagingSenderId}:web:[0-9a-f]+$`));
});

test('first manager bootstrap password is disabled by default', () => {
  assert.strictEqual(DEFAULT_ROOF_CONFIG.managerPassword, '');
});
