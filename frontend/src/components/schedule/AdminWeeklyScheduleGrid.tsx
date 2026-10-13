import type { ScheduleItem, ShiftCode } from '../../types';
import { formatDate, formatTime, scheduleLabel, todayIso, weekdayLabel } from '../../utils/format';

const shifts: Array<{ code: ShiftCode; label: string; start: string; end: string; icon: string }> = [
  { code: 'SANG', label: 'Ca sáng', start: '07:30', end: '11:30', icon: '☀' },
  { code: 'CHIEU', label: 'Ca chiều', start: '13:30', end: '17:30', icon: '◒' },
];

const tones = {
  APPROVED: 'border-[#a7dfc6] bg-[#e6f9ef] text-[#166746]',
  PENDING: 'border-[#b4d5ee] bg-[#edf6ff] text-[#245f8d]',
  REJECTED: 'border-[#efc2c4] bg-[#fff2f3] text-[#9e4149]',
};

function overlaps(item: ScheduleItem, start: string, end: string) {
  return item.startTime.slice(0, 5) < end && item.endTime.slice(0, 5) > start;
}

export function AdminScheduleLegend() {
  return <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#20aa76]" />Đã duyệt</span>
    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#3984b9]" />Chờ duyệt</span>
    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#da7a83]" />Từ chối</span>
    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-[#a9b9c9]" />Trống</span>
  </div>;
}

export function AdminWeeklyScheduleGrid({
  days, items, visibleIds, busy, canCreate, onCreate, onEdit, onDelete, onApprove, onReject,
}: {
  days: string[];
  items: ScheduleItem[];
  visibleIds: Set<number>;
  busy: boolean;
  canCreate: boolean;
  onCreate: (date: string, shift?: ShiftCode) => void;
  onEdit: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const otherHours = items.filter((item) => !shifts.some((shift) => overlaps(item, shift.start, shift.end)));
  const today = todayIso();

  function card(item: ScheduleItem) {
    return <article key={item.id} className={`flex flex-col gap-2 rounded-xl border p-2.5 ${tones[item.statusCode]}`}>
      <div className="flex items-center justify-between gap-1 text-xs font-semibold"><span>{scheduleLabel(item.statusCode)}</span><span aria-hidden="true">{item.statusCode === 'APPROVED' ? '✓' : item.statusCode === 'PENDING' ? '◷' : '×'}</span></div>
      <strong className="text-[13px] leading-snug">{formatTime(item.startTime)} – {formatTime(item.endTime)}</strong>
      <span className="text-xs">{item.slotMinutes} phút / lượt khám</span>
      {item.note ? <p className="break-words text-xs leading-relaxed">{item.note}</p> : null}
      <div className="flex flex-wrap gap-1.5 border-t border-current/10 pt-2">
        <button type="button" className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold disabled:opacity-50" disabled={busy} onClick={() => onEdit(item)}>Sửa</button>
        <button type="button" className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-danger disabled:opacity-50" disabled={busy} onClick={() => onDelete(item)}>Xóa</button>
        {item.statusCode === 'PENDING' ? <>
          <button type="button" className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold disabled:opacity-50" disabled={busy || !canCreate} onClick={() => onApprove(item.id)}>Duyệt</button>
          <button type="button" className="rounded-md bg-white/80 px-2 py-1 text-xs font-semibold disabled:opacity-50" disabled={busy} onClick={() => onReject(item.id)}>Từ chối</button>
        </> : null}
      </div>
    </article>;
  }

  function cell(day: string, candidates: ScheduleItem[], shift?: ShiftCode) {
    const existing = candidates.filter((item) => item.date.slice(0, 10) === day);
    const visible = existing.filter((item) => visibleIds.has(item.id));
    const occupied = existing.some((item) => item.statusCode !== 'REJECTED');
    const hidden = existing.length - visible.length;
    return <td key={day} className={`border-b border-r border-line p-2 align-top ${day === today ? 'bg-[#f4f9fd]' : 'bg-white'}`}>
      <div className="flex flex-col gap-2">
        {visible.map(card)}
        {hidden ? <div className="rounded-lg bg-surface p-2 text-xs leading-relaxed text-muted">{hidden} lịch ngoài bộ lọc{occupied && !visible.length ? ' · Đã có lịch làm việc' : ''}</div> : null}
        {!occupied ? <button type="button" className="flex min-h-[128px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#d5dee8] bg-[#fcfdff] px-2 py-4 text-[13px] font-semibold text-muted hover:border-primary-600 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !canCreate} onClick={() => onCreate(day, shift)} aria-label={`Thêm lịch ${shift === 'SANG' ? 'ca sáng' : shift === 'CHIEU' ? 'ca chiều' : ''} ngày ${formatDate(day)}`}><span className="grid size-6 place-items-center rounded-full border border-current text-lg" aria-hidden="true">+</span>Thêm lịch</button> : null}
      </div>
    </td>;
  }

  return <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
    <table className="w-full min-w-[1100px] table-fixed border-collapse">
      <thead>
        <tr>
          <th className="w-[160px] border-b border-r border-line bg-[#f7fafb] px-4 py-4 text-left text-xs font-semibold uppercase leading-relaxed tracking-wide text-muted">Ca làm việc / thời gian</th>
          {days.map((day) => <th key={day} className={`relative border-b border-r border-line px-2 py-4 text-center ${day === today ? 'bg-[#eaf3fb]' : 'bg-[#f7fafb]'}`}>
            {day === today ? <span className="absolute top-1 left-1/2 -translate-x-1/2 rounded-full bg-primary-700 px-2 text-[9px] font-semibold text-white">HÔM NAY</span> : null}
            <span className={`block text-[11px] font-semibold uppercase ${weekdayLabel(day) === 'CN' ? 'text-danger' : 'text-muted'}`}>{weekdayLabel(day)}</span>
            <span className="mt-1 block text-sm font-semibold text-ink">{formatDate(day).slice(0, 5)}</span>
          </th>)}
        </tr>
      </thead>
      <tbody>
        {shifts.map((shift) => <tr key={shift.code}>
          <th className="border-b border-r border-line bg-white px-3 py-4 text-left align-top">
            <div className="flex items-start gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#fff6dc] text-lg text-[#ac7b16]" aria-hidden="true">{shift.icon}</span><span><strong className="block text-sm">{shift.label}</strong><span className="mt-1 block text-xs font-normal text-muted">{shift.start} – {shift.end}</span><span className="mt-2 inline-block rounded bg-surface px-2 py-1 text-[11px] font-normal text-muted">4 giờ / ca</span></span></div>
          </th>
          {days.map((day) => cell(day, items.filter((item) => overlaps(item, shift.start, shift.end)), shift.code))}
        </tr>)}
        {otherHours.length ? <tr><th className="border-r border-line px-3 py-4 text-left align-top"><strong className="block text-sm">Giờ khác</strong><span className="mt-1 block text-xs font-normal text-muted">Ngoài ca sáng / chiều</span></th>{days.map((day) => cell(day, otherHours))}</tr> : null}
      </tbody>
    </table>
  </div>;
}
