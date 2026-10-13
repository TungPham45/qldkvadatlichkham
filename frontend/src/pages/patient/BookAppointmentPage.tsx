import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, hasApiErrorCode } from '../../api/client';
import { AppointmentSlot } from '../../components/patient/AppointmentSlot';
import { BookingOtpModal } from '../../components/patient/BookingOtpModal';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { PatientPicker } from '../../components/patient/PatientPicker';
import {
  emptyRelativeForm,
  RelativeProfileModal,
  relativeFormFromPatient,
} from '../../components/patient/RelativeProfileModal';
import { SelectField } from '../../components/SelectField';
import { TextArea } from '../../components/TextArea';
import { appointmentApi, type AvailabilityShift, type AvailabilitySlot } from '../../features/appointment/api';
import { doctorApi } from '../../features/doctor/api';
import { patientApi, type RelativeProfileInput } from '../../features/patient/api';
import type { BookablePatient, DoctorProfile, Specialty } from '../../types';
import { addDays, ageLabel, formatDate, formatTime, genderLabel, initials, relationLabel, todayIso, weekdayLabel } from '../../utils/format';

function isSelfPatient(item: BookablePatient) {
  return item.laChuHoSo || item.loaiQuanHe === 'BanThan';
}

function foldName(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + (minute || 0);
}

function groupSlots(slots: AvailabilitySlot[]): AvailabilityShift[] {
  const ordered = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  const bands = [
    { code: 'SANG' as const, label: 'Ca sáng', from: 0, to: 12 * 60 },
    { code: 'CHIEU' as const, label: 'Ca chiều', from: 12 * 60, to: 17 * 60 + 30 },
    { code: 'TOI' as const, label: 'Ca tối', from: 17 * 60 + 30, to: 24 * 60 },
  ];
  return bands.flatMap((band) => {
    const items = ordered.filter((slot) => {
      const start = minutes(slot.start);
      return start >= band.from && start < band.to;
    });
    if (!items.length) return [];
    const durations = new Set(items.map((slot) => minutes(slot.end) - minutes(slot.start)));
    return [{
      code: band.code,
      label: band.label,
      start: items[0].start,
      end: items[items.length - 1].end,
      slotMinutes: durations.size === 1 ? [...durations][0] : null,
      available: items.filter((slot) => slot.available).length,
      total: items.length,
      note: null,
      slots: items,
    }];
  });
}

const shiftTone: Record<AvailabilityShift['code'], string> = {
  SANG: 'bg-[#fff6e8] text-[#9a5b09]',
  CHIEU: 'bg-primary-50 text-primary-700',
  TOI: 'bg-[#eef2f7] text-navy-800',
};

function patientOptionLabel(item: BookablePatient) {
  const relation = relationLabel(item.loaiQuanHe);
  return item.laChuHoSo || item.loaiQuanHe === 'BanThan'
    ? `${item.hoTen} (Bản thân)`
    : `${item.hoTen} (${relation})`;
}

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const [bookablePatients, setBookablePatients] = useState<BookablePatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState('');
  const [bhytFilter, setBhytFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [query, setQuery] = useState('');
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [shifts, setShifts] = useState<AvailabilityShift[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missingProfile, setMissingProfile] = useState(false);
  const [formError, setFormError] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpMask, setOtpMask] = useState('');
  const [otpSimCode, setOtpSimCode] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [relativeModal, setRelativeModal] = useState<'create' | BookablePatient | null>(null);
  const [relativeError, setRelativeError] = useState('');
  const [relativeBusy, setRelativeBusy] = useState(false);

  useEffect(() => {
    Promise.all([patientApi.bookable(), doctorApi.specialties()])
      .then(([patients, specs]) => {
        if (!patients.length) {
          setMissingProfile(true);
          return;
        }
        setBookablePatients(patients);
        const preferred = patients.find((item) => item.laChuHoSo) || patients[0];
        setSelectedPatientId(String(preferred.id));
        setSpecialties(specs);
      })
      .catch((err) => {
        if (hasApiErrorCode(err, 'PATIENT_NOT_FOUND')) setMissingProfile(true);
        else setError(errorMessage(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !selectedPatientId) return;
    const selected = bookablePatients.find((item) => String(item.id) === selectedPatientId);
    if (!selected) return;
    setDoctor(null);
    setDates([]);
    setSlots([]);
    setShifts([]);
    setSlot('');
    doctorApi.bookable(specialtyId || undefined, selected.coBhyt === true ? undefined : false)
      .then((list) => setDoctors(list))
      .catch((err) => setFormError(errorMessage(err)));
  }, [specialtyId, loading, selectedPatientId, bookablePatients]);

  useEffect(() => {
    if (!doctor) return;
    const from = todayIso();
    doctorApi.dates(doctor.id, from, addDays(from, 21))
      .then((response) => {
        setDates(response);
        setDate(response[0] || '');
        setSlot('');
      })
      .catch((err) => setFormError(errorMessage(err)));
  }, [doctor]);

  useEffect(() => {
    if (!doctor || !date) {
      setSlots([]);
      setShifts([]);
      return;
    }
    let active = true;
    setSlots([]);
    setShifts([]);
    setSlot('');
    setSlotsLoading(true);
    appointmentApi.availability(doctor.id, date)
      .then((response) => {
        if (!active) return;
        const next = response.slots ?? [];
        setSlots(next);
        setShifts(response.shifts?.length ? response.shifts : groupSlots(next));
        setSlot('');
      })
      .catch((err) => { if (active) setFormError(errorMessage(err)); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [doctor, date]);

  const patient = useMemo(
    () => bookablePatients.find((item) => String(item.id) === selectedPatientId) || null,
    [bookablePatients, selectedPatientId],
  );

  useEffect(() => {
    if (patient && !patient.coBhyt && bhytFilter === 'yes') setBhytFilter('all');
  }, [patient, bhytFilter]);

  const visibleDoctors = useMemo(() => {
    const keyword = foldName(query.trim());
    return doctors.filter((item) => {
      if (bhytFilter === 'yes' && !item.nhanBhyt) return false;
      if (bhytFilter === 'no' && item.nhanBhyt) return false;
      if (keyword && !foldName(item.hoTen).includes(keyword)) return false;
      return true;
    });
  }, [doctors, query, bhytFilter]);

  const chosenSlot = slots.find((item) => item.start === slot);
  const chosenShift = shifts.find((item) => item.slots.some((itemSlot) => itemSlot.start === slot));
  const patientHasPhone = Boolean(patient?.soDienThoai && /^0\d{9,10}$/.test(patient.soDienThoai));

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setTimeout(() => setOtpCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);

  async function requestOtp() {
    if (!patient) return;
    setOtpBusy(true);
    setOtpError('');
    setFormError('');
    try {
      const response = await appointmentApi.sendOtp(patient.id);
      setOtpMask(response.soDienThoaiMask);
      setOtpSimCode(response.maOtpGiaLap);
      setOtpMessage(response.thongBao);
      setOtpCooldown(60);
      setOtpOpen(true);
    } catch (err) {
      setFormError(errorMessage(err));
      setOtpError(errorMessage(err));
    } finally {
      setOtpBusy(false);
    }
  }

  async function beginBooking() {
    if (!doctor || !date || !slot || !patient) return;
    if (!patientHasPhone) {
      setFormError('Người tới khám chưa có SĐT hợp lệ. Hãy cập nhật số điện thoại để nhận OTP.');
      return;
    }
    if (reason.trim().length < 3) return;
    await requestOtp();
  }

  async function submitWithOtp(maOtp: string) {
    if (!doctor || !date || !slot || !patient) return;
    setBusy(true);
    setOtpError('');
    setFormError('');
    try {
      await appointmentApi.book({
        benhNhanId: patient.id,
        bacSiId: doctor.id,
        ngayHen: date,
        gioHen: slot,
        lyDoKham: reason.trim(),
        maOtp,
      });
      navigate('/patient/appointments');
    } catch (err) {
      setOtpError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openRelativeForm() {
    setRelativeError('');
    setRelativeModal('create');
  }

  async function saveRelative(payload: RelativeProfileInput) {
    if (relativeBusy || !relativeModal) return;
    setRelativeBusy(true);
    setRelativeError('');
    try {
      if (relativeModal === 'create') {
        const created = await patientApi.createRelative(payload);
        setBookablePatients((current) => [...current, created]);
        setSelectedPatientId(String(created.id));
      } else {
        const updated = await patientApi.updateRelative(relativeModal.id, payload);
        setBookablePatients((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedPatientId(String(updated.id));
      }
      setRelativeModal(null);
    } catch (err) {
      setRelativeError(errorMessage(err));
    } finally {
      setRelativeBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (missingProfile) return <section className="rounded-xl border border-line bg-white p-[18px] shadow-card"><h1 className="text-xl font-semibold">Thêm thông tin cá nhân để đặt khám</h1><p className="mt-2 text-muted">Vui lòng tạo hồ sơ của bạn hoặc được liên kết với hồ sơ người thân trước khi chọn lịch khám.</p><Link className="mt-4 inline-block" to="/patient/profile"><Button>Thêm thông tin cá nhân</Button></Link></section>;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 wide:grid-cols-[250px_minmax(0,1fr)_300px]">
      <aside className="rounded-2xl border border-line bg-white p-4 shadow-card wide:sticky wide:top-[90px]">
        <h2 className="mb-3 text-base font-semibold">Thông tin đặt khám</h2>
        <PatientPicker
          label="Người tới khám (*)"
          patients={bookablePatients}
          value={selectedPatientId}
          onChange={setSelectedPatientId}
          onAddRelative={openRelativeForm}
        />
        {patient && !isSelfPatient(patient) ? (
          <div className="mt-2 rounded-xl bg-[#f3fbf7] px-2.5 py-2 text-xs leading-snug text-success">
            Đặt hộ · quan hệ: {relationLabel(patient.loaiQuanHe)}
          </div>
        ) : null}
        <div className="mt-3">
          <InfoRow label="Người khám" value={patient?.hoTen || '—'} />
          <InfoRow label="Quan hệ" value={patient ? relationLabel(patient.loaiQuanHe) : '—'} />
          <InfoRow label="Giới tính" value={genderLabel(patient?.gioiTinh)} />
          <InfoRow label="Tuổi" value={ageLabel(patient?.ngaySinh) || '—'} />
          <InfoRow label="Điện thoại" value={patient?.soDienThoai || '—'} />
          <InfoRow label="Địa chỉ" value={patient?.diaChi || '—'} />
        </div>
        <div className={`mt-3 rounded-xl px-3 py-2.5 ${patient?.coBhyt ? 'bg-[#eef8f2]' : 'bg-[#f5f7fa]'}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted">Bảo hiểm y tế</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${patient?.coBhyt ? 'bg-[#d8f0e3] text-success' : 'bg-[#e8edf3] text-muted'}`}>
              {patient?.coBhyt ? 'Có BHYT' : 'Không BHYT'}
            </span>
          </div>
          {patient?.coBhyt && patient.soBhyt ? (
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[#d7ebe0] pt-2">
              <span className="text-xs text-muted">Số thẻ</span>
              <code className="font-mono text-sm font-semibold tracking-wide text-navy-900">{patient.soBhyt}</code>
            </div>
          ) : null}
          <p className="mt-2 text-xs leading-snug text-muted">
            {patient?.coBhyt
              ? 'Có thể chọn bác sĩ nhận BHYT hoặc khám ngoài BHYT.'
              : 'Chỉ chọn được bác sĩ khám ngoài BHYT (thu phí).'}
          </p>
        </div>
        {patient && !isSelfPatient(patient) ? (
          <button
            type="button"
            className="mt-3 w-full cursor-pointer rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
            onClick={() => { setRelativeError(''); setRelativeModal(patient); }}
          >
            Sửa thông tin người khám
          </button>
        ) : (
          <Link className="mt-3 inline-block font-bold text-primary-600" to="/patient/profile">Sửa thông tin cá nhân</Link>
        )}
        <Link className="mt-2 inline-block font-bold text-primary-600" to="/patient/appointments">Lịch sử đặt khám</Link>
        <div className="mt-3.5 rounded-xl bg-[#fff7eb] p-3 text-[13px] leading-snug text-[#8a5a12]">Chỉ đặt giờ trong ca đã duyệt. Ca cả ngày được tách thành ca sáng và ca chiều, nghỉ 11:30–13:30. Có thể chọn người thân trong danh sách để đặt hộ.</div>
      </aside>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div>
          <h2 className="text-base font-semibold">Chọn bác sĩ và giờ khám</h2>
          <p className="mt-1 text-sm text-muted">{visibleDoctors.length} bác sĩ đang nhận lịch trong 3 tuần tới.</p>
        </div>
        <div className="grid gap-3 desk:grid-cols-3">
          <SelectField
            label="Chuyên khoa"
            value={specialtyId}
            onChange={(event) => setSpecialtyId(event.target.value)}
            aria-label="Lọc theo chuyên khoa"
          >
            <option value="">Tất cả chuyên khoa</option>
            {specialties.map((item) => (
              <option key={item.id} value={String(item.id)}>{item.ten}</option>
            ))}
          </SelectField>
          <SelectField
            label="BHYT"
            value={bhytFilter}
            onChange={(event) => setBhytFilter(event.target.value as 'all' | 'yes' | 'no')}
            aria-label="Lọc theo nhận BHYT"
          >
            <option value="all">Tất cả</option>
            <option value="yes" disabled={!patient?.coBhyt}>Nhận BHYT</option>
            <option value="no">Không BHYT</option>
          </SelectField>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            <span>Tìm bác sĩ theo tên</span>
            <span className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 focus-within:border-primary-600 focus-within:shadow-[0_0_0_3px_rgba(29,106,223,.12)]">
              <span className="text-muted" aria-hidden="true">⌕</span>
              <input
                className="w-full border-0 bg-transparent py-2.5 text-sm font-normal text-ink outline-none"
                value={query}
                placeholder="Nhập tên bác sĩ"
                aria-label="Tìm bác sĩ theo tên"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? <button className="cursor-pointer border-0 bg-transparent px-1 text-xs font-semibold text-muted" type="button" onClick={() => setQuery('')}>Xóa</button> : null}
            </span>
          </label>
        </div>
        {visibleDoctors.length === 0 ? <EmptyState title={query.trim() ? 'Không thấy bác sĩ theo tên này' : 'Chưa có bác sĩ nhận lịch'} description={query.trim() ? 'Thử tên khác hoặc bỏ bớt ký tự. Có thể gõ không dấu.' : 'Chưa có ca làm việc đã duyệt phù hợp bộ lọc này.'} /> : null}
        {visibleDoctors.map((item) => {
          const open = doctor?.id === item.id;
          return (
            <article key={item.id} className={`rounded-[14px] border bg-white p-3.5 ${open ? 'border-[#b9d2f5] shadow-[0_0_0_3px_rgba(29,106,223,.08)]' : 'border-line'}`}>
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">{initials(item.hoTen)}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-[15px]">{item.hoTen}</strong>
                      {item.bangCap ? <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-bold text-primary-700">{item.bangCap}</span> : null}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.nhanBhyt ? 'bg-[#e7f7ef] text-success' : 'bg-[#eef2f7] text-muted'}`}>
                        {item.nhanBhyt ? 'Nhận BHYT' : 'Không BHYT'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[13px] font-semibold text-primary-700">Chuyên khoa: {item.chuyenKhoa?.ten || 'Chưa gán chuyên khoa'}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted">
                      {genderLabel(item.gioiTinh)}
                      {' · '}
                      {item.maBacSi ? `CCHN ${item.maBacSi}` : 'Chưa có số chứng chỉ'}
                    </div>
                  </div>
                </div>
                {!open ? <Button variant="ghost" onClick={() => setDoctor(item)}>Chọn</Button> : <span className="shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">Đang chọn</span>}
              </div>
              {open ? (
                <div className="mt-3.5 flex flex-col gap-3">
                  <dl className="grid grid-cols-1 gap-2 rounded-xl bg-[#f7faff] p-3 text-sm sm:grid-cols-2">
                    <Detail label="Bằng cấp" value={item.bangCap || 'Chưa cập nhật'} />
                    <Detail label="Chuyên khoa" value={item.chuyenKhoa?.ten || 'Chưa gán chuyên khoa'} />
                    <Detail label="Giới tính" value={genderLabel(item.gioiTinh)} />
                    <Detail label="Chứng chỉ hành nghề" value={item.maBacSi || 'Chưa cập nhật'} />
                  </dl>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Chọn ngày khám</h3>
                    <div className="flex gap-2 overflow-auto pb-1">
                      {dates.length === 0 ? <span className="text-[13px] text-muted">Chưa có ngày khám trong 3 tuần tới.</span> : null}
                      {dates.map((itemDate) => (
                        <button key={itemDate} type="button" className={`min-w-[78px] cursor-pointer rounded-xl border px-1.5 py-2 ${date === itemDate ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-white'}`} onClick={() => setDate(itemDate)}>
                          <strong className="block text-sm">{weekdayLabel(itemDate)}</strong>
                          <span className={`block text-xs ${date === itemDate ? 'text-white/80' : 'text-muted'}`}>{formatDate(itemDate).slice(0, 5)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {slotsLoading ? <span className="text-[13px] text-muted">Đang tải khung giờ...</span> : null}
                  {!slotsLoading && date && shifts.length === 0 ? <span className="text-[13px] text-muted">Ngày này không còn giờ có thể đặt.</span> : null}
                  {!slotsLoading ? shifts.map((shift, index) => {
                    const previous = shifts[index - 1];
                    const gap = previous ? minutes(shift.start) - minutes(previous.end) : 0;
                    return (
                      <div key={shift.code}>
                        {previous && gap >= 60 ? (
                          <p className="mb-3 rounded-lg bg-[#f4f7fb] px-3 py-2 text-xs text-muted">Nghỉ giữa ca {formatTime(previous.end)}–{formatTime(shift.start)}. Khoảng này không mở đặt.</p>
                        ) : null}
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${shiftTone[shift.code]}`}>{shift.label}</span>
                            <strong className="text-sm">{formatTime(shift.start)}–{formatTime(shift.end)}</strong>
                          </div>
                          <span className="text-xs font-semibold text-muted">{shift.available} trống / {shift.total} khung</span>
                        </div>
                        <p className="mb-2 text-xs text-muted">{shift.slotMinutes ? `Mỗi lượt khám ${shift.slotMinutes} phút.` : 'Thời lượng từng lượt theo lịch đã duyệt.'}{shift.note ? ` ${shift.note}` : ''}</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {shift.slots.map((itemSlot) => (
                            <AppointmentSlot key={itemSlot.start} start={itemSlot.start} end={itemSlot.end} available={itemSlot.available} active={slot === itemSlot.start} onClick={() => setSlot(itemSlot.start)} />
                          ))}
                        </div>
                      </div>
                    );
                  }) : null}
                  {chosenSlot ? (
                    <p className="rounded-xl bg-[#f3fbf7] px-3 py-2 text-sm text-success">
                      Đang chọn {chosenShift?.label || 'khung giờ'} {formatTime(chosenSlot.start)}–{formatTime(chosenSlot.end)} · {weekdayLabel(date)} {formatDate(date)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {formError ? <div className="text-[13px] text-danger">{formError}</div> : null}
      </section>

      <aside className="rounded-2xl border border-line bg-white p-4 shadow-card wide:sticky wide:top-[90px]">
        <h2 className="mb-3 text-base font-semibold">Tóm tắt lịch khám</h2>
        <ol className="mb-4 flex flex-col gap-3">
          <SummaryStep index={1} done={Boolean(patient)} title="Chọn người tới khám" detail={patient ? patientOptionLabel(patient) : 'Chưa chọn'} />
          <SummaryStep index={2} done={Boolean(doctor)} title="Chọn bác sĩ" detail={doctor ? `${doctor.hoTen}${doctor.bangCap ? ` · ${doctor.bangCap}` : ''}` : 'Chưa chọn'} />
          <SummaryStep index={3} done={Boolean(chosenSlot)} title="Chọn ngày và ca" detail={chosenSlot && date ? `${chosenShift?.label || 'Khung giờ'} · ${weekdayLabel(date)} ${formatDate(date)} · ${formatTime(chosenSlot.start)}–{formatTime(chosenSlot.end)}` : 'Chưa chọn giờ'} />
          <SummaryStep index={4} done={reason.trim().length >= 3 && Boolean(chosenSlot)} title="Xác nhận lý do khám" detail={reason.trim().length >= 3 ? 'Đã nhập lý do' : 'Cần ít nhất 3 ký tự'} />
        </ol>
        {doctor ? (
          <div className="mb-3 rounded-xl bg-[#f7faff] p-3 text-sm">
            <span className="text-[13px] text-muted">Bác sĩ</span>
            <strong className="mt-0.5 block">{doctor.hoTen}</strong>
            <span className="mt-1 block text-[13px] text-muted">{doctor.chuyenKhoa?.ten || 'Chưa gán chuyên khoa'}</span>
            <span className="mt-1 block text-[13px] text-muted">{doctor.bangCap || 'Chưa cập nhật bằng cấp'} · {doctor.maBacSi ? `CCHN ${doctor.maBacSi}` : 'Chưa có số chứng chỉ'}</span>
          </div>
        ) : null}
        {doctor && date && chosenSlot ? (
          <>
            <div className="mb-3 rounded-xl bg-[#f7faff] p-3 text-sm">
              <span className="text-[13px] text-muted">Thời gian</span>
              <strong className="mt-0.5 block">{chosenShift?.label || 'Khung giờ'} · {weekdayLabel(date)} {formatDate(date)}</strong>
              <span className="mt-1 block">{formatTime(chosenSlot.start)} – {formatTime(chosenSlot.end)}{chosenShift?.slotMinutes ? ` · ${chosenShift.slotMinutes} phút` : ''}</span>
            </div>
            <div className="mb-3 rounded-xl bg-[#f7faff] p-3 text-sm">
              <span className="text-[13px] text-muted">Người khám</span>
              <strong className="mt-0.5 block">{patient?.hoTen}</strong>
              <span className="mt-1 block text-[13px] text-muted">{relationLabel(patient?.loaiQuanHe)} · {genderLabel(patient?.gioiTinh)} · {ageLabel(patient?.ngaySinh) || 'Chưa có tuổi'} · BHYT {patient?.coBhyt ? 'có' : 'không'}</span>
            </div>
            <TextArea label="Lý do khám" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mô tả ngắn triệu chứng hoặc nhu cầu khám" />
            {!patientHasPhone ? (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-danger">
                Người tới khám chưa có SĐT hợp lệ. Cập nhật số điện thoại để nhận OTP xác minh.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted">Bước tiếp theo sẽ gửi OTP giả lập tới SĐT người tới khám để xác minh.</p>
            )}
            <div className="mt-3">
              <Button
                className="w-full"
                disabled={!patient || !patientHasPhone || reason.trim().length < 3 || busy || otpBusy}
                onClick={() => { void beginBooking(); }}
              >
                {otpBusy ? 'Đang gửi OTP...' : 'Xác nhận đặt lịch'}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted">Chọn người tới khám, bác sĩ, ngày và một khung giờ còn trống. Ca sáng và ca chiều được tách riêng để dễ đối chiếu giờ nghỉ.</p>
        )}
      </aside>

      {otpOpen && doctor && chosenSlot && patient ? (
        <BookingOtpModal
          phoneMask={otpMask}
          simulatedCode={otpSimCode}
          message={`${otpMessage} Người khám: ${patient.hoTen} · ${chosenShift?.label || 'Khung giờ'} ${formatDate(date)} ${formatTime(chosenSlot.start)}–${formatTime(chosenSlot.end)}.`}
          busy={busy || otpBusy}
          error={otpError}
          cooldownLeft={otpCooldown}
          onResend={() => { void requestOtp(); }}
          onConfirm={(maOtp) => { void submitWithOtp(maOtp); }}
          onClose={() => { if (!busy && !otpBusy) setOtpOpen(false); }}
        />
      ) : null}

      {relativeModal ? (
        <RelativeProfileModal
          key={relativeModal === 'create' ? 'create' : relativeModal.id}
          title={relativeModal === 'create' ? 'Thêm hồ sơ người thân' : 'Sửa hồ sơ người thân'}
          initial={relativeModal === 'create' ? emptyRelativeForm : relativeFormFromPatient(relativeModal)}
          busy={relativeBusy}
          error={relativeError}
          submitLabel={relativeModal === 'create' ? 'Thêm hồ sơ' : 'Lưu thay đổi'}
          onClose={() => { if (!relativeBusy) setRelativeModal(null); }}
          onSubmit={saveRelative}
        />
      ) : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#eef2f7] py-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <strong className="text-right break-words">{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function SummaryStep({ index, done, title, detail }: { index: number; done: boolean; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-primary-600 text-white' : 'bg-[#e8eef6] text-muted'}`}>{index}</span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <span className="text-xs leading-snug text-muted">{detail}</span>
      </span>
    </li>
  );
}
