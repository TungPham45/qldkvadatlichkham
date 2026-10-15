import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import {
  clinicalApi,
  type ClinicalServiceCatalogItem,
  type ClinicalServiceOrder,
  type Disease,
  type MedicalRecordInput,
  type PrescriptionItemInput,
  type ReceptionInput,
  type ReceptionItem,
} from '../../features/clinical/api';
import { medicinesApi, type Medicine } from '../../features/manager/medicines-api';
import { appointmentLabel, genderLabel } from '../../utils/format';

type RecordField = 'symptoms' | 'examResult' | 'conclusion' | 'treatment' | 'diseaseId';

const emptyRecord: MedicalRecordInput = {
  symptoms: '',
  onset: '',
  diseaseProgress: '',
  postTreatmentProgress: '',
  examResult: '',
  conclusion: '',
  treatment: '',
  careAdvice: '',
  doctorNotes: '',
  followUpDate: '',
  diseaseId: undefined,
  secondaryDiseaseIds: [],
  diagnosisNote: '',
  noClinicalServices: false,
  noPrescription: false,
  prescriptionLocked: false,
  prescriptionNote: '',
  prescriptionItems: [],
};

function money(value: string | number) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
}

function dateTime(value: string | null | undefined) {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function age(date: string | null | undefined) {
  if (!date) return 'Chưa ghi nhận';
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const today = new Date();
  let value = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    value -= 1;
  }
  return value >= 0 ? `${value} tuổi` : 'Chưa ghi nhận';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function includesTerm(values: Array<string | null | undefined>, term: string) {
  const normalized = term.trim().toLocaleLowerCase('vi-VN');
  return !normalized || values.some((value) => value?.toLocaleLowerCase('vi-VN').includes(normalized));
}

export function DoctorVisitDetailPage() {
  const id = Number(useParams().appointmentId);
  const navigate = useNavigate();

  const [visit, setVisit] = useState<ReceptionItem | null>(null);
  const [orders, setOrders] = useState<ClinicalServiceOrder[]>([]);
  const [catalog, setCatalog] = useState<ClinicalServiceCatalogItem[]>([]);
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [record, setRecord] = useState<MedicalRecordInput>(emptyRecord);
  const [vitals, setVitals] = useState<ReceptionInput>({ appointmentId: id });

  // Form states
  const [serviceId, setServiceId] = useState(0);
  const [servicePurpose, setServicePurpose] = useState('');
  const [priority, setPriority] = useState<'Thuong' | 'Khan'>('Thuong');
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);

  // Search filters
  const [serviceSearch, setServiceSearch] = useState('');
  const [diseaseSearch, setDiseaseSearch] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RecordField, string>>>({});
  const [showClinicalPanel, setShowClinicalPanel] = useState(false);

  const fill = useCallback((item: ReceptionItem) => {
    const medical = item.medicalRecord;
    setVisit(item);
    setVitals({
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
    setRecord(
      medical
        ? {
            symptoms: medical.symptoms || '',
            onset: medical.onset || '',
            diseaseProgress: medical.diseaseProgress || '',
            postTreatmentProgress: medical.postTreatmentProgress || '',
            examResult: medical.examResult || '',
            conclusion: medical.conclusion || '',
            treatment: medical.treatment || '',
            careAdvice: medical.careAdvice || '',
            doctorNotes: medical.doctorNotes || '',
            followUpDate: medical.followUpDate ? medical.followUpDate.slice(0, 10) : '',
            diseaseId: Number(medical.diseaseId || 0) || undefined,
            secondaryDiseaseIds: (medical.diagnoses || [])
              .filter((diagnosis) => !diagnosis.primary)
              .map((diagnosis) => diagnosis.id),
            diagnosisNote: medical.diagnosisNote || '',
            noClinicalServices: Boolean(medical.noClinicalServices),
            noPrescription: Boolean(medical.noPrescription),
            prescriptionLocked: medical.prescription?.status === 'Da khoa',
            prescriptionNote: medical.prescription?.note || '',
            prescriptionItems: (medical.prescription?.items || []).map((item) => ({
              ...item,
              quantity: item.quantity || 1,
            })),
          }
        : {
            ...emptyRecord,
            symptoms: item.reception?.initialSymptoms || item.reason || '',
          },
    );
    // Panel chỉ định chỉ mở khi đang dùng CLS (chưa skip).
    setShowClinicalPanel(Boolean(medical && !medical.noClinicalServices));
  }, []);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id < 1) {
      setError('Mã lượt khám không hợp lệ.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [receptionRes, ordersRes, catalogRes, diseaseRes, medicineRes] = await Promise.allSettled([
        clinicalApi.reception(id),
        clinicalApi.clinicalOrders(id),
        clinicalApi.clinicalCatalog(),
        clinicalApi.diseases({ page: 1, limit: 100 }),
        medicinesApi.list({ page: 1, limit: 100, active: 'true' }),
      ]);

      if (receptionRes.status === 'rejected') {
        throw receptionRes.reason;
      }

      fill(receptionRes.value);

      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value);
      if (catalogRes.status === 'fulfilled') setCatalog(catalogRes.value);
      if (diseaseRes.status === 'fulfilled') setDiseases(diseaseRes.value.items);
      if (medicineRes.status === 'fulfilled') setMedicines(medicineRes.value.items);

      setError('');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [fill, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = visit?.status === 'Dang kham';
  const prescriptionLocked = record.prescriptionLocked === true;
  const professionallyFinished = Boolean(visit && ['Da kham xong', 'Hoan thanh'].includes(visit.status));
  const activeOrders = orders.filter((order) => order.status !== 'Huy');
  const clinicalSkipped = Boolean(record.noClinicalServices) && activeOrders.length === 0;
  const resultReady =
    professionallyFinished ||
    clinicalSkipped ||
    Boolean(record.noClinicalServices) ||
    (activeOrders.length > 0 &&
      activeOrders.every((order) => ['Da co ket qua', 'Da xem ket qua'].includes(order.status)));
  const prescriptionDone = professionallyFinished || Boolean(record.noPrescription) || prescriptionLocked;
  const invoicePaid = visit?.invoice?.status === 'Da thanh toan';

  const bmi =
    Number(vitals.weight) > 0 && Number(vitals.height) > 0
      ? (Number(vitals.weight) / ((Number(vitals.height) / 100) ** 2)).toFixed(1)
      : 'Chưa ghi nhận';

  const filteredCatalog = useMemo(
    () =>
      catalog.filter((item) =>
        includesTerm([item.code, item.name, item.group, item.performingUnit], serviceSearch),
      ),
    [catalog, serviceSearch],
  );

  const filteredDiseases = useMemo(
    () => diseases.filter((item) => includesTerm([item.code, item.name, item.group], diseaseSearch)),
    [diseases, diseaseSearch],
  );

  const filteredMedicines = useMemo(
    () =>
      medicines.filter((item) =>
        includesTerm(
          [item.name, item.activeIngredient, item.strength, item.group, item.manufacturer],
          medicineSearch,
        ),
      ),
    [medicineSearch, medicines],
  );

  const savedRecord = visit?.medicalRecord;

  // Vẫn hiện bước CLS trên stepper; bấm "Bỏ qua" thì bước đó chuyển sang hoàn thành.
  const clinicalStepDone =
    clinicalSkipped ||
    Boolean(savedRecord?.noClinicalServices) ||
    (activeOrders.length > 0 && resultReady);

  const steps = useMemo(
    () => [
      {
        id: 'vitals-section',
        label: 'Khám',
        done: Boolean(visit?.examStartedAt || visit?.reception?.temperature || savedRecord?.symptoms),
      },
      {
        id: 'clinical-orders',
        label: 'Cận LS',
        done: clinicalStepDone,
      },
      {
        id: 'diagnosis-section',
        label: 'Kết quả',
        done: Boolean(savedRecord?.diseaseId && savedRecord?.conclusion && savedRecord?.examResult),
      },
      { id: 'prescription-section', label: 'Đơn thuốc', done: prescriptionDone },
      { id: 'billing-section', label: 'Thanh toán', done: invoicePaid },
      {
        id: 'completion-section',
        label: 'Hoàn thành',
        done: professionallyFinished || visit?.status === 'Hoan thanh',
      },
    ],
    [clinicalStepDone, invoicePaid, prescriptionDone, professionallyFinished, savedRecord, visit],
  );

  const firstPendingStep = steps.findIndex((step) => !step.done);
  const currentStep = firstPendingStep < 0 ? steps.length - 1 : firstPendingStep;

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function refresh() {
    const [item, serviceOrders] = await Promise.all([
      clinicalApi.reception(id),
      clinicalApi.clinicalOrders(id),
    ]);
    fill(item);
    setOrders(serviceOrders);
  }

  function clearMessages() {
    setError('');
    setNotice('');
  }

  async function start() {
    clearMessages();
    setBusy(true);
    try {
      await clinicalApi.startVisit(id);
      await refresh();
      setNotice('Đã bắt đầu khám. Có thể bỏ qua cận lâm sàng hoặc ghi kết quả khám.');
      scrollToSection('clinical-orders');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function saveVitals(event: FormEvent) {
    event.preventDefault();
    if (!visit?.reception) return;
    clearMessages();
    setBusy(true);
    try {
      await clinicalApi.updateReception(id, vitals);
      await refresh();
      setNotice('Đã cập nhật sinh hiệu lâm sàng.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    clearMessages();
    if (!servicePurpose.trim()) {
      setError('Vui lòng nhập mục đích chỉ định.');
      return;
    }
    if (!editingOrderId && !serviceId) {
      setError('Vui lòng chọn dịch vụ từ danh mục.');
      return;
    }
    setBusy(true);
    try {
      if (editingOrderId) {
        await clinicalApi.updateClinicalOrder(editingOrderId, {
          purpose: servicePurpose.trim(),
          priority,
        });
        setNotice('Đã cập nhật chỉ định dịch vụ.');
      } else {
        await clinicalApi.createClinicalOrder(id, {
          serviceId,
          purpose: servicePurpose.trim(),
          priority,
        });
        setNotice('Đã thêm và gửi chỉ định dịch vụ cận lâm sàng.');
      }
      setRecord((current) => ({ ...current, noClinicalServices: false }));
      setEditingOrderId(null);
      setServiceId(0);
      setServicePurpose('');
      setPriority('Thuong');
      await refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function editOrder(order: ClinicalServiceOrder) {
    setEditingOrderId(order.id);
    setServiceId(order.serviceId);
    setServicePurpose(order.purpose || '');
    setPriority(order.priority);
    scrollToSection('clinical-orders');
  }

  async function cancelOrder(orderId: number) {
    if (!window.confirm('Hủy chỉ định dịch vụ này?')) return;
    clearMessages();
    setBusy(true);
    try {
      await clinicalApi.cancelClinicalOrder(orderId);
      if (editingOrderId === orderId) {
        setEditingOrderId(null);
        setServiceId(0);
        setServicePurpose('');
        setPriority('Thuong');
      }
      await refresh();
      setNotice('Đã hủy chỉ định chưa thực hiện.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function reviewResult(orderId: number) {
    clearMessages();
    setBusy(true);
    try {
      await clinicalApi.reviewClinicalResult(orderId);
      await refresh();
      setNotice('Đã xác nhận bác sĩ xem kết quả.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function payload(lockPrescription = false): MedicalRecordInput {
    const cleanFollowUp =
      record.followUpDate && record.followUpDate.trim() ? record.followUpDate.slice(0, 10) : undefined;
    const cleanDiseaseId =
      Number(record.diseaseId) > 0 ? Number(record.diseaseId) : undefined;
    const cleanSecondary =
      cleanDiseaseId && Array.isArray(record.secondaryDiseaseIds) && record.secondaryDiseaseIds.length > 0
        ? record.secondaryDiseaseIds.filter((dId) => Number(dId) > 0 && dId !== cleanDiseaseId)
        : undefined;

    const validItems =
      !record.noPrescription && Array.isArray(record.prescriptionItems)
        ? record.prescriptionItems
            .filter((item) => Number(item.medicineId) > 0 && Number(item.quantity) > 0)
            .map((item) => ({
              medicineId: Number(item.medicineId),
              quantity: Number(item.quantity),
              dosage: item.dosage?.trim() || undefined,
              frequency: item.frequency?.trim() || undefined,
              days: Number(item.days) > 0 ? Number(item.days) : undefined,
              route: item.route?.trim() || undefined,
              instructions: item.instructions?.trim() || undefined,
            }))
        : [];

    const body: MedicalRecordInput = {
      symptoms: record.symptoms?.trim() || undefined,
      onset: record.onset?.trim() || undefined,
      diseaseProgress: record.diseaseProgress?.trim() || undefined,
      postTreatmentProgress: record.postTreatmentProgress?.trim() || undefined,
      examResult: record.examResult?.trim() || undefined,
      conclusion: record.conclusion?.trim() || undefined,
      treatment: record.treatment?.trim() || undefined,
      doctorNotes: record.doctorNotes?.trim() || undefined,
      careAdvice: record.careAdvice?.trim() || undefined,
      followUpDate: cleanFollowUp,
      diseaseId: cleanDiseaseId,
      secondaryDiseaseIds: cleanSecondary,
      diagnosisNote: record.diagnosisNote?.trim() || undefined,
      noClinicalServices: Boolean(record.noClinicalServices),
      noPrescription: Boolean(record.noPrescription),
      prescriptionLocked: lockPrescription || Boolean(record.prescriptionLocked),
      prescriptionNote: record.prescriptionNote?.trim() || undefined,
      prescriptionItems: record.prescriptionLocked ? undefined : validItems,
    };
    return body;
  }

  function validateCompletion() {
    const nextErrors: Partial<Record<RecordField, string>> = {};
    if (!record.symptoms?.trim()) nextErrors.symptoms = 'Vui lòng ghi nhận triệu chứng hiện tại.';
    if (!record.examResult?.trim()) nextErrors.examResult = 'Vui lòng nhập kết quả khám thực thể và tổng hợp.';
    if (!record.conclusion?.trim()) nextErrors.conclusion = 'Vui lòng nhập kết luận trước khi hoàn thành khám.';
    if (!record.treatment?.trim()) nextErrors.treatment = 'Vui lòng nhập hướng điều trị.';
    if (!Number(record.diseaseId) || Number(record.diseaseId) < 1) nextErrors.diseaseId = 'Vui lòng chọn chẩn đoán chính (mã bệnh ICD-10).';

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError('Hồ sơ còn thiếu thông tin chuyên môn bắt buộc. Vui lòng kiểm tra các trường được đánh dấu đỏ.');
      return false;
    }
    if (!record.noClinicalServices && activeOrders.length === 0) {
      setError('Hãy thêm chỉ định cận lâm sàng hoặc xác nhận "Lượt khám này không cần cận lâm sàng".');
      return false;
    }
    if (!resultReady) {
      setError('Chưa thể hoàn thành vì còn chỉ định cận lâm sàng chưa có kết quả.');
      return false;
    }
    const validPrescriptionItems = (record.prescriptionItems || []).filter(
      (item) => Number(item.medicineId) > 0 && Number(item.quantity) > 0,
    );
    if (!record.noPrescription && !prescriptionLocked && validPrescriptionItems.length === 0) {
      setError('Hãy thêm thuốc vào đơn hoặc xác nhận "Không kê đơn cho lượt khám này".');
      return false;
    }
    return true;
  }

  async function saveRecord(mode: 'draft' | 'record' | 'lock' = 'draft') {
    clearMessages();
    if (mode === 'lock') {
      const validItems = (record.prescriptionItems || []).filter(
        (item) => Number(item.medicineId) > 0 && Number(item.quantity) > 0,
      );
      if (validItems.length === 0) {
        setError('Đơn thuốc phải có ít nhất một loại thuốc hợp lệ trước khi khóa.');
        return;
      }
    }
    setBusy(true);
    try {
      await clinicalApi.saveMedicalRecord(id, payload(mode === 'lock'));
      await refresh();
      setFieldErrors({});
      setNotice(
        mode === 'lock'
          ? 'Đã lưu và khóa đơn thuốc.'
          : mode === 'record'
          ? 'Đã cập nhật kết quả khám lâm sàng & chẩn đoán.'
          : 'Đã lưu nháp hồ sơ bệnh án thành công.',
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  /** Ngoại trú: bỏ qua chỉ định + kết quả CLS, chuyển thẳng sang ghi kết quả khám / kê đơn. */
  async function skipClinicalServices() {
    if (activeOrders.length > 0) {
      setError('Đang có chỉ định cận lâm sàng. Hãy hủy các chỉ định trước khi bỏ qua bước này.');
      return;
    }
    clearMessages();
    setBusy(true);
    try {
      const next = { ...record, noClinicalServices: true };
      setRecord(next);
      setShowClinicalPanel(false);
      await clinicalApi.saveMedicalRecord(id, {
        ...payload(),
        noClinicalServices: true,
      });
      await refresh();
      setNotice('Đã bỏ qua — bước Cận lâm sàng hoàn thành. Tiếp tục ghi kết quả khám và kê đơn.');
      scrollToSection('diagnosis-section');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function enableClinicalServices() {
    setRecord((current) => ({ ...current, noClinicalServices: false }));
    setShowClinicalPanel(true);
    scrollToSection('clinical-orders');
  }

  async function complete() {
    clearMessages();
    if (!validateCompletion()) return;
    setBusy(true);
    try {
      await clinicalApi.saveMedicalRecord(
        id,
        payload(!record.noPrescription && !prescriptionLocked),
      );
      await clinicalApi.completeVisit(id);
      await refresh();
      setFieldErrors({});
      setNotice('Đã hoàn tất chuyên môn khám bệnh; lượt khám chuyển sang trạng thái chờ thanh toán.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function setVital(key: keyof ReceptionInput, value: string) {
    setVitals((current) => ({
      ...current,
      [key]: value === '' ? undefined : Number(value),
    }));
  }

  function setRecordField<K extends keyof MedicalRecordInput>(key: K, value: MedicalRecordInput[K]) {
    setRecord((current) => ({ ...current, [key]: value }));
    if (key in fieldErrors) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  function addMedicine() {
    setRecord((current) => ({
      ...current,
      noPrescription: false,
      prescriptionItems: [
        ...(current.prescriptionItems || []),
        {
          medicineId: 0,
          quantity: 1,
          dosage: '',
          frequency: '',
          days: 5,
          route: 'Uống',
          instructions: '',
        },
      ],
    }));
  }

  function updateMedicine(index: number, patch: Partial<PrescriptionItemInput>) {
    setRecord((current) => ({
      ...current,
      prescriptionItems: (current.prescriptionItems || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function removeMedicine(index: number) {
    setRecord((current) => ({
      ...current,
      prescriptionItems: (current.prescriptionItems || []).filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    }));
  }

  if (loading) return <LoadingState label="Đang tải chi tiết lượt khám..." />;
  if (error && !visit) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!visit) return null;

  const completionChecks = [
    ['Đã ghi nhận triệu chứng ban đầu', Boolean(savedRecord?.symptoms?.trim())],
    ['Đã lưu kết quả khám thực thể', Boolean(savedRecord?.examResult?.trim())],
    ['Đã chọn chẩn đoán chính ICD-10', Boolean(savedRecord?.diseaseId)],
    ['Đã có kết luận và hướng điều trị', Boolean(savedRecord?.conclusion?.trim() && savedRecord?.treatment?.trim())],
    [
      clinicalSkipped
        ? 'Đã bỏ qua cận lâm sàng (hoàn thành bước)'
        : 'Đã xử lý cận lâm sàng',
      clinicalStepDone,
    ],
    ['Đã hoàn thiện quyết định kê đơn', prescriptionDone],
    ['Đã lưu hồ sơ bệnh án', Boolean(savedRecord)],
    ['Đã lập hóa đơn viện phí', Boolean(visit.invoice)],
    ['Đã hoàn tất thanh toán', invoicePaid],
  ] as Array<[string, boolean]>;

  return (
    <main className="visit-detail-page">
      <header className="visit-detail-heading">
        <div>
          <button type="button" onClick={() => navigate('/doctor/examinations')}>
            ← Quay lại danh sách khám
          </button>
          <nav aria-label="Breadcrumb">
            Bác sĩ <span>›</span> Khám bệnh <span>›</span> <strong>Chi tiết khám</strong>
          </nav>
          <h1>Khám bệnh – {visit.patient.name}</h1>
          <p>
            {visit.code} · Ngày {visit.date} lúc {visit.time.slice(0, 5)} · Trạng thái:{' '}
            <strong>{appointmentLabel(visit.status)}</strong>
          </p>
        </div>
        <div>
          <button type="button" onClick={() => window.print()}>
            🖨 In hồ sơ
          </button>
          {visit.status === 'Da check-in' ? (
            <button
              type="button"
              className="is-primary"
              disabled={busy}
              onClick={() => void start()}
            >
              ▶ Bắt đầu khám
            </button>
          ) : null}
          {editable ? (
            <button
              type="button"
              className="is-primary"
              disabled={busy}
              onClick={() => void saveRecord('draft')}
            >
              💾 Lưu hồ sơ
            </button>
          ) : null}
        </div>
      </header>

      <ol
        className="visit-stepper"
        aria-label="Tiến trình khám bệnh"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`${step.done ? 'is-done' : ''} ${index === currentStep ? 'is-current' : ''}`}
            onClick={() => scrollToSection(step.id)}
            style={{ cursor: 'pointer' }}
            title={`Chuyển tới bước ${index + 1}: ${step.label}`}
          >
            <span>{step.done ? '✓' : index + 1}</span>
            <b>{step.label}</b>
          </li>
        ))}
      </ol>

      {notice ? (
        <p className="visit-notice" role="status">
          <span>✓ {notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo">
            ×
          </button>
        </p>
      ) : null}
      {error ? (
        <p className="visit-error" role="alert">
          <span>⚠ {error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Đóng lỗi">
            ×
          </button>
        </p>
      ) : null}

      <div className="visit-layout">
        {/* CỘT TRÁI: THÔNG TIN BỆNH NHÂN, LỊCH HẸN, SINH HIỆU & TRẠNG THÁI */}
        <aside className="visit-sidebar">
          {/* 1. Card thông tin bệnh nhân */}
          <section>
            <div className="visit-patient">
              <span>{initials(visit.patient.name)}</span>
              <div>
                <h2>{visit.patient.name}</h2>
                <em>{visit.visitType === 'Tai kham' ? 'Tái khám' : 'Khám lần đầu'}</em>
              </div>
            </div>
            <dl>
              <div>
                <dt>Mã bệnh nhân</dt>
                <dd>{visit.patient.code}</dd>
              </div>
              <div>
                <dt>Tuổi / Giới tính</dt>
                <dd>
                  {age(visit.patient.birthDate)} / {genderLabel(visit.patient.gender)}
                </dd>
              </div>
              <div>
                <dt>Số điện thoại</dt>
                <dd>{visit.patient.phone || 'Chưa ghi nhận'}</dd>
              </div>
              <div>
                <dt>BHYT</dt>
                <dd>
                  {visit.patient.hasInsurance
                    ? visit.patient.insuranceNumber || 'Có BHYT'
                    : 'Không có BHYT'}
                </dd>
              </div>
              <div>
                <dt>Địa chỉ</dt>
                <dd>{visit.patient.address || 'Chưa ghi nhận'}</dd>
              </div>
            </dl>
            <button
              className="visit-link-button"
              type="button"
              onClick={() =>
                window.open(`/medical-history?patientId=${visit.patient.id}`, '_blank')
              }
              title="Mở lịch sử khám bệnh của bệnh nhân trong tab mới"
            >
              📄 Xem hồ sơ bệnh án
            </button>
          </section>

          {/* 2. Card lịch hẹn và phòng khám */}
          <section>
            <h3>Lịch hẹn & phòng khám</h3>
            <dl>
              <div>
                <dt>Mã lịch hẹn</dt>
                <dd>{visit.code}</dd>
              </div>
              <div>
                <dt>Ngày giờ hẹn</dt>
                <dd>
                  {visit.date} · {visit.time.slice(0, 5)}
                </dd>
              </div>
              <div>
                <dt>Bác sĩ phụ trách</dt>
                <dd>{visit.doctor.name}</dd>
              </div>
              <div>
                <dt>Chuyên khoa</dt>
                <dd>{visit.doctor.specialty?.name || 'Đa khoa'}</dd>
              </div>
              <div>
                <dt>Phòng khám</dt>
                <dd>
                  {visit.doctor.specialty?.name
                    ? `Phòng ${visit.doctor.specialty.name}`
                    : 'Phòng khám chuyên khoa'}
                </dd>
              </div>
              <div>
                <dt>Lý do khám</dt>
                <dd>{visit.reason || 'Chưa ghi nhận'}</dd>
              </div>
              <div>
                <dt>Thời gian check-in</dt>
                <dd>{dateTime(visit.checkedInAt)}</dd>
              </div>
              <div>
                <dt>Trạng thái khám</dt>
                <dd>{appointmentLabel(visit.status)}</dd>
              </div>
            </dl>
          </section>

          {/* 3. Card sinh hiệu lâm sàng */}
          <form id="vitals-section" onSubmit={saveVitals}>
            <h3>Sinh hiệu lâm sàng</h3>
            <div className="visit-vitals">
              {(
                [
                  ['temperature', 'Nhiệt độ', '°C', '0.1'],
                  ['systolicBloodPressure', 'HA tâm thu', 'mmHg', '1'],
                  ['diastolicBloodPressure', 'HA tâm trương', 'mmHg', '1'],
                  ['heartRate', 'Nhịp tim', 'nhịp/phút', '1'],
                  ['spo2', 'SpO₂', '%', '0.1'],
                  ['height', 'Chiều cao', 'cm', '0.1'],
                  ['weight', 'Cân nặng', 'kg', '0.1'],
                ] as Array<[keyof ReceptionInput, string, string, string]>
              ).map(([key, label, unit, step]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    disabled={!editable}
                    type="number"
                    min="0"
                    step={step}
                    value={String(vitals[key] ?? '')}
                    placeholder="—"
                    onChange={(event) => setVital(key, event.target.value)}
                  />
                  <small>{unit}</small>
                </label>
              ))}
              <div className="visit-bmi">
                <span>Chỉ số BMI</span>
                <strong>{bmi}</strong>
              </div>
            </div>
            <label className="visit-vital-note">
              <span>Ghi chú lâm sàng</span>
              <textarea
                disabled={!editable}
                value={vitals.notes || ''}
                onChange={(event) =>
                  setVitals((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Ghi chú lâm sàng bổ sung..."
              />
            </label>
            {editable ? (
              <button type="submit" disabled={busy}>
                Cập nhật sinh hiệu
              </button>
            ) : null}
          </form>

          {/* 4. Card trạng thái lượt khám */}
          <section className="visit-status">
            <h3>Trạng thái: {appointmentLabel(visit.status)}</h3>
            <p>Bắt đầu khám: {dateTime(visit.examStartedAt)}</p>
            <p>Kết thúc khám: {dateTime(visit.examCompletedAt)}</p>
            <p>Hoàn tất lượt khám: {dateTime(visit.visitCompletedAt)}</p>
          </section>
        </aside>

        {/* CỘT PHẢI: CHỈ ĐỊNH DỊCH VỤ, KẾT QUẢ CLS, CHẨN ĐOÁN, ĐƠN THUỐC, HÓA ĐƠN & HOÀN TẤT */}
        <div className="visit-main">
          {/* Ngoại trú: CLS tùy chọn — mặc định bỏ qua để ghi kết quả khám + kê đơn */}
          <section className="visit-section visit-clinical-optional" id="clinical-orders">
            <header>
              <span>{clinicalStepDone ? '✓' : '1'}</span>
              <div>
                <h2>Cận lâm sàng</h2>
                <p>
                  {clinicalStepDone
                    ? clinicalSkipped
                      ? 'Đã bỏ qua — bước này hoàn thành (ngoại trú).'
                      : 'Đã xử lý chỉ định / kết quả cận lâm sàng.'
                    : 'Bấm bỏ qua để hoàn thành bước này, hoặc mở chỉ định nếu cần.'}
                </p>
              </div>
            </header>

            {clinicalSkipped ? (
              <div className="visit-skip-banner">
                <div>
                  <strong>Đã bỏ qua — trạng thái hoàn thành</strong>
                  <p>Tiếp tục ghi kết quả khám và kê đơn thuốc.</p>
                </div>
                {editable ? (
                  <button type="button" disabled={busy} onClick={enableClinicalServices}>
                    Mở lại chỉ định
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {editable && activeOrders.length === 0 ? (
                  <div className="visit-skip-actions">
                    <button
                      type="button"
                      className="is-primary"
                      disabled={busy}
                      onClick={() => void skipClinicalServices()}
                    >
                      Bỏ qua bước này (hoàn thành)
                    </button>
                    {!showClinicalPanel ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRecordField('noClinicalServices', false);
                          setShowClinicalPanel(true);
                        }}
                      >
                        Mở chỉ định CLS
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {showClinicalPanel || activeOrders.length > 0 ? (
                  <>
                    {editable ? (
                      <form className="service-order-form" onSubmit={submitOrder}>
                        <input
                          value={serviceSearch}
                          onChange={(event) => setServiceSearch(event.target.value)}
                          placeholder="Tìm mã hoặc tên dịch vụ..."
                          aria-label="Tìm dịch vụ"
                        />
                        <select
                          value={serviceId || ''}
                          disabled={editingOrderId !== null}
                          onChange={(event) => setServiceId(Number(event.target.value))}
                        >
                          <option value="">Chọn dịch vụ từ danh mục</option>
                          {filteredCatalog.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.name} ({money(item.unitPrice)})
                            </option>
                          ))}
                        </select>
                        <input
                          value={servicePurpose}
                          onChange={(event) => setServicePurpose(event.target.value)}
                          placeholder="Mục đích / ghi chú thực hiện *"
                        />
                        <select
                          value={priority}
                          onChange={(event) =>
                            setPriority(event.target.value as 'Thuong' | 'Khan')
                          }
                        >
                          <option value="Thuong">Thường</option>
                          <option value="Khan">Khẩn</option>
                        </select>
                        <button type="submit" disabled={busy}>
                          {editingOrderId ? 'Lưu thay đổi' : '＋ Thêm & gửi chỉ định'}
                        </button>
                        {editingOrderId ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingOrderId(null);
                              setServiceId(0);
                              setServicePurpose('');
                              setPriority('Thuong');
                            }}
                          >
                            Hủy sửa
                          </button>
                        ) : null}
                      </form>
                    ) : null}

                    {catalog.length === 0 ? (
                      <p className="visit-empty">
                        Chưa có danh mục dịch vụ cận lâm sàng. Quản lý cần cấu hình dữ liệu trước khi
                        chỉ định.
                      </p>
                    ) : null}

                    <div className="service-orders">
                      {orders.length === 0 ? (
                        <p className="visit-empty">Chưa có chỉ định cận lâm sàng nào.</p>
                      ) : (
                        orders.map((order) => (
                          <article
                            className={order.status === 'Huy' ? 'is-cancelled' : ''}
                            key={order.id}
                          >
                            <div>
                              <strong>
                                {order.code} · {order.name}
                              </strong>
                              <small>
                                Đơn vị: {order.performingUnit || 'Phòng xét nghiệm/CĐHA'} · Mức độ:{' '}
                                {order.priority === 'Khan' ? 'Khẩn' : 'Thường'} · Đơn giá:{' '}
                                {money(order.unitPrice)}
                              </small>
                              <p>{order.purpose || 'Chưa có mục đích chỉ định.'}</p>
                            </div>
                            <div className="service-order-status">
                              <b>{order.status}</b>
                              {editable && order.status === 'Cho thuc hien' ? (
                                <span>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => editOrder(order)}
                                  >
                                    Sửa
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void cancelOrder(order.id)}
                                  >
                                    Hủy
                                  </button>
                                </span>
                              ) : null}
                            </div>
                          </article>
                        ))
                      )}
                    </div>

                    <div className="clinical-results" id="clinical-results">
                      <h3>Kết quả cận lâm sàng</h3>
                      {activeOrders.length === 0 ? (
                        <p className="visit-empty">Chưa có chỉ định để trả kết quả.</p>
                      ) : activeOrders.filter((order) => order.result).length === 0 ? (
                        <p className="visit-empty">
                          Đang chờ kết quả từ bộ phận thực hiện cận lâm sàng...
                        </p>
                      ) : (
                        activeOrders
                          .filter((order) => order.result)
                          .map((order) => (
                            <article key={order.id}>
                              <div>
                                <strong>
                                  {order.name} ({order.code})
                                </strong>
                                <small>
                                  Thời gian trả KQ: {dateTime(order.result?.reportedAt || null)}
                                  {order.result?.performedBy
                                    ? ` · Người thực hiện: ${order.result.performedBy}`
                                    : ''}
                                </small>
                                <p>
                                  <strong>Kết quả:</strong> {order.result?.result}
                                </p>
                                {order.result?.conclusion ? (
                                  <em>Kết luận: {order.result.conclusion}</em>
                                ) : null}
                                {order.result?.attachment ? (
                                  <a
                                    href={order.result.attachment}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    📎 Mở tệp / hình ảnh kết quả
                                  </a>
                                ) : null}
                              </div>
                              {order.status === 'Da co ket qua' && editable ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void reviewResult(order.id)}
                                >
                                  ✓ Xác nhận đã xem
                                </button>
                              ) : (
                                <b>{order.status}</b>
                              )}
                            </article>
                          ))
                      )}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </section>

          {/* Kết quả khám và chẩn đoán */}
          <section className="visit-section" id="diagnosis-section">
            <header>
              <span>3</span>
              <div>
                <h2>Kết quả khám &amp; chẩn đoán</h2>
                <p>Ghi triệu chứng, kết quả khám, chẩn đoán ICD-10 và hướng điều trị.</p>
              </div>
            </header>
            <div className="medical-form">
              <label>
                <span>Triệu chứng hiện tại *</span>
                <textarea
                  disabled={!editable}
                  value={record.symptoms || ''}
                  onChange={(event) => setRecordField('symptoms', event.target.value)}
                  placeholder="Ghi nhận triệu chứng cơ năng bệnh nhân mô tả..."
                />
                {fieldErrors.symptoms ? <small>{fieldErrors.symptoms}</small> : null}
              </label>

              <label>
                <span>Bệnh sử / thời gian xuất hiện</span>
                <input
                  disabled={!editable}
                  value={record.onset || ''}
                  onChange={(event) => setRecordField('onset', event.target.value)}
                  placeholder="Ví dụ: Khởi phát 3 ngày trước..."
                />
              </label>

              <label className="is-wide">
                <span>Diễn tiến bệnh</span>
                <textarea
                  disabled={!editable}
                  value={record.diseaseProgress || ''}
                  onChange={(event) =>
                    setRecordField('diseaseProgress', event.target.value)
                  }
                  placeholder="Diễn tiến bệnh, các thuốc đã dùng trước khi đến khám..."
                />
              </label>

              <label className="is-wide">
                <span>Kết quả khám thực thể & các cơ quan *</span>
                <textarea
                  disabled={!editable}
                  value={record.examResult || ''}
                  onChange={(event) => setRecordField('examResult', event.target.value)}
                  placeholder="Khám tuần hoàn, hô hấp, tiêu hóa, thần kinh, cơ xương khớp..."
                />
                {fieldErrors.examResult ? <small>{fieldErrors.examResult}</small> : null}
              </label>

              <label>
                <span>Tìm bệnh theo mã hoặc tên (ICD-10)</span>
                <input
                  disabled={!editable}
                  value={diseaseSearch}
                  onChange={(event) => setDiseaseSearch(event.target.value)}
                  placeholder="Nhập mã ICD-10 hoặc tên bệnh..."
                />
              </label>

              <label>
                <span>Chẩn đoán chính *</span>
                <select
                  disabled={!editable}
                  value={record.diseaseId || ''}
                  onChange={(event) =>
                    setRecordField(
                      'diseaseId',
                      Number(event.target.value) || undefined,
                    )
                  }
                >
                  <option value="">Chọn bệnh chính từ danh mục ICD-10</option>
                  {filteredDiseases.map((disease) => (
                    <option key={disease.id} value={disease.id}>
                      {disease.code} · {disease.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.diseaseId ? <small>{fieldErrors.diseaseId}</small> : null}
              </label>

              <label className="is-wide">
                <span>Chẩn đoán phụ (nếu có - giữ Ctrl để chọn nhiều)</span>
                <select
                  multiple
                  disabled={!editable || !record.diseaseId}
                  value={(record.secondaryDiseaseIds || []).map(String)}
                  onChange={(event) =>
                    setRecordField(
                      'secondaryDiseaseIds',
                      Array.from(event.target.selectedOptions).map((option) =>
                        Number(option.value),
                      ),
                    )
                  }
                >
                  {diseases
                    .filter((disease) => disease.id !== record.diseaseId)
                    .map((disease) => (
                      <option key={disease.id} value={disease.id}>
                        {disease.code} · {disease.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="is-wide">
                <span>Ghi chú chẩn đoán</span>
                <textarea
                  disabled={!editable}
                  value={record.diagnosisNote || ''}
                  onChange={(event) =>
                    setRecordField('diagnosisNote', event.target.value)
                  }
                  placeholder="Ghi chú chi tiết về chẩn đoán, thể bệnh, giai đoạn..."
                />
              </label>

              <label className="is-wide">
                <span>Kết luận *</span>
                <textarea
                  disabled={!editable}
                  value={record.conclusion || ''}
                  onChange={(event) => setRecordField('conclusion', event.target.value)}
                  placeholder="Kết luận của bác sĩ sau khi thăm khám..."
                />
                {fieldErrors.conclusion ? <small>{fieldErrors.conclusion}</small> : null}
              </label>

              <label className="is-wide">
                <span>Hướng điều trị *</span>
                <textarea
                  disabled={!editable}
                  value={record.treatment || ''}
                  onChange={(event) => setRecordField('treatment', event.target.value)}
                  placeholder="Hướng điều trị: Ngoại trú / Nội trú / Chuyển viện / Kê đơn..."
                />
                {fieldErrors.treatment ? <small>{fieldErrors.treatment}</small> : null}
              </label>

              <label className="is-wide">
                <span>Lời dặn / tư vấn chăm sóc</span>
                <textarea
                  disabled={!editable}
                  value={record.careAdvice || ''}
                  onChange={(event) => setRecordField('careAdvice', event.target.value)}
                  placeholder="Chế độ ăn uống, sinh hoạt, tập luyện, theo dõi dấu hiệu nguy hiểm..."
                />
              </label>

              <label>
                <span>Ngày hẹn tái khám (nếu có)</span>
                <input
                  disabled={!editable}
                  type="date"
                  value={record.followUpDate || ''}
                  onChange={(event) =>
                    setRecordField('followUpDate', event.target.value)
                  }
                />
              </label>

              <label>
                <span>Ghi chú bác sĩ</span>
                <input
                  disabled={!editable}
                  value={record.doctorNotes || ''}
                  onChange={(event) =>
                    setRecordField('doctorNotes', event.target.value)
                  }
                  placeholder="Ghi chú nội bộ dành cho bác sĩ..."
                />
              </label>
            </div>

            {editable ? (
              <div className="visit-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveRecord('draft')}
                >
                  Lưu nháp
                </button>
                <button
                  type="button"
                  className="is-primary"
                  disabled={busy}
                  onClick={() => void saveRecord('record')}
                >
                  Cập nhật kết quả khám
                </button>
              </div>
            ) : null}
          </section>

          {/* Card 4: Kê đơn thuốc ngoại trú */}
          <section className="visit-section prescription-section" id="prescription-section">
            <header>
              <span>4</span>
              <div>
                <h2>Kê đơn thuốc ngoại trú</h2>
                <p>Thuốc, hoạt chất và đơn giá lấy từ danh mục thuốc chuẩn của bệnh viện.</p>
              </div>
            </header>

            <label className="visit-check">
              <input
                disabled={!editable || prescriptionLocked}
                type="checkbox"
                checked={Boolean(record.noPrescription)}
                onChange={(event) =>
                  setRecord((current) => ({
                    ...current,
                    noPrescription: event.target.checked,
                    prescriptionItems: event.target.checked ? [] : current.prescriptionItems,
                  }))
                }
              />
              <strong>Không kê đơn thuốc cho lượt khám này</strong>
            </label>

            {!record.noPrescription ? (
              <>
                <input
                  className="prescription-search"
                  disabled={!editable || prescriptionLocked}
                  value={medicineSearch}
                  onChange={(event) => setMedicineSearch(event.target.value)}
                  placeholder="Tìm tên thuốc, hoạt chất, hàm lượng, nhóm thuốc..."
                />
                <div className="prescription-table">
                  {(record.prescriptionItems || []).map((item, index) => {
                    const medicine = medicines.find(
                      (candidate) => candidate.id === item.medicineId,
                    );
                    const options =
                      medicine &&
                      !filteredMedicines.some((candidate) => candidate.id === medicine.id)
                        ? [medicine, ...filteredMedicines]
                        : filteredMedicines;

                    return (
                      <article key={`${index}-${item.medicineId}`}>
                        <div className="prescription-drug">
                          <select
                            disabled={!editable || prescriptionLocked}
                            value={item.medicineId || ''}
                            onChange={(event) =>
                              updateMedicine(index, {
                                medicineId: Number(event.target.value),
                              })
                            }
                          >
                            <option value="">Chọn thuốc từ danh mục *</option>
                            {options.map((candidate) => (
                              <option
                                disabled={(record.prescriptionItems || []).some(
                                  (selected, selectedIndex) =>
                                    selectedIndex !== index &&
                                    selected.medicineId === candidate.id,
                                )}
                                key={candidate.id}
                                value={candidate.id}
                              >
                                {candidate.name} {candidate.strength || ''} ·{' '}
                                {candidate.activeIngredient || 'Chưa có hoạt chất'} (
                                {money(candidate.unitPrice)})
                              </option>
                            ))}
                          </select>
                          {medicine ? (
                            <small>
                              Hoạt chất: {medicine.activeIngredient || '—'} · Hàm lượng:{' '}
                              {medicine.strength || '—'} · ĐVT: {medicine.unit || '—'} · Đơn giá:{' '}
                              {money(medicine.unitPrice)}
                            </small>
                          ) : null}
                        </div>

                        <label>
                          <span>Số lượng *</span>
                          <input
                            disabled={!editable || prescriptionLocked}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) =>
                              updateMedicine(index, {
                                quantity: Math.max(1, Number(event.target.value) || 1),
                              })
                            }
                          />
                        </label>

                        <label>
                          <span>Liều dùng</span>
                          <input
                            disabled={!editable || prescriptionLocked}
                            value={item.dosage || ''}
                            placeholder="VD: 1 viên"
                            onChange={(event) =>
                              updateMedicine(index, { dosage: event.target.value })
                            }
                          />
                        </label>

                        <label>
                          <span>Tần suất</span>
                          <input
                            disabled={!editable || prescriptionLocked}
                            value={item.frequency || ''}
                            placeholder="VD: 2 lần/ngày"
                            onChange={(event) =>
                              updateMedicine(index, { frequency: event.target.value })
                            }
                          />
                        </label>

                        <label>
                          <span>Số ngày</span>
                          <input
                            disabled={!editable || prescriptionLocked}
                            type="number"
                            min="1"
                            value={item.days || ''}
                            placeholder="VD: 5"
                            onChange={(event) =>
                              updateMedicine(index, {
                                days: event.target.value
                                  ? Math.max(1, Number(event.target.value))
                                  : undefined,
                              })
                            }
                          />
                        </label>

                        <label>
                          <span>Đường dùng</span>
                          <input
                            disabled={!editable || prescriptionLocked}
                            value={item.route || ''}
                            placeholder="VD: Uống"
                            onChange={(event) =>
                              updateMedicine(index, { route: event.target.value })
                            }
                          />
                        </label>

                        <label className="is-wide">
                          <span>Cách dùng / hướng dẫn sử dụng</span>
                          <input
                            disabled={!editable || prescriptionLocked}
                            value={item.instructions || ''}
                            placeholder="VD: Uống sau bữa ăn sáng và tối 30 phút..."
                            onChange={(event) =>
                              updateMedicine(index, { instructions: event.target.value })
                            }
                          />
                        </label>

                        <strong className="prescription-line-total">
                          Thành tiền: {money((medicine?.unitPrice || 0) * item.quantity)}
                        </strong>

                        {editable && !prescriptionLocked ? (
                          <button
                            type="button"
                            className="prescription-remove"
                            onClick={() => removeMedicine(index)}
                            aria-label="Xóa dòng thuốc này"
                            title="Xóa thuốc"
                          >
                            ×
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                {editable && !prescriptionLocked ? (
                  <button
                    type="button"
                    className="visit-add-button"
                    onClick={addMedicine}
                  >
                    ＋ Thêm thuốc vào đơn
                  </button>
                ) : null}

                <label className="prescription-note">
                  <span>Ghi chú đơn thuốc</span>
                  <textarea
                    disabled={!editable || prescriptionLocked}
                    value={record.prescriptionNote || ''}
                    placeholder="Ghi chú thêm về đơn thuốc, cách bảo quản thuốc..."
                    onChange={(event) =>
                      setRecordField('prescriptionNote', event.target.value)
                    }
                  />
                </label>

                <p className="prescription-total">
                  Tạm tính theo giá danh mục:{' '}
                  <b>
                    {money(
                      (record.prescriptionItems || []).reduce(
                        (sum, item) =>
                          sum +
                          (medicines.find((medicine) => medicine.id === item.medicineId)
                            ?.unitPrice || 0) *
                            item.quantity,
                        0,
                      ),
                    )}
                  </b>
                </p>
              </>
            ) : null}

            <div className="visit-actions">
              <button type="button" onClick={() => window.print()}>
                🖨 In đơn thuốc
              </button>
              {editable && !prescriptionLocked ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveRecord('draft')}
                  >
                    Lưu nháp đơn
                  </button>
                  {!record.noPrescription ? (
                    <button
                      type="button"
                      className="is-primary"
                      disabled={
                        busy ||
                        (record.prescriptionItems || []).filter(
                          (item) => Number(item.medicineId) > 0,
                        ).length === 0
                      }
                      onClick={() => void saveRecord('lock')}
                    >
                      🔒 Lưu & khóa đơn thuốc
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          {/* Card 5: Hóa đơn và thanh toán viện phí */}
          <section className="visit-section" id="billing-section">
            <header>
              <span>5</span>
              <div>
                <h2>Thanh toán viện phí & Dịch vụ</h2>
                <p>
                  Bác sĩ theo dõi chi phí; việc thu viện phí và xác nhận giao dịch do Bộ phận Thu ngân
                  thực hiện.
                </p>
              </div>
            </header>
            {visit.invoice ? (
              <div className="invoice-summary">
                <div>
                  <span>Tiền khám</span>
                  <b>{money(visit.invoice.examFee)}</b>
                </div>
                <div>
                  <span>Tiền dịch vụ cận lâm sàng</span>
                  <b>{money(visit.invoice.serviceAmount)}</b>
                </div>
                <div>
                  <span>Tiền thuốc</span>
                  <b>{money(visit.invoice.medicineAmount)}</b>
                </div>
                <div>
                  <span>Giảm trừ</span>
                  <b>- {money(visit.invoice.discount)}</b>
                </div>
                <div>
                  <span>Đã thanh toán</span>
                  <b>{money(visit.invoice.paidAmount)}</b>
                </div>
                <div>
                  <span>Còn phải thanh toán</span>
                  <b>{money(visit.invoice.balance)}</b>
                </div>
                <div className="is-total">
                  <span>Tổng viện phí</span>
                  <b>{money(visit.invoice.total)}</b>
                </div>
                <p>
                  Trạng thái hóa đơn:{' '}
                  <strong style={{ color: invoicePaid ? '#157347' : '#b02a37' }}>
                    {visit.invoice.status}
                  </strong>
                </p>
              </div>
            ) : (
              <p className="visit-empty">
                Chưa có hóa đơn. Hóa đơn sẽ được hệ thống khởi tạo sau khi hoàn tất chuyên môn khám bệnh.
              </p>
            )}
          </section>

          {/* Card 6: Checklist hoàn tất quy trình khám */}
          <section className="visit-complete" id="completion-section">
            <div>
              <h2>Hoàn tất quy trình khám lâm sàng</h2>
              <p>Checklist kiểm tra dữ liệu chuyên môn đã được lưu trên hệ thống.</p>
              <ul>
                {completionChecks.map(([label, done]) => (
                  <li className={done ? 'is-done' : ''} key={label}>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            {editable ? (
              <button
                type="button"
                className="is-primary"
                disabled={busy}
                onClick={() => void complete()}
              >
                ✓ Hoàn tất khám bệnh
              </button>
            ) : (
              <b>
                {professionallyFinished
                  ? '✓ ĐÃ HOÀN TẤT CHUYÊN MÔN'
                  : 'CHƯA THỂ HOÀN TẤT'}
              </b>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
