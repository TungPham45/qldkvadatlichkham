import { addDays, formatDate, startOfWeek, todayIso } from '../utils/format';
import { Button } from './Button';

export function WeekPicker({ week, onChange }: { week: string; onChange: (week: string) => void }) {
  const start = startOfWeek(week);
  const end = addDays(start, 6);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" onClick={() => onChange(addDays(start, -7))}>Tuần trước</Button>
      <strong className="min-w-[180px] text-center text-sm">{formatDate(start)} – {formatDate(end)}</strong>
      <Button variant="ghost" onClick={() => onChange(addDays(start, 7))}>Tuần sau</Button>
      <Button variant="ghost" onClick={() => onChange(todayIso())}>Tuần này</Button>
    </div>
  );
}
