import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import { clinicalApi, type ReceptionItem, type ReceptionTabs } from '../../features/clinical/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const pageSize = 10;
type ConfirmationStage = 'CONFIRMATION_PENDING' | 'CONFIRMATION_CONFIRMED' | 'CONFIRMATION_REJECTED';

function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return next.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(year, month - 1, day));
}

function ageAt(birthDate: string | null, referenceDate: string) {
  if (!birthDate) return null;
  const birth = birthDate.slice(0, 10).split('-').map(Number);
  const current = referenceDate.split('-').map(Number);
  let age = current[0] - birth[0];
  if (current[1] < birth[1] || (current[1] === birth[1] && current[2] < birth[2])) age -= 1;
  return age >= 0 ? age : null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

function shift(time: string) {
  return Number(time.slice(0, 2)) < 12 ? 'SÁNG' : 'CHIỀU';
}

function statusLabel(item: ReceptionItem) {
  if (item.status === 'Cho xac nhan') return 'Chờ xác nhận';
  if (item.status === 'Huy') return 'Đã hủy / từ chối';
  return 'Đã chấp nhận';
}

const emptyTabs: ReceptionTabs = { pending: 0, confirmed: 0, cancelled: 0, waiting: 0, inProgress: 0, completed: 0 };

export function DoctorAppointmentConfirmationPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const paramDate = searchParams.get('date');
  const paramStage = searchParams.get('stage') as ConfirmationStage | null;
  const paramAppointmentId = searchParams.get('appointmentId') ? Number(searchParams.get('appointmentId')) : null;

  const [date, setDate] = useState(() => (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) ? paramDate : vietnamToday()));
  const [stage, setStage] = useState<ConfirmationStage>(() => {
    if (paramStage === 'CONFIRMATION_PENDING' || paramStage === 'CONFIRMATION_CONFIRMED' || paramStage === 'CONFIRMATION_REJECTED') {
      return paramStage;
    }
    return 'CONFIRMATION_PENDING';
  });
  const [highlightedId, setHighlightedId] = useState<number | null>(() => paramAppointmentId);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [tabs, setTabs] = useState<ReceptionTabs>(emptyTabs);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rejecting, setRejecting] = useState<ReceptionItem | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  const updateUrl = useCallback((newDate: string, newStage: ConfirmationStage, newAppointmentId?: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('date', newDate);
      next.set('stage', newStage);
      if (newAppointmentId) {
        next.set('appointmentId', String(newAppointmentId));
      } else {
        next.delete('appointmentId');
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Sync state if URL params change externally (e.g. browser back/forward or notification click)
  useEffect(() => {
    const urlDate = searchParams.get('date');
    const urlStage = searchParams.get('stage') as ConfirmationStage | null;
    const urlAppointmentId = searchParams.get('appointmentId') ? Number(searchParams.get('appointmentId')) : null;

    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) && urlDate !== date) {
      setDate(urlDate);
      setPage(1);
    }
    if (urlStage && (urlStage === 'CONFIRMATION_PENDING' || urlStage === 'CONFIRMATION_CONFIRMED' || urlStage === 'CONFIRMATION_REJECTED') && urlStage !== stage) {
      setStage(urlStage);
      setPage(1);
    }
    if (urlAppointmentId) {
      setHighlightedId(urlAppointmentId);
    }
  }, [searchParams]);

  // Verify target appointment from backend to ensure correct date and stage
  useEffect(() => {
    const targetId = searchParams.get('appointmentId') ? Number(searchParams.get('appointmentId')) : null;
    if (!targetId) return;

    let cancelled = false;
    clinicalApi.reception(targetId).then((apt) => {
      if (cancelled) return;
      const actualDate = apt.date;
      let actualStage: ConfirmationStage = 'CONFIRMATION_PENDING';
      if (apt.status === 'Huy') actualStage = 'CONFIRMATION_REJECTED';
      else if (apt.status !== 'Cho xac nhan') actualStage = 'CONFIRMATION_CONFIRMED';

      if (actualDate !== date || actualStage !== stage) {
        setDate(actualDate);
        setStage(actualStage);
        setPage(1);
        updateUrl(actualDate, actualStage, targetId);
      }
    }).catch(() => {
      if (!cancelled) {
        setError('Lịch hẹn không còn tồn tại hoặc bạn không có quyền truy cập.');
      }
    });

    return () => { cancelled = true; };
  }, [searchParams]);

  // Auto scroll and highlight target appointment
  useEffect(() => {
    if (!highlightedId || loading) return;
    const element = document.getElementById(`appointment-card-${highlightedId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = window.setTimeout(() => {
        setHighlightedId(null);
      }, 5000);
      return () => window.clearTimeout(timer);
    }
  }, [highlightedId, items, loading]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await clinicalApi.receptions({ page, limit: pageSize, date, stage, search: search || undefined });
      setItems(result.items);
      setTotal(result.total);
      setTabs(result.tabs);
      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [date, page, search, stage]);

  useEffect(() => { void load(); }, [load]);

  function chooseStage(next: ConfirmationStage) {
    setStage(next);
    setPage(1);
    updateUrl(date, next, highlightedId);
  }

  function moveDate(amount: number) {
    const nextDate = addDays(date, amount);
    setDate(nextDate);
    setPage(1);
    updateUrl(nextDate, stage, null);
  }

  async function confirm(item: ReceptionItem) {
    setBusyId(item.appointmentId);
    setNotice('');
    setError('');
    try {
      await clinicalApi.confirmAppointment(item.appointmentId);
      setNotice(`Đã xác nhận lịch ${item.time.slice(0, 5)} của ${item.patient.name}.`);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting || reason.trim().length < 3) {
      setFormError('Vui lòng nhập lý do từ chối cụ thể.');
      return;
    }
    setBusyId(rejecting.appointmentId);
    setFormError('');
    try {
      await clinicalApi.rejectAppointment(rejecting.appointmentId, reason.trim());
      setNotice(`Đã từ chối lịch của ${rejecting.patient.name} và gửi thông báo cho bệnh nhân.`);
      setRejecting(null);
      setReason('');
      await load();
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  }

  const tabItems: Array<{ key: ConfirmationStage; label: string; count: number }> = [
    { key: 'CONFIRMATION_PENDING', label: 'Chờ xác nhận', count: tabs.pending },
    { key: 'CONFIRMATION_CONFIRMED', label: 'Đã chấp nhận', count: tabs.confirmed },
    { key: 'CONFIRMATION_REJECTED', label: 'Đã hủy / từ chối', count: tabs.cancelled },
  ];

  return (
    <main className="doctor-workflow-page">
      <header className="doctor-workflow-heading">
        <div><h1>Xác nhận lịch hẹn</h1><p>Xem xét, chấp nhận hoặc từ chối yêu cầu đặt khám được phân công cho bạn.</p></div>
      </header>

      <section className="doctor-workflow-panel">
        <div className="doctor-date-bar">
          <button type="button" aria-label="Ngày trước" onClick={() => moveDate(-1)}>‹</button>
          <button type="button" className="doctor-date-today" onClick={() => { const today = vietnamToday(); setDate(today); setPage(1); updateUrl(today, stage, null); }}>
            <span aria-hidden="true">▣</span> {date === vietnamToday() ? 'Hôm nay' : 'Ngày khám'}: {displayDate(date)}
          </button>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
                setPage(1);
                updateUrl(event.target.value, stage, null);
              }
            }}
            className="doctor-date-picker"
            title="Chọn ngày khám"
            aria-label="Chọn ngày khám"
          />
          <button type="button" aria-label="Ngày sau" onClick={() => moveDate(1)}>›</button>
        </div>
        <div className="doctor-workflow-controls">
          <div className="doctor-workflow-tabs" role="tablist" aria-label="Trạng thái xác nhận">
            {tabItems.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={stage === tab.key} className={stage === tab.key ? 'is-active' : ''} onClick={() => chooseStage(tab.key)}>
                {tab.label}<b>{tab.count}</b>
              </button>
            ))}
          </div>
          <label className="doctor-workflow-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm tên, mã hoặc SĐT bệnh nhân..." /></label>
        </div>
      </section>

      {notice ? <p className="doctor-workflow-notice" role="status">{notice}</p> : null}
      {loading ? <LoadingState label="Đang tải lịch hẹn..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? (
        <EmptyState title="Không có lịch hẹn trong mục này" description={`Không tìm thấy lịch phù hợp cho ${displayDate(date)}.`} />
      ) : (
        <section className="doctor-appointment-list" aria-live="polite">
          {items.map((item) => {
            const age = ageAt(item.patient.birthDate, item.date);
            return (
              <article
                id={`appointment-card-${item.appointmentId}`}
                className={`doctor-appointment-card is-${stage.toLowerCase()} ${highlightedId === item.appointmentId ? 'is-highlighted' : ''}`}
                key={item.appointmentId}
              >
                <div className="doctor-time-block"><strong>{item.time.slice(0, 5)}</strong><span>{shift(item.time)}</span></div>
                <div className="doctor-appointment-body">
                  <div className="doctor-patient-line">
                    <span className="doctor-patient-avatar">{initials(item.patient.name)}</span>
                    <div><h2>{item.patient.name} <em>{item.visitType === 'Tai kham' ? 'Tái khám' : 'Khám lần đầu'}</em></h2><p>{item.patient.code} · {item.patient.gender || 'Chưa rõ'}{age !== null ? ` · ${age} tuổi` : ''} · {item.patient.phone || 'Chưa có SĐT'}</p></div>
                    <span className="doctor-card-status">{statusLabel(item)}</span>
                  </div>
                  <p className="doctor-reason"><b>Lý do khám:</b> {item.reason || 'Không ghi nhận lý do.'}</p>
                  {item.cancellationReason ? <p className="doctor-rejection-reason"><b>Lý do hủy/từ chối:</b> {item.cancellationReason}</p> : null}
                </div>
                {item.status === 'Cho xac nhan' ? (
                  <div className="doctor-card-actions">
                    <button type="button" className="is-reject" disabled={busyId === item.appointmentId} onClick={() => { setRejecting(item); setReason(''); setFormError(''); }}>× Từ chối</button>
                    <button type="button" className="is-confirm" disabled={busyId === item.appointmentId} onClick={() => void confirm(item)}>✓ Xác nhận</button>
                  </div>
                ) : null}
              </article>
            );
          })}
          <ManagerPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </section>
      )}

      {rejecting ? (
        <AdminModal title="Xác nhận từ chối lịch hẹn" onClose={() => { if (!busyId) setRejecting(null); }}>
          <div className="doctor-reject-dialog">
            <p>Bạn đang từ chối lịch <strong>{rejecting.time.slice(0, 5)}</strong> của <strong>{rejecting.patient.name}</strong>. Bệnh nhân sẽ nhận được lý do này trong thông báo.</p>
            <label><span>Lý do từ chối *</span><textarea autoFocus rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: Khung giờ đã phát sinh lịch cấp cứu, vui lòng chọn giờ khác..." /></label>
            {formError ? <p className="manager-form__error">{formError}</p> : null}
            <div className="manager-form__actions"><button type="button" disabled={Boolean(busyId)} onClick={() => setRejecting(null)}>Quay lại</button><button type="button" className="doctor-danger-button" disabled={Boolean(busyId)} onClick={() => void reject()}>{busyId ? 'Đang xử lý...' : 'Xác nhận từ chối'}</button></div>
          </div>
        </AdminModal>
      ) : null}
    </main>
  );
}
