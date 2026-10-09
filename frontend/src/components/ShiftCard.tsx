import { scheduleLabel } from '../utils/format';
import { StatusBadge } from './StatusBadge';

const tones: Record<string, string> = {
  EMPTY: 'border-dashed border-[#c9d5e4] bg-[#fbfcfe]',
  SELECTED: 'border-solid border-primary-600 bg-primary-50',
  PENDING: 'border-solid border-[#f3c98a] bg-[#fff8ee]',
  APPROVED: 'border-solid border-[#b7e4cf] bg-[#f3fbf7]',
  REJECTED: 'border-solid border-[#f3c1c3] bg-[#fff6f6]',
};

export function ShiftCard({
  state,
  note,
  onSelect,
  onApprove,
  onReject,
}: {
  state: 'EMPTY' | 'SELECTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  note?: string | null;
  onSelect?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className={`flex min-h-[78px] flex-col gap-1.5 rounded-[10px] border p-2 ${tones[state]}`}>
      <StatusBadge status={state === 'EMPTY' ? 'neutral' : state} label={scheduleLabel(state)} />
      {note ? <span className="text-[13px] text-muted">{note}</span> : null}
      {state === 'EMPTY' && onSelect ? <button className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-primary-700" onClick={onSelect}>Chọn ca</button> : null}
      {state === 'SELECTED' && onSelect ? <button className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-primary-700" onClick={onSelect}>Bỏ chọn</button> : null}
      {state === 'PENDING' && onApprove ? <button className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-primary-700" onClick={onApprove}>Duyệt</button> : null}
      {state === 'PENDING' && onReject ? <button className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-primary-700" onClick={onReject}>Từ chối</button> : null}
    </div>
  );
}
