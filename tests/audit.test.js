const test = require('node:test');
const assert = require('node:assert');
const Audit = require('../audit.js');

test('buildEvent creates a manager audit event with actor and target metadata', () => {
  const event = Audit.buildEvent(
    { id: 'mgr1', name: 'Manager', role: 'manager' },
    'request.approve',
    'request',
    'req1',
    { resolution: 'permanent' },
    123
  );
  assert.deepStrictEqual(event, {
    action: 'request.approve',
    targetType: 'request',
    targetId: 'req1',
    actorId: 'mgr1',
    actorName: 'Manager',
    actorRole: 'manager',
    details: { resolution: 'permanent' },
    createdAt: 123,
  });
});

test('buildEvent allows lead review audit events', () => {
  const event = Audit.buildEvent(
    { id: 'lead1', name: 'Lead', role: 'lead' },
    'request.reject',
    'request',
    'req2',
    null,
    456
  );
  assert.strictEqual(event.actorRole, 'lead');
  assert.deepStrictEqual(event.details, {});
});

test('buildEvent rejects invalid actor roles, actions and target types', () => {
  assert.throws(() => Audit.buildEvent(null, 'request.approve', 'request', 'r1'), /actor/);
  assert.throws(() => Audit.buildEvent({ id: 'a1', role: 'agent' }, 'request.approve', 'request', 'r1'), /role/);
  assert.throws(() => Audit.buildEvent({ id: 'm1', role: 'manager' }, 'bad.action', 'request', 'r1'), /action/);
  assert.throws(() => Audit.buildEvent({ id: 'm1', role: 'manager' }, 'request.approve', 'bad', 'r1'), /targetType/);
});
