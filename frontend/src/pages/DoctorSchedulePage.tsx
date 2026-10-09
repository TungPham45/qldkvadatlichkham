import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { scheduleApi } from '../features/schedule/api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { WeekPicker } from '../components/WeekPicker';
import { WeeklyScheduleGrid } from '../components/WeeklyScheduleGrid';
import type { ScheduleItem, ShiftCode } from '../types';
import { addDays, startOfWeek, todayIso } from '../utils/format';

export function DoctorSchedulePage() {
  const [week, setWeek] = useState(startOfWeek(todayIso()));
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(week), index));

  function load(nextWeek = week) {
    setLoading(true);
    scheduleApi.mine(nextWeek)
      .then((response) => {
        setItems(response.items);
        setSelected(new Set());
        setError('');
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(week); }, [week]);

  function toggle(date: string, shift: ShiftCode) {
    const key = `${date}:${shift}`;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      await scheduleApi.submit([...selected].map((key) => {
        const [ngayLamViec, ca] = key.split(':');
        return { ngayLamViec, ca };
      }));
      setMessage('Đã gửi đăng ký. Các ca đang chờ quản lý duyệt.');
      load(week);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        crumbs={['Bác sĩ', 'Đăng ký lịch']}
        title="Đăng ký lịch làm việc"
        description="Ca mới có trạng thái chờ duyệt và chưa mở cho bệnh nhân đặt."
        actions={<Button disabled={busy || selected.size === 0} onClick={submit}>{busy ? 'Đang gửi...' : `Gửi duyệt (${selected.size})`}</Button>}
      />
      <WeekPicker week={week} onChange={setWeek} />
      {message ? <div className="rounded-xl border border-line bg-white p-[18px] shadow-card">{message}</div> : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load(week)} /> : null}
      {!loading && !error ? <WeeklyScheduleGrid days={days} items={items} selected={selected} mode="edit" onToggle={toggle} /> : null}
    </PageContainer>
  );
}
