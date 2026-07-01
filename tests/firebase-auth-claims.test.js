const test = require('node:test');
const assert = require('node:assert');
const { validateClaimsPayload } = require('../firebase-auth-claims.js');

const profiles = {
  agents: {
    manager_uid: { name: 'Manager', email: 'manager@example.com', role: 'manager', active: true },
    agent_uid: { name: 'Agent', email: 'agent@example.com', role: 'agent', active: true },
  },
};

test('Firebase Auth claims match profile roles by uid', () => {
  const result = validateClaimsPayload({
    claims: {
      manager_uid: { role: 'manager' },
      agent_uid: { role: 'agent' },
    },
  }, profiles);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.count, 2);
});

test('Firebase Auth claims reject role mismatch and unsupported fields', () => {
  const result = validateClaimsPayload({
    claims: {
      manager_uid: { role: 'agent', admin: true },
      agent_uid: { role: 'agent' },
    },
  }, profiles);
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join('\n'), /unsupported claim field admin/);
  assert.match(result.errors.join('\n'), /does not match profile role manager/);
});

test('Firebase Auth claims require every profile uid to have claims', () => {
  const result = validateClaimsPayload({ claims: { manager_uid: { role: 'manager' } } }, profiles);
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join('\n'), /missing matching custom claims entry/);
});
