import { formatTime } from '../utils/format';

export function AppointmentSlot({ start, end, available, active, onClick }: { start: string; end: string; available: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`cursor-pointer rounded-[10px] border px-2.5 py-2 font-semibold ${active ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-white'} disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-muted`}
      disabled={!available}
      onClick={onClick}
      type="button"
    >
      {formatTime(start)}–{formatTime(end)}
    </button>
  );
}
