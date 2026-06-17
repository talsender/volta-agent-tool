const test = require('node:test');
const assert = require('node:assert');
const Requests = require('../requests.js');

test('normalizeName מסיר גרשיים, מקפים ורווחים כפולים', () => {
  assert.strictEqual(Requests.normalizeName('  רמת   השרון '), 'רמת השרון');
  assert.strictEqual(Requests.normalizeName('כְּפַר-סבא'), 'כְּפַר סבא');
});

test('mergeOverrides דורס סטטוס מ-override לפי שם מנורמל', () => {
  const settlements = [
    { name: 'מגדל העמק', status: 'מתקינים', note: '' },
    { name: 'דימונה', status: 'מתקינים', note: 'ישן' },
  ];
  const overrides = {
    'מגדל העמק': { status: 'לא מתקינים', note: 'אזור בעייתי', updatedBy: 'מנהל' },
  };
  const merged = Requests.mergeOverrides(settlements, overrides);
  assert.strictEqual(merged[0].status, 'לא מתקינים');
  assert.strictEqual(merged[0].note, 'אזור בעייתי');
  assert.strictEqual(merged[0].overridden, true);
  assert.strictEqual(merged[1].status, 'מתקינים');
  assert.strictEqual(merged[1].overridden, undefined);
});

test('mergeOverrides ללא overrides מחזיר את המקור', () => {
  const settlements = [{ name: 'אילת', status: 'מתקינים', note: '' }];
  assert.deepStrictEqual(Requests.mergeOverrides(settlements, null), settlements);
});

test('buildRequest בונה בקשת יישוב תקינה עם status pending', () => {
  const agent = { id: 'a1', name: 'דני' };
  const req = Requests.buildRequest({
    type: 'settlement', agent, subject: 'דימונה',
    reason: ' יש לנו לקוח גדול ', context: { status: 'לא מתקינים' },
    requestedStatus: 'מתקינים',
  });
  assert.strictEqual(req.type, 'settlement');
  assert.strictEqual(req.agentId, 'a1');
  assert.strictEqual(req.agentName, 'דני');
  assert.strictEqual(req.subject, 'דימונה');
  assert.strictEqual(req.reason, 'יש לנו לקוח גדול'); // trimmed
  assert.strictEqual(req.requestedStatus, 'מתקינים');
  assert.deepStrictEqual(req.context, { status: 'לא מתקינים' });
  assert.strictEqual(req.status, 'pending');
  assert.strictEqual(req.resolution, null);
  assert.strictEqual(typeof req.createdAt, 'number');
});

test('buildRequest ליישוב זורק כשהסטטוס המבוקש חסר או לא חוקי', () => {
  assert.throws(() => Requests.buildRequest({
    type: 'settlement', agent: { id: 'a1' }, subject: 'דימונה', reason: 'סיבה',
  }), /requestedStatus/);
  assert.throws(() => Requests.buildRequest({
    type: 'settlement', agent: { id: 'a1' }, subject: 'דימונה', reason: 'סיבה',
    requestedStatus: 'אולי',
  }), /requestedStatus/);
});

test('buildRequest לבקשת גג אינה דורשת סטטוס מבוקש', () => {
  const req = Requests.buildRequest({
    type: 'roof', agent: { id: 'a1' }, subject: 's', reason: 'סיבה',
  });
  assert.strictEqual(req.type, 'roof');
  assert.strictEqual(req.requestedStatus, null);
});

test('buildRequest זורק כשחסר נימוק', () => {
  assert.throws(() => Requests.buildRequest({
    type: 'roof', agent: { id: 'a1' }, subject: 's', reason: '   ',
  }), /reason/);
});

test('buildRequest זורק על type לא חוקי', () => {
  assert.throws(() => Requests.buildRequest({
    type: 'bogus', agent: { id: 'a1' }, reason: 'x',
  }), /type/);
});

test('decideRequest דחייה מסמנת rejected עם הערה', () => {
  const patch = Requests.decideRequest({ type: 'settlement' },
    { action: 'reject', managerNote: 'לא רלוונטי' });
  assert.strictEqual(patch.status, 'rejected');
  assert.strictEqual(patch.resolution, null);
  assert.strictEqual(patch.managerNote, 'לא רלוונטי');
  assert.strictEqual(typeof patch.resolvedAt, 'number');
});

test('decideRequest אישור חד-פעמי', () => {
  const patch = Requests.decideRequest({ type: 'roof' },
    { action: 'approve', resolution: 'one-off', managerNote: 'אושר ללקוח' });
  assert.strictEqual(patch.status, 'approved');
  assert.strictEqual(patch.resolution, 'one-off');
});

test('decideRequest אישור קבוע', () => {
  const patch = Requests.decideRequest({ type: 'settlement' },
    { action: 'approve', resolution: 'permanent' });
  assert.strictEqual(patch.status, 'approved');
  assert.strictEqual(patch.resolution, 'permanent');
});

test('overrideFromApproval משתמש בסטטוס שהנציג ביקש', () => {
  const req = { type: 'settlement', subject: 'מגדל העמק', reason: 'לקוח גדול',
    requestedStatus: 'לא מתקינים' };
  const ov = Requests.overrideFromApproval(req, 'מנהל');
  assert.strictEqual(ov.key, 'מגדל העמק');
  assert.strictEqual(ov.value.status, 'לא מתקינים');
  assert.strictEqual(ov.value.note, 'לקוח גדול');
  assert.strictEqual(ov.value.updatedBy, 'מנהל');

  assert.strictEqual(Requests.overrideFromApproval({ type: 'roof' }, 'm'), null);
});
