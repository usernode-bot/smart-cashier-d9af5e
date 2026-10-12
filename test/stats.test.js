'use strict';
const test = require('node:test');
const assert = require('node:assert');
const stats = require('../lib/stats');

const TZ = 'Asia/Kuala_Lumpur'; // UTC+8, no DST

test('periodBounds for today crosses a zone midnight correctly', () => {
  // 2026-10-12 02:00 UTC is 10:00 in KL the same local day.
  const now = new Date('2026-10-12T02:00:00Z');
  const b = stats.periodBounds(now, TZ, 'today');
  // Local midnight 2026-10-12 KL == 2026-10-11T16:00Z
  assert.strictEqual(b.start.toISOString(), '2026-10-11T16:00:00.000Z');
  assert.strictEqual(b.end.toISOString(), '2026-10-12T16:00:00.000Z');
  assert.strictEqual(b.prevStart.toISOString(), '2026-10-10T16:00:00.000Z');
});

test('periodBounds for week starts on Monday local time', () => {
  // 2026-10-14 is a Wednesday.
  const now = new Date('2026-10-14T02:00:00Z');
  const b = stats.periodBounds(now, TZ, 'week');
  assert.strictEqual(b.start.toISOString(), '2026-10-11T16:00:00.000Z'); // Mon 2026-10-12 KL
  assert.strictEqual(b.prevStart.toISOString(), '2026-10-04T16:00:00.000Z');
});

test('periodBounds for month starts on the 1st', () => {
  const now = new Date('2026-10-14T02:00:00Z');
  const b = stats.periodBounds(now, TZ, 'month');
  assert.strictEqual(b.start.toISOString(), '2026-09-30T16:00:00.000Z'); // 1 Oct KL
  assert.strictEqual(b.prevStart.toISOString(), '2026-08-31T16:00:00.000Z'); // 1 Sep KL
});

test('periodBounds for 7d and 30d include today', () => {
  const now = new Date('2026-10-14T02:00:00Z');
  const b7 = stats.periodBounds(now, TZ, '7d');
  assert.strictEqual(b7.end.toISOString(), '2026-10-14T16:00:00.000Z'); // end of local today
  assert.strictEqual(b7.start.toISOString(), '2026-10-07T16:00:00.000Z'); // local 8 Oct, 7 days
  const b30 = stats.periodBounds(now, TZ, '30d');
  assert.strictEqual(b30.end.toISOString(), '2026-10-14T16:00:00.000Z');
  assert.strictEqual(b30.start.toISOString(), '2026-09-14T16:00:00.000Z');
});

test('percentChange and its zero-previous case', () => {
  assert.strictEqual(stats.percentChange(120, 100), 20);
  assert.strictEqual(stats.percentChange(90, 100), -10);
  assert.strictEqual(stats.percentChange(100, 0), null);
});

test('fillDays fills empty local days with zeros', () => {
  const b = stats.periodBounds(new Date('2026-10-14T02:00:00Z'), TZ, '7d');
  const filled = stats.fillDays([{ day: '2026-10-10', total: '500', count: '2' }], b, TZ);
  assert.strictEqual(filled.length, 7);
  const hit = filled.find((d) => d.day === '2026-10-10');
  assert.strictEqual(hit.total, 500);
  assert.strictEqual(hit.count, 2);
  assert.ok(filled.every((d) => d.day === '2026-10-10' || (d.total === 0 && d.count === 0)));
});

test('fillHours fills all 24 hours', () => {
  const filled = stats.fillHours([{ hour: '9', total: '400', count: '3' }]);
  assert.strictEqual(filled.length, 24);
  assert.strictEqual(filled[9].count, 3);
  assert.strictEqual(filled[8].count, 0);
});

test('busiestHour takes the highest count and earliest hour on a tie', () => {
  const hours = stats.fillHours([{ hour: 9, count: 5 }, { hour: 13, count: 7 }, { hour: 15, count: 7 }]);
  assert.strictEqual(stats.busiestHour(hours), 13); // earliest of the tied 7s
  assert.strictEqual(stats.busiestHour(stats.fillHours([])), null);
});

test('voided sales are excluded by callers via SQL, hour labels read plainly', () => {
  assert.strictEqual(stats.hourLabel(8), '8 am to 9 am');
  assert.strictEqual(stats.hourLabel(13), '1 pm to 2 pm');
});