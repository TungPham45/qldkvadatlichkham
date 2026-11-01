import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { AdminModal } from '../../components/AdminModal';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ManagerPager } from '../../components/ManagerPager';
import { clinicalApi, type MedicalRecord } from '../../features/clinical/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/auth-store';
import { formatDate, hospitalHotline, hospitalName, hospitalSubtitle } from '../../utils/format';

const limit = 10;

const prescriptionStatusLabel: Record<string, string> = {
  'Da khoa': 'Đã khóa',
  'Da ke': 'Đã kê',
  Nhap: 'Nháp',
};

const medicineUnitLabel: Record<string, string> = {
  Vien: 'Viên', Ong: 'Ống', Goi: 'Gói', Hop: 'Hộp', Chai: 'Chai', Vao: 'Gói',
};

function money(value: number | string | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `${amount.toLocaleString('vi-VN')} đ`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function text(value?: string | number | null) {
  const trimmed = value == null ? '' : String(value).trim();
  return trimmed ? escapeHtml(trimmed) : '';
}

function genderLabel(value?: string | null) {
  if (value === 'Nu') return 'Nữ';
  if (value === 'Nam') return 'Nam';
  return value?.trim() || '—';
}

function ageYears(birthDate?: string | null) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  if (currentMonth < month || (currentMonth === month && today.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

function plainAmount(value?: string | null) {
  return Boolean(value && /^\d+([.,]\d+)?$/.test(value.trim()));
}

function usageText(item: NonNullable<MedicalRecord['prescription']>['items'][number]) {
  const parts = [
    item.route?.trim(),
    item.dosage?.trim() ? (plainAmount(item.dosage) ? `mỗi lần ${item.dosage.trim()}` : item.dosage.trim()) : '',
    item.frequency?.trim() ? (plainAmount(item.frequency) ? `${item.frequency.trim()} lần/ngày` : item.frequency.trim()) : '',
    item.days ? `trong ${item.days} ngày` : '',
    item.instructions?.trim(),
  ].filter(Boolean);
  return parts.join(', ');
}

function prescriptionDocument(record: MedicalRecord) {
  const prescription = record.prescription;
  if (!prescription) return '';
  const age = ageYears(record.patient.birthDate);
  const diagnosis = record.diagnoses.map((item) => `${item.code} – ${item.name}${item.primary ? ' (chính)' : ''}`).join('; ');
  const advice = [prescription.note?.trim(), record.followUpDate ? `Tái khám ngày ${formatDate(record.followUpDate)}` : ''].filter(Boolean).join('. ');
  const drugs = prescription.items.map((item, index) => {
    const name = [item.drug, item.strength].filter(Boolean).join(' ');
    const unit = item.unit ? (medicineUnitLabel[item.unit] || item.unit) : '';
    const ingredient = item.activeIngredient && item.activeIngredient.trim().toLowerCase() !== item.drug.trim().toLowerCase()
      ? `<div>Hoạt chất: ${text(item.activeIngredient)}</div>`
      : '';
    return `<article>
      <strong>${index + 1}. ${text(name)}</strong>
      ${ingredient}
      <div>Số lượng: ${text(item.quantity)}${unit ? ` ${text(unit)}` : ''}</div>
      <div>Cách dùng: ${text(usageText(item)) || 'Theo chỉ dẫn của bác sĩ'}</div>
    </article>`;
  }).join('');
  const hotline = hospitalHotline ? `<div>Điện thoại: ${text(hospitalHotline)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Đơn thuốc ${text(record.patient.name)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font: 15px/1.45 "Times New Roman", Times, serif; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .toolbar button { min-height: 36px; padding: 0 14px; border: 1px solid #24517d; border-radius: 6px; background: #0869bf; color: #fff; font: 700 13px/1 sans-serif; cursor: pointer; }
    .sheet { max-width: 760px; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .facility { text-align: left; }
    .facility strong { display: block; text-transform: uppercase; }
    .nation { font-weight: 700; text-align: center; }
    .nation small { display: block; margin-top: 2px; font-weight: 400; font-style: italic; }
    .facility { font-size: 14px; }
    .rule { margin: 8px 0 0; border: 0; border-top: 1px solid #111; }
    h1 { margin: 16px 0 4px; text-align: center; font-size: 26px; letter-spacing: 1px; }
    .code { margin: 0 0 14px; text-align: center; }
    .info { display: grid; gap: 4px; }
    .split { display: flex; justify-content: space-between; gap: 16px; }
    h2 { margin: 16px 0 8px; font-size: 16px; }
    article { margin: 0 0 12px; }
    article strong { font-size: 16px; }
    .sign { display: flex; justify-content: flex-end; margin-top: 22px; }
    .sign div { width: 230px; text-align: center; }
    .sign b { display: block; margin-top: 72px; }
    .note { margin-top: 18px; font-size: 13px; font-style: italic; }
    @media print { .toolbar { display: none; } }
  </style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">In đơn thuốc</button></div>
  <main class="sheet">
    <header class="head">
      <div class="facility">
        <strong>${text(hospitalName)}</strong>
        <div>${text(hospitalSubtitle)}</div>
        ${hotline}
      </div>
      <div class="nation">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<small>Độc lập - Tự do - Hạnh phúc</small></div>
    </header>
    <hr class="rule" />
    <h1>ĐƠN THUỐC</h1>
    <p class="code">Số: ĐT-${String(prescription.id).padStart(6, '0')} · Ngày ${text(formatDate(prescription.date || record.examDate))}</p>
    <section class="info">
      <div class="split"><span>Họ và tên: <strong>${text(record.patient.name)}</strong></span><span>Mã BN: ${text(record.patient.code)}</span></div>
      <div class="split"><span>Năm sinh: ${text(formatDate(record.patient.birthDate))}${age == null ? '' : ` (${age} tuổi)`}</span><span>Giới tính: ${text(genderLabel(record.patient.gender))}</span></div>
      <div>Địa chỉ: ${text(record.patient.address) || '—'}</div>
      <div>Điện thoại: ${text(record.patient.phone) || '—'}</div>
      <div>Chẩn đoán: ${text(diagnosis) || '—'}</div>
    </section>
    <h2>Thuốc điều trị</h2>
    ${drugs || '<p>Không có thuốc trong đơn.</p>'}
    <p><strong>Lời dặn:</strong> ${text(advice) || 'Dùng thuốc theo chỉ dẫn. Tái khám khi có dấu hiệu bất thường.'}</p>
    <section class="sign">
      <div>
        Ngày ${text(formatDate(prescription.date || record.examDate))}
        <div>Bác sĩ điều trị</div>
        <b>${text(record.doctor.name)}</b>
        <small>${text(record.doctor.specialty) ? `Chuyên khoa ${text(record.doctor.specialty)}` : ''}${record.doctor.license ? `<br />CCHN: ${text(record.doctor.license)}` : ''}</small>
      </div>
    </section>
    <p class="note">Đơn thuốc có giá trị khi có chữ ký bác sĩ. Người bệnh không tự ý đổi liều hoặc ngừng thuốc.</p>
  </main>
</body>
</html>`;
}

function openPrescriptionPrint(record: MedicalRecord) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(prescriptionDocument(record));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
  return true;
}

function PrescriptionDetail({ record }: { record: MedicalRecord }) {
  const [open, setOpen] = useState(false);
  const [printError, setPrintError] = useState('');
  const prescription = record.prescription;
  if (!prescription) return <p>Không có đơn thuốc.</p>;
  const status = prescriptionStatusLabel[prescription.status] || prescription.status;
  const total = prescription.items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0);
  return (
    <div className="clinical-prescription">
      <button className="clinical-prescription__toggle" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>Xem bảng đơn thuốc chi tiết</span>
        <small>{status} · {prescription.items.length} thuốc{prescription.date ? ` · ${formatDate(prescription.date)}` : ''}</small>
      </button>
      <div className={`clinical-prescription__panel${open ? ' is-open' : ''}`}>
        <div className="clinical-prescription__panel-inner">
          {prescription.note ? <p className="clinical-prescription__note">Ghi chú: {prescription.note}</p> : null}
          {prescription.items.length === 0 ? <p className="clinical-prescription__empty">Đơn thuốc không có thuốc.</p> : (
            <div className="clinical-prescription__table">
              <table>
                <thead>
                  <tr>
                    <th>Thuốc</th>
                    <th>Hoạt chất</th>
                    <th>Hàm lượng</th>
                    <th>Đơn vị</th>
                    <th>Số lượng</th>
                    <th>Liều dùng</th>
                    <th>Tần suất</th>
                    <th>Số ngày</th>
                    <th>Đường dùng</th>
                    <th>Hướng dẫn</th>
                    <th>Đơn giá</th>
                    <th>Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {prescription.items.map((item, index) => (
                    <tr key={`${item.drug}-${index}`}>
                      <td><strong>{item.drug}</strong></td>
                      <td>{item.activeIngredient || '—'}</td>
                      <td>{item.strength || '—'}</td>
                      <td>{item.unit ? (medicineUnitLabel[item.unit] || item.unit) : '—'}</td>
                      <td>{item.quantity}</td>
                      <td>{item.dosage || '—'}</td>
                      <td>{item.frequency || '—'}</td>
                      <td>{item.days ?? '—'}</td>
                      <td>{item.route || '—'}</td>
                      <td>{item.instructions || '—'}</td>
                      <td>{item.unitPrice == null ? '—' : money(item.unitPrice)}</td>
                      <td>{money(Number(item.unitPrice || 0) * Number(item.quantity || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={11}>Tổng tiền thuốc</td>
                    <td>{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="clinical-prescription__actions">
            {printError ? <p className="clinical-prescription__error">{printError}</p> : <span />}
            <button
              type="button"
              disabled={prescription.items.length === 0}
              title={prescription.items.length === 0 ? 'Đơn chưa có thuốc để in' : 'In đơn thuốc ra giấy'}
              onClick={() => setPrintError(openPrescriptionPrint(record) ? '' : 'Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ mới, rồi bấm In đơn thuốc lại.')}
            >
              In đơn thuốc
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MedicalHistoryPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<MedicalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [patientId, setPatientId] = useState(searchParams.get('patientId') || '');
  const [doctorId, setDoctorId] = useState('');
  const [detail, setDetail] = useState<MedicalRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await clinicalApi.history({ page, limit, search: search || undefined, from: from || undefined, to: to || undefined, patientId: patientId || undefined, doctorId: doctorId || undefined });
      setItems(result.items);
      setTotal(result.total);
      setError('');
    } catch (requestError) {
      console.error('[MedicalHistoryPage] Không tải được lịch sử khám', requestError);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, from, to, patientId, doctorId]);

  useEffect(() => { void load(); }, [load]);

  function reset() {
    setQuery(''); setFrom(''); setTo(''); setPatientId(''); setDoctorId(''); setPage(1);
  }

  return <main className="manager-page clinical-page">
    <div className="manager-page__heading"><div><h1>{user?.role === 'PATIENT' ? 'Lịch sử khám của tôi' : 'Tra cứu lịch sử khám'}</h1><p>Xem bệnh án, chẩn đoán, đơn thuốc và thông tin thanh toán.</p></div><div className="manager-stat"><span>⌁</span><div><small>Tổng số</small><strong>{loading ? '…' : error ? '—' : total}</strong><em>lần khám</em></div></div></div>
    <section className="manager-card">
      <div className="manager-toolbar"><div className="manager-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm mã phiếu, lịch hẹn hoặc bệnh nhân" /></div><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} title="Từ ngày" /><input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} title="Đến ngày" />{user?.role === 'MANAGER' ? <><input className="clinical-id-filter" type="number" min="1" value={patientId} onChange={(event) => { setPatientId(event.target.value); setPage(1); }} placeholder="ID bệnh nhân" /><input className="clinical-id-filter" type="number" min="1" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setPage(1); }} placeholder="ID bác sĩ" /></> : null}<button className="manager-btn manager-btn--outline" type="button" onClick={reset}>Đặt lại</button></div>
      {loading ? <LoadingState label="Đang tải lịch sử khám..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="Chưa có lịch sử khám" description="Không có hồ sơ khám phù hợp với phạm vi và bộ lọc hiện tại." /> : <><div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Mã phiếu</th><th>Ngày khám</th><th>Bệnh nhân</th><th>Bác sĩ</th><th>Chẩn đoán</th><th>Kết luận</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="manager-code">PK-{String(item.id).padStart(5, '0')}</span><small>LH-{item.appointmentId}</small></td><td>{new Date(item.examDate).toLocaleDateString('vi-VN')}</td><td><strong>{item.patient.name}</strong><small>{item.patient.code}</small></td><td>{item.doctor.name}</td><td>{item.diagnoses.map((diagnosis) => diagnosis.name).join(', ') || '—'}</td><td>{item.conclusion || '—'}</td><td><div className="manager-row-actions"><button type="button" onClick={() => setDetail(item)}>Xem chi tiết</button></div></td></tr>)}</tbody></table></div><ManagerPager page={page} pageSize={limit} total={total} onPage={setPage} /></>}
    </section>
    {detail ? <AdminModal title={`Chi tiết phiếu khám PK-${String(detail.id).padStart(5, '0')}`} onClose={() => setDetail(null)}><div className="clinical-detail"><h3>Thông tin khám</h3><dl><div><dt>Bệnh nhân</dt><dd>{detail.patient.name} ({detail.patient.code})</dd></div><div><dt>Bác sĩ</dt><dd>{detail.doctor.name}</dd></div><div><dt>Ngày khám</dt><dd>{new Date(detail.examDate).toLocaleDateString('vi-VN')}</dd></div>{detail.symptoms ? <div><dt>Triệu chứng</dt><dd>{detail.symptoms}</dd></div> : null}{detail.examResult ? <div><dt>Kết quả khám</dt><dd>{detail.examResult}</dd></div> : null}{detail.conclusion ? <div><dt>Kết luận</dt><dd>{detail.conclusion}</dd></div> : null}{detail.treatment ? <div><dt>Hướng điều trị</dt><dd>{detail.treatment}</dd></div> : null}{detail.followUpDate ? <div><dt>Ngày tái khám</dt><dd>{new Date(detail.followUpDate).toLocaleDateString('vi-VN')}</dd></div> : null}</dl><h3>Chẩn đoán</h3>{detail.diagnoses.length ? <ul>{detail.diagnoses.map((diagnosis) => <li key={diagnosis.id}><b>{diagnosis.code} – {diagnosis.name}</b>{diagnosis.primary ? ' (chính)' : ' (phụ)'}{diagnosis.note ? `: ${diagnosis.note}` : ''}</li>)}</ul> : <p>Chưa có chẩn đoán.</p>}<h3>Đơn thuốc</h3><PrescriptionDetail record={detail} /><h3>Hóa đơn</h3>{detail.invoice ? <p><b>{detail.invoice.id}</b> – {Number(detail.invoice.total).toLocaleString('vi-VN')} đ – {detail.invoice.status}</p> : <p>Chưa có hóa đơn.</p>}</div></AdminModal> : null}
  </main>;
}
