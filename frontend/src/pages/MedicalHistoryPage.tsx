import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { AdminModal } from '../components/AdminModal';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { ManagerPager } from '../components/ManagerPager';
import { clinicalApi, type MedicalRecord } from '../features/clinical/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuth } from '../stores/auth-store';

const limit = 10;

export function MedicalHistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<MedicalRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [patientId, setPatientId] = useState('');
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
      {loading ? <LoadingState label="Đang tải lịch sử khám..." /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyState title="Chưa có lịch sử khám" description="Không có hồ sơ khám phù hợp với phạm vi và bộ lọc hiện tại." /> : <><div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>Mã phiếu</th><th>Ngày khám</th>{user?.role !== 'PATIENT' ? <th>Bệnh nhân</th> : null}<th>Bác sĩ</th><th>Chẩn đoán</th><th>Kết luận</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><span className="manager-code">PK-{String(item.id).padStart(5, '0')}</span><small>LH-{item.appointmentId}</small></td><td>{new Date(item.examDate).toLocaleDateString('vi-VN')}</td>{user?.role !== 'PATIENT' ? <td><strong>{item.patient.name}</strong><small>{item.patient.code}</small></td> : null}<td>{item.doctor.name}</td><td>{item.diagnoses.map((diagnosis) => diagnosis.name).join(', ') || '—'}</td><td>{item.conclusion || '—'}</td><td><div className="manager-row-actions"><button type="button" onClick={() => setDetail(item)}>Xem chi tiết</button></div></td></tr>)}</tbody></table></div><ManagerPager page={page} pageSize={limit} total={total} onPage={setPage} /></>}
    </section>
    {detail ? <AdminModal title={`Chi tiết phiếu khám PK-${String(detail.id).padStart(5, '0')}`} onClose={() => setDetail(null)}><div className="clinical-detail"><h3>Thông tin khám</h3><dl><div><dt>Bệnh nhân</dt><dd>{detail.patient.name} ({detail.patient.code})</dd></div><div><dt>Bác sĩ</dt><dd>{detail.doctor.name}</dd></div><div><dt>Ngày khám</dt><dd>{new Date(detail.examDate).toLocaleDateString('vi-VN')}</dd></div>{detail.symptoms ? <div><dt>Triệu chứng</dt><dd>{detail.symptoms}</dd></div> : null}{detail.examResult ? <div><dt>Kết quả khám</dt><dd>{detail.examResult}</dd></div> : null}{detail.conclusion ? <div><dt>Kết luận</dt><dd>{detail.conclusion}</dd></div> : null}{detail.treatment ? <div><dt>Hướng điều trị</dt><dd>{detail.treatment}</dd></div> : null}{detail.followUpDate ? <div><dt>Ngày tái khám</dt><dd>{new Date(detail.followUpDate).toLocaleDateString('vi-VN')}</dd></div> : null}</dl><h3>Chẩn đoán</h3>{detail.diagnoses.length ? <ul>{detail.diagnoses.map((diagnosis) => <li key={diagnosis.id}><b>{diagnosis.code} – {diagnosis.name}</b>{diagnosis.primary ? ' (chính)' : ' (phụ)'}{diagnosis.note ? `: ${diagnosis.note}` : ''}</li>)}</ul> : <p>Chưa có chẩn đoán.</p>}<h3>Đơn thuốc</h3>{detail.prescription ? <><p>Trạng thái: {detail.prescription.status}</p><div className="clinical-drugs">{detail.prescription.items.map((item, index) => <div key={index}><b>{item.drug} {item.strength}</b><span>SL: {item.quantity}; {item.dosage || ''} {item.frequency || ''} {item.instructions || ''}</span></div>)}</div></> : <p>Không có đơn thuốc.</p>}<h3>Hóa đơn</h3>{detail.invoice ? <p><b>{detail.invoice.id}</b> – {Number(detail.invoice.total).toLocaleString('vi-VN')} đ – {detail.invoice.status}</p> : <p>Chưa có hóa đơn.</p>}</div></AdminModal> : null}
  </main>;
}
