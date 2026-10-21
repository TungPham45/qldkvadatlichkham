import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import {
  billingApi,
  clinicalApi,
  type Disease,
  type MedicalRecordInput,
  type PrescriptionItemInput,
  type ReceptionInput,
  type ReceptionItem,
  type ReceptionStats,
} from '../../features/clinical/api';
import { directoryApi, type ManagedDoctor } from '../../features/manager/directory-api';
import { medicinesApi, type Medicine } from '../../features/manager/medicines-api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/auth-store';
import { appointmentLabel, formatDate, formatTime } from '../../utils/format';
import { validateReception } from '../../utils/reception-validation';

const limit = 10;
const blankReception: ReceptionInput = { appointmentId: 0, initialSymptoms: '', notes: '' };
const blankRecord: MedicalRecordInput = {
  symptoms: '',
  examResult: '',
  conclusion: '',
  treatment: '',
  doctorNotes: '',
  followUpDate: '',
  diseaseId: 0,
  diagnosisNote: '',
  prescriptionNote: '',
  prescriptionItems: [],
};
const vitalFields: Array<[keyof ReceptionInput, string]> = [
  ['weight', 'Cân nặng (kg)'],
  ['height', 'Chiều cao (cm)'],
  ['temperature', 'Nhiệt độ (°C)'],
  ['systolicBloodPressure', 'Huyết áp tâm thu'],
  ['diastolicBloodPressure', 'Huyết áp tâm trương'],
  ['heartRate', 'Nhịp tim'],
  ['spo2', 'SpO2 (%)'],
];

type ModalMode = 'detail' | 'reception' | 'exam' | 'invoice' | 'payment';

function paymentLabel(item: ReceptionItem) {
  if (item.invoice?.status === 'Da thanh toan') return 'Đã thanh toán';
  if (item.invoice?.status === 'Thanh toan mot phan') return 'Thanh toán một phần';
  if (item.invoice) return 'Chưa thanh toán';
  if (['Da kham xong', 'Hoan thanh'].includes(item.status)) return 'Chưa lập hóa đơn';
  return 'Chưa đến bước thanh toán';
}

function paymentTone(item: ReceptionItem) {
  if (item.invoice?.status === 'Da thanh toan') return 'is-active';
  if (item.invoice?.status === 'Thanh toan mot phan') return 'is-inactive';
  return 'is-locked';
}

function formatMoney(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('vi-VN').format(amount)} ₫` : '—';
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Chưa thực hiện';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function VisitTimeline({ item }: { item: ReceptionItem }) {
  const steps = [
    { label: 'Đặt lịch', time: item.bookedAt },
    { label: 'Tiếp nhận', time: item.checkedInAt },
    { label: 'Chờ khám', time: item.checkedInAt },
    { label: 'Đang khám', time: item.examStartedAt },
    { label: 'Hoàn tất khám', time: item.examCompletedAt },
    { label: 'Lập hóa đơn', time: item.invoice?.createdAt },
    { label: 'Thanh toán', time: item.invoice?.lastPaidAt },
    { label: 'Hoàn tất lượt khám', time: item.visitCompletedAt },
  ];
  const completed = steps.filter((step) => Boolean(step.time)).length;
  return (
    <ol className="visit-timeline" aria-label="Tiến trình lượt khám">
      {steps.map((step, index) => (
        <li key={step.label} className={step.time ? 'is-done' : index === completed ? 'is-current' : ''}>
          <span className="visit-timeline__marker">{step.time ? '✓' : index + 1}</span>
          <div><strong>{step.label}</strong><small>{formatDateTime(step.time)}</small></div>
        </li>
      ))}
    </ol>
  );
}

export function ReceptionPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';
  const isDoctor = user?.role === 'DOCTOR';
  const canManagePayments = Boolean(user?.canManagePayments);
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [stats, setStats] = useState<ReceptionStats | null>(null);
  const [doctors, setDoctors] = useState<ManagedDoctor[]>([]);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [selected, setSelected] = useState<ReceptionItem | null>(null);
  const [mode, setMode] = useState<ModalMode>('detail');
  const [receptionForm, setReceptionForm] = useState<ReceptionInput>(blankReception);
  const [recordForm, setRecordForm] = useState<MedicalRecordInput>(blankRecord);
  const [invoiceFee, setInvoiceFee] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Tien mat' as 'Tien mat' | 'Chuyen khoan', idempotencyKey: '', note: '' });
  const [error, setError] = useState('');
  const [receptionErrors, setReceptionErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
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
        paymentStatus: paymentStatus || undefined,
        doctorId: doctorId || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setStats(result.stats);
      setError('');
    } catch (requestError) {
      console.error('[ReceptionPage] Không tải được danh sách quá trình khám', requestError);
      setError(errorMessage(requestError));
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [page, date, search, status, paymentStatus, doctorId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (isManager) directoryApi.allDoctors({}).then(setDoctors).catch(() => setDoctors([]));
    if (isDoctor) {
      clinicalApi.diseases({ page: 1, limit: 100 }).then((result) => setDiseases(result.items)).catch(() => setDiseases([]));
      medicinesApi.listAll({ active: 'true' }).then(setMedicines).catch(() => setMedicines([]));
    }
  }, [isDoctor, isManager]);

  const statCards = useMemo(() => [
    ['Tổng lượt khám', stats?.total],
    ['Chờ tiếp nhận', stats?.awaitingReception],
    ['Đã tiếp nhận / Chờ khám', stats?.waiting],
    ['Đang khám', stats?.inProgress],
    ['Đã khám xong', stats?.examCompleted],
    ['Chưa thanh toán', stats?.unpaid],
    ['Đã hoàn tất', stats?.completed],
  ], [stats]);

  function fillForms(item: ReceptionItem) {
    setReceptionForm({
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
    setRecordForm({
      symptoms: item.medicalRecord?.symptoms || item.reception?.initialSymptoms || '',
      examResult: item.medicalRecord?.examResult || '',
      conclusion: item.medicalRecord?.conclusion || '',
      treatment: item.medicalRecord?.treatment || '',
      doctorNotes: item.medicalRecord?.doctorNotes || '',
      followUpDate: item.medicalRecord?.followUpDate || '',
      diseaseId: Number(item.medicalRecord?.diseaseId || 0),
      diagnosisNote: item.medicalRecord?.diagnosisNote || '',
      prescriptionNote: item.medicalRecord?.prescription?.note || '',
      prescriptionItems: item.medicalRecord?.prescription?.items || [],
    });
    setPaymentForm({
      amount: item.invoice?.balance ? String(item.invoice.balance) : '',
      method: 'Tien mat',
      idempotencyKey: '',
      note: '',
    });
    setInvoiceFee('');
  }

  function open(item: ReceptionItem, nextMode: ModalMode = 'detail') {
    setSelected(item);
    setMode(nextMode);
    fillForms(item);
    setReceptionErrors({});
    setFormError('');
    setNotice('');
  }

  async function refreshSelected(appointmentId: number) {
    const fresh = await clinicalApi.reception(appointmentId);
    setSelected(fresh);
    fillForms(fresh);
    return fresh;
  }

  function setReceptionNumber(key: keyof ReceptionInput, value: string) {
    setReceptionErrors((prev) => ({ ...prev, [key]: '' }));
    setReceptionForm({ ...receptionForm, [key]: value === '' ? undefined : Number(value) });
  }

  async function perform(action: () => Promise<unknown>, success: string, keepOpen = false) {
    setBusy(true);
    setFormError('');
    setNotice('');
    try {
      await action();
      if (selected && keepOpen) await refreshSelected(selected.appointmentId);
      else setSelected(null);
      setNotice(success);
      await load();
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submitReception(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const isNew = !selected.reception;
    const validation = validateReception(receptionForm, isNew);
    if (!validation.isValid) {
      setReceptionErrors(validation.errors);
      setFormError(validation.summaryError);
      if (validation.firstErrorField) {
        document.getElementById(`reception-${validation.firstErrorField}`)?.focus();
      }
      return;
    }
    await perform(
      () => selected.reception
        ? clinicalApi.updateReception(selected.appointmentId, receptionForm)
        : clinicalApi.createReception(receptionForm),
      'Đã lưu thông tin tiếp nhận thành công.',
    );
  }

  async function startExam(item: ReceptionItem) {
    setSelected(item);
    setBusy(true);
    setFormError('');
    try {
      await clinicalApi.startVisit(item.appointmentId);
      const fresh = await refreshSelected(item.appointmentId);
      setMode('exam');
      setNotice('Đã bắt đầu lượt khám.');
      fillForms(fresh);
      await load();
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submitRecord(complete: boolean) {
    if (!selected) return;
    await perform(async () => {
      await clinicalApi.saveMedicalRecord(selected.appointmentId, recordForm);
      if (complete) await clinicalApi.completeVisit(selected.appointmentId);
    }, complete ? 'Đã hoàn tất khám; lượt khám đang chờ lập hóa đơn và thanh toán.' : 'Đã lưu hồ sơ bệnh án.', !complete);
  }

  function addPrescriptionItem() {
    setRecordForm({
      ...recordForm,
      prescriptionItems: [
        ...(recordForm.prescriptionItems || []),
        { medicineId: 0, quantity: 1, dosage: '', frequency: '', days: undefined, route: '', instructions: '' },
      ],
    });
  }

  function updatePrescriptionItem(index: number, patch: Partial<PrescriptionItemInput>) {
    setRecordForm({
      ...recordForm,
      prescriptionItems: (recordForm.prescriptionItems || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
  }

  function removePrescriptionItem(index: number) {
    setRecordForm({ ...recordForm, prescriptionItems: (recordForm.prescriptionItems || []).filter((_, itemIndex) => itemIndex !== index) });
  }

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await perform(() => billingApi.createInvoice(selected.appointmentId, {
      examFee: invoiceFee === '' ? undefined : Number(invoiceFee),
    }), 'Đã lập hóa đơn từ các khoản phí thực tế.', true);
    setMode('detail');
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await perform(() => billingApi.recordPayment(selected.appointmentId, {
      amount: Number(paymentForm.amount),
      method: paymentForm.method,
      idempotencyKey: paymentForm.idempotencyKey.trim(),
      note: paymentForm.note,
    }), 'Đã ghi nhận giao dịch thanh toán.', true);
    setMode('detail');
  }

  const selectedReceptionEditable = false;

  return (
    <main className="manager-page reception-workflow-page">
      <div className="manager-page__heading">
        <div>
          <h1>Giám sát quá trình khám</h1>
          <p>Admin theo dõi trạng thái vận hành; các thao tác xác nhận, check-in và khám bệnh thuộc quyền của bác sĩ phụ trách.</p>
        </div>
      </div>

      <section className="reception-stats" aria-label="Thống kê quá trình khám">
        {statCards.map(([label, value]) => (
          <article key={label} className="reception-stat-card">
            <small>{label}</small>
            <strong>{loading || !stats ? '—' : value}</strong>
          </article>
        ))}
      </section>

      {notice ? <p className="manager-alert is-success" role="status">{notice}</p> : null}
      <section className="manager-card">
        <div className="manager-toolbar reception-toolbar">
          <input aria-label="Lọc theo ngày khám" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} />
          <div className="manager-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Mã lượt khám hoặc tên bệnh nhân" /></div>
          {isManager ? (
            <select aria-label="Lọc theo bác sĩ" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setPage(1); }}>
              <option value="">Tất cả bác sĩ</option>
              {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.hoTen}</option>)}
            </select>
          ) : null}
          <select aria-label="Lọc theo trạng thái khám" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">Tất cả trạng thái khám</option>
            <option value="Cho xac nhan">Chờ xác nhận</option>
            <option value="Da xac nhan">Chờ tiếp nhận</option>
            <option value="Da check-in">Chờ khám</option>
            <option value="Dang kham">Đang khám</option>
            <option value="Da kham xong">Đã khám xong</option>
            <option value="Hoan thanh">Hoàn tất</option>
            <option value="Huy">Đã hủy</option>
          </select>
          <select aria-label="Lọc theo thanh toán" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }}>
            <option value="">Tất cả thanh toán</option>
            <option value="NOT_INVOICED">Chưa lập hóa đơn</option>
            <option value="Chua thanh toan">Chưa thanh toán</option>
            <option value="Thanh toan mot phan">Thanh toán một phần</option>
            <option value="Da thanh toan">Đã thanh toán</option>
          </select>
        </div>
        {loading ? <LoadingState label="Đang tải quá trình khám..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="Không có lượt khám phù hợp" description="Hãy thay đổi bộ lọc hoặc kiểm tra lại phạm vi quyền truy cập." /> : (
          <>
            <div className="manager-table-wrap">
              <table className="manager-table reception-table">
                <thead><tr><th>STT</th><th>Mã lượt khám</th><th>Bệnh nhân</th><th>Bác sĩ</th><th>Ngày giờ khám</th><th>Trạng thái khám</th><th>Thanh toán</th><th>Thao tác</th></tr></thead>
                <tbody>{items.map((item, index) => (
                  <tr key={item.appointmentId}>
                    <td>{(page - 1) * limit + index + 1}</td>
                    <td><span className="manager-code">{item.code}</span></td>
                    <td><strong>{item.patient.name}</strong><small>{item.patient.code} · {item.patient.phone || 'Chưa có SĐT'}</small></td>
                    <td><strong>{item.doctor.name}</strong><small>{item.doctor.specialty?.name || item.doctor.code || 'Chưa phân chuyên khoa'}</small></td>
                    <td><strong>{formatDate(item.date)}</strong><small>{formatTime(item.time)}</small></td>
                    <td><span className="manager-status is-active">{appointmentLabel(item.status)}</span></td>
                    <td><span className={`manager-status ${paymentTone(item)}`}>{paymentLabel(item)}</span></td>
                    <td>
                      <div className="manager-row-actions reception-actions">
                        <button type="button" onClick={() => open(item)}>Chi tiết</button>
                        {isDoctor && item.status === 'Da check-in' ? <button className="is-primary" type="button" disabled={busy} onClick={() => void startExam(item)}>Bắt đầu khám</button> : null}
                        {isDoctor && item.status === 'Dang kham' ? <button className="is-primary" type="button" onClick={() => open(item, 'exam')}>Khám bệnh</button> : null}
                        {canManagePayments && ['Da kham xong', 'Hoan thanh'].includes(item.status) && !item.invoice ? <button className="is-primary" type="button" disabled={busy} onClick={() => open(item, 'invoice')}>Lập hóa đơn</button> : null}
                        {canManagePayments && item.invoice && item.invoice.status !== 'Da thanh toan' ? <button className="is-primary" type="button" onClick={() => open(item, 'payment')}>Thanh toán</button> : null}
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
        <AdminModal title={`${selected.code} – ${selected.patient.name}`} onClose={() => !busy && setSelected(null)}>
          {mode === 'detail' ? (
            <div className="reception-modal-content">
              <dl className="reception-detail is-wide">
                <div><dt>Bệnh nhân</dt><dd>{selected.patient.name} · {selected.patient.code}</dd></div>
                <div><dt>Bác sĩ</dt><dd>{selected.doctor.name}</dd></div>
                <div><dt>Chuyên khoa</dt><dd>{selected.doctor.specialty?.name || '—'}</dd></div>
                <div><dt>Ngày, giờ khám</dt><dd>{formatDate(selected.date)} · {formatTime(selected.time)}</dd></div>
                <div><dt>Trạng thái khám</dt><dd>{appointmentLabel(selected.status)}</dd></div>
                <div><dt>Thanh toán</dt><dd>{paymentLabel(selected)}</dd></div>
                <div className="is-wide"><dt>Lý do khám</dt><dd>{selected.reason || '—'}</dd></div>
              </dl>
              <h3>Tiến trình lượt khám</h3>
              <VisitTimeline item={selected} />
              {selected.medicalRecord ? (
                <section className="reception-summary">
                  <h3>Kết quả khám</h3>
                  <p><strong>Chẩn đoán:</strong> {selected.medicalRecord.diseaseCode} · {selected.medicalRecord.diseaseName}</p>
                  <p><strong>Kết luận:</strong> {selected.medicalRecord.conclusion}</p>
                  <p><strong>Hướng điều trị:</strong> {selected.medicalRecord.treatment}</p>
                </section>
              ) : null}
              {selected.invoice ? (
                <section className="reception-summary invoice-summary">
                  <h3>Hóa đơn {selected.invoice.id}</h3>
                  <dl>
                    <div><dt>Phí khám</dt><dd>{formatMoney(selected.invoice.examFee)}</dd></div>
                    <div><dt>Thuốc đã cấp</dt><dd>{formatMoney(selected.invoice.medicineAmount)}</dd></div>
                    <div><dt>Tổng tiền</dt><dd>{formatMoney(selected.invoice.total)}</dd></div>
                    <div><dt>Đã thanh toán</dt><dd>{formatMoney(selected.invoice.paidAmount)}</dd></div>
                    <div><dt>Còn lại</dt><dd>{formatMoney(selected.invoice.balance)}</dd></div>
                  </dl>
                </section>
              ) : null}
              {formError ? <p className="manager-form__error">{formError}</p> : null}
              <div className="manager-form__actions">
                {isDoctor && selected.status === 'Dang kham' ? <button className="manager-btn--primary" type="button" onClick={() => setMode('exam')}>Mở hồ sơ khám</button> : null}
                {canManagePayments && ['Da kham xong', 'Hoan thanh'].includes(selected.status) && !selected.invoice ? <button className="manager-btn--primary" type="button" onClick={() => setMode('invoice')}>Lập hóa đơn</button> : null}
                {canManagePayments && selected.invoice && selected.invoice.status !== 'Da thanh toan' ? <button className="manager-btn--primary" type="button" onClick={() => setMode('payment')}>Ghi nhận thanh toán</button> : null}
                <button type="button" onClick={() => setSelected(null)}>Đóng</button>
              </div>
            </div>
          ) : null}

          {mode === 'reception' ? (
            <form className="manager-form" onSubmit={submitReception} noValidate>
              {!selected?.reception ? <p className="doctor-modal-intro is-wide">Vui lòng nhập đầy đủ các thông tin bắt buộc (*) trước khi xác nhận tiếp nhận.</p> : null}
              {vitalFields.map(([key, label]) => {
                const isRequired = !selected?.reception;
                return (
                  <label key={key}>
                    <span>{label} {isRequired ? <span className="required-star">*</span> : null}</span>
                    <input
                      id={`reception-${key}`}
                      className={receptionErrors[key] ? 'input-has-error' : ''}
                      disabled={!selectedReceptionEditable}
                      type="number"
                      step={['heartRate', 'systolicBloodPressure', 'diastolicBloodPressure'].includes(key) ? '1' : '0.1'}
                      value={String(receptionForm[key] ?? '')}
                      onChange={(event) => setReceptionNumber(key, event.target.value)}
                    />
                    {receptionErrors[key] ? <span className="field-error">{receptionErrors[key]}</span> : null}
                  </label>
                );
              })}
              <label className="is-wide">
                <span>Triệu chứng ban đầu {!selected?.reception ? <span className="required-star">*</span> : null}</span>
                <textarea
                  id="reception-initialSymptoms"
                  className={receptionErrors.initialSymptoms ? 'input-has-error' : ''}
                  disabled={!selectedReceptionEditable}
                  rows={3}
                  value={receptionForm.initialSymptoms || ''}
                  onChange={(event) => {
                    setReceptionErrors((prev) => ({ ...prev, initialSymptoms: '' }));
                    setReceptionForm({ ...receptionForm, initialSymptoms: event.target.value });
                  }}
                />
                {receptionErrors.initialSymptoms ? <span className="field-error">{receptionErrors.initialSymptoms}</span> : null}
              </label>
              <label className="is-wide">
                <span>Ghi chú tiếp nhận</span>
                <textarea
                  id="reception-notes"
                  className={receptionErrors.notes ? 'input-has-error' : ''}
                  disabled={!selectedReceptionEditable}
                  rows={3}
                  value={receptionForm.notes || ''}
                  onChange={(event) => {
                    setReceptionErrors((prev) => ({ ...prev, notes: '' }));
                    setReceptionForm({ ...receptionForm, notes: event.target.value });
                  }}
                />
                {receptionErrors.notes ? <span className="field-error">{receptionErrors.notes}</span> : null}
              </label>
              {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
              <div className="manager-form__actions is-wide">
                <button type="button" onClick={() => setMode('detail')}>Quay lại</button>
                <button className="manager-btn--primary" disabled={busy || !selectedReceptionEditable}>{busy ? 'Đang lưu...' : 'Lưu tiếp nhận'}</button>
              </div>
            </form>
          ) : null}

          {mode === 'exam' ? (
            <form className="manager-form" onSubmit={(event) => { event.preventDefault(); void submitRecord(false); }}>
              <label className="is-wide"><span>Triệu chứng *</span><textarea required rows={3} value={recordForm.symptoms} onChange={(event) => setRecordForm({ ...recordForm, symptoms: event.target.value })} /></label>
              <label className="is-wide"><span>Kết quả khám *</span><textarea required rows={3} value={recordForm.examResult} onChange={(event) => setRecordForm({ ...recordForm, examResult: event.target.value })} /></label>
              <label className="is-wide"><span>Chẩn đoán chính *</span><select required value={recordForm.diseaseId || ''} onChange={(event) => setRecordForm({ ...recordForm, diseaseId: Number(event.target.value) })}><option value="">Chọn bệnh từ danh mục</option>{diseases.map((disease) => <option key={disease.id} value={disease.id}>{disease.code} · {disease.name}</option>)}</select></label>
              <label className="is-wide"><span>Ghi chú chẩn đoán</span><textarea rows={2} value={recordForm.diagnosisNote || ''} onChange={(event) => setRecordForm({ ...recordForm, diagnosisNote: event.target.value })} /></label>
              <label className="is-wide"><span>Kết luận *</span><textarea required rows={3} value={recordForm.conclusion} onChange={(event) => setRecordForm({ ...recordForm, conclusion: event.target.value })} /></label>
              <label className="is-wide"><span>Hướng điều trị *</span><textarea required rows={3} value={recordForm.treatment} onChange={(event) => setRecordForm({ ...recordForm, treatment: event.target.value })} /></label>
              <label><span>Ngày tái khám</span><input type="date" value={recordForm.followUpDate || ''} onChange={(event) => setRecordForm({ ...recordForm, followUpDate: event.target.value })} /></label>
              <label><span>Ghi chú bác sĩ</span><input value={recordForm.doctorNotes || ''} onChange={(event) => setRecordForm({ ...recordForm, doctorNotes: event.target.value })} /></label>
              <section className="prescription-editor is-wide">
                <div className="prescription-editor__heading"><div><strong>Đơn thuốc</strong><small>Đơn kê không tự động được tính là thuốc đã xuất bán.</small></div><button type="button" onClick={addPrescriptionItem}>＋ Thêm thuốc</button></div>
                {(recordForm.prescriptionItems || []).length === 0 ? <p>Không kê thuốc cho lượt khám này.</p> : (recordForm.prescriptionItems || []).map((item, index) => (
                  <div className="prescription-row" key={`${index}-${item.medicineId}`}>
                    <select required value={item.medicineId || ''} onChange={(event) => updatePrescriptionItem(index, { medicineId: Number(event.target.value) })}><option value="">Chọn thuốc</option>{medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} {medicine.strength ? `· ${medicine.strength}` : ''}</option>)}</select>
                    <input required aria-label="Số lượng" type="number" min="1" value={item.quantity} onChange={(event) => updatePrescriptionItem(index, { quantity: Number(event.target.value) })} placeholder="Số lượng" />
                    <input aria-label="Liều dùng" value={item.dosage || ''} onChange={(event) => updatePrescriptionItem(index, { dosage: event.target.value })} placeholder="Liều dùng" />
                    <input aria-label="Tần suất" value={item.frequency || ''} onChange={(event) => updatePrescriptionItem(index, { frequency: event.target.value })} placeholder="Tần suất" />
                    <input aria-label="Số ngày" type="number" min="1" value={item.days ?? ''} onChange={(event) => updatePrescriptionItem(index, { days: event.target.value ? Number(event.target.value) : undefined })} placeholder="Số ngày" />
                    <input aria-label="Hướng dẫn" value={item.instructions || ''} onChange={(event) => updatePrescriptionItem(index, { instructions: event.target.value })} placeholder="Hướng dẫn sử dụng" />
                    <button type="button" className="is-danger" onClick={() => removePrescriptionItem(index)}>Xóa</button>
                  </div>
                ))}
                <textarea rows={2} value={recordForm.prescriptionNote || ''} onChange={(event) => setRecordForm({ ...recordForm, prescriptionNote: event.target.value })} placeholder="Ghi chú chung cho đơn thuốc" />
              </section>
              {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
              <div className="manager-form__actions is-wide"><button type="button" onClick={() => setMode('detail')}>Quay lại</button><button disabled={busy}>Lưu hồ sơ</button><button className="manager-btn--primary" type="button" disabled={busy} onClick={() => void submitRecord(true)}>{busy ? 'Đang xử lý...' : 'Lưu & hoàn tất khám'}</button></div>
            </form>
          ) : null}

          {mode === 'invoice' ? (
            <form className="manager-form" onSubmit={createInvoice}>
              <dl className="reception-detail is-wide">
                <div><dt>Lượt khám</dt><dd>{selected.code}</dd></div>
                <div><dt>Bệnh nhân</dt><dd>{selected.patient.name}</dd></div>
                <div><dt>Thuốc tính tiền</dt><dd>Chỉ thuốc đã có giao dịch xuất kho</dd></div>
                <div><dt>Dịch vụ phát sinh</dt><dd>Chưa có module dịch vụ trong hệ thống</dd></div>
              </dl>
              <label className="is-wide"><span>Phí khám thực tế *</span><input required type="number" min="0" step="0.01" value={invoiceFee} onChange={(event) => setInvoiceFee(event.target.value)} placeholder="Nhập mức phí đã được cơ sở y tế xác nhận" /></label>
              <p className="manager-form__hint is-wide">Mức phí này được lưu vào hồ sơ khám. Hệ thống không tự đặt giá; tiền thuốc được tính riêng từ số lượng đã xuất kho thực tế.</p>
              {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
              <div className="manager-form__actions is-wide"><button type="button" onClick={() => setMode('detail')}>Quay lại</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lập...' : 'Xác nhận lập hóa đơn'}</button></div>
            </form>
          ) : null}

          {mode === 'payment' ? (
            <form className="manager-form" onSubmit={submitPayment}>
              <dl className="reception-detail is-wide"><div><dt>Hóa đơn</dt><dd>{selected.invoice?.id}</dd></div><div><dt>Còn phải thu</dt><dd>{formatMoney(selected.invoice?.balance)}</dd></div></dl>
              <label><span>Số tiền thu *</span><input required type="number" min="0.01" step="0.01" max={selected.invoice?.balance} value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></label>
              <label><span>Phương thức *</span><select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value as 'Tien mat' | 'Chuyen khoan' })}><option value="Tien mat">Tiền mặt</option><option value="Chuyen khoan">Chuyển khoản đã đối soát</option></select></label>
              <label className="is-wide"><span>Mã tham chiếu giao dịch *</span><input required maxLength={100} value={paymentForm.idempotencyKey} onChange={(event) => setPaymentForm({ ...paymentForm, idempotencyKey: event.target.value })} placeholder="Ví dụ: TM-20261014-0001 hoặc mã ngân hàng đã đối soát" /></label>
              <label className="is-wide"><span>Ghi chú</span><textarea rows={2} value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></label>
              <p className="manager-form__hint is-wide">Chọn chuyển khoản chỉ ghi nhận giao dịch đã được nhân sự đối soát thực tế; hệ thống không tự giả lập thanh toán thành công.</p>
              {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
              <div className="manager-form__actions is-wide"><button type="button" onClick={() => setMode('detail')}>Quay lại</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang ghi nhận...' : 'Xác nhận đã thu'}</button></div>
            </form>
          ) : null}
        </AdminModal>
      ) : null}
    </main>
  );
}
