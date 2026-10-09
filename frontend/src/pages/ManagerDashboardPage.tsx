import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { managerApi, type ManagerDashboard } from '../features/manager/api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';

export function ManagerDashboardPage() {
  const [data, setData] = useState<ManagerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    managerApi.dashboard()
      .then((response) => { setData(response); setError(''); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <PageContainer>
      <PageHeader crumbs={['Admin', 'Tổng quan']} title={data?.manager?.hoTen || 'Bảng điều phối'} description="Số liệu lấy từ lịch làm việc và lịch hẹn trong tuần hiện tại." actions={<div className="flex flex-wrap gap-2"><Link to="/manager/accounts"><Button variant="ghost">Quản lý tài khoản</Button></Link><Link to="/manager/doctor-schedules"><Button>Quản lý lịch làm việc bác sĩ</Button></Link></div>} />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {data ? (
        <div className="grid grid-cols-1 gap-3.5 desk:grid-cols-2 wide:grid-cols-4">
          <StatCard label="Lịch chờ duyệt" value={data.pendingCount} hint="Trong tuần này" />
          <StatCard label="Lịch đã duyệt" value={data.approvedCount} hint="Gồm lịch đang hoạt động" />
          <StatCard label="Bác sĩ có lịch" value={data.doctorsWithSchedule} />
          <StatCard label="Lịch hẹn hôm nay / tuần" value={`${data.appointmentsToday ?? '—'} / ${data.appointmentsWeek ?? '—'}`} />
        </div>
      ) : null}
    </PageContainer>
  );
}
