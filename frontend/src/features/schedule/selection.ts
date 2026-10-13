import type { ScheduleItem, ShiftCode } from '../../types';

export function overlapsShift(item: ScheduleItem, shift: ShiftCode) {
  const start = shift === 'SANG' ? '07:30' : '13:30';
  const end = shift === 'SANG' ? '11:30' : '17:30';
  return item.startTime.slice(0, 5) < end && item.endTime.slice(0, 5) > start;
}

export function canSelectShift(date: string, shift: ShiftCode, items: ScheduleItem[], today: string) {
  return date >= today && !items.some(item => item.date.slice(0, 10) === date
    && item.statusCode !== 'REJECTED' && overlapsShift(item, shift));
}
