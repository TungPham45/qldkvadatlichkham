import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import { clinicalApi, type ReceptionInput, type ReceptionItem } from '../../features/clinical/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { appointmentLabel, formatDate, formatTime } from '../../utils/format';

const limit = 10;
const blank: ReceptionInput = { appointmentId: 0, initialSymptoms: '', notes: '' };
const vitalFields: Array<[keyof ReceptionInput, string]> = [
  ['weight', 'Cân nặng (kg)'],
  ['height', 'Chiều cao (cm)'],
  ['temperature', 'Nhiệt độ (°C)'],
  ['systolicBloodPressure', 'Huyết áp tâm thu'],
  ['diastolicBloodPressure', 'Huyết áp tâm trương'],
  ['heartRate', 'Nhịp tim'],
  ['spo2', 'SpO2 (%)'],
];

function canEditReception(item: ReceptionItem) {
  return Boolean(item.reception) && ['Da check-in', 'Dang kham'].includes(item.status);
}

export function ReceptionPage() {
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Do not silently hide appointments booked for another day. The user can
  // still narrow the shared queue with the explicit date filter.
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<ReceptionItem | null>(null);
  const [form, setForm] = useState<ReceptionInput>(blank);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await clinicalApi.receptions({
        page,
        limit,
        date: date || undefined,
        search: search || undefined,
        status: status || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setError('');
    } catch (requestError) {
      console.error('[ReceptionPage] Không tải được danh sách tiếp nhận', requestError);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, date, search, status]);

  useEffect(() => { void load(); }, [load]);

  function open(item: ReceptionItem) {
    setSelected(item);
    setForm({
      appointmentId: item.appointmentId,
      weight: item.reception?.weight,
      height: item.reception?.height,
      temperature: item.reception?.temperature,
      systolicBloodPressure: item.reception?.systolicBloodPressure,
      diastolicBloodPressure: item.reception?.diastolicBloodPressure,
      heartRate: item.reception?.heartRate,
      spo2: item.reception?.spo2,
      initialSymptoms: item.reception?.initialSymptoms || '',
      notes: item.reception?.notes || '',
    });
    setFormError('');
  }

  function setNumber(key: keyof ReceptionInput, value: string) {
    setForm({ ...form, [key]: value === '' ? undefined : Number(value) });
  }

  async function confirm(item: ReceptionItem) {
    setBusy(true);
    setError('');
    try {
      await clinicalApi.confirmAppointment(item.appointmentId);
      await load();
    } catch (requestError) {
      console.error('[ReceptionPage] Không xác nhận được lịch hẹn', requestError);
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.reception) await clinicalApi.updateReception(selected.appointmentId, form);
      else await clinicalApi.createReception(form);
      setSelected(null);
      await load();
    } catch (requestError) {
      console.error('[ReceptionPage] Không lưu được thông tin tiếp nhận', requestError);
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const selectedEditable = selected
    ? (!selected.reception && selected.status === 'Da xac nhan') || canEditReception(selected)
    : false;

  return (
    <main className="manager-page">
      <div className="manager-page__heading">
        <div><h1>Tiếp nhận bệnh nhân</h1><p>Xác nhận lịch và ghi nhận thông tin ban đầu trước khi khám.</p></div>
        <div className="manager-stat"><span>✚</span><div><small>Lịch phù hợp</small><strong>{loading ? '…' : error ? '—' : total}</strong></div></div>
      </div>
      <section className="manager-card">
        <div className="manager-toolbar">
          <input aria-label="Lọc theo ngày khám" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} />
          <div className="manager-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tên, mã lịch, mã bệnh nhân, bác sĩ" /></div>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái</option>
            <option value="Cho xac nhan">Chờ xác nhận</option>
            <option value="Da xac nhan">Đã xác nhận</option>
            <option value="Da check-in">Đã check-in</option>
            <option value="Dang kham">Đang khám</option>
            <option value="Hoan thanh">Hoàn thành</option>
            <option value="Huy">Đã hủy</option>
          </select>
        </div>
        {loading ? <LoadingState label="Đang tải lịch khám..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="Không có lịch phù hợp" description="Không có lịch khám phù hợp với bộ lọc đã chọn." /> : (
          <>
            <div className="manager-table-wrap">
              <table className="manager-table reception-table">
                <thead><tr><th>Mã lịch</th><th>Bệnh nhân</th><th>Bác sĩ</th><th>Ngày, giờ khám</th><th>Trạng thái lịch</th><th>Tiếp nhận</th><th>Thao tác</th></tr></thead>
                <tbody>{items.map((item) => (
                  <tr key={item.appointmentId}>
                    <td><span className="manager-code">{item.code}</span></td>
                    <td><strong>{item.patient.name}</strong><small>{item.patient.code} · {item.patient.phone || 'Chưa có SĐT'}</small></td>
                    <td><strong>{item.doctor.name}</strong><small>{item.doctor.specialty?.name || item.doctor.code || 'Chưa phân chuyên khoa'}</small></td>
                    <td><strong>{formatDate(item.date)}</strong><small>{formatTime(item.time)}</small></td>
                    <td>{appointmentLabel(item.status)}</td>
                    <td><span className={`manager-status ${item.reception ? 'is-active' : 'is-inactive'}`}>{item.reception ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}</span></td>
                    <td>
                      <div className="manager-row-actions">
                        <button type="button" onClick={() => open(item)}>{item.status === 'Da xac nhan' && !item.reception ? 'Tiếp nhận' : canEditReception(item) ? 'Xem/Cập nhật' : 'Chi tiết'}</button>
                        {item.status === 'Cho xac nhan' && !item.reception ? <button className="is-primary" type="button" disabled={busy} onClick={() => void confirm(item)}>Xác nhận</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <ManagerPager page={page} pageSize={limit} total={total} onPage={setPage} />
          </>
        )}
      </section>
      {selected ? (
        <AdminModal title={`${selectedEditable ? (selected.reception ? 'Cập nhật tiếp nhận' : 'Tiếp nhận') : 'Chi tiết lịch hẹn'} – ${selected.patient.name}`} onClose={() => !busy && setSelected(null)}>
          <form className="manager-form" onSubmit={submit}>
            <dl className="reception-detail is-wide">
              <div><dt>Mã lịch</dt><dd>{selected.code}</dd></div>
              <div><dt>Ngày, giờ khám</dt><dd>{formatDate(selected.date)} · {formatTime(selected.time)}</dd></div>
              <div><dt>Bác sĩ</dt><dd>{selected.doctor.name}</dd></div>
              <div><dt>Chuyên khoa</dt><dd>{selected.doctor.specialty?.name || '—'}</dd></div>
              <div><dt>Trạng thái</dt><dd>{appointmentLabel(selected.status)}</dd></div>
              <div><dt>Lý do khám</dt><dd>{selected.reason || '—'}</dd></div>
            </dl>
            {vitalFields.map(([key, label]) => <label key={key}><span>{label}</span><input disabled={!selectedEditable} type="number" step="0.1" min="0" value={String(form[key] ?? '')} onChange={(event) => setNumber(key, event.target.value)} /></label>)}
            <label className="is-wide"><span>Triệu chứng ban đầu</span><textarea disabled={!selectedEditable} rows={3} value={form.initialSymptoms || ''} onChange={(event) => setForm({ ...form, initialSymptoms: event.target.value })} /></label>
            <label className="is-wide"><span>Ghi chú</span><textarea disabled={!selectedEditable} rows={3} value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
            <div className="manager-form__actions is-wide">
              <button type="button" onClick={() => setSelected(null)}>Đóng</button>
              {selectedEditable ? <button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu tiếp nhận'}</button> : null}
            </div>
          </form>
        </AdminModal>
      ) : null}
    </main>
  );
}
