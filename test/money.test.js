'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../public/money');

test('formats MYR with two decimals', () => {
  assert.strictEqual(M.formatMoney(3790, 'MYR', 'en-MY').replace(/ /g, ' '), 'RM 37.90');
});
test('formats IDR with no decimals and grouping', () => {
  const s = M.formatMoney(1500000, 'IDR', 'en').replace(/ /g, ' ');
  assert.match(s, /Rp 1,500,000/);
  assert.ok(!/\.\d/.test(s));
});
test('formats JPY with no decimals', () => {
  const s = M.formatMoney(1500, 'JPY', 'en');
  assert.match(s, /^¥1,500$/);
  assert.ok(!/\.\d/.test(s));
});
test('formats USD with two decimals', () => {
  assert.strictEqual(M.formatMoney(1234, 'USD', 'en').replace(/ /g, ' '), '$12.34');
});

test('parses plain decimals', () => {
  assert.strictEqual(M.parseMoney('4.50', 'MYR'), 450);
});
test('parses comma decimals', () => {
  assert.strictEqual(M.parseMoney('4,50', 'MYR'), 450);
});
test('parses IDR group separators', () => {
  assert.strictEqual(M.parseMoney('15.000', 'IDR'), 1500000);
  assert.strictEqual(M.parseMoney('15.000', 'IDR'), 1500000);
  assert.strictEqual(M.parseMoney('37', 'IDR'), 3700);
});
test('rejects junk, negatives and oversized values', () => {
  assert.strictEqual(M.parseMoney('abc', 'MYR'), null);
  assert.strictEqual(M.parseMoney('-4', 'MYR'), null);
  assert.strictEqual(M.parseMoney('4.505', 'MYR'), null);
  assert.strictEqual(M.parseMoney('12345678901234', 'MYR'), null);
  assert.strictEqual(M.parseMoney('', 'MYR'), null);
});

test('quick cash for RM 37.90: Exact, 40, 50, 100', () => {
  const q = M.quickCashAmounts(3790, 'MYR');
  assert.strictEqual(q[0][1], 'Exact');
  assert.strictEqual(q[0][0], 3790);
  const values = q.map((x) => x[0]);
  assert.ok(values.includes(4000), 'includes RM 40');
  assert.ok(values.includes(5000), 'includes RM 50');
  assert.ok(values.includes(10000), 'includes RM 100');
  assert.strictEqual(q.length, 4);
});
test('quick cash for Rp 37.500 rounds to notes', () => {
  const q = M.quickCashAmounts(3750000, 'IDR');
  assert.strictEqual(q[0][1], 'Exact');
  for (const [v] of q) assert.ok(v >= 3750000);
  assert.ok(q.length >= 2 && q.length <= 4);
});