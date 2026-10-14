import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, hasApiErrorCode } from '../../api/client';
import { appointmentApi } from '../../features/appointment/api';
import { Button } from '../../components/Button';
import { DataTable } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PageContainer } from '../../components/PageContainer';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import type { AppointmentItem } from '../../types';
import { appointmentLabel, formatDate, formatTime } from '../../utils/format';
import { clinicalApi, type ReceptionItem } from '../../features/clinical/api';

function progressTime(value?: string | null) {
  if (!value) return 'Chưa thực hiện';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function MyAppointmentsPage() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ReceptionItem | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<AppointmentItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  async function cancelAppointment() {
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setCancelBusy(true); setCancelError('');
    try { await appointmentApi.cancel(cancelTarget.id, cancelReason.trim()); setCancelTarget(null); setCancelReason(''); load(page); }
    catch (err) { setCancelError(errorMessage(err)); }
    finally { setCancelBusy(false); }
  }

  async function openProgress(id: number) {
    setProgressLoading(true);
    setProgressError('');
    try { setProgress(await clinicalApi.reception(id)); }
    catch (err) { setProgressError(errorMessage(err)); }
    finally { setProgressLoading(false); }
  }

  function load(nextPage = page) {
    setLoading(true);
    appointmentApi.mine({ page: nextPage, pageSize: 8 })
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
        setError('');
      })
      .catch((err) => {
        if (hasApiErrorCode(err, 'PATIENT_NOT_FOUND')) { setItems([]); setTotal(0); setError(''); }
        else setError(errorMessage(err));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(page); }, [page]);

  return (
    <PageContainer flush>
      <PageHeader crumbs={['Cổng bệnh nhân', 'Lịch khám']} title="Lịch khám của tôi" actions={<Link to="/patient/appointments/book"><Button>Đặt khám</Button></Link>} />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load(page)} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Chưa có lịch hẹn" description="Các lịch bạn đặt sẽ xuất hiện tại đây." /> : null}
      {!loading && !error && items.length > 0 ? (
        <section className="rounded-xl border border-line bg-white p-[18px] shadow-card">
          <DataTable
            rows={items}
            rowKey={(row) => row.id}
            columns={[
              { key: 'date', header: 'Ngày', render: (row) => formatDate(row.ngayHen) },
              { key: 'time', header: 'Giờ', render: (row) => formatTime(row.gioBatDau) },
              { key: 'doctor', header: 'Bác sĩ', render: (row) => row.bacSi?.hoTen || '—' },
              { key: 'spec', header: 'Chuyên khoa', render: (row) => row.bacSi?.chuyenKhoa?.ten || '—' },
              { key: 'reason', header: 'Lý do', render: (row) => row.lyDoKham || '—' },
              { key: 'status', header: 'Trạng thái', render: (row) => <StatusBadge status={row.trangThai} label={appointmentLabel(row.trangThai)} /> },
              { key: 'progress', header: 'Tiến trình', render: (row) => <Button variant="ghost" onClick={() => void openProgress(row.id)}>Xem chi tiết</Button> },
              { key: 'cancel', header: '', render: (row) => ['Cho xac nhan','Da xac nhan'].includes(row.trangThai) ? <Button variant="ghost" onClick={() => { setCancelTarget(row); setCancelReason(''); setCancelError(''); }}>Hủy lịch</Button> : null },
            ]}
          />
          <Pagination page={page} pageSize={8} total={total} onPage={setPage} />
        </section>
      ) : null}
      {progressLoading ? <Modal title="Tiến trình lượt khám" onClose={() => setProgressLoading(false)}><LoadingState label="Đang tải tiến trình..." /></Modal> : null}
      {progressError ? <Modal title="Không tải được tiến trình" onClose={() => setProgressError('')}><ErrorState message={progressError} /><Button variant="ghost" onClick={() => setProgressError('')}>Đóng</Button></Modal> : null}
      {progress ? (
        <Modal title={`Tiến trình ${progress.code}`} onClose={() => setProgress(null)}>
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <p className="mb-4 text-sm text-muted">{progress.patient.name} · {formatDate(progress.date)} lúc {formatTime(progress.time)}</p>
            {progress.cancellationReason ? <p className="mb-4 rounded-xl border border-danger/20 bg-danger-bg p-3 text-sm text-danger"><strong>Lý do hủy / từ chối:</strong> {progress.cancellationReason}</p> : null}
            <ol className="grid gap-2">
              {[
                ['Đặt lịch', progress.bookedAt],
                ['Tiếp nhận', progress.checkedInAt],
                ['Chờ khám', progress.checkedInAt],
                ['Đang khám', progress.examStartedAt],
                ['Hoàn tất khám', progress.examCompletedAt],
                ['Lập hóa đơn', progress.invoice?.createdAt],
                ['Thanh toán', progress.invoice?.lastPaidAt],
                ['Hoàn tất lượt khám', progress.visitCompletedAt],
              ].map(([label, time]) => (
                <li key={label} className={`flex gap-3 rounded-xl border p-3 ${time ? 'border-[#b9e3d2] bg-success-bg' : 'border-line bg-white'}`}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${time ? 'bg-success text-white' : 'bg-[#edf1f5] text-muted'}`}>{time ? '✓' : '·'}</span>
                  <span><strong className="block text-sm">{label}</strong><small className="text-xs text-muted">{progressTime(time)}</small></span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-xl bg-[#f5f8fb] p-4 text-sm">
              <strong className="block">Thanh toán</strong>
              <span className="mt-1 block text-muted">{progress.invoice ? ({ 'Chua thanh toan': 'Chưa thanh toán', 'Thanh toan mot phan': 'Thanh toán một phần', 'Da thanh toan': 'Đã thanh toán' }[progress.invoice.status] || progress.invoice.status) : 'Chưa có hóa đơn'}</span>
              {progress.invoice ? <span className="mt-1 block">Còn lại: {new Intl.NumberFormat('vi-VN').format(Number(progress.invoice.balance))} ₫</span> : null}
            </div>
          </div>
          <Button variant="ghost" onClick={() => setProgress(null)}>Đóng</Button>
        </Modal>
      ) : null}
      {cancelTarget ? <Modal title="Hủy lịch khám" onClose={() => { if (!cancelBusy) setCancelTarget(null); }}><p className="mb-3 text-sm">Bạn đang hủy lịch ngày {formatDate(cancelTarget.ngayHen)} lúc {formatTime(cancelTarget.gioBatDau)}. Khung giờ sẽ được trả lại sau khi hủy.</p><label className="block text-sm font-semibold">Lý do hủy<textarea className="mt-2 min-h-24 w-full rounded-xl border border-line p-3 font-normal" value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Nhập lý do hủy (ít nhất 3 ký tự)"/></label>{cancelError?<p className="mt-2 text-sm text-danger">{cancelError}</p>:null}<div className="mt-4 flex justify-end gap-2"><Button variant="ghost" disabled={cancelBusy} onClick={()=>setCancelTarget(null)}>Đóng</Button><Button disabled={cancelBusy||cancelReason.trim().length<3} onClick={()=>void cancelAppointment()}>{cancelBusy?'Đang hủy...':'Xác nhận hủy lịch'}</Button></div></Modal>:null}
    </PageContainer>
  );
}
