import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSlots, rangesOverlap, startOfWeek, timeToMinutes } from '../src/schedule';

test('slots follow the schedule duration instead of a fixed clock', () => {
  const slots = generateSlots('07:30:00', '09:00:00', 30);
  assert.deepEqual(slots, [
    { start: '07:30:00', end: '08:00:00' },
    { start: '08:00:00', end: '08:30:00' },
    { start: '08:30:00', end: '09:00:00' },
  ]);
  assert.equal(generateSlots('07:30:00', '08:20:00', 30).length, 1);
});

test('overlapping shifts are detected and adjacent shifts are not', () => {
  assert.equal(rangesOverlap('07:00:00', '17:30:00', '07:30:00', '11:30:00'), true);
  assert.equal(rangesOverlap('07:30:00', '11:30:00', '13:30:00', '17:30:00'), false);
  assert.equal(timeToMinutes('07:30:00'), 450);
});

test('week starts on Monday', () => {
  assert.equal(startOfWeek('2026-10-09'), '2026-10-05');
  assert.equal(startOfWeek('2026-10-12'), '2026-10-12');
});
