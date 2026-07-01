const test = require('node:test');
const assert = require('node:assert');
const { validateProfilesPayload } = require('../firebase-auth-profiles.js');

test('Firebase Auth profiles accept profile-only agents keyed by uid', () => {
  const result = validateProfilesPayload({
    agents: {
      uid_manager: { name: 'Manager', email: 'manager@example.com', role: 'manager', active: true, phone: '', createdAt: 1, lastLoginAt: null },
      uid_agent: { name: 'Agent', email: 'agent@example.com', role: 'agent', active: true },
    },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.activeManagers, 1);
});

test('Firebase Auth profiles reject password material and unsupported fields', () => {
  const result = validateProfilesPayload({
    agents: {
      uid_manager: { name: 'Manager', email: 'manager@example.com', role: 'manager', active: true, passwordHash: 'secret' },
    },
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join('\n'), /password material|unsupported field passwordHash/);
});

test('Firebase Auth profiles require one active manager and unique emails', () => {
  const result = validateProfilesPayload([
    { uid: 'u1', name: 'A', email: 'same@example.com', role: 'agent', active: true },
    { uid: 'u2', name: 'B', email: 'same@example.com', role: 'lead', active: true },
  ]);
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate email/);
  assert.match(result.errors.join('\n'), /active manager/);
});

test('Firebase Auth profiles reject unsafe or duplicate uids and non-normalized emails', () => {
  const result = validateProfilesPayload([
    { uid: 'manager/one', name: 'Manager', email: 'Manager@Example.com', role: 'manager', active: true },
    { uid: 'agent one', name: 'Agent', email: ' agent@example.com ', role: 'agent', active: true },
    { uid: 'agent one', name: 'Agent Two', email: 'agent2@example.com', role: 'agent', active: true },
  ]);
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join('\n'), /safe Firebase Auth uid/);
  assert.match(result.errors.join('\n'), /email must be trimmed and lowercase/);
  assert.match(result.errors.join('\n'), /duplicate uid/);
});
