import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';
import { doctorApi } from '../features/doctor/api';
import { managerApi, type ManagerDoctorGroup, type ManagerScheduleInput } from '../features/manager/api';
import { Button } from '../components/Button';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FilterSelect } from '../components/FilterSelect';
import { LoadingState } from '../components/LoadingState';
import { Modal } from '../components/Modal';
import { PageContainer } from '../components/PageContainer';
import { PageHeader } from '../components/PageHeader';
import { SearchInput } from '../components/SearchInput';
import { SelectField } from '../components/SelectField';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { TextArea } from '../components/TextArea';
import { TextField } from '../components/TextField';
import { WeekPicker } from '../components/WeekPicker';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { DoctorProfile, ScheduleCode, ScheduleItem, Specialty } from '../types';
import { formatDate, formatTime, scheduleLabel, startOfWeek, todayIso } from '../utils/format';

interface ScheduleForm {
  doctorId: string;
  ngayLamViec: string;
  gioBatDau: string;
  gioKetThuc: string;
  thoiLuongMoiCa: string;
  statusCode: ScheduleCode;
  ghiChu: string;
}

function emptyForm(date: string, doctorId = ''): ScheduleForm {
  return { doctorId, ngayLamViec: date, gioBatDau: '07:30', gioKetThuc: '11:30', thoiLuongMoiCa: '30', statusCode: 'APPROVED', ghiChu: '' };
}

export function ManagerSchedulesPage() {
  const [week, setWeek] = useState(startOfWeek(todayIso()));
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [availableDoctors, setAvailableDoctors] = useState<DoctorProfile[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [specialtyId, setSpecialtyId] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [shift, setShift] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [doctors, setDoctors] = useState<ManagerDoctorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [deleteItem, setDeleteItem] = useState<ScheduleItem | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const requestId = useRef(0);
  const rows = doctors.flatMap((doctor) => doctor.schedules.map((item) => ({ ...item, doctorName: doctor.hoTen, specialty: doctor.chuyenKhoa })));

  async function load() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await managerApi.schedules({ week, chuyenKhoaId: specialtyId || undefined, status: status || undefined, q: debouncedQ || undefined, date: date || undefined, shift: shift || undefined });
      if (currentRequest !== requestId.current) return;
      setSummary(response.summary);
      setDoctors(response.doctors);
      setError('');
    } catch (err) {
      if (currentRequest === requestId.current) setError(errorMessage(err));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  async function loadOptions() {
    setOptionsLoading(true);
    try {
      const [specialtyOptions, doctorOptions] = await Promise.all([doctorApi.specialties(), managerApi.doctors()]);
      setSpecialties(specialtyOptions);
      setAvailableDoctors(doctorOptions);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setOptionsLoading(false);
    }
  }

  const latestLoad = useRef(load);
  latestLoad.current = load;

  useEffect(() => { void loadOptions(); }, []);
  useEffect(() => { void load(); }, [week, specialtyId, status, debouncedQ, date, shift]);

  function beginCreate() {
    setEditId(null);
    setActionError('');
    setForm(emptyForm(date || week, availableDoctors[0] ? String(availableDoctors[0].id) : ''));
  }

  function beginEdit(item: ScheduleItem) {
    setEditId(item.id);
    setActionError('');
    setForm({ doctorId: String(item.doctorId), ngayLamViec: item.date.slice(0, 10), gioBatDau: item.startTime.slice(0, 5), gioKetThuc: item.endTime.slice(0, 5), thoiLuongMoiCa: String(item.slotMinutes), statusCode: item.statusCode, ghiChu: item.note || '' });
  }

  function closeDialog() {
    if (busy) return;
    setForm(null);
    setRejectId(null);
    setDeleteItem(null);
    setActionError('');
    setReason('');
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await action();
      setForm(null);
      setRejectId(null);
      setDeleteItem(null);
      setReason('');
      setNotice(success);
      await latestLoad.current();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || busy) return;
    const duration = Number(form.thoiLuongMoiCa);
    const minutes = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
    if (form.gioKetThuc <= form.gioBatDau || duration > minutes(form.gioKetThuc) - minutes(form.gioBatDau)) {
      setActionError('Giờ kết thúc phải sau giờ bắt đầu và đủ thời lượng một lượt khám.');
      return;
    }
    const body: ManagerScheduleInput = { ...form, doctorId: Number(form.doctorId), thoiLuongMoiCa: duration, ghiChu: form.ghiChu.trim() };
    const id = editId;
    await runAction(() => id ? managerApi.updateSchedule(id, body) : managerApi.createSchedule(body), id ? 'Đã cập nhật lịch làm việc.' : 'Đã thêm lịch làm việc.');
  }

  const actionErrorView = actionError ? <p className="text-sm text-danger" role="alert">{actionError}</p> : null;
  const doctorOptions = [...availableDoctors];
  if (form && !doctorOptions.some((item) => String(item.id) === form.doctorId)) {
    const current = doctors.find((item) => String(item.id) === form.doctorId);
    if (current) doctorOptions.push({ id: current.id, hoTen: current.hoTen + ' (ngừng hoạt động)', maBacSi: current.maBacSi, chuyenKhoa: null, email: null, soDienThoai: null, bangCap: null, gioiTinh: null });
  }

  return (
    <PageContainer>
      <PageHeader crumbs={['Admin', 'Lịch làm việc']} title="Quản lý lịch làm việc bác sĩ" description="Thêm, sửa, xóa, tìm kiếm lịch làm việc và phê duyệt đăng ký của bác sĩ." actions={<div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy || loading || !rows.some((item) => item.statusCode === 'PENDING') || (status !== '' && status !== 'PENDING')} onClick={() => void runAction(() => managerApi.bulkApprove(week, specialtyId || undefined, { q: debouncedQ || undefined, date: date || undefined, shift: shift || undefined }), 'Đã phê duyệt các ca chờ trong bộ lọc.')}>Duyệt các ca chờ</Button><Button disabled={busy || optionsLoading || !availableDoctors.length} onClick={beginCreate}>Thêm lịch làm việc</Button></div>} />
      <div className="grid grid-cols-1 gap-3.5 desk:grid-cols-2 wide:grid-cols-4">
        <StatCard label="Tổng ca trong tuần" value={summary.total} />
        <StatCard label="Chờ phê duyệt" value={summary.pending} />
        <StatCard label="Đã phê duyệt" value={summary.approved} />
        <StatCard label="Bị từ chối" value={summary.rejected} />
      </div>
      <div className="flex flex-wrap items-end gap-2.5">
        <WeekPicker week={week} onChange={(value) => { setWeek(value); setDate(''); }} />
        <TextField label="Ngày làm việc" type="date" value={date} onChange={(event) => { setDate(event.target.value); if (event.target.value) setWeek(startOfWeek(event.target.value)); }} />
        <FilterSelect label="Chuyên khoa" value={specialtyId} onChange={setSpecialtyId} options={[{ value: '', label: 'Tất cả' }, ...specialties.map((item) => ({ value: String(item.id), label: item.ten }))]} />
        <FilterSelect label="Ca khám" value={shift} onChange={setShift} options={[{ value: '', label: 'Tất cả' }, { value: 'SANG', label: 'Ca sáng' }, { value: 'CHIEU', label: 'Ca chiều' }]} />
        <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={[{ value: '', label: 'Tất cả' }, { value: 'PENDING', label: 'Chờ duyệt' }, { value: 'APPROVED', label: 'Đã duyệt' }, { value: 'REJECTED', label: 'Từ chối' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Tìm tên, mã bác sĩ hoặc ghi chú" />
      </div>
      {notice ? <p className="text-sm text-primary-700" role="status">{notice}</p> : null}
      {!form && !rejectId && !deleteItem ? actionErrorView : null}
      {!optionsLoading && !availableDoctors.length ? <p className="text-sm text-muted">Chưa có bác sĩ đang hoạt động để thêm lịch. <button type="button" className="text-primary-700" onClick={() => void loadOptions()}>Tải lại danh sách bác sĩ</button></p> : null}
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length === 0 ? <EmptyState title="Không có lịch làm việc" description="Không có lịch khớp bộ lọc. Bạn có thể thêm lịch mới hoặc chọn tuần khác." /> : (
        <div className="rounded-xl border border-line bg-white p-4 shadow-card">
          <DataTable rows={rows} rowKey={(item) => item.id} columns={[
            { key: 'doctor', header: 'Bác sĩ', render: (item) => <div className="font-semibold">{item.doctorName}<div className="text-xs font-normal text-muted">{item.specialty || 'Chưa có chuyên khoa'}</div></div> },
            { key: 'date', header: 'Ngày', render: (item) => formatDate(item.date) },
            { key: 'time', header: 'Giờ làm việc', render: (item) => <span className="whitespace-nowrap">{formatTime(item.startTime)} – {formatTime(item.endTime)}</span> },
            { key: 'duration', header: 'Lượt khám', render: (item) => item.slotMinutes + ' phút' },
            { key: 'status', header: 'Trạng thái', render: (item) => <StatusBadge status={item.statusCode} label={scheduleLabel(item.statusCode)} /> },
            { key: 'note', header: 'Ghi chú', render: (item) => <span className="break-words">{item.note || '—'}</span> },
            { key: 'actions', header: 'Thao tác', render: (item) => <div className="flex flex-wrap gap-2"><Button variant="ghost" disabled={busy} onClick={() => beginEdit(item)}>Sửa</Button><Button variant="danger" disabled={busy} onClick={() => { setActionError(''); setDeleteItem(item); }}>Xóa</Button>{item.statusCode === 'PENDING' ? <><Button disabled={busy} onClick={() => void runAction(() => managerApi.approve(item.id), 'Đã duyệt ca làm việc.')}>Duyệt</Button><Button variant="ghost" disabled={busy} onClick={() => { setActionError(''); setRejectId(item.id); }}>Từ chối</Button></> : null}</div> },
          ]} />
        </div>
      )}
      {form ? (
        <Modal title={editId ? 'Sửa lịch làm việc' : 'Thêm lịch làm việc'} onClose={closeDialog}>
          <form className="flex flex-col gap-3" onSubmit={save}>
            <SelectField label="Bác sĩ" required value={form.doctorId} disabled={busy} onChange={(event) => setForm({ ...form, doctorId: event.target.value })}><option value="">Chọn bác sĩ</option>{doctorOptions.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.hoTen}{doctor.maBacSi ? ' · ' + doctor.maBacSi : ''}</option>)}</SelectField>
            <TextField label="Ngày làm việc" type="date" required value={form.ngayLamViec} disabled={busy} onChange={(event) => setForm({ ...form, ngayLamViec: event.target.value })} />
            <div className="grid grid-cols-2 gap-3"><TextField label="Giờ bắt đầu" type="time" required value={form.gioBatDau} disabled={busy} onChange={(event) => setForm({ ...form, gioBatDau: event.target.value })} /><TextField label="Giờ kết thúc" type="time" required value={form.gioKetThuc} disabled={busy} onChange={(event) => setForm({ ...form, gioKetThuc: event.target.value })} /></div>
            <TextField label="Thời lượng mỗi lượt khám (phút)" type="number" min="1" max="1440" step="1" required value={form.thoiLuongMoiCa} disabled={busy} onChange={(event) => setForm({ ...form, thoiLuongMoiCa: event.target.value })} />
            <SelectField label="Trạng thái" value={form.statusCode} disabled={busy} onChange={(event) => setForm({ ...form, statusCode: event.target.value as ScheduleCode })}><option value="APPROVED">Đã duyệt</option><option value="PENDING">Chờ duyệt</option><option value="REJECTED">Từ chối</option></SelectField>
            <TextArea label="Ghi chú" maxLength={500} value={form.ghiChu} disabled={busy} onChange={(event) => setForm({ ...form, ghiChu: event.target.value })} />
            {actionErrorView}
            <div className="flex justify-end gap-3"><Button type="button" variant="ghost" disabled={busy} onClick={closeDialog}>Hủy</Button><Button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu lịch'}</Button></div>
          </form>
        </Modal>
      ) : null}
      {rejectId ? <Modal title="Từ chối ca làm việc" onClose={closeDialog}><TextArea label="Lý do từ chối" maxLength={500} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />{actionErrorView}<div className="flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={closeDialog}>Hủy</Button><Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void runAction(() => managerApi.reject(rejectId, reason.trim()), 'Đã từ chối ca làm việc.')}>Từ chối</Button></div></Modal> : null}
      {deleteItem ? <Modal title="Xóa lịch làm việc" onClose={closeDialog}><p className="text-sm">Xóa ca ngày {formatDate(deleteItem.date)}, {formatTime(deleteItem.startTime)} – {formatTime(deleteItem.endTime)}? Ca đã có lịch hẹn chưa hoàn thành sẽ không thể xóa.</p>{actionErrorView}<div className="flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={closeDialog}>Hủy</Button><Button variant="danger" disabled={busy} onClick={() => void runAction(() => managerApi.deleteSchedule(deleteItem.id), 'Đã xóa lịch làm việc.')}>Xóa lịch</Button></div></Modal> : null}
    </PageContainer>
  );
}
