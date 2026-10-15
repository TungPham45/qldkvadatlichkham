import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage, hasApiErrorCode } from '../../api/client';
import { doctorApi } from '../../features/doctor/api';
import { scheduleApi } from '../../features/schedule/api';
import { canSelectShift, overlapsShift } from '../../features/schedule/selection';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../../stores/auth-store';
import type { ScheduleItem, ShiftCode } from '../../types';
import { addDays, formatDate, scheduleLabel, startOfWeek, todayIso, weekdayLabel } from '../../utils/format';
import '../../styles/doctor-work-schedule.css';

const SHIFTS: Array<{ code: ShiftCode; label: string; time: string }> = [
  { code: 'SANG', label: 'Ca Sáng', time: '07:30 - 11:30' },
  { code: 'CHIEU', label: 'Ca Chiều', time: '13:30 - 17:30' },
];

type IconName = 'calendar' | 'previous' | 'next' | 'sun' | 'sunset' | 'plus' | 'check' | 'clock' | 'save' | 'send';

function ScheduleIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 11h16m-11 4h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01" /></>,
    previous: <path d="m14 6-6 6 6 6" />,
    next: <path d="m10 6 6 6-6 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    sunset: <><path d="M2 18h20M3 22h18M7 18a5 5 0 0 1 10 0M12 3v5M4 10l2 2m12 0 2-2M2 15h2m16 0h2" /><path d="m9 6 3 3 3-3" /></>,
    plus: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8m-4-4v8" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>,
    send: <><path d="m3 3 19 9-19 9 4-9-4-9Z" /><path d="M7 12h15" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function readDraft(key: string, days: string[]): string[] {
  try {
    const draft: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    if (!draft || typeof draft !== 'object' || !('selected' in draft) || !Array.isArray(draft.selected)) return [];
    return draft.selected.filter((value: unknown): value is string => {
      if (typeof value !== 'string') return false;
      const [date, shift, extra] = value.split(':');
      return !extra && days.includes(date) && (shift === 'SANG' || shift === 'CHIEU');
    });
  } catch {
    return [];
  }
}

export function DoctorSchedulePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramWeek = searchParams.get('week');
  const paramScheduleId = searchParams.get('scheduleId') ? Number(searchParams.get('scheduleId')) : null;

  const [week, setWeek] = useState(() => (paramWeek ? startOfWeek(paramWeek) : startOfWeek(todayIso())));
  const [targetScheduleId, setTargetScheduleId] = useState<number | null>(() => paramScheduleId);
  const [specialty, setSpecialty] = useState('');
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
  const today = todayIso();
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const draftKey = (value: string) => `doctor-work-schedule:draft:v1:${user?.id || ''}:${value}`;
  const registered = items.filter(item => item.statusCode !== 'REJECTED');
  const morningCount = days.filter(day => selected.has(`${day}:SANG`) || registered.some(item => item.date.slice(0, 10) === day && overlapsShift(item, 'SANG'))).length;
  const afternoonCount = days.filter(day => selected.has(`${day}:CHIEU`) || registered.some(item => item.date.slice(0, 10) === day && overlapsShift(item, 'CHIEU'))).length;
  const hours = registered.reduce((total, item) => total + item.hours, 0) + selected.size * 4;
  const pending = registered.filter(item => item.statusCode === 'PENDING').length;
  const rejectedOnly = items.length > 0 && registered.length === 0;
  const otherShifts = items.filter(item => !overlapsShift(item, 'SANG') && !overlapsShift(item, 'CHIEU'));
  const status = loading ? 'Đang tải lịch' : error ? 'Không thể tải lịch' : pending ? 'Đang chờ duyệt' : selected.size ? 'Chưa gửi duyệt' : registered.length ? 'Đã được phê duyệt' : rejectedOnly ? 'Cần đăng ký lại' : 'Chưa đăng ký';
  const locked = busy || loading || Boolean(error);

  async function load(nextWeek = week, preserveSelection = false) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await scheduleApi.mine(nextWeek);
      if (!mounted.current || currentRequest !== requestId.current) return;
      const nextDays = Array.from({ length: 7 }, (_, index) => addDays(nextWeek, index));
      const draft = user?.id ? readDraft(draftKey(nextWeek), nextDays) : [];
      setItems(response.items);
      setSelected(current => new Set((preserveSelection ? [...current] : draft).filter(key => {
        const [date, shift] = key.split(':');
        return nextDays.includes(date) && canSelectShift(date, shift as ShiftCode, response.items, todayIso());
      })));
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
  }, [week, user?.id]);
  useEffect(() => {
    let active = true;
    setSpecialty('');
    doctorApi.me().then(profile => { if (active) setSpecialty(profile.chuyenKhoa?.ten || ''); }).catch(() => { /* The schedule remains usable if profile information is unavailable. */ });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (paramWeek) {
      const nextWeek = startOfWeek(paramWeek);
      if (nextWeek !== week) setWeek(nextWeek);
    }
  }, [paramWeek]);

  useEffect(() => {
    if (paramScheduleId && paramScheduleId !== targetScheduleId) {
      setTargetScheduleId(paramScheduleId);
    }
  }, [paramScheduleId]);

  useEffect(() => {
    if (!targetScheduleId || loading) return;
    const el = document.getElementById(`doctor-schedule-item-${targetScheduleId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = window.setTimeout(() => setTargetScheduleId(null), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [targetScheduleId, loading, items]);

  function changeWeek(value: string) {
    if (submitting.current) return;
    const next = startOfWeek(value);
    if (next === week) return;
    requestId.current++;
    setLoading(true);
    setItems([]);
    setSelected(new Set());
    setMessage('');
    setSubmissionError('');
    setWeek(next);
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('week', next);
      nextParams.delete('scheduleId');
      return nextParams;
    }, { replace: true });
  }

  function toggle(date: string, shift: ShiftCode) {
    if (submitting.current || loading || error || !canSelectShift(date, shift, items, todayIso())) return;
    setMessage('');
    setSubmissionError('');
    const key = `${date}:${shift}`;
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function saveDraft() {
    if (locked || !user?.id) return;
    const valid = [...selected].filter(key => {
      const [date, shift] = key.split(':');
      return canSelectShift(date, shift as ShiftCode, items, todayIso());
    });
    try {
      localStorage.setItem(draftKey(week), JSON.stringify({ selected: valid, savedAt: new Date().toISOString() }));
      setSelected(new Set(valid));
      setSubmissionError('');
      setMessage('Đã lưu nháp trên thiết bị này. Bạn có thể mở lại tuần này để tiếp tục đăng ký.');
    } catch {
      setSubmissionError('Không thể lưu nháp trên thiết bị này. Vui lòng kiểm tra quyền lưu trữ của trình duyệt.');
    }
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
      await scheduleApi.submit(valid.map(key => {
        const [ngayLamViec, ca] = key.split(':');
        return { ngayLamViec, ca: ca as ShiftCode };
      }));
      if (!mounted.current) return;
      try { localStorage.removeItem(draftKey(week)); } catch { /* Submitted shifts are filtered when restoring a draft. */ }
      setMessage('Đã gửi đăng ký. Các ca đang chờ Admin phê duyệt.');
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
    <div className="doctor-work-schedule">
      <div className="doctor-work-schedule__heading">
        <div><h1>Đăng ký lịch làm việc</h1><p>Chọn các ca trực mong muốn trong tuần để gửi Admin xem xét và phê duyệt.</p></div>
        <span className={`doctor-work-schedule__status ${!loading && !error && !pending && !selected.size && registered.length ? 'is-approved' : ''} ${!loading && (error || (rejectedOnly && !selected.size)) ? 'is-rejected' : ''}`}><ScheduleIcon name="clock" />Trạng thái: {status}</span>
      </div>

      <div className="doctor-work-schedule__toolbar">
        <div className="doctor-work-schedule__week-actions">
          <div className="doctor-work-schedule__week-picker">
            <button type="button" aria-label="Tuần trước" disabled={busy} onClick={() => changeWeek(addDays(week, -7))}><ScheduleIcon name="previous" /></button>
            <span><ScheduleIcon name="calendar" /><strong>Tuần: {formatDate(week)} - {formatDate(addDays(week, 6))}</strong></span>
            <button type="button" aria-label="Tuần sau" disabled={busy} onClick={() => changeWeek(addDays(week, 7))}><ScheduleIcon name="next" /></button>
          </div>
          <button className="doctor-work-schedule__button" type="button" disabled={busy} onClick={() => changeWeek(todayIso())}>Hôm nay</button>
        </div>
        <div className="doctor-work-schedule__legend" aria-label="Chú thích lịch"><span><i className="is-approved" />Đã duyệt</span><span><i className="is-pending" />Đã đăng ký</span><span><i className="is-empty" />Trống (+ Chọn ca)</span></div>
      </div>

      {message ? <div role="status" className="doctor-work-schedule__notice">{message}</div> : null}
      {submissionError ? <div role="alert" className="doctor-work-schedule__notice is-error">{submissionError}</div> : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load(week, true)} /> : null}

      {!loading && !error ? (
        <section className="doctor-work-schedule__calendar" aria-label="Lịch đăng ký làm việc trong tuần">
          <div className="doctor-work-schedule__table-scroll">
            <table className="doctor-work-schedule__table">
              <thead><tr><th scope="col" className="doctor-work-schedule__shift-heading">Ca làm việc / Thời gian</th>{days.map(day => <th scope="col" key={day} className={`${day === today ? 'is-today' : ''} ${weekdayLabel(day) === 'CN' ? 'is-sunday' : ''}`}>{day === today ? <span className="doctor-work-schedule__today-tag">Hôm nay</span> : null}<span>{weekdayLabel(day)}</span><strong>{formatDate(day).slice(0, 5)}</strong></th>)}</tr></thead>
              <tbody>{SHIFTS.map(shift => <tr key={shift.code}>
                <th scope="row"><div className="doctor-work-schedule__shift"><span className={`doctor-work-schedule__shift-icon ${shift.code === 'CHIEU' ? 'is-afternoon' : ''}`}><ScheduleIcon name={shift.code === 'SANG' ? 'sun' : 'sunset'} /></span><div><strong>{shift.label}</strong><span>{shift.time}</span><small>4.0 giờ / ca</small></div></div></th>
                {days.map(day => {
                  const active = registered.filter(item => item.date.slice(0, 10) === day && overlapsShift(item, shift.code));
                  const rejected = items.find(item => item.date.slice(0, 10) === day && item.statusCode === 'REJECTED' && overlapsShift(item, shift.code));
                  const key = `${day}:${shift.code}`;
                  const available = canSelectShift(day, shift.code, items, today);
                  const chosen = available && selected.has(key);
                  const approved = active.length > 0 && active.every(item => item.statusCode === 'APPROVED');
                  const targetItem = active.find(item => item.id === targetScheduleId) || (rejected?.id === targetScheduleId ? rejected : null);
                  const isHighlighted = Boolean(targetItem && targetItem.id === targetScheduleId);
                  return <td key={key} className={day === today ? 'is-today' : ''}>
                    {active.length ? <div id={targetItem ? `doctor-schedule-item-${targetItem.id}` : undefined} className={`doctor-work-schedule__shift-card ${approved ? 'is-approved' : 'is-registered'} ${isHighlighted ? 'is-highlighted' : ''}`}><span className="doctor-work-schedule__card-status"><ScheduleIcon name="check" />{approved ? 'Đã duyệt' : 'Đã đăng ký'}<i /></span><strong>{specialty || (shift.code === 'SANG' ? 'Lịch khám buổi sáng' : 'Lịch khám buổi chiều')}</strong><span>{active.map(item => `${item.startTime.slice(0, 5)} - ${item.endTime.slice(0, 5)}`).join(', ')}</span><small>{active.map(item => item.note).filter(Boolean).join(' · ') || (approved ? 'Đã mở lịch đặt khám' : 'Chờ Admin xét duyệt')}</small></div>
                      : chosen ? <button type="button" className="doctor-work-schedule__shift-card is-selected" disabled={busy} aria-pressed="true" aria-label={`Bỏ chọn ${shift.label.toLowerCase()} ${formatDate(day)}`} onClick={() => toggle(day, shift.code)}><span className="doctor-work-schedule__card-status"><ScheduleIcon name="check" />Đang chọn<i /></span><strong>{shift.time}</strong><small>Chưa gửi phê duyệt</small><span className="doctor-work-schedule__remove">Bấm để bỏ chọn</span></button>
                        : <button type="button" id={rejected?.id === targetScheduleId ? `doctor-schedule-item-${rejected.id}` : undefined} className={`doctor-work-schedule__empty ${rejected ? 'is-rejected' : ''} ${rejected?.id === targetScheduleId ? 'is-highlighted' : ''}`} disabled={!available || busy} aria-pressed="false" aria-label={`${rejected ? 'Đăng ký lại' : 'Chọn'} ${shift.label.toLowerCase()} ${formatDate(day)}`} onClick={() => toggle(day, shift.code)}><ScheduleIcon name="plus" /><strong>{rejected ? 'Đăng ký lại' : available ? '+ Chọn ca' : 'Ngày đã qua'}</strong>{rejected ? <small>{rejected.note || 'Ca trước đã bị từ chối'}</small> : null}</button>}
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
          <div className="doctor-work-schedule__footer">
            <div className="doctor-work-schedule__summary"><span className="doctor-work-schedule__summary-icon"><ScheduleIcon name="calendar" /></span><div><p>Đã chọn: <strong>{morningCount} ca sáng, {afternoonCount} ca chiều</strong> <span>(Tổng {Number(hours.toFixed(1))} giờ)</span></p><small><ScheduleIcon name="clock" />{selected.size ? `${selected.size} ca mới sẵn sàng gửi Admin phê duyệt.` : 'Chọn ca trống từ hôm nay để đăng ký lịch làm việc.'}</small></div></div>
            <div className="doctor-work-schedule__footer-actions"><button type="button" className="doctor-work-schedule__button" disabled={locked || !user?.id} onClick={saveDraft}><ScheduleIcon name="save" />Lưu nháp</button><button type="button" className="doctor-work-schedule__button is-primary" disabled={locked || !selected.size} onClick={() => void submit()}><ScheduleIcon name="send" />{busy ? 'Đang gửi...' : 'Gửi Admin duyệt'}</button></div>
          </div>
        </section>
      ) : null}
      {!loading && !error && otherShifts.length ? (
        <section className="doctor-work-schedule__other" aria-labelledby="doctor-other-shifts">
          <h2 id="doctor-other-shifts"><ScheduleIcon name="clock" />Ca làm việc khác</h2>
          <ul>{otherShifts.map(item => (
            <li key={item.id} id={`doctor-schedule-item-${item.id}`} className={targetScheduleId === item.id ? 'is-highlighted' : ''}>
              <span className="doctor-work-schedule__other-date">{weekdayLabel(item.date.slice(0, 10))}, {formatDate(item.date)}</span>
              <strong>{item.startTime.slice(0, 5)} - {item.endTime.slice(0, 5)}</strong>
              <small>{item.hours} giờ</small>
              <span className={`doctor-work-schedule__other-status is-${item.statusCode.toLowerCase()}`}>{scheduleLabel(item.statusCode)}</span>
              {item.note ? <p>{item.note}</p> : null}
            </li>
          ))}</ul>
        </section>
      ) : null}
      <p className="doctor-work-schedule__hint">Các ca đang chờ duyệt sẽ được mở cho bệnh nhân đặt khám sau khi Admin phê duyệt.</p>
    </div>
  );
}
