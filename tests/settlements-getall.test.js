const test = require('node:test');
const assert = require('node:assert');
global.window = { SETTLEMENTS_CSV: 'name,type,status\nרעננה,עיר,מתקינים\nגדרה,מועצה,לא מתקינים\n' };
const Settlements = require('../settlements.js');

test('getAll returns all loaded settlements', async () => {
  await Settlements.load();
  const all = Settlements.getAll();
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all[0].name, 'רעננה');
  assert.strictEqual(all[1].status, 'לא מתקינים');
});

test('getAll returns a copy, not the internal array', async () => {
  await Settlements.load();
  const a = Settlements.getAll();
  a.push({ name: 'x' });
  assert.strictEqual(Settlements.getAll().length, 2);
});
