const test = require('node:test');
const assert = require('node:assert');
const Auth = require('../auth.js');

const AGENTS = [
  { id: 'a1', name: 'דני', email: 'dani@volta.com', password: 'pass1', role: 'agent', active: true },
  { id: 'a2', name: 'רונית', email: 'ronit@volta.com', password: 'pass2', role: 'lead', active: false },
  { id: 'a3', name: 'מנהל', email: 'boss@volta.com', password: 'admin123', role: 'manager', active: true },
];

test('findAgentByCredentials מאמת אימייל + סיסמה לנציג פעיל', () => {
  assert.strictEqual(Auth.findAgentByCredentials(AGENTS, 'dani@volta.com', 'pass1').id, 'a1');
});

test('findAgentByCredentials אימייל case-insensitive + רווחים', () => {
  assert.strictEqual(Auth.findAgentByCredentials(AGENTS, ' DANI@Volta.com ', 'pass1').id, 'a1');
});

test('findAgentByCredentials דוחה סיסמה שגויה', () => {
  assert.strictEqual(Auth.findAgentByCredentials(AGENTS, 'dani@volta.com', 'wrong'), null);
});

test('findAgentByCredentials דוחה נציג מושבת', () => {
  assert.strictEqual(Auth.findAgentByCredentials(AGENTS, 'ronit@volta.com', 'pass2'), null);
});

test('findAgentByCredentials דוחה ריקים', () => {
  assert.strictEqual(Auth.findAgentByCredentials(AGENTS, '', 'pass1'), null);
  assert.strictEqual(Auth.findAgentByCredentials(AGENTS, 'dani@volta.com', ''), null);
});

test('findAgentByCredentialsAsync מאמת passwordHash ומזהה סיסמת legacy', async () => {
  const hashed = await Auth.hashPassword('secret');
  const agents = [
    { id: 'h1', email: 'hash@volta.com', active: true, role: 'agent', passwordHash: hashed.passwordHash },
    { id: 'l1', email: 'legacy@volta.com', active: true, role: 'agent', password: 'plain' },
  ];

  const hashAgent = await Auth.findAgentByCredentialsAsync(agents, 'hash@volta.com', 'secret');
  assert.strictEqual(hashAgent.id, 'h1');
  assert.strictEqual(hashAgent._legacyPassword, false);

  const legacyAgent = await Auth.findAgentByCredentialsAsync(agents, 'legacy@volta.com', 'plain');
  assert.strictEqual(legacyAgent.id, 'l1');
  assert.strictEqual(legacyAgent._legacyPassword, true);
});

test('hashPassword מייצר salt ומונע התאמה בסיסמה שגויה', async () => {
  const patch = await Auth.hashPassword('secret');
  assert.match(patch.passwordHash, /^pbkdf2:\d+:[0-9a-f]+:[0-9a-f]+$/);
  assert.strictEqual((await Auth.verifyPassword({ active: true, passwordHash: patch.passwordHash }, 'secret')).ok, true);
  assert.strictEqual((await Auth.verifyPassword({ active: true, passwordHash: patch.passwordHash }, 'wrong')).ok, false);
});

test('verifyPassword תומך ב-sha256 ישן ומסמן לשדרוג', async () => {
  const crypto = require('node:crypto');
  const salt = 'abc123';
  const hash = crypto.createHash('sha256').update(`${salt}:secret`, 'utf8').digest('hex');
  const result = await Auth.verifyPassword({ active: true, passwordHash: `sha256:${salt}:${hash}` }, 'secret');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.needsRehash, true);
});

test('can — נציג יכול רק לבקש', () => {
  const agent = { role: 'agent' };
  assert.strictEqual(Auth.can(agent, 'request'), true);
  assert.strictEqual(Auth.can(agent, 'reviewRequests'), false);
  assert.strictEqual(Auth.can(agent, 'manageAgents'), false);
});

test('can — ראש צוות יכול לאשר אך לא לנהל נציגים', () => {
  const lead = { role: 'lead' };
  assert.strictEqual(Auth.can(lead, 'reviewRequests'), true);
  assert.strictEqual(Auth.can(lead, 'manageAgents'), false);
  assert.strictEqual(Auth.can(lead, 'roofSettings'), false);
});

test('can — מנהל יכול הכל', () => {
  const mgr = { role: 'manager' };
  ['request', 'reviewRequests', 'manageAgents', 'roofSettings'].forEach(c =>
    assert.strictEqual(Auth.can(mgr, c), true));
});

test('can — ללא תפקיד מחזיר false', () => {
  assert.strictEqual(Auth.can(null, 'request'), false);
  assert.strictEqual(Auth.can({}, 'request'), false);
});

test('isLastActiveManager — חוסם מחיקת המנהל הפעיל האחרון', () => {
  assert.strictEqual(Auth.isLastActiveManager(AGENTS, 'a3'), true);
});

test('isLastActiveManager — מתיר כשיש עוד מנהל פעיל', () => {
  const two = AGENTS.concat([{ id: 'a4', role: 'manager', active: true }]);
  assert.strictEqual(Auth.isLastActiveManager(two, 'a3'), false);
});

test('roleLabel מחזיר תווית עברית', () => {
  assert.strictEqual(Auth.roleLabel('manager'), 'מנהל');
  assert.strictEqual(Auth.roleLabel('lead'), 'ראש צוות');
  assert.strictEqual(Auth.roleLabel('agent'), 'נציג');
});

test('reconcileCurrentAgent מעדכן session מתפקיד חי ומנתק נציג מושבת', () => {
  const oldStorage = global.localStorage;
  const store = new Map();
  global.localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  };
  try {
    Auth.setCurrentAgent({ id: 'a1', name: 'שם ישן', email: 'old@volta.com', role: 'agent' });
    const fresh = Auth.reconcileCurrentAgent([
      { id: 'a1', name: 'שם חדש', email: 'new@volta.com', role: 'manager', active: true },
    ]);
    assert.deepStrictEqual(fresh, { id: 'a1', name: 'שם חדש', email: 'new@volta.com', role: 'manager' });
    assert.strictEqual(Auth.getCurrentAgent().role, 'manager');

    const gone = Auth.reconcileCurrentAgent([
      { id: 'a1', name: 'שם חדש', email: 'new@volta.com', role: 'manager', active: false },
    ]);
    assert.strictEqual(gone, null);
    assert.strictEqual(Auth.getCurrentAgent(), null);
  } finally {
    global.localStorage = oldStorage;
  }
});

test('validateAgentFields — תקין מחזיר null', () => {
  const ok = Auth.validateAgentFields(
    { name: 'יוסי', email: 'yossi@volta.com', password: '1234', role: 'agent' }, AGENTS);
  assert.strictEqual(ok, null);
});

test('validateAgentFields — דורש שם, אימייל תקין, תפקיד', () => {
  assert.match(Auth.validateAgentFields({ name: '', email: 'a@b.com', password: '1234', role: 'agent' }, []), /שם/);
  assert.match(Auth.validateAgentFields({ name: 'x', email: 'bad', password: '1234', role: 'agent' }, []), /אימייל/);
  assert.match(Auth.validateAgentFields({ name: 'x', email: 'a@b.com', password: '1234', role: 'nope' }, []), /תפקיד/);
});

test('validateAgentFields — סיסמה קצרה נדחית; ריקה מותרת בעריכה', () => {
  assert.match(Auth.validateAgentFields({ name: 'x', email: 'a@b.com', password: '12', role: 'agent' }, []), /סיסמה/);
  assert.strictEqual(Auth.validateAgentFields({ name: 'x', email: 'a@b.com', password: '', role: 'agent' }, []), null);
});

test('validateAgentFields — אימייל כפול נדחה, אך לא מול עצמו (ignoreId)', () => {
  assert.match(Auth.validateAgentFields({ name: 'x', email: 'dani@volta.com', password: '1234', role: 'agent' }, AGENTS), /קיים/);
  assert.strictEqual(Auth.validateAgentFields({ name: 'דני', email: 'dani@volta.com', password: '', role: 'agent' }, AGENTS, 'a1'), null);
});

test('validateAgentFields — מגביל אורך שדות לפי Firestore rules', () => {
  assert.match(Auth.validateAgentFields({ name: 'x'.repeat(121), email: 'a@b.com', password: '1234', role: 'agent' }, []), /ארוך/);
  assert.match(Auth.validateAgentFields({ name: 'x', email: `${'a'.repeat(250)}@b.com`, password: '1234', role: 'agent' }, []), /ארוך/);
  assert.match(Auth.validateAgentFields({ name: 'x', email: 'a@b.com', phone: '1'.repeat(41), password: '1234', role: 'agent' }, []), /ארוך/);
});

test('validFirebaseUid matches Firebase Auth and Firestore document id constraints', () => {
  assert.strictEqual(Auth.validFirebaseUid('uid_manager-1'), true);
  assert.strictEqual(Auth.validFirebaseUid('manager/one'), false);
  assert.strictEqual(Auth.validFirebaseUid(' uid '), false);
  assert.strictEqual(Auth.validFirebaseUid('.'), false);
  assert.strictEqual(Auth.validFirebaseUid('x'.repeat(129)), false);
  assert.strictEqual(Auth.validFirebaseUid('bad\u0001uid'), false);
});
