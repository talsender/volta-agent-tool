const test = require('node:test');
const assert = require('node:assert');
const Auth = require('../auth.js');

const AGENTS = [
  { id: 'a1', name: 'דני', code: '1234', active: true },
  { id: 'a2', name: 'רונית', code: '5678', active: false },
];

test('findAgentByCode מחזיר נציג פעיל לפי קוד', () => {
  assert.strictEqual(Auth.findAgentByCode(AGENTS, '1234').id, 'a1');
});

test('findAgentByCode מתעלם מרווחים מסביב', () => {
  assert.strictEqual(Auth.findAgentByCode(AGENTS, ' 1234 ').id, 'a1');
});

test('findAgentByCode מחזיר null לנציג מושבת', () => {
  assert.strictEqual(Auth.findAgentByCode(AGENTS, '5678'), null);
});

test('findAgentByCode מחזיר null לקוד לא קיים / ריק', () => {
  assert.strictEqual(Auth.findAgentByCode(AGENTS, '0000'), null);
  assert.strictEqual(Auth.findAgentByCode(AGENTS, ''), null);
});
