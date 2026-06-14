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
