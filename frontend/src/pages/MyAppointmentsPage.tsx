import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, hasApiErrorCode } from '../api/client';
import { appointmentApi } from '../features/appointment/api';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import type { AppointmentItem } from '../types';
import { appointmentLabel, formatDate, formatTime } from '../utils/format';

export function MyAppointmentsPage() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
            ]}
          />
          <Pagination page={page} pageSize={8} total={total} onPage={setPage} />
        </section>
      ) : null}
    </PageContainer>
  );
}
