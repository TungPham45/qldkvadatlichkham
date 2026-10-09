export const ScheduleStatus = {
  PENDING: 'Cho duyet',
  APPROVED: 'Da duyet',
  REJECTED: 'Tu choi',
  LEGACY_APPROVED: 'Active',
} as const;

export const APPROVED_SCHEDULE_STATUSES = [
  ScheduleStatus.APPROVED,
  ScheduleStatus.LEGACY_APPROVED,
] as const;

export function isApprovedScheduleStatus(status: string): boolean {
  return (APPROVED_SCHEDULE_STATUSES as readonly string[]).includes(status);
}

export function isEditableScheduleStatus(status: string): boolean {
  return status === ScheduleStatus.PENDING || status === ScheduleStatus.REJECTED;
}

export const AppointmentStatus = {
  PENDING: 'Cho xac nhan',
  CONFIRMED: 'Da xac nhan',
  CHECKED_IN: 'Da check-in',
  IN_PROGRESS: 'Dang kham',
  COMPLETED: 'Hoan thanh',
  CANCELLED: 'Huy',
} as const;

export const SHIFTS = [
  { code: 'SANG', label: 'Ca Sáng', start: '07:30:00', end: '11:30:00' },
  { code: 'CHIEU', label: 'Ca Chiều', start: '13:30:00', end: '17:30:00' },
] as const;

export type ShiftCode = (typeof SHIFTS)[number]['code'];

export function shiftByCode(code: string) {
  return SHIFTS.find((shift) => shift.code === code);
}

export function normalizeTime(value: string): string {
  const parts = value.trim().split(':');
  const hour = (parts[0] ?? '0').padStart(2, '0');
  const minute = (parts[1] ?? '00').padStart(2, '0');
  const second = (parts[2] ?? '00').padStart(2, '0').slice(0, 2);
  return `${hour}:${minute}:${second}`;
}

export function timeToMinutes(value: string): number {
  const [hour, minute] = normalizeTime(value).split(':').map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(total: number): string {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

export function shiftCoveredBy(scheduleStart: string, scheduleEnd: string, shiftCode: ShiftCode): boolean {
  const shift = shiftByCode(shiftCode);
  if (!shift) return false;
  return timeToMinutes(scheduleStart) <= timeToMinutes(shift.start) && timeToMinutes(scheduleEnd) >= timeToMinutes(shift.end);
}

export function exactShift(scheduleStart: string, scheduleEnd: string): ShiftCode | null {
  const start = normalizeTime(scheduleStart);
  const end = normalizeTime(scheduleEnd);
  const found = SHIFTS.find((shift) => shift.start === start && shift.end === end);
  return found?.code ?? null;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export function generateSlots(start: string, end: string, durationMinutes: number): TimeSlot[] {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return [];
  const slots: TimeSlot[] = [];
  let cursor = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  while (cursor + durationMinutes <= endMinutes) {
    slots.push({ start: minutesToTime(cursor), end: minutesToTime(cursor + durationMinutes) });
    cursor += durationMinutes;
  }
  return slots;
}

export function normalizeDate(value: string | Date): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function weekDays(dateStr: string): string[] {
  const start = startOfWeek(dateStr);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function todayInVietnam(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function nowMinutesInVietnam(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

export function isPastSlot(date: string, startTime: string, now = new Date()): boolean {
  const today = todayInVietnam(now);
  if (date < today) return true;
  if (date > today) return false;
  return timeToMinutes(startTime) <= nowMinutesInVietnam(now);
}
