const test = require('node:test');
const assert = require('node:assert');
const { buildMigrationPlan } = require('../firebase-auth-migration-plan.js');

const profiles = {
  agents: {
    manager_uid: { name: 'Manager', email: 'manager@example.com', role: 'manager', active: true },
    agent_uid: { name: 'Agent', email: 'agent@example.com', role: 'agent', active: false },
  },
};
const claims = {
  claims: {
    manager_uid: { role: 'manager' },
    agent_uid: { role: 'agent' },
  },
};

test('Firebase Auth migration plan emits auth users, claims, and Firestore profiles', () => {
  const plan = buildMigrationPlan(profiles, claims);
  assert.strictEqual(plan.ok, true);
  assert.deepStrictEqual(plan.counts, { authUsers: 2, customClaims: 2, firestoreAgents: 2 });
  assert.deepStrictEqual(plan.authUsers.find(u => u.uid === 'agent_uid'), {
    uid: 'agent_uid',
    email: 'agent@example.com',
    displayName: 'Agent',
    disabled: true,
  });
  assert.deepStrictEqual(plan.customClaims.find(c => c.uid === 'manager_uid'), {
    uid: 'manager_uid',
    claims: { role: 'manager' },
  });
  assert.strictEqual(plan.firestoreAgents.find(a => a.path === 'agents/manager_uid').data.role, 'manager');
  assert.match(plan.checklist.join('\n'), /npm run verify:deploy/);
  assert.doesNotMatch(plan.checklist.join('\n'), /verify:production/);
});

test('Firebase Auth migration plan fails closed on invalid claims', () => {
  const plan = buildMigrationPlan(profiles, { claims: { manager_uid: { role: 'agent' } } });
  assert.strictEqual(plan.ok, false);
  assert.match(plan.errors.join('\n'), /does not match profile role manager/);
  assert.match(plan.errors.join('\n'), /missing matching custom claims entry/);
});
