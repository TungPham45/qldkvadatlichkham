import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage, hasApiErrorCode } from '../api/client';
import { AppointmentSlot } from '../components/AppointmentSlot';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { SearchInput } from '../components/SearchInput';
import { TextArea } from '../components/TextArea';
import { appointmentApi } from '../features/appointment/api';
import { doctorApi } from '../features/doctor/api';
import { patientApi } from '../features/patient/api';
import type { DoctorProfile, PatientProfile, Specialty } from '../types';
import { addDays, ageLabel, formatDate, formatTime, initials, todayIso, weekdayLabel } from '../utils/format';

interface Slot { start: string; end: string; available: boolean }

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [specialtyId, setSpecialtyId] = useState('');
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [query, setQuery] = useState('');
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missingProfile, setMissingProfile] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([patientApi.me(), doctorApi.specialties(), doctorApi.bookable()])
      .then(([profile, specs, list]) => {
        setPatient(profile);
        setSpecialties(specs);
        setDoctors(list);
      })
      .catch((err) => { if (hasApiErrorCode(err, 'PATIENT_NOT_FOUND')) setMissingProfile(true); else setError(errorMessage(err)); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    setDoctor(null);
    setDates([]);
    setSlots([]);
    setSlot('');
    doctorApi.bookable(specialtyId || undefined)
      .then((list) => setDoctors(list))
      .catch((err) => setFormError(errorMessage(err)));
  }, [specialtyId, loading]);

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
      return;
    }
    appointmentApi.availability(doctor.id, date)
      .then((response) => {
        setSlots(response.slots);
        setSlot('');
      })
      .catch((err) => setFormError(errorMessage(err)));
  }, [doctor, date]);

  const visibleDoctors = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return doctors;
    return doctors.filter((item) => item.hoTen.toLowerCase().includes(keyword) || item.chuyenKhoa?.ten?.toLowerCase().includes(keyword));
  }, [doctors, query]);

  const chosenSlot = slots.find((item) => item.start === slot);

  async function submit() {
    if (!doctor || !date || !slot) return;
    setBusy(true);
    setFormError('');
    try {
      await appointmentApi.book({ bacSiId: doctor.id, ngayHen: date, gioHen: slot, lyDoKham: reason.trim() });
      navigate('/patient/appointments');
    } catch (err) {
      setFormError(errorMessage(err));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (missingProfile) return <section className="rounded-xl border border-line bg-white p-[18px] shadow-card"><h1 className="text-xl font-semibold">Thêm thông tin cá nhân để đặt khám</h1><p className="mt-2 text-muted">Vui lòng tạo lại hồ sơ của bạn trước khi chọn lịch khám.</p><Link className="mt-4 inline-block" to="/patient/profile"><Button>Thêm thông tin cá nhân</Button></Link></section>;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="grid grid-cols-1 items-start gap-3.5 wide:grid-cols-[250px_minmax(0,1fr)_280px]">
      <aside className="rounded-2xl border border-line bg-white p-4 shadow-card wide:sticky wide:top-[90px]">
        <h2 className="mb-3 text-base font-semibold">Thông tin đặt khám</h2>
        <div className="flex justify-between gap-2 border-b border-[#eef2f7] py-2 text-sm"><span className="text-muted">Người khám</span><strong>{patient?.hoTen || '—'}</strong></div>
        <div className="flex justify-between gap-2 border-b border-[#eef2f7] py-2 text-sm"><span className="text-muted">Tuổi</span><strong>{ageLabel(patient?.ngaySinh) || '—'}</strong></div>
        <div className="flex justify-between gap-2 border-b border-[#eef2f7] py-2 text-sm"><span className="text-muted">Điện thoại</span><strong>{patient?.soDienThoai || '—'}</strong></div>
        <div className="flex justify-between gap-2 border-b border-[#eef2f7] py-2 text-sm"><span className="text-muted">Bảo hiểm</span><strong>{patient?.soBaoHiemYTe ? 'Có' : 'Không'}</strong></div>
        <Link className="mt-3 inline-block font-bold text-primary-600" to="/patient/appointments">Lịch sử đặt khám</Link>
        <div className="mt-3.5 rounded-xl bg-[#fff7eb] p-3 text-[13px] leading-snug text-[#8a5a12]">Chỉ đặt được giờ nằm trong ca bác sĩ đã được duyệt và chưa có người khác giữ.</div>
      </aside>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <h2 className="text-base font-semibold">Chọn bác sĩ và giờ khám</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`cursor-pointer rounded-full border px-3 py-1.5 font-semibold ${specialtyId === '' ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-white'}`} onClick={() => setSpecialtyId('')}>Tất cả</button>
          {specialties.map((item) => (
            <button key={item.id} type="button" className={`cursor-pointer rounded-full border px-3 py-1.5 font-semibold ${specialtyId === String(item.id) ? 'border-primary-600 bg-primary-600 text-white' : 'border-line bg-white'}`} onClick={() => setSpecialtyId(String(item.id))}>{item.ten}</button>
          ))}
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm bác sĩ hoặc chuyên khoa" />
        {visibleDoctors.length === 0 ? <EmptyState title="Chưa có bác sĩ nhận lịch" description="Chưa có ca làm việc đã duyệt phù hợp bộ lọc này." /> : null}
        {visibleDoctors.map((item) => {
          const open = doctor?.id === item.id;
          return (
            <article key={item.id} className={`rounded-[14px] border bg-white p-3.5 ${open ? 'border-[#b9d2f5] shadow-[0_0_0_3px_rgba(29,106,223,.08)]' : 'border-line'}`}>
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-primary-50 font-bold text-primary-700">{initials(item.hoTen)}</div>
                  <div>
                    <strong>{item.hoTen}</strong>
                    <div className="text-[13px] text-muted">{item.chuyenKhoa?.ten || 'Chưa gán chuyên khoa'}{item.maBacSi ? ` · ${item.maBacSi}` : ''}</div>
                  </div>
                </div>
                {!open ? <Button variant="ghost" onClick={() => setDoctor(item)}>Chọn</Button> : null}
              </div>
              {open ? (
                <div className="mt-3.5 flex flex-col gap-3">
                  <div className="flex gap-2 overflow-auto pb-1">
                    {dates.length === 0 ? <span className="text-[13px] text-muted">Chưa có ngày khám trong 3 tuần tới.</span> : null}
                    {dates.map((itemDate) => (
                      <button key={itemDate} type="button" className={`min-w-[72px] cursor-pointer rounded-xl border px-1.5 py-2 ${date === itemDate ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-line bg-white'}`} onClick={() => setDate(itemDate)}>
                        <strong className="block">{weekdayLabel(itemDate)}</strong>
                        <span className="block text-xs text-muted">{formatDate(itemDate).slice(0, 5)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {date && slots.length === 0 ? <span className="text-[13px] text-muted">Ngày này không còn giờ có thể đặt.</span> : null}
                    {slots.map((itemSlot) => (
                      <AppointmentSlot key={itemSlot.start} start={itemSlot.start} end={itemSlot.end} available={itemSlot.available} active={slot === itemSlot.start} onClick={() => setSlot(itemSlot.start)} />
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
        {formError ? <div className="text-[13px] text-danger">{formError}</div> : null}
      </section>

      <aside className="rounded-2xl border border-line bg-white p-4 shadow-card wide:sticky wide:top-[90px]">
        <h2 className="mb-3 text-base font-semibold">Tóm tắt lịch khám</h2>
        {doctor && date && chosenSlot ? (
          <>
            <div className="mb-3 rounded-xl bg-[#f7faff] p-3">
              <span className="text-[13px] text-muted">Bác sĩ</span>
              <strong className="block">{doctor.hoTen}</strong>
              <span className="text-[13px] text-muted">{doctor.chuyenKhoa?.ten}</span>
            </div>
            <div className="mb-3 rounded-xl bg-[#f7faff] p-3">
              <span className="text-[13px] text-muted">Thời gian</span>
              <strong className="block">{weekdayLabel(date)} {formatDate(date)}</strong>
              <span>{formatTime(chosenSlot.start)} – {formatTime(chosenSlot.end)}</span>
            </div>
            <TextArea label="Lý do khám" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mô tả ngắn triệu chứng hoặc nhu cầu khám" />
            <div className="mt-3">
              <Button className="w-full" disabled={reason.trim().length < 3 || busy} onClick={() => setConfirm(true)}>Xác nhận đặt lịch</Button>
            </div>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted">Chọn bác sĩ, ngày và một khung giờ còn trống để hoàn tất đặt lịch.</p>
        )}
      </aside>

      {confirm && doctor && chosenSlot ? (
        <ConfirmDialog
          title="Xác nhận đặt lịch"
          message={`${doctor.hoTen} · ${formatDate(date)} · ${formatTime(chosenSlot.start)}. ${reason.trim()}`}
          confirmLabel="Đặt lịch"
          busy={busy}
          onConfirm={submit}
          onClose={() => setConfirm(false)}
        />
      ) : null}
    </div>
  );
}
