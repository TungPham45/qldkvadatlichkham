import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { doctorApi } from '../../features/doctor/api';
import { managerApi, type ManagerDoctorGroup } from '../../features/manager/api';
import { directoryApi, type ManagedDoctor } from '../../features/manager/directory-api';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ScheduleApprovalIcon } from '../../components/ScheduleApprovalIcon';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/auth-store';
import type { ScheduleItem, Specialty } from '../../types';
import { addDays, formatDate, formatTime, initials, scheduleLabel, startOfWeek, todayIso, weekdayLabel } from '../../utils/format';
import { exportCsv } from '../../utils/export-csv';
import '../../styles/schedule-approval.css';

const shifts = [
  { code: 'SANG', label: 'Ca Sáng', start: '07:30', end: '11:30' },
  { code: 'CHIEU', label: 'Ca Chiều', start: '13:30', end: '17:30' },
];

function approvalIssue(item: ScheduleItem, group: ManagerDoctorGroup, doctor?: ManagedDoctor) {
  if (!doctor || doctor.trangThai !== 'Active') return 'Bác sĩ chưa có hồ sơ đang hoạt động';
  if (item.date.slice(0, 10) < todayIso()) return 'Ca đã qua ngày làm việc';
  if (group.schedules.some((other) => other.id !== item.id && other.statusCode !== 'REJECTED' && other.date.slice(0, 10) === item.date.slice(0, 10) && other.startTime.slice(0, 5) < item.endTime.slice(0, 5) && other.endTime.slice(0, 5) > item.startTime.slice(0, 5))) return 'Trùng giờ với ca khác';
  return '';
}

function DoctorAvatar({ id, name }: { id: number; name: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    directoryApi.doctorPhoto(id).then((blob) => {
      if (!active || !blob.type.startsWith('image/')) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return <span className="approval-avatar">{url ? <img src={url} alt={name} /> : initials(name)}</span>;
}

function sentAt(items: ScheduleItem[]) {
  const times = items.map((item) => item.createdAt).filter((value): value is string => Boolean(value));
  const timestamp = times.sort()[times.length - 1];
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function ManagerSchedulesPage() {
  const { user } = useAuth();
  const [week, setWeek] = useState(startOfWeek(todayIso()));
  const [groups, setGroups] = useState<ManagerDoctorGroup[]>([]);
  const [directory, setDirectory] = useState<ManagedDoctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState('');
  const [q, setQ] = useState('');
  const query = useDebouncedValue(q).trim().toLocaleLowerCase('vi-VN');
  const [queueFilter, setQueueFilter] = useState('PENDING');
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const actionLock = useRef(false);
  const mounted = useRef(true);
  const loadedDraftKey = useRef('');
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const doctorFor = (id: number) => directory.find((doctor) => doctor.id === id);
  const filteredGroups = groups.filter((group) => {
    const doctor = doctorFor(group.id);
    if (specialtyId && (group.chuyenKhoaId ?? doctor?.chuyenKhoaId) !== Number(specialtyId)) return false;
    return !query || [group.hoTen, group.maBacSi, String(group.id), group.chuyenKhoa].some((value) => value?.toLocaleLowerCase('vi-VN').includes(query));
  });
  const queue = filteredGroups.filter((group) => !queueFilter || group.schedules.some((item) => item.statusCode === queueFilter));
  const selectedGroup = queue.find((group) => group.id === selectedDoctorId) || queue[0] || null;
  const selectedDoctor = selectedGroup ? doctorFor(selectedGroup.id) : undefined;
  const pendingItems = selectedGroup?.schedules.filter((item) => item.statusCode === 'PENDING') || [];
  const selectedItems = pendingItems.filter((item) => selectedIds.has(item.id));
  const invalidSelected = selectedGroup ? selectedItems.filter((item) => approvalIssue(item, selectedGroup, selectedDoctor)) : [];
  const eligibleGroups = filteredGroups.map((group) => ({ group, items: group.schedules.filter((item) => item.statusCode === 'PENDING' && !approvalIssue(item, group, doctorFor(group.id))) })).filter(({ items }) => items.length > 0);
  const pendingDoctors = groups.filter((group) => group.schedules.some((item) => item.statusCode === 'PENDING')).length;
  const approvedDoctors = groups.filter((group) => group.statusCode === 'APPROVED').length;
  const totalPending = groups.flatMap((group) => group.schedules).filter((item) => item.statusCode === 'PENDING').length;
  const draftKey = `qlpk:approval-draft:${user?.id}:${week}:${selectedGroup?.id}`;

  async function load() {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const [response, doctors, options] = await Promise.all([managerApi.schedules({ week }), managerApi.doctorDirectory(), doctorApi.specialties()]);
      if (!mounted.current || current !== requestId.current) return;
      setGroups(response.doctors);
      setDirectory(doctors);
      setSpecialties(options);
      setError('');
    } catch (err) {
      if (mounted.current && current === requestId.current) setError(errorMessage(err));
    } finally {
      if (mounted.current && current === requestId.current) setLoading(false);
    }
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);
  useEffect(() => { void load(); return () => { requestId.current++; }; }, [week]);
  useEffect(() => {
    const pending = selectedGroup?.schedules.filter((item) => item.statusCode === 'PENDING') || [];
    if (loadedDraftKey.current === draftKey) {
      setSelectedIds((current) => new Set(pending.filter((item) => current.has(item.id)).map((item) => item.id)));
      return;
    }
    loadedDraftKey.current = draftKey;
    setSelectedIds(new Set(pending.filter((item) => selectedGroup && !approvalIssue(item, selectedGroup, doctorFor(selectedGroup.id))).map((item) => item.id)));
    setNote('');
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { ids?: unknown; note?: unknown };
        if (Array.isArray(draft.ids)) {
          const savedIds = draft.ids;
          setSelectedIds(new Set(pending.filter((item) => savedIds.includes(item.id)).map((item) => item.id)));
        }
        if (typeof draft.note === 'string') setNote(draft.note.slice(0, 500));
      }
    } catch { /* A damaged local draft does not prevent reviewing. */ }
  }, [draftKey, groups, directory]);

  function changeWeek(value: string) {
    if (actionLock.current) return;
    const next = startOfWeek(value);
    if (next === week) return;
    requestId.current++;
    setSelectedDoctorId(null);
    setGroups([]);
    setSelectedIds(new Set());
    setNotice('');
    setActionError('');
    setLoading(true);
    setWeek(next);
  }

  function toggle(id: number) {
    if (actionLock.current) return;
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ ids: [...selectedIds], note }));
      setNotice('Đã lưu tạm lựa chọn và phản hồi trên thiết bị này.');
      setActionError('');
    } catch { setActionError('Không thể lưu tạm trên trình duyệt này.'); }
  }

  async function review(decision: 'APPROVED' | 'REJECTED') {
    if (actionLock.current || loading || error || !selectedGroup || !selectedItems.length) return;
    if (decision === 'REJECTED' && note.trim().length < 3) { setActionError('Nhập lý do từ chối ít nhất 3 ký tự trong ô phản hồi cho bác sĩ.'); return; }
    if (decision === 'APPROVED' && invalidSelected.length) { setActionError('Bỏ chọn các ca chưa hợp lệ trước khi phê duyệt.'); return; }
    actionLock.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const result = await managerApi.reviewSchedules({ doctorId: selectedGroup.id, week, scheduleIds: selectedItems.map((item) => item.id), decision, note: note.trim() || undefined });
      try { localStorage.removeItem(draftKey); } catch { /* Review has already succeeded. */ }
      if (!mounted.current) return;
      setNote('');
      setNotice(decision === 'APPROVED' ? `Đã phê duyệt ${result.approved} ca làm việc.` : `Đã từ chối ${result.rejected} ca và lưu phản hồi cho bác sĩ.`);
      await load();
    } catch (err) {
      if (mounted.current) { setActionError(errorMessage(err)); await load(); }
    } finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  }

  async function bulkApprove() {
    if (actionLock.current || loading || error || !eligibleGroups.length) return;
    actionLock.current = true;
    setBusy(true);
    setNotice('');
    setActionError('');
    let approved = 0;
    const failures: string[] = [];
    try {
      for (const { group, items } of eligibleGroups) {
        try {
          const result = await managerApi.reviewSchedules({ doctorId: group.id, week, scheduleIds: items.map((item) => item.id), decision: 'APPROVED' });
          approved += result.approved;
          try { localStorage.removeItem(`qlpk:approval-draft:${user?.id}:${week}:${group.id}`); } catch { /* Keep the completed review. */ }
        } catch (err) { failures.push(`${group.hoTen}: ${errorMessage(err)}`); }
      }
      if (!mounted.current) return;
      if (approved) setNotice(`Đã phê duyệt hàng loạt ${approved} ca hợp lệ.`);
      if (failures.length) setActionError(failures.join(' '));
      await load();
    } finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  }

  function exportWeek() {
    exportCsv(`lich-khoa-${week}.csv`, ['Bác sĩ', 'Mã bác sĩ', 'Chuyên khoa', 'Ngày', 'Bắt đầu', 'Kết thúc', 'Số giờ', 'Trạng thái', 'Ghi chú'], filteredGroups.flatMap((group) => group.schedules.map((item) => [group.hoTen, group.maBacSi, group.chuyenKhoa, formatDate(item.date), formatTime(item.startTime), formatTime(item.endTime), item.hours, scheduleLabel(item.statusCode), item.note])));
    setNotice('Đã xuất lịch làm việc của tuần theo bộ lọc hiện tại.');
  }

  const activeItems = selectedGroup?.schedules.filter((item) => item.statusCode !== 'REJECTED') || [];
  const morning = activeItems.filter((item) => item.shift === 'SANG').length;
  const afternoon = activeItems.filter((item) => item.shift === 'CHIEU').length;
  const otherCount = activeItems.filter((item) => !item.shift).length;
  const hours = activeItems.reduce((sum, item) => sum + item.hours, 0);
  const reviewTime = selectedGroup ? sentAt(selectedGroup.schedules) : '';
  const hasOther = selectedGroup?.schedules.some((item) => !item.shift);
  const rows = hasOther ? [...shifts, { code: 'KHAC', label: 'Ca khác', start: '', end: '' }] : shifts;
  const progress = specialties.map((specialty) => {
    const schedules = groups.filter((group) => (group.chuyenKhoaId ?? doctorFor(group.id)?.chuyenKhoaId) === specialty.id).flatMap((group) => group.schedules);
    return { ...specialty, total: schedules.length, approved: schedules.filter((item) => item.statusCode === 'APPROVED').length };
  }).filter((specialty) => specialty.total > 0);
  const allSchedules = groups.flatMap((group) => group.schedules);
  const percent = allSchedules.length ? Math.round(allSchedules.filter((item) => item.statusCode === 'APPROVED').length * 100 / allSchedules.length) : 0;

  return (
    <main className="schedule-approval">
      <div className="approval-heading">
        <div>
          <h1>Duyệt Đăng Ký Lịch Làm Việc Bác Sĩ</h1>
          <p>Xem xét và phê duyệt hoặc từ chối phiếu đăng ký ca làm việc của bác sĩ các chuyên khoa.</p>
        </div>
        <div className="approval-heading__actions">
          <button
            className="approval-button"
            type="button"
            disabled={loading || busy || Boolean(error) || !filteredGroups.length}
            onClick={exportWeek}
          >
            <ScheduleApprovalIcon name="print" />
            Xuất lịch khoa
          </button>
          <button
            className="approval-button approval-button--primary"
            type="button"
            disabled={loading || busy || Boolean(error) || !eligibleGroups.length}
            onClick={() => void bulkApprove()}
          >
            <ScheduleApprovalIcon name="check" />
            {busy ? 'Đang xử lý…' : 'Phê duyệt hàng loạt ca hợp lệ'}
          </button>
        </div>
      </div>

      <div className="approval-stats">
        <div className="approval-stat">
          <div>
            <p>Tổng đăng ký tuần này</p>
            <strong>{groups.length}</strong><span> Bác sĩ</span>
            <small>{allSchedules.length} ca làm việc đã đăng ký</small>
          </div>
          <span className="approval-stat__icon"><ScheduleApprovalIcon name="calendar" /></span>
        </div>
        <div className="approval-stat approval-stat--pending">
          <div>
            <p>Chờ phê duyệt</p>
            <strong>{pendingDoctors}</strong><span> Phiếu đăng ký</span>
            <small><ScheduleApprovalIcon name="pending" /> {totalPending} ca đang chờ xem xét</small>
          </div>
          <span className="approval-stat__icon"><ScheduleApprovalIcon name="pending" /></span>
        </div>
        <div className="approval-stat approval-stat--approved">
          <div>
            <p>Đã phê duyệt</p>
            <strong>{approvedDoctors}</strong><span> Phiếu đã duyệt</span>
            <small><ScheduleApprovalIcon name="check" /> Lịch đã mở cho bệnh nhân đặt khám</small>
          </div>
          <span className="approval-stat__icon"><ScheduleApprovalIcon name="check" /></span>
        </div>
      </div>

      <section className="approval-filters" aria-label="Bộ lọc đăng ký lịch làm việc">
        <div className="approval-week">
          <div>
            <button type="button" aria-label="Tuần trước" disabled={busy} onClick={() => changeWeek(addDays(week, -7))}>
              <ScheduleApprovalIcon name="previous" />
            </button>
            <ScheduleApprovalIcon name="calendar" />
            <strong>Tuần: {formatDate(week)} - {formatDate(addDays(week, 6))}</strong>
            <button type="button" aria-label="Tuần sau" disabled={busy} onClick={() => changeWeek(addDays(week, 7))}>
              <ScheduleApprovalIcon name="next" />
            </button>
          </div>
          <button
            className="approval-button approval-button--soft"
            type="button"
            disabled={busy}
            onClick={() => changeWeek(todayIso())}
          >
            Tuần này
          </button>
        </div>
        <div className="approval-filter-row">
          <label>
            Chuyên khoa:
            <select value={specialtyId} disabled={busy} onChange={(event) => setSpecialtyId(event.target.value)}>
              <option value="">Tất cả chuyên khoa ({specialties.length})</option>
              {specialties.map((item) => <option key={item.id} value={item.id}>{item.ten}</option>)}
            </select>
          </label>
          <label className="approval-search">
            <ScheduleApprovalIcon name="search" />
            <input
              aria-label="Tìm tên hoặc mã bác sĩ"
              placeholder="Tìm tên hoặc mã bác sĩ…"
              disabled={busy}
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </label>
        </div>
      </section>

      {notice ? <p className="approval-feedback approval-feedback--success" role="status">{notice}</p> : null}
      {actionError ? <p className="approval-feedback approval-feedback--error" role="alert">{actionError}</p> : null}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <div className="approval-workspace">
          {selectedGroup ? (
            <section className="approval-detail">
              <header className="approval-doctor">
                <div className="approval-doctor__identity">
                  <DoctorAvatar key={selectedGroup.id} id={selectedGroup.id} name={selectedGroup.hoTen} />
                  <div>
                    <div className="approval-doctor__name">
                      <h2>{selectedGroup.hoTen}</h2>
                      <span>Mã BS: {selectedGroup.maBacSi || `#${selectedGroup.id}`}</span>
                    </div>
                    <p>
                      <b><ScheduleApprovalIcon name="hospital" /> {selectedGroup.chuyenKhoa || 'Chưa phân chuyên khoa'}</b>
                      {reviewTime ? <span>• &nbsp; Gửi lúc: {reviewTime}</span> : null}
                    </p>
                  </div>
                </div>
                <div className="approval-doctor__summary">
                  <div>
                    <strong>
                      {morning} ca sáng • {afternoon} ca chiều{otherCount ? ` • ${otherCount} ca khác` : ''}
                    </strong>
                    <small>Tổng {Math.round(hours * 10) / 10} giờ làm việc trong tuần</small>
                  </div>
                  <span className={`approval-status approval-status--${selectedGroup.statusCode?.toLowerCase() || 'pending'}`}>
                    <ScheduleApprovalIcon name="dot" />
                    {selectedGroup.statusCode === 'PENDING' ? 'Đang chờ duyệt' : scheduleLabel(selectedGroup.statusCode || '')}
                  </span>
                </div>
              </header>

              <div className="approval-grid-section">
                <div className="approval-section-title">
                  <h3><ScheduleApprovalIcon name="grid" /> Lưới Lịch Đăng Ký Trong Tuần</h3>
                  <div className="approval-legend">
                    <span><i /> Đã đăng ký</span>
                    <span><i className="is-empty" /> Trống / Nghỉ</span>
                  </div>
                </div>
                <div className="approval-grid-wrap">
                  <table className="approval-grid">
                    <thead>
                      <tr>
                        <th>Ca làm việc</th>
                        {days.map((day) => (
                          <th key={day} className={day === todayIso() ? 'is-today' : ''}>
                            <small>{weekdayLabel(day)}</small>
                            {formatDate(day).slice(0, 5)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.code}>
                          <th>
                            <strong>{row.label}</strong>
                            {row.start ? (
                              <>
                                <small>{row.start} - {row.end}</small>
                                <b>4.0h</b>
                              </>
                            ) : <small>Giờ linh hoạt</small>}
                          </th>
                          {days.map((day) => {
                            const items = selectedGroup.schedules.filter(
                              (item) => item.date.slice(0, 10) === day && (row.code === 'KHAC' ? !item.shift : item.shift === row.code),
                            );
                            return (
                              <td key={day}>
                                {items.length ? items.map((item) => {
                                  const issue = approvalIssue(item, selectedGroup, selectedDoctor);
                                  return (
                                    <div
                                      key={item.id}
                                      className={`approval-shift approval-shift--${item.statusCode.toLowerCase()} ${selectedIds.has(item.id) ? 'is-selected' : ''}`}
                                    >
                                      <strong>
                                        {item.statusCode === 'PENDING' ? 'ĐĂNG KÝ CA' : scheduleLabel(item.statusCode).toLocaleUpperCase('vi-VN')}
                                      </strong>
                                      <b>{formatTime(item.startTime)} - {formatTime(item.endTime)}</b>
                                      <small>{selectedGroup.chuyenKhoa || 'Ca làm việc'} · {item.hours}h</small>
                                      {item.note ? <p title={item.note}>{item.note}</p> : null}
                                      {item.statusCode === 'PENDING' ? (
                                        <label
                                          className={`approval-shift__check ${issue ? 'has-issue' : ''}`}
                                          title={issue || 'Ca hợp lệ để duyệt'}
                                        >
                                          <span>{issue ? 'Cần kiểm tra' : 'Hợp lệ'}</span>
                                          <input
                                            type="checkbox"
                                            aria-label={`Chọn ca ${formatDate(day)} ${formatTime(item.startTime)}`}
                                            checked={selectedIds.has(item.id)}
                                            disabled={busy}
                                            onChange={() => toggle(item.id)}
                                          />
                                        </label>
                                      ) : (
                                        <small className="approval-shift__result">
                                          <ScheduleApprovalIcon name={item.statusCode === 'APPROVED' ? 'check' : 'retry'} />
                                          {item.statusCode === 'APPROVED' ? 'Đã phê duyệt' : 'Có thể đăng ký lại'}
                                        </small>
                                      )}
                                    </div>
                                  );
                                }) : <span className="approval-empty-shift">Không đăng ký</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="approval-system-check">
                  <ScheduleApprovalIcon name="info" />
                  <p>
                    <strong>Kiểm tra tự động của hệ thống: </strong>
                    {pendingItems.some((item) => approvalIssue(item, selectedGroup, selectedDoctor))
                      ? 'Có ca đã qua ngày, trùng giờ hoặc bác sĩ chưa hoạt động. Xem các ca được đánh dấu “Cần kiểm tra” trước khi phê duyệt.'
                      : 'Các ca chờ duyệt không trùng giờ, thuộc ngày hiện tại hoặc tương lai và bác sĩ đang hoạt động.'}
                    {' '}Tổng đăng ký hiện tại: {Math.round(hours * 10) / 10} giờ/tuần.
                  </p>
                </div>
              </div>

              <div className="approval-review">
                <label htmlFor="approval-note">
                  <ScheduleApprovalIcon name="feedback" />
                  Ghi chú / Phản hồi của Admin gửi Bác sĩ:
                </label>
                <textarea
                  id="approval-note"
                  maxLength={500}
                  rows={3}
                  disabled={busy || !pendingItems.length}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ghi chú cho bác sĩ (nếu cần điều chỉnh ca hoặc yêu cầu đăng ký lại)…"
                />
                <div className="approval-review__selection">
                  <button
                    className="approval-button"
                    type="button"
                    disabled={busy || !pendingItems.length}
                    onClick={() => setSelectedIds(selectedItems.length === pendingItems.length ? new Set() : new Set(pendingItems.map((item) => item.id)))}
                  >
                    <ScheduleApprovalIcon name="select" />
                    {selectedItems.length === pendingItems.length && pendingItems.length ? 'Bỏ chọn tất cả' : `Chọn tất cả ${pendingItems.length} ca`}
                  </button>
                  <button
                    className="approval-button"
                    type="button"
                    disabled={busy || !pendingItems.length}
                    onClick={saveDraft}
                  >
                    <ScheduleApprovalIcon name="save" />
                    Lưu tạm
                  </button>
                  <span>Đã chọn {selectedItems.length} ca</span>
                </div>
                <div className="approval-review__actions">
                  <button
                    className="approval-button approval-button--danger"
                    type="button"
                    disabled={busy || !selectedItems.length}
                    onClick={() => void review('REJECTED')}
                  >
                    <ScheduleApprovalIcon name="close" />
                    Từ chối / Yêu cầu đăng ký lại
                  </button>
                  <button
                    className="approval-button approval-button--primary"
                    type="button"
                    disabled={busy || !selectedItems.length || Boolean(invalidSelected.length)}
                    onClick={() => void review('APPROVED')}
                  >
                    <ScheduleApprovalIcon name="check" />
                    {busy ? 'Đang xử lý…' : selectedItems.length === pendingItems.length ? 'Duyệt tất cả ca làm việc' : `Duyệt ${selectedItems.length} ca đã chọn`}
                  </button>
                </div>
                {invalidSelected.length ? (
                  <p className="approval-review__hint">
                    {invalidSelected.length} ca được chọn chưa hợp lệ để duyệt. Có thể bỏ chọn hoặc ghi lý do để từ chối.
                  </p>
                ) : null}
                {!pendingItems.length ? (
                  <p className="approval-review__hint">Phiếu đăng ký này đã được xử lý. Chọn phiếu chờ duyệt để tiếp tục.</p>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="approval-detail approval-no-results">
              <span><ScheduleApprovalIcon name="check" /></span>
              <h2>{queueFilter === 'PENDING' ? 'Không có đăng ký chờ duyệt' : 'Không tìm thấy đăng ký'}</h2>
              <p>Chọn tuần, chuyên khoa hoặc thay đổi bộ lọc để xem lịch làm việc.</p>
            </section>
          )}

          <aside className="approval-side">
            <section className="approval-queue">
              <header>
                <h2>
                  <ScheduleApprovalIcon name="hospital" />
                  {queueFilter === 'PENDING' ? 'Danh Sách Chờ Phê Duyệt' : 'Danh Sách Đăng Ký'}
                </h2>
                <span>{queue.length} hồ sơ</span>
              </header>
              <select
                aria-label="Lọc trạng thái đăng ký"
                disabled={busy}
                value={queueFilter}
                onChange={(event) => setQueueFilter(event.target.value)}
              >
                <option value="PENDING">Chờ phê duyệt</option>
                <option value="">Tất cả đăng ký</option>
                <option value="APPROVED">Có ca đã phê duyệt</option>
                <option value="REJECTED">Có ca bị từ chối</option>
              </select>
              <div className="approval-queue__list">
                {queue.map((group) => (
                  <button
                    className={`approval-queue-card ${selectedGroup?.id === group.id ? 'is-active' : ''}`}
                    key={group.id}
                    disabled={busy}
                    type="button"
                    onClick={() => { setSelectedDoctorId(group.id); setActionError(''); }}
                  >
                    <div>
                      <DoctorAvatar id={group.id} name={group.hoTen} />
                      <span>
                        <strong>{group.hoTen}</strong>
                        <small>
                          {group.chuyenKhoa || 'Chưa phân chuyên khoa'}{group.maBacSi ? ` (${group.maBacSi})` : ''}
                        </small>
                      </span>
                      <b>{selectedGroup?.id === group.id ? 'Đang xem' : scheduleLabel(group.statusCode || '')}</b>
                    </div>
                    <footer>
                      <span>
                        {group.schedules.filter((item) => item.statusCode !== 'REJECTED').length} ca
                        {' '}({Math.round(group.schedules.filter((item) => item.statusCode !== 'REJECTED').reduce((sum, item) => sum + item.hours, 0) * 10) / 10}h)
                      </span>
                      <strong>
                        {selectedGroup?.id === group.id ? (
                          <><ScheduleApprovalIcon name="dot" /> Đang xem</>
                        ) : (
                          <>Xem &amp; Duyệt <ScheduleApprovalIcon name="arrow" /></>
                        )}
                      </strong>
                    </footer>
                  </button>
                ))}
              </div>
              {!queue.length ? <p className="approval-queue__empty">Không có hồ sơ theo bộ lọc.</p> : null}
              <div className="approval-queue__bulk">
                <button
                  className="approval-button approval-button--soft"
                  type="button"
                  disabled={busy || !eligibleGroups.length}
                  onClick={() => void bulkApprove()}
                >
                  <ScheduleApprovalIcon name="bulk" />
                  Phê duyệt hàng loạt {eligibleGroups.length} hồ sơ hợp lệ
                </button>
                <small>Đối chiếu ngày làm việc, trạng thái bác sĩ và trùng giờ.</small>
              </div>
            </section>

            <section className="approval-progress">
              <header>
                <h3><ScheduleApprovalIcon name="chart" /> Tiến Độ Duyệt Tuần Này</h3>
                <strong>{percent}%</strong>
              </header>
              {progress.map((specialty) => (
                <div key={specialty.id}>
                  <p><span>{specialty.ten}</span><b>{specialty.approved}/{specialty.total} ca</b></p>
                  <progress max={specialty.total} value={specialty.approved} aria-label={`Tiến độ duyệt ${specialty.ten}`} />
                </div>
              ))}
              {!progress.length ? <p>Chưa có lịch làm việc trong tuần này.</p> : null}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
