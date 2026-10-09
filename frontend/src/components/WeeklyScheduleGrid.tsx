import type { ScheduleItem, ShiftCode } from '../types';
import { formatDate, weekdayLabel } from '../utils/format';
import { ShiftCard } from './ShiftCard';

const SHIFTS: Array<{ code: ShiftCode; label: string; time: string }> = [
  { code: 'SANG', label: 'Ca sáng', time: '07:30 - 11:30' },
  { code: 'CHIEU', label: 'Ca chiều', time: '13:30 - 17:30' },
];

function covers(item: ScheduleItem, shift: ShiftCode) {
  if (item.shift === shift) return true;
  const start = shift === 'SANG' ? '07:30:00' : '13:30:00';
  const end = shift === 'SANG' ? '11:30:00' : '17:30:00';
  return item.startTime <= start && item.endTime >= end;
}

export function WeeklyScheduleGrid({
  days,
  items,
  selected,
  mode,
  onToggle,
  onApprove,
  onReject,
}: {
  days: string[];
  items: ScheduleItem[];
  selected: Set<string>;
  mode: 'edit' | 'review';
  onToggle?: (date: string, shift: ShiftCode) => void;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-line bg-white p-[18px] shadow-card">
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-line bg-[#f8fafc] px-2.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">Ca làm việc</th>
            {days.map((day) => <th key={day} className="border-b border-line bg-[#f8fafc] px-2.5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">{weekdayLabel(day)}<div className="text-[13px] font-medium normal-case tracking-normal text-muted">{formatDate(day)}</div></th>)}
          </tr>
        </thead>
        <tbody>
          {SHIFTS.map((shift) => (
            <tr key={shift.code}>
              <td className="w-[140px] border-b border-line px-2.5 py-3 align-top text-sm">{shift.label}<small className="block font-medium text-muted">{shift.time}</small></td>
              {days.map((day) => {
                const active = items.find((item) => item.date.slice(0, 10) === day && covers(item, shift.code) && item.statusCode !== 'REJECTED');
                const rejected = items.find((item) => item.date.slice(0, 10) === day && covers(item, shift.code) && item.statusCode === 'REJECTED');
                const key = `${day}:${shift.code}`;
                const selectedCell = selected.has(key) && !active;
                const state = selectedCell ? 'SELECTED' : active?.statusCode || (rejected ? 'REJECTED' : 'EMPTY');
                const editable = mode === 'edit' && !active;
                return (
                  <td key={key} className="min-h-[92px] border-b border-line px-2.5 py-3 align-top text-sm">
                    <ShiftCard
                      state={state as 'EMPTY' | 'SELECTED' | 'PENDING' | 'APPROVED' | 'REJECTED'}
                      note={state === 'REJECTED' ? rejected?.note : active && !active.shift ? `${active.startTime.slice(0, 5)}-${active.endTime.slice(0, 5)}` : null}
                      onSelect={editable ? () => onToggle?.(day, shift.code) : undefined}
                      onApprove={mode === 'review' && active?.statusCode === 'PENDING' ? () => onApprove?.(active.id) : undefined}
                      onReject={mode === 'review' && active?.statusCode === 'PENDING' ? () => onReject?.(active.id) : undefined}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
