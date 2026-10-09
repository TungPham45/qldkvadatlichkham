import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { doctorApi } from '../features/doctor/api';
import { scheduleApi } from '../features/schedule/api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { WeeklyScheduleGrid } from '../components/WeeklyScheduleGrid';
import type { DoctorProfile, ScheduleItem } from '../types';
import { addDays, startOfWeek, todayIso } from '../utils/format';

export function DoctorDashboardPage() {
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const week = startOfWeek(todayIso());
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));

  function load() {
    setLoading(true);
    Promise.all([
      doctorApi.me(),
      scheduleApi.mine(week),
    ]).then(([profile, schedules]) => {
      setDoctor(profile);
      setItems(schedules.items);
      setSummary(schedules.summary);
      setError('');
    }).catch((err) => setError(errorMessage(err))).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <PageContainer>
      <PageHeader crumbs={['Bác sĩ', 'Tổng quan']} title={doctor ? doctor.hoTen : 'Tổng quan'} description={doctor?.chuyenKhoa?.ten || 'Chuyên khoa'} actions={<Link to="/doctor/schedule"><Button>Đăng ký lịch làm việc</Button></Link>} />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error ? (
        <>
          <div className="grid grid-cols-1 gap-3.5 desk:grid-cols-2 wide:grid-cols-4">
            <StatCard label="Ca đã đăng ký trong tuần" value={summary.total} />
            <StatCard label="Chờ duyệt" value={summary.pending} />
            <StatCard label="Đã duyệt" value={summary.approved} />
            <StatCard label="Mã bác sĩ" value={doctor?.maBacSi || '—'} />
          </div>
          <WeeklyScheduleGrid days={days} items={items} selected={new Set()} mode="review" />
        </>
      ) : null}
    </PageContainer>
  );
}
