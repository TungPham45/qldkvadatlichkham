import { formatTime } from '../../utils/format';

export function AppointmentSlot({ start, end, available, active, onClick }: { start: string; end: string; available: boolean; active: boolean; onClick: () => void }) {
  const label = available ? `Còn trống, ${formatTime(start)} đến ${formatTime(end)}` : `Đã kín, ${formatTime(start)} đến ${formatTime(end)}`;
  return (
    <button
      className={`w-full cursor-pointer rounded-[10px] border px-2 py-1.5 text-center ${active ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-white'} disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-muted`}
      disabled={!available}
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-semibold">{formatTime(start)}</span>
      <span className={`block text-[11px] font-medium ${active ? 'text-white/80' : 'text-muted'}`}>đến {formatTime(end)}</span>
    </button>
  );
}
