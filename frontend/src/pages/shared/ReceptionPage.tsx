import { FormEvent, useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import { clinicalApi, type ReceptionInput, type ReceptionItem } from '../../features/clinical/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const limit = 10;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const blank: ReceptionInput = { appointmentId: 0, initialSymptoms: '', notes: '' };
const vitalFields: Array<[keyof ReceptionInput, string]> = [['weight', 'Cân nặng (kg)'], ['height', 'Chiều cao (cm)'], ['temperature', 'Nhiệt độ (°C)'], ['systolicBloodPressure', 'Huyết áp tâm thu'], ['diastolicBloodPressure', 'Huyết áp tâm trương'], ['heartRate', 'Nhịp tim'], ['spo2', 'SpO2 (%)']];

export function ReceptionPage() {
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(today);
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
      const result = await clinicalApi.receptions({ page, limit, date: date || undefined, search: search || undefined, status: status || undefined });
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
    setForm({ appointmentId: item.appointmentId, weight: item.reception?.weight, height: item.reception?.height, temperature: item.reception?.temperature, systolicBloodPressure: item.reception?.systolicBloodPressure, diastolicBloodPressure: item.reception?.diastolicBloodPressure, heartRate: item.reception?.heartRate, spo2: item.reception?.spo2, initialSymptoms: item.reception?.initialSymptoms || '', notes: item.reception?.notes || '' });
    setFormError('');
  }

  function setNumber(key: keyof ReceptionInput, value: string) { setForm({ ...form, [key]: value === '' ? undefined : Number(value) }); }

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

  return <main className="manager-page">
    <div className="manager-page__heading"><div><h1>Tiếp nhận bệnh nhân</h1><p>Ghi nhận thông tin ban đầu trước khi khám.</p></div><div className="manager-stat"><span>✚</span><div><small>Lịch phù hợp</small><strong>{loading ? '…' : error ? '—' : total}</strong></div></div></div>
    <section className="manager-card">
      <div className="manager-toolbar"><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /><div className="manager-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tên, mã bệnh nhân, số điện thoại" /></div><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="Cho xac nhan">Chờ xác nhận</option><option value="Da xac nhan">Đã xác nhận</option><option value="Dang kham">Đang khám</option><option value="Hoan thanh">Hoàn thành</option></select></div>
      {loading ? <LoadingState label="Đang tải lịch khám..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="Không có lịch phù hợp" description="Không có lịch khám phù hợp với ngày và bộ lọc đã chọn." /> : <><div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Bệnh nhân</th><th>Số điện thoại</th><th>Bác sĩ</th><th>Giờ khám</th><th>Trạng thái lịch</th><th>Tiếp nhận</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item.appointmentId}><td><strong>{item.patient.name}</strong><small>{item.patient.code}</small></td><td>{item.patient.phone || '—'}</td><td>{item.doctor.name}</td><td>{String(item.time).slice(0, 5)}</td><td>{item.status}</td><td><span className={`manager-status ${item.reception ? 'is-active' : 'is-inactive'}`}>{item.reception ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}</span></td><td><div className="manager-row-actions"><button type="button" onClick={() => open(item)}>{item.reception ? 'Xem/Cập nhật' : 'Tiếp nhận'}</button></div></td></tr>)}</tbody></table></div><ManagerPager page={page} pageSize={limit} total={total} onPage={setPage} /></>}
    </section>
    {selected ? <AdminModal title={`${selected.reception ? 'Cập nhật' : 'Tiếp nhận'} – ${selected.patient.name}`} onClose={() => !busy && setSelected(null)}><form className="manager-form" onSubmit={submit}>{vitalFields.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" step="0.1" min="0" value={String(form[key] ?? '')} onChange={(event) => setNumber(key, event.target.value)} /></label>)}<label className="is-wide"><span>Triệu chứng ban đầu</span><textarea rows={3} value={form.initialSymptoms || ''} onChange={(event) => setForm({ ...form, initialSymptoms: event.target.value })} /></label><label className="is-wide"><span>Ghi chú</span><textarea rows={3} value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>{formError ? <p className="manager-form__error is-wide">{formError}</p> : null}<div className="manager-form__actions is-wide"><button type="button" onClick={() => setSelected(null)}>Hủy</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu tiếp nhận'}</button></div></form></AdminModal> : null}
  </main>;
}
