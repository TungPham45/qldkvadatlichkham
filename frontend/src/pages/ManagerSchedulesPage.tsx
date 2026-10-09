import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { doctorApi } from '../features/doctor/api';
import { managerApi, type ManagerDoctorGroup } from '../features/manager/api';
import { Button } from '../components/Button';
import { DoctorCard } from '../components/DoctorCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FilterSelect } from '../components/FilterSelect';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { TextArea } from '../components/TextArea';
import { WeekPicker } from '../components/WeekPicker';
import { WeeklyScheduleGrid } from '../components/WeeklyScheduleGrid';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { Specialty } from '../types';
import { addDays, scheduleLabel, startOfWeek, todayIso } from '../utils/format';

export function ManagerSchedulesPage() {
  const [week, setWeek] = useState(startOfWeek(todayIso()));
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0 });
  const [doctors, setDoctors] = useState<ManagerDoctorGroup[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(week), index));

  function load() {
    setLoading(true);
    managerApi.schedules({ week, chuyenKhoaId: specialtyId || undefined, status: status || undefined, q: debouncedQ || undefined })
    .then((response) => {
      setSummary(response.summary);
      setDoctors(response.doctors);
      setSelectedId((current) => current && response.doctors.some((item) => item.id === current) ? current : response.doctors[0]?.id ?? null);
      setError('');
    }).catch((err) => setError(errorMessage(err))).finally(() => setLoading(false));
  }

  useEffect(() => {
    doctorApi.specialties().then((response) => setSpecialties(response)).catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [week, specialtyId, status, debouncedQ]);

  const selected = doctors.find((item) => item.id === selectedId) || null;

  async function approve(id: number) {
    await managerApi.approve(id);
    load();
  }

  async function reject() {
    if (!rejectId) return;
    setBusy(true);
    try {
      await managerApi.reject(rejectId, reason.trim());
      setRejectId(null);
      setReason('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function bulk() {
    setBusy(true);
    try {
      await managerApi.bulkApprove(week, specialtyId || undefined);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader crumbs={['Quản lý', 'Duyệt lịch']} title="Duyệt đăng ký lịch làm việc" description="Chỉ ca đã duyệt mới được dùng để mở slot đặt lịch." actions={<Button disabled={busy} onClick={bulk}>Phê duyệt các ca chờ trong bộ lọc</Button>} />
      <div className="grid grid-cols-1 gap-3.5 desk:grid-cols-2 wide:grid-cols-4">
        <StatCard label="Tổng đăng ký tuần này" value={summary.total} />
        <StatCard label="Chờ phê duyệt" value={summary.pending} />
        <StatCard label="Đã phê duyệt" value={summary.approved} />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <WeekPicker week={week} onChange={setWeek} />
        <FilterSelect label="Chuyên khoa" value={specialtyId} onChange={setSpecialtyId} options={[{ value: '', label: 'Tất cả' }, ...specialties.map((item) => ({ value: String(item.id), label: item.ten }))]} />
        <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={[{ value: '', label: 'Tất cả' }, { value: 'PENDING', label: 'Chờ duyệt' }, { value: 'APPROVED', label: 'Đã duyệt' }, { value: 'REJECTED', label: 'Từ chối' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Tìm bác sĩ" />
      </div>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && doctors.length === 0 ? <EmptyState title="Không có đăng ký" description="Không có lịch làm việc khớp bộ lọc của tuần này." /> : null}
      {!loading && doctors.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 wide:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-2.5">
            {doctors.map((item) => (
              <div key={item.id}>
                <DoctorCard
                  active={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                  doctor={{ id: item.id, hoTen: item.hoTen, maBacSi: item.maBacSi, chuyenKhoa: item.chuyenKhoa ? { id: 0, ten: item.chuyenKhoa } : null, email: null, soDienThoai: null, bangCap: null, gioiTinh: null }}
                />
                <div className="mx-2 mt-1 mb-2.5 text-[13px] text-muted">{item.totalShifts} ca · {item.totalHours} giờ {item.statusCode ? <StatusBadge status={item.statusCode} label={scheduleLabel(item.statusCode)} /> : null}</div>
              </div>
            ))}
          </div>
          <div>
            {selected ? <WeeklyScheduleGrid days={days} items={selected.schedules} selected={new Set()} mode="review" onApprove={approve} onReject={setRejectId} /> : null}
          </div>
        </div>
      ) : null}
      {rejectId ? (
        <Modal title="Từ chối ca làm việc" onClose={() => setRejectId(null)}>
          <TextArea label="Lý do từ chối" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setRejectId(null)}>Đóng</Button>
            <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={reject}>Từ chối</Button>
          </div>
        </Modal>
      ) : null}
    </PageContainer>
  );
}
