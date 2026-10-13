import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { doctorApi } from '../../features/doctor/api';
import { managerApi, type ManagerDoctorGroup, type ManagerScheduleInput } from '../../features/manager/api';
import type { ManagedDoctor } from '../../features/manager/directory-api';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FilterSelect } from '../../components/FilterSelect';
import { LoadingState } from '../../components/LoadingState';
import { Modal } from '../../components/Modal';
import { PageContainer } from '../../components/PageContainer';
import { PageHeader } from '../../components/PageHeader';
import { SearchInput } from '../../components/SearchInput';
import { SelectField } from '../../components/SelectField';
import { StatCard } from '../../components/StatCard';
import { TextArea } from '../../components/TextArea';
import { TextField } from '../../components/TextField';
import { AdminScheduleLegend, AdminWeeklyScheduleGrid } from '../../components/schedule/AdminWeeklyScheduleGrid';
import { WeekPicker } from '../../components/schedule/WeekPicker';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { ScheduleCode, ScheduleItem, ShiftCode, Specialty } from '../../types';
import { addDays, formatDate, formatTime, initials, startOfWeek, todayIso } from '../../utils/format';

interface ScheduleForm {
  doctorId: string;
  ngayLamViec: string;
  gioBatDau: string;
  gioKetThuc: string;
  thoiLuongMoiCa: string;
  statusCode: ScheduleCode;
  ghiChu: string;
}

function emptyForm(date: string, doctorId = '', shift: ShiftCode | 'KHAC' = 'SANG'): ScheduleForm {
  const times = shift === 'CHIEU' ? ['13:30', '17:30'] : shift === 'KHAC' ? ['18:00', '20:00'] : ['07:30', '11:30'];
  return { doctorId, ngayLamViec: date, gioBatDau: times[0], gioKetThuc: times[1], thoiLuongMoiCa: '30', statusCode: 'APPROVED', ghiChu: '' };
}

export function ManagerSchedulesPage() {
  const [week, setWeek] = useState(startOfWeek(todayIso()));
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [directory, setDirectory] = useState<ManagedDoctor[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [shift, setShift] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [groups, setGroups] = useState<ManagerDoctorGroup[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
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
  const selectedDoctor = directory.find((doctor) => doctor.id === selectedDoctorId) || null;
  const availableDoctors = directory.filter((doctor) => doctor.trangThai === 'Active');
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(week), index));
  const schedulesFor = (doctorId: number) => groups.find((group) => group.id === doctorId)?.schedules || [];
  const search = debouncedQ.trim().toLocaleLowerCase('vi-VN');

  function matchesDoctor(doctor: ManagedDoctor) {
    return [doctor.hoTen, doctor.soChungChiHanhNghe, doctor.chuyenKhoa].some((value) => value?.toLocaleLowerCase('vi-VN').includes(search));
  }

  function matchesSchedule(doctor: ManagedDoctor, item: ScheduleItem) {
    if (date && item.date.slice(0, 10) !== date) return false;
    if (status && item.statusCode !== status) return false;
    if (shift) {
      const start = shift === 'SANG' ? '07:30' : '13:30';
      const end = shift === 'SANG' ? '11:30' : '17:30';
      if (item.startTime.slice(0, 5) >= end || item.endTime.slice(0, 5) <= start) return false;
    }
    return !search || matchesDoctor(doctor) || [item.note, item.date].some((value) => value?.toLocaleLowerCase('vi-VN').includes(search));
  }

  const doctors = directory.map((doctor) => {
    const schedules = schedulesFor(doctor.id);
    const visible = schedules.filter((item) => matchesSchedule(doctor, item));
    return { ...doctor, schedules, visible, totalHours: Math.round(schedules.reduce((sum, item) => sum + item.hours, 0) * 10) / 10 };
  });
  const filteredDoctors = doctors.filter((doctor) => {
    if (specialtyId && doctor.chuyenKhoaId !== Number(specialtyId)) return false;
    if (search && !matchesDoctor(doctor) && !doctor.visible.length) return false;
    return !(date || status || shift) || doctor.visible.length > 0;
  });
  const selectedSchedules = selectedDoctor ? schedulesFor(selectedDoctor.id) : [];
  const displayedSummary = selectedDoctor ? {
    total: selectedSchedules.length,
    pending: selectedSchedules.filter((item) => item.statusCode === 'PENDING').length,
    approved: selectedSchedules.filter((item) => item.statusCode === 'APPROVED').length,
    rejected: selectedSchedules.filter((item) => item.statusCode === 'REJECTED').length,
  } : summary;
  const visibleSchedules = selectedDoctor ? selectedSchedules.filter((item) =>
    (!specialtyId || selectedDoctor.chuyenKhoaId === Number(specialtyId)) && matchesSchedule(selectedDoctor, item),
  ) : [];
  const pending = selectedDoctor
    ? visibleSchedules.filter((item) => item.statusCode === 'PENDING')
    : filteredDoctors.flatMap((doctor) => doctor.visible).filter((item) => item.statusCode === 'PENDING');

  async function load() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      // Retain the full week so filters never make an occupied cell appear empty.
      const response = await managerApi.schedules({ week });
      if (currentRequest !== requestId.current) return;
      setSummary(response.summary);
      setGroups(response.doctors);
      setError('');
    } catch (err) {
      if (currentRequest === requestId.current) setError(errorMessage(err));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  async function loadOptions() {
    setOptionsLoading(true);
    setOptionsError('');
    const [specialtyOptions, doctorOptions] = await Promise.allSettled([doctorApi.specialties(), managerApi.doctorDirectory()]);
    const errors: string[] = [];
    if (specialtyOptions.status === 'fulfilled') setSpecialties(specialtyOptions.value);
    else errors.push('Chuyên khoa: ' + errorMessage(specialtyOptions.reason));
    if (doctorOptions.status === 'fulfilled') {
      setDirectory(doctorOptions.value);
      setSelectedDoctorId((current) => current && doctorOptions.value.some((doctor) => doctor.id === current) ? current : null);
    } else errors.push('Bác sĩ: ' + errorMessage(doctorOptions.reason));
    setOptionsError(errors.join(' '));
    setOptionsLoading(false);
  }

  const latestLoad = useRef(load);
  latestLoad.current = load;
  useEffect(() => { void loadOptions(); }, []);
  useEffect(() => { void load(); }, [week]);

  function beginCreate(doctorId?: number, day?: string, selectedShift: ShiftCode | 'KHAC' = 'SANG') {
    setEditId(null);
    setActionError('');
    setForm(emptyForm(day || date || week, String(doctorId || selectedDoctor?.id || availableDoctors[0]?.id || ''), selectedShift));
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

  function clearFilters() {
    setSpecialtyId('');
    setStatus('');
    setDate('');
    setShift('');
    setQ('');
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    if (busy) return;
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
      await latestLoad.current();
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
    const current = directory.find((item) => String(item.id) === form.doctorId);
    if (current) doctorOptions.push(current);
  }
  const hasFilters = Boolean(search || specialtyId || date || status || shift);
  const canCreate = selectedDoctor ? selectedDoctor.trangThai === 'Active' : availableDoctors.length > 0;
  const hasInactivePending = selectedDoctor
    ? selectedDoctor.trangThai !== 'Active' && pending.length > 0
    : filteredDoctors.some((doctor) => doctor.trangThai !== 'Active' && doctor.visible.some((item) => item.statusCode === 'PENDING'));

  return (
    <PageContainer>
      <PageHeader crumbs={['Admin', 'Lịch làm việc', ...(selectedDoctor ? [selectedDoctor.hoTen] : [])]} title={selectedDoctor ? 'Lịch làm việc · ' + selectedDoctor.hoTen : 'Quản lý lịch làm việc bác sĩ'} description={selectedDoctor ? (selectedDoctor.chuyenKhoa || 'Chưa phân khoa') + (selectedDoctor.soChungChiHanhNghe ? ' · ' + selectedDoctor.soChungChiHanhNghe : '') : 'Chọn một bác sĩ để xem và quản lý lịch làm việc theo tuần.'} actions={<div className="flex flex-wrap gap-2">{selectedDoctor ? <Button variant="ghost" disabled={busy} onClick={() => { setSelectedDoctorId(null); setActionError(''); }}>← Danh sách bác sĩ</Button> : null}<Button disabled={busy || optionsLoading || !canCreate} onClick={() => beginCreate()}>+ Thêm lịch làm việc</Button></div>} />
      <div className="grid grid-cols-1 gap-3.5 desk:grid-cols-2 wide:grid-cols-4">
        <StatCard label="Tổng ca trong tuần" value={displayedSummary.total} />
        <StatCard label="Chờ phê duyệt" value={displayedSummary.pending} />
        <StatCard label="Đã phê duyệt" value={displayedSummary.approved} />
        <StatCard label="Bị từ chối" value={displayedSummary.rejected} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-4 shadow-card">
        <WeekPicker week={week} onChange={(value) => { setWeek(startOfWeek(value)); setDate(''); }} />
        <AdminScheduleLegend />
      </div>
      <div className="flex flex-wrap items-end gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder={selectedDoctor ? 'Tìm ghi chú lịch, tên hoặc mã bác sĩ' : 'Tìm bác sĩ, mã hành nghề hoặc ghi chú lịch'} />
        <TextField label="Ngày làm việc" type="date" value={date} onChange={(event) => { setDate(event.target.value); if (event.target.value) setWeek(startOfWeek(event.target.value)); }} />
        <FilterSelect label="Chuyên khoa" value={specialtyId} onChange={setSpecialtyId} options={[{ value: '', label: 'Tất cả' }, ...specialties.map((item) => ({ value: String(item.id), label: item.ten }))]} />
        <FilterSelect label="Ca khám" value={shift} onChange={setShift} options={[{ value: '', label: 'Tất cả' }, { value: 'SANG', label: 'Ca sáng' }, { value: 'CHIEU', label: 'Ca chiều' }]} />
        <FilterSelect label="Trạng thái" value={status} onChange={setStatus} options={[{ value: '', label: 'Tất cả' }, { value: 'PENDING', label: 'Chờ duyệt' }, { value: 'APPROVED', label: 'Đã duyệt' }, { value: 'REJECTED', label: 'Từ chối' }]} />
        {hasFilters ? <Button variant="ghost" onClick={clearFilters}>Xóa bộ lọc</Button> : null}
        <Button variant="ghost" disabled={busy || loading || !pending.length || hasInactivePending} title={hasInactivePending ? 'Bộ lọc có ca chờ của bác sĩ ngừng hoạt động hoặc đã khóa.' : undefined} onClick={() => void runAction(() => managerApi.bulkApprove(week, specialtyId || undefined, { doctorId: selectedDoctor?.id, q: debouncedQ.trim() || undefined, date: date || undefined, shift: shift || undefined }), 'Đã hoàn tất duyệt các ca chờ theo bộ lọc.')}>Duyệt các ca chờ ({pending.length})</Button>
      </div>
      {hasInactivePending ? <p className="text-xs text-muted" role="status">Chưa thể duyệt theo bộ lọc vì có ca chờ của bác sĩ ngừng hoạt động hoặc đã khóa. Hãy chọn bác sĩ đang hoạt động.</p> : null}
      {notice ? <p className="text-sm text-primary-700" role="status">{notice}</p> : null}
      {!form && !rejectId && !deleteItem ? actionErrorView : null}
      {optionsError ? <ErrorState message={optionsError} onRetry={() => void loadOptions()} /> : null}
      {loading || optionsLoading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : selectedDoctor ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p><strong>{selectedSchedules.length} ca</strong> · {Math.round(selectedSchedules.reduce((sum, item) => sum + item.hours, 0) * 10) / 10} giờ trong tuần{hasFilters ? ' · ' + visibleSchedules.length + ' ca khớp bộ lọc' : ''}</p>
            {selectedDoctor.trangThai !== 'Active' ? <span className="text-muted">Bác sĩ {selectedDoctor.trangThai === 'Locked' ? 'đã khóa tài khoản' : 'ngừng hoạt động'}; bạn vẫn có thể sửa ghi chú hoặc xóa lịch hiện có.</span> : <span className="text-muted">Bấm ô trống để thêm lịch cho ngày và ca đó.</span>}
          </div>
          <AdminWeeklyScheduleGrid days={days} items={selectedSchedules} visibleIds={new Set(visibleSchedules.map((item) => item.id))} busy={busy} canCreate={canCreate} onCreate={(day, selectedShift) => beginCreate(selectedDoctor.id, day, selectedShift || 'KHAC')} onEdit={beginEdit} onDelete={(item) => { setActionError(''); setDeleteItem(item); }} onApprove={(id) => void runAction(() => managerApi.approve(id), 'Đã duyệt ca làm việc.')} onReject={(id) => { setActionError(''); setReason(''); setRejectId(id); }} />
        </>
      ) : filteredDoctors.length ? (
        <section className="rounded-xl border border-line bg-white p-4 shadow-card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Danh sách bác sĩ</h2><span className="text-sm text-muted">{filteredDoctors.length} / {directory.length} bác sĩ · Bấm tên hoặc dòng để mở lịch tuần</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead><tr>{['Bác sĩ', 'Chuyên khoa', 'Trạng thái', 'Lịch tuần này', 'Chờ duyệt', ''].map((label, index) => <th key={index} className="border-b border-line px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted">{label}</th>)}</tr></thead>
              <tbody>{filteredDoctors.map((doctor) => <tr key={doctor.id} className="cursor-pointer hover:bg-primary-50" onClick={() => { setSelectedDoctorId(doctor.id); setActionError(''); setNotice(''); }}>
                <td className="border-b border-line px-3 py-4"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 font-bold text-primary-700" aria-hidden="true">{initials(doctor.hoTen)}</span><div><button type="button" className="text-left text-sm font-semibold text-primary-700 hover:underline">{doctor.hoTen}</button><p className="mt-1 text-xs text-muted">{doctor.soChungChiHanhNghe || 'BS-' + String(doctor.id).padStart(4, '0')}</p></div></div></td>
                <td className="border-b border-line px-3 py-4 text-sm">{doctor.chuyenKhoa || 'Chưa phân khoa'}</td>
                <td className="border-b border-line px-3 py-4 text-sm"><span className={doctor.trangThai === 'Active' ? 'text-success' : 'text-muted'}>{doctor.trangThai === 'Active' ? 'Hoạt động' : doctor.trangThai === 'Locked' ? 'Đã khóa' : 'Ngừng hoạt động'}</span></td>
                <td className="border-b border-line px-3 py-4 text-sm">{doctor.schedules.length ? <><strong>{doctor.schedules.length} ca</strong> · {doctor.totalHours} giờ{hasFilters ? <span className="mt-1 block text-xs text-muted">{doctor.visible.length} ca khớp bộ lọc</span> : null}</> : <span className="text-muted">Chưa có lịch tuần này</span>}</td>
                <td className="border-b border-line px-3 py-4 text-sm">{doctor.schedules.filter((item) => item.statusCode === 'PENDING').length}</td>
                <td className="border-b border-line px-3 py-4 text-right"><span className="whitespace-nowrap text-sm font-semibold text-primary-700">Xem lịch →</span></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : !optionsError ? <EmptyState title={directory.length ? 'Không tìm thấy bác sĩ phù hợp' : 'Chưa có bác sĩ'} description={directory.length ? 'Thử thay đổi từ khóa hoặc xóa bộ lọc để xem toàn bộ bác sĩ.' : 'Danh sách bác sĩ sẽ xuất hiện sau khi thêm hồ sơ bác sĩ.'} /> : null}
      {form ? (
        <Modal title={editId ? 'Sửa lịch làm việc' : 'Thêm lịch làm việc'} onClose={closeDialog}>
          <form className="flex flex-col gap-3" onSubmit={save}>
            <SelectField label="Bác sĩ" required value={form.doctorId} disabled={busy} onChange={(event) => setForm({ ...form, doctorId: event.target.value })}><option value="">Chọn bác sĩ</option>{doctorOptions.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.hoTen}{doctor.soChungChiHanhNghe ? ' · ' + doctor.soChungChiHanhNghe : ''}{doctor.trangThai !== 'Active' ? ' (ngừng hoạt động)' : ''}</option>)}</SelectField>
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
