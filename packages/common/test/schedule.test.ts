import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingWindows, generateSlots, rangesOverlap, shiftBand, startOfWeek, timeToMinutes } from '../src/schedule';

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

test('a full-day schedule splits around the midday break and a single shift stays intact', () => {
  assert.deepEqual(bookingWindows('07:00:00', '17:30:00'), [
    { start: '07:00:00', end: '11:30:00' },
    { start: '13:30:00', end: '17:30:00' },
  ]);
  const slots = bookingWindows('07:00:00', '17:30:00').flatMap((window) => generateSlots(window.start, window.end, 30));
  assert.equal(slots.some((slot) => ['11:30:00', '12:00:00', '12:30:00', '13:00:00'].includes(slot.start)), false);
  assert.equal(slots[0]?.start, '07:00:00');
  assert.equal(slots.at(-1)?.end, '17:30:00');
  assert.deepEqual(bookingWindows('07:30:00', '11:30:00'), [{ start: '07:30:00', end: '11:30:00' }]);
  assert.deepEqual(bookingWindows('13:30:00', '17:30:00'), [{ start: '13:30:00', end: '17:30:00' }]);
  assert.deepEqual(bookingWindows('08:00:00', '12:00:00'), [{ start: '08:00:00', end: '12:00:00' }]);
  assert.equal(shiftBand('10:30:00').label, 'Ca sáng');
  assert.equal(shiftBand('13:30:00').code, 'CHIEU');
  assert.equal(shiftBand('18:00:00').code, 'TOI');
});

test('week starts on Monday', () => {
  assert.equal(startOfWeek('2026-10-09'), '2026-10-05');
  assert.equal(startOfWeek('2026-10-12'), '2026-10-12');
});
