import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import {
  clinicalApi,
  type Disease,
  type MedicalRecordInput,
  type PrescriptionItemInput,
  type ReceptionInput,
  type ReceptionItem,
  type ReceptionTabs,
} from '../../features/clinical/api';
import { medicinesApi, type Medicine } from '../../features/manager/medicines-api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const pageSize = 10;
type ExamStage = 'EXAM_WAITING' | 'EXAM_IN_PROGRESS' | 'EXAM_COMPLETED';
type DialogMode = 'checkin' | 'exam' | 'detail';
const emptyTabs: ReceptionTabs = { pending: 0, confirmed: 0, cancelled: 0, waiting: 0, inProgress: 0, completed: 0 };
const emptyReception: ReceptionInput = { appointmentId: 0, initialSymptoms: '', notes: '' };
const emptyRecord: MedicalRecordInput = { symptoms: '', examResult: '', conclusion: '', treatment: '', doctorNotes: '', followUpDate: '', diseaseId: 0, diagnosisNote: '', prescriptionNote: '', prescriptionItems: [] };
const vitalFields: Array<[keyof ReceptionInput, string, string]> = [
  ['temperature', 'Nhiệt độ', '°C'],
  ['systolicBloodPressure', 'Huyết áp tâm thu', 'mmHg'],
  ['diastolicBloodPressure', 'Huyết áp tâm trương', 'mmHg'],
  ['heartRate', 'Nhịp tim', 'bpm'],
  ['spo2', 'SpO₂', '%'],
  ['weight', 'Cân nặng', 'kg'],
  ['height', 'Chiều cao', 'cm'],
];

function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function displayDateTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
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

function insurance(item: ReceptionItem) {
  return item.patient.hasInsurance ? `BHYT: ${item.patient.insuranceNumber || 'Có BHYT'}` : 'Dịch vụ tự nguyện';
}

export function DoctorExaminationPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(vietnamToday);
  const [stage, setStage] = useState<ExamStage>('EXAM_WAITING');
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [scheduledItems, setScheduledItems] = useState<ReceptionItem[]>([]);
  const [tabs, setTabs] = useState<ReceptionTabs>(emptyTabs);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ReceptionItem | null>(null);
  const [mode, setMode] = useState<DialogMode>('detail');
  const [receptionForm, setReceptionForm] = useState<ReceptionInput>(emptyReception);
  const [recordForm, setRecordForm] = useState<MedicalRecordInput>(emptyRecord);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, scheduled] = await Promise.all([
        clinicalApi.receptions({ page, limit: pageSize, date, stage, search: search || undefined }),
        clinicalApi.receptions({ page: 1, limit: 100, date, stage: 'EXAM_SCHEDULED', search: search || undefined }),
      ]);
      setItems(result.items);
      setScheduledItems(scheduled.items);
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
  useEffect(() => {
    clinicalApi.diseases({ page: 1, limit: 100 }).then((result) => setDiseases(result.items)).catch(() => setDiseases([]));
    medicinesApi.list({ page: 1, limit: 100, active: 'true' }).then((result) => setMedicines(result.items)).catch(() => setMedicines([]));
  }, []);

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
      initialSymptoms: item.reception?.initialSymptoms || item.reason || '',
      notes: item.reception?.notes || '',
    });
    setRecordForm({
      symptoms: item.medicalRecord?.symptoms || item.reception?.initialSymptoms || item.reason || '',
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
  }

  async function open(item: ReceptionItem, nextMode: DialogMode) {
    setBusy(true);
    setFormError('');
    try {
      const fresh = await clinicalApi.reception(item.appointmentId);
      setSelected(fresh);
      fillForms(fresh);
      setMode(nextMode);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function moveDate(amount: number) {
    setDate((current) => addDays(current, amount));
    setPage(1);
  }

  function setReceptionNumber(key: keyof ReceptionInput, value: string) {
    setReceptionForm((current) => ({ ...current, [key]: value === '' ? undefined : Number(value) }));
  }

  async function checkIn(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setFormError('');
    try {
      if (selected.reception) await clinicalApi.updateReception(selected.appointmentId, receptionForm);
      else await clinicalApi.createReception(receptionForm);
      setNotice(`Đã xác nhận ${selected.patient.name} có mặt và đưa vào hàng chờ khám.`);
      setSelected(null);
      await load();
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function start(item: ReceptionItem) {
    setBusy(true);
    setFormError('');
    try {
      await clinicalApi.startVisit(item.appointmentId);
      navigate(`/doctor/examinations/${item.appointmentId}`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecord(complete: boolean) {
    if (!selected) return;
    setBusy(true);
    setFormError('');
    try {
      await clinicalApi.saveMedicalRecord(selected.appointmentId, recordForm);
      if (complete) {
        await clinicalApi.completeVisit(selected.appointmentId);
        setSelected(null);
        setNotice('Đã hoàn tất khám. Lượt khám đang chờ bộ phận có quyền thanh toán xử lý.');
      } else {
        const fresh = await clinicalApi.reception(selected.appointmentId);
        setSelected(fresh);
        fillForms(fresh);
        setNotice('Đã lưu bản nháp hồ sơ bệnh án.');
      }
      await load();
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function addPrescriptionItem() {
    setRecordForm((current) => ({ ...current, prescriptionItems: [...(current.prescriptionItems || []), { medicineId: 0, quantity: 1 }] }));
  }

  function updatePrescriptionItem(index: number, patch: Partial<PrescriptionItemInput>) {
    setRecordForm((current) => ({ ...current, prescriptionItems: (current.prescriptionItems || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }

  function removePrescriptionItem(index: number) {
    setRecordForm((current) => ({ ...current, prescriptionItems: (current.prescriptionItems || []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  const tabItems: Array<{ key: ExamStage; label: string; count: number }> = [
    { key: 'EXAM_WAITING', label: 'Chờ khám', count: tabs.waiting },
    { key: 'EXAM_IN_PROGRESS', label: 'Đang khám', count: tabs.inProgress },
    { key: 'EXAM_COMPLETED', label: 'Đã hoàn thành', count: tabs.completed },
  ];

  return (
    <main className="doctor-workflow-page doctor-examination-page">
      <header className="doctor-workflow-heading doctor-exam-heading">
        <div><h1>Khám bệnh</h1><p>Quản lý bệnh nhân chờ khám, đang khám và đã hoàn thành trong ngày.</p></div>
        <div className="doctor-date-bar is-compact">
          <button type="button" aria-label="Ngày trước" onClick={() => moveDate(-1)}>‹</button>
          <button type="button" className="doctor-date-today" onClick={() => { setDate(vietnamToday()); setPage(1); }}><span aria-hidden="true">▣</span> {date === vietnamToday() ? 'Hôm nay' : 'Ngày khám'}: {displayDate(date)}</button>
          <button type="button" aria-label="Ngày sau" onClick={() => moveDate(1)}>›</button>
        </div>
      </header>

      <section className="doctor-workflow-panel">
        <div className="doctor-workflow-controls">
          <div className="doctor-workflow-tabs" role="tablist" aria-label="Trạng thái khám">
            {tabItems.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={stage === tab.key} className={stage === tab.key ? 'is-active' : ''} onClick={() => { setStage(tab.key); setPage(1); }}>{tab.label}<b>{tab.count}</b></button>)}
          </div>
          <label className="doctor-workflow-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm tên, mã hoặc SĐT bệnh nhân..." /></label>
        </div>
      </section>

      {notice ? <p className="doctor-workflow-notice" role="status">{notice}</p> : null}
      {!loading && !error && stage === 'EXAM_WAITING' && scheduledItems.length > 0 ? (
        <section className="doctor-scheduled-section" aria-label="Lịch đã xác nhận, chờ bệnh nhân đến">
          <header><div><h2>Lịch đã xác nhận, chờ bệnh nhân đến</h2><p>Các lịch này chưa nằm trong hàng chờ khám cho đến khi bạn xác nhận bệnh nhân có mặt.</p></div><b>{scheduledItems.length}</b></header>
          <div>
            {scheduledItems.map((item) => {
              const age = ageAt(item.patient.birthDate, item.date);
              return <article key={item.appointmentId} className="doctor-scheduled-card"><div className="doctor-time-block"><strong>{item.time.slice(0, 5)}</strong><span>{shift(item.time)}</span></div><div><h3>{item.patient.name} <em>{item.visitType === 'Tai kham' ? 'Tái khám' : 'Khám lần đầu'}</em></h3><p>{item.patient.code} · {item.patient.gender || 'Chưa rõ'}{age !== null ? ` · ${age} tuổi` : ''} · {item.patient.phone || 'Chưa có SĐT'}</p><small><b>Lý do khám:</b> {item.reason || 'Không ghi nhận lý do.'}</small></div><button type="button" disabled={busy} onClick={() => void open(item, 'checkin')}>✓ Xác nhận có mặt</button></article>;
            })}
          </div>
        </section>
      ) : null}
      {loading ? <LoadingState label="Đang tải danh sách khám..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? (
        <EmptyState title="Không có bệnh nhân trong mục này" description={`Danh sách ngày ${displayDate(date)} hiện đang trống.`} />
      ) : (
        <section className="doctor-appointment-list doctor-exam-list">
          {items.map((item) => {
            const age = ageAt(item.patient.birthDate, item.date);
            const checkedIn = item.status === 'Da check-in';
            const inProgress = item.status === 'Dang kham';
            const completed = ['Da kham xong', 'Hoan thanh'].includes(item.status);
            return (
              <article className={`doctor-appointment-card doctor-exam-card ${inProgress ? 'is-current' : checkedIn ? 'is-ready' : completed ? 'is-complete' : 'is-not-arrived'}`} key={item.appointmentId}>
                {inProgress ? <div className="doctor-room-strip"><b>ĐANG TRONG LƯỢT KHÁM</b><span>{item.examStartedAt ? `Bắt đầu lúc ${displayDateTime(item.examStartedAt)}` : ''}</span></div> : null}
                <div className="doctor-exam-card-content">
                  <div className="doctor-time-block"><strong>{item.time.slice(0, 5)}</strong><span>{shift(item.time)}</span></div>
                  <div className="doctor-appointment-body">
                    <div className="doctor-patient-line">
                      <span className="doctor-patient-avatar">{initials(item.patient.name)}</span>
                      <div><h2>{item.patient.name} <em>{item.visitType === 'Tai kham' ? 'Tái khám' : 'Khám lần đầu'}</em></h2><p>{item.patient.code} · {item.patient.gender || 'Chưa rõ'}{age !== null ? ` · ${age} tuổi` : ''} · {item.patient.phone || 'Chưa có SĐT'} · {insurance(item)}</p></div>
                      <span className={`doctor-checkin-chip ${checkedIn ? 'is-checked' : inProgress ? 'is-progress' : completed ? 'is-complete' : ''}`}>
                        {checkedIn ? `Đã check-in ${displayDateTime(item.checkedInAt)}` : inProgress ? 'Đang khám' : completed ? 'Đã hoàn thành' : 'Chưa check-in'}
                      </span>
                    </div>
                    <p className="doctor-reason"><b>Lý do khám:</b> {item.reason || 'Không ghi nhận lý do.'}</p>
                    {item.reception ? <div className="doctor-vitals"><span>Nhiệt độ: <b>{item.reception.temperature ?? '—'}°C</b></span><span>Huyết áp: <b>{item.reception.systolicBloodPressure ?? '—'}/{item.reception.diastolicBloodPressure ?? '—'} mmHg</b></span><span>Nhịp tim: <b>{item.reception.heartRate ?? '—'} bpm</b></span><span>SpO₂: <b>{item.reception.spo2 ?? '—'}%</b></span></div> : null}
                  </div>
                  <div className="doctor-card-actions">
                    {checkedIn ? <button type="button" className="is-start" disabled={busy} onClick={() => void start(item)}>▶ Bắt đầu khám</button> : null}
                    {inProgress ? <button type="button" className="is-start" disabled={busy} onClick={() => navigate(`/doctor/examinations/${item.appointmentId}`)}>Tiếp tục khám →</button> : null}
                    {completed ? <button type="button" className="is-view" disabled={busy} onClick={() => navigate(`/doctor/examinations/${item.appointmentId}`)}>Xem kết quả</button> : null}
                  </div>
                </div>
              </article>
            );
          })}
          <ManagerPager page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </section>
      )}

      {selected ? (
        <AdminModal title={`${selected.code} – ${selected.patient.name}`} onClose={() => { if (!busy) setSelected(null); }}>
          {mode === 'checkin' ? (
            <form className="manager-form doctor-clinical-form" onSubmit={checkIn}>
              <p className="doctor-modal-intro is-wide">Chỉ xác nhận có mặt khi bệnh nhân đã thực sự đến cơ sở khám. Các chỉ số sinh tồn có thể bổ sung ngay hoặc cập nhật khi đang khám.</p>
              {vitalFields.map(([key, label, unit]) => <label key={key}><span>{label} ({unit})</span><input type="number" step="0.1" min="0" value={String(receptionForm[key] ?? '')} onChange={(event) => setReceptionNumber(key, event.target.value)} /></label>)}
              <label className="is-wide"><span>Triệu chứng ban đầu</span><textarea rows={3} value={receptionForm.initialSymptoms || ''} onChange={(event) => setReceptionForm({ ...receptionForm, initialSymptoms: event.target.value })} /></label>
              <label className="is-wide"><span>Ghi chú tiếp nhận</span><textarea rows={2} value={receptionForm.notes || ''} onChange={(event) => setReceptionForm({ ...receptionForm, notes: event.target.value })} /></label>
              {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
              <div className="manager-form__actions is-wide"><button type="button" disabled={busy} onClick={() => setSelected(null)}>Hủy</button><button className="manager-btn--primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Xác nhận bệnh nhân có mặt'}</button></div>
            </form>
          ) : null}

          {mode === 'exam' ? (
            <form className="manager-form doctor-clinical-form" onSubmit={(event) => { event.preventDefault(); void saveRecord(false); }}>
              <div className="doctor-modal-patient is-wide"><span className="doctor-patient-avatar">{initials(selected.patient.name)}</span><div><strong>{selected.patient.name}</strong><small>{selected.patient.code} · {insurance(selected)}</small></div></div>
              <label className="is-wide"><span>Triệu chứng *</span><textarea required rows={3} value={recordForm.symptoms} onChange={(event) => setRecordForm({ ...recordForm, symptoms: event.target.value })} /></label>
              <label className="is-wide"><span>Kết quả khám *</span><textarea required rows={3} value={recordForm.examResult} onChange={(event) => setRecordForm({ ...recordForm, examResult: event.target.value })} /></label>
              <label className="is-wide"><span>Chẩn đoán chính *</span><select required value={recordForm.diseaseId || ''} onChange={(event) => setRecordForm({ ...recordForm, diseaseId: Number(event.target.value) })}><option value="">Chọn bệnh từ danh mục</option>{diseases.map((disease) => <option key={disease.id} value={disease.id}>{disease.code} · {disease.name}</option>)}</select></label>
              <label className="is-wide"><span>Ghi chú chẩn đoán</span><textarea rows={2} value={recordForm.diagnosisNote || ''} onChange={(event) => setRecordForm({ ...recordForm, diagnosisNote: event.target.value })} /></label>
              <label className="is-wide"><span>Kết luận *</span><textarea required rows={3} value={recordForm.conclusion} onChange={(event) => setRecordForm({ ...recordForm, conclusion: event.target.value })} /></label>
              <label className="is-wide"><span>Hướng điều trị *</span><textarea required rows={3} value={recordForm.treatment} onChange={(event) => setRecordForm({ ...recordForm, treatment: event.target.value })} /></label>
              <label><span>Ngày tái khám</span><input type="date" value={recordForm.followUpDate || ''} onChange={(event) => setRecordForm({ ...recordForm, followUpDate: event.target.value })} /></label>
              <label><span>Ghi chú bác sĩ</span><input value={recordForm.doctorNotes || ''} onChange={(event) => setRecordForm({ ...recordForm, doctorNotes: event.target.value })} /></label>
              <section className="prescription-editor is-wide">
                <div className="prescription-editor__heading"><div><strong>Đơn thuốc</strong><small>Kê thuốc theo dữ liệu thực tế; không tự động ghi nhận xuất kho.</small></div><button type="button" onClick={addPrescriptionItem}>＋ Thêm thuốc</button></div>
                {(recordForm.prescriptionItems || []).length === 0 ? <p>Không kê thuốc cho lượt khám này.</p> : (recordForm.prescriptionItems || []).map((item, index) => (
                  <div className="prescription-row" key={`${index}-${item.medicineId}`}>
                    <select required value={item.medicineId || ''} onChange={(event) => updatePrescriptionItem(index, { medicineId: Number(event.target.value) })}><option value="">Chọn thuốc</option>{medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} {medicine.strength ? `· ${medicine.strength}` : ''}</option>)}</select>
                    <input required aria-label="Số lượng" type="number" min="1" value={item.quantity} onChange={(event) => updatePrescriptionItem(index, { quantity: Number(event.target.value) })} placeholder="Số lượng" />
                    <input aria-label="Liều dùng" value={item.dosage || ''} onChange={(event) => updatePrescriptionItem(index, { dosage: event.target.value })} placeholder="Liều dùng" />
                    <input aria-label="Tần suất" value={item.frequency || ''} onChange={(event) => updatePrescriptionItem(index, { frequency: event.target.value })} placeholder="Tần suất" />
                    <input aria-label="Số ngày" type="number" min="1" value={item.days ?? ''} onChange={(event) => updatePrescriptionItem(index, { days: event.target.value ? Number(event.target.value) : undefined })} placeholder="Số ngày" />
                    <input aria-label="Hướng dẫn" value={item.instructions || ''} onChange={(event) => updatePrescriptionItem(index, { instructions: event.target.value })} placeholder="Hướng dẫn" />
                    <button type="button" className="is-danger" onClick={() => removePrescriptionItem(index)}>Xóa</button>
                  </div>
                ))}
                <textarea rows={2} value={recordForm.prescriptionNote || ''} onChange={(event) => setRecordForm({ ...recordForm, prescriptionNote: event.target.value })} placeholder="Ghi chú chung cho đơn thuốc" />
              </section>
              {formError ? <p className="manager-form__error is-wide">{formError}</p> : null}
              <div className="manager-form__actions is-wide"><button type="button" disabled={busy} onClick={() => setSelected(null)}>Đóng</button><button disabled={busy}>Lưu hồ sơ</button><button className="manager-btn--primary" type="button" disabled={busy} onClick={() => void saveRecord(true)}>{busy ? 'Đang xử lý...' : 'Lưu & hoàn tất khám'}</button></div>
            </form>
          ) : null}

          {mode === 'detail' ? (
            <div className="doctor-result-detail">
              <dl><div><dt>Ngày giờ khám</dt><dd>{displayDate(selected.date)} · {selected.time.slice(0, 5)}</dd></div><div><dt>Trạng thái</dt><dd>{selected.status === 'Hoan thanh' ? 'Đã hoàn tất lượt khám' : 'Đã khám xong, chờ thanh toán'}</dd></div><div className="is-wide"><dt>Triệu chứng</dt><dd>{selected.medicalRecord?.symptoms || '—'}</dd></div><div className="is-wide"><dt>Kết quả khám</dt><dd>{selected.medicalRecord?.examResult || '—'}</dd></div><div><dt>Chẩn đoán</dt><dd>{selected.medicalRecord?.diseaseCode} · {selected.medicalRecord?.diseaseName || '—'}</dd></div><div><dt>Ngày tái khám</dt><dd>{selected.medicalRecord?.followUpDate || '—'}</dd></div><div className="is-wide"><dt>Kết luận</dt><dd>{selected.medicalRecord?.conclusion || '—'}</dd></div><div className="is-wide"><dt>Hướng điều trị</dt><dd>{selected.medicalRecord?.treatment || '—'}</dd></div></dl>
              <div className="manager-form__actions"><button type="button" onClick={() => setSelected(null)}>Đóng</button></div>
            </div>
          ) : null}
        </AdminModal>
      ) : null}
    </main>
  );
}
