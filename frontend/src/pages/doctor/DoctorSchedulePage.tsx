import { useEffect, useRef, useState } from 'react';
import { errorMessage, hasApiErrorCode } from '../../api/client';
import { scheduleApi } from '../../features/schedule/api';
import { canSelectShift } from '../../features/schedule/selection';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageContainer } from '../../components/PageContainer';
import { PageHeader } from '../../components/PageHeader';
import { WeekPicker } from '../../components/schedule/WeekPicker';
import { WeeklyScheduleGrid } from '../../components/schedule/WeeklyScheduleGrid';
import type { ScheduleItem, ShiftCode } from '../../types';
import { addDays, startOfWeek, todayIso } from '../../utils/format';

export function DoctorSchedulePage() {
  const [week, setWeek] = useState(startOfWeek(todayIso()));
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(week), index));

  async function load(nextWeek = week, preserveSelection = false) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await scheduleApi.mine(nextWeek);
      if (!mounted.current || currentRequest !== requestId.current) return;
      setItems(response.items);
      setSelected(current => preserveSelection ? new Set([...current].filter(key => {
        const [date, shift] = key.split(':');
        return canSelectShift(date, shift as ShiftCode, response.items, todayIso());
      })) : new Set());
      setError('');
    } catch (err) {
      if (mounted.current && currentRequest === requestId.current) setError(errorMessage(err));
    } finally {
      if (mounted.current && currentRequest === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current++; };
  }, []);
  useEffect(() => {
    void load(week);
    return () => { requestId.current++; };
  }, [week]);

  function changeWeek(value: string) {
    if (submitting.current) return;
    const next = startOfWeek(value);
    if (next === week) return;
    requestId.current++;
    setLoading(true);
    setSelected(new Set());
    setMessage('');
    setSubmissionError('');
    setWeek(next);
  }

  function toggle(date: string, shift: ShiftCode) {
    if (submitting.current || loading || error || !canSelectShift(date, shift, items, todayIso())) return;
    setMessage('');
    setSubmissionError('');
    const key = `${date}:${shift}`;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit() {
    if (submitting.current || loading || error || !selected.size) return;
    const valid = [...selected].filter(key => {
      const [date, shift] = key.split(':');
      return canSelectShift(date, shift as ShiftCode, items, todayIso());
    });
    if (valid.length !== selected.size) {
      setSelected(new Set(valid));
      setSubmissionError('Một số ca đã qua ngày hoặc đã có lịch. Vui lòng kiểm tra các ca còn chọn trước khi gửi.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage('');
    setSubmissionError('');
    try {
      await scheduleApi.submit(valid.map((key) => {
        const [ngayLamViec, ca] = key.split(':');
        return { ngayLamViec, ca: ca as ShiftCode };
      }));
      if (!mounted.current) return;
      setMessage('Đã gửi đăng ký. Các ca đang chờ quản lý duyệt.');
      await load(week);
    } catch (err) {
      if (!mounted.current) return;
      setSubmissionError(errorMessage(err));
      if (hasApiErrorCode(err, 'SCHEDULE_ALREADY_REGISTERED')) await load(week, true);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        crumbs={['Bác sĩ', 'Đăng ký lịch']}
        title="Đăng ký lịch làm việc"
        description="Ca mới có trạng thái chờ duyệt và chưa mở cho bệnh nhân đặt."
        actions={<Button disabled={busy || loading || Boolean(error) || selected.size === 0} onClick={() => void submit()}>{busy ? 'Đang gửi...' : `Gửi duyệt (${selected.size})`}</Button>}
      />
      <WeekPicker week={week} onChange={changeWeek} disabled={busy} />
      <p className="text-sm text-muted">Chọn ca trống từ hôm nay trở đi, sau đó bấm Gửi duyệt. Ca đã có lịch sẽ không thể chọn thêm.</p>
      {message ? <div role="status" className="rounded-xl border border-line bg-white p-[18px] shadow-card">{message}</div> : null}
      {submissionError ? <div role="alert" className="rounded-xl border border-danger/30 bg-white p-[18px] text-danger shadow-card">{submissionError}</div> : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load(week, true)} /> : null}
      {!loading && !error ? <WeeklyScheduleGrid days={days} items={items} selected={selected} mode="edit" onToggle={toggle} disabled={busy} /> : null}
    </PageContainer>
  );
}
