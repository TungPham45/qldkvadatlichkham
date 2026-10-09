import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { StatusBadge } from '../components/StatusBadge';
import { appointmentApi } from '../features/appointment/api';
import { patientApi } from '../features/patient/api';
import type { AppointmentItem, PatientProfile } from '../types';
import { ageLabel, appointmentLabel, formatDate, formatTime, genderLabel, hospitalName } from '../utils/format';

export function PatientDashboardPage() {
  const [patient, setPatient] = useState<PatientProfile | null>(null);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([
      patientApi.me(),
      appointmentApi.mine({ upcoming: true, pageSize: 5 }),
    ]).then(([profile, appointments]) => {
      setPatient(profile);
      setItems(appointments.items);
      setError('');
    }).catch((err) => setError(errorMessage(err))).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <section className="grid grid-cols-1 items-stretch gap-[18px] wide:grid-cols-[1.3fr_0.7fr]">
        <div>
          <span className="mb-2.5 inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">{hospitalName}</span>
          <h1 className="max-w-[560px] text-[28px] font-semibold tracking-tight text-navy-900 desk:text-[34px]">Đặt lịch và theo dõi lịch khám của bạn</h1>
          <p className="mt-2.5 max-w-[560px] leading-relaxed text-[#52637a]">Chọn chuyên khoa, bác sĩ và khung giờ còn trống. Chỉ những ca làm việc đã được duyệt mới mở để đặt.</p>
          <div className="mt-[22px] grid grid-cols-1 gap-3 desk:grid-cols-2">
            <Link className="flex items-start gap-3 rounded-[14px] border border-line bg-white p-3.5 text-inherit shadow-card hover:border-[#c9daf3]" to="/patient/appointments/book">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-[#e7f0ff] font-extrabold text-primary-600">+</span>
              <span><strong className="mb-0.5 block">Đặt khám</strong><span className="text-[13px] leading-snug text-muted">Chọn chuyên khoa, bác sĩ và giờ còn trống.</span></span>
            </Link>
            <Link className="flex items-start gap-3 rounded-[14px] border border-line bg-white p-3.5 text-inherit shadow-card hover:border-[#c9daf3]" to="/patient/appointments">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-[#e7f7ef] font-extrabold text-success">◷</span>
              <span><strong className="mb-0.5 block">Lịch khám</strong><span className="text-[13px] leading-snug text-muted">Xem các lịch hẹn đã đặt và trạng thái.</span></span>
            </Link>
            <a className="flex items-start gap-3 rounded-[14px] border border-line bg-white p-3.5 text-inherit shadow-card hover:border-[#c9daf3]" href="#ho-so">
              <span className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-[#e7f6f8] font-extrabold text-[#0e7490]">•</span>
              <span><strong className="mb-0.5 block">Thông tin của tôi</strong><span className="text-[13px] leading-snug text-muted">Họ tên, liên hệ và bảo hiểm đang lưu trên hồ sơ.</span></span>
            </a>
          </div>
        </div>
        <aside className="flex min-h-[280px] flex-col justify-end rounded-[18px] border border-[#dce8f8] bg-gradient-to-b from-[#eef5ff] to-[#f8fbff] p-4" aria-hidden="true">
          <svg className="h-auto w-full" viewBox="0 0 320 210" fill="none">
            <rect x="24" y="28" width="272" height="154" rx="18" fill="#fff" />
            <rect x="44" y="48" width="92" height="12" rx="6" fill="#d7e6fb" />
            <rect x="44" y="70" width="150" height="8" rx="4" fill="#e8eef6" />
            <rect x="44" y="96" width="70" height="54" rx="12" fill="#e7f1ff" />
            <rect x="126" y="96" width="70" height="54" rx="12" fill="#e7f7ef" />
            <rect x="208" y="96" width="64" height="54" rx="12" fill="#fff4e6" />
            <circle cx="246" cy="62" r="16" fill="#1d6adf" />
            <path d="M246 54v16M238 62h16" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <div className="mt-3 rounded-[14px] border border-line bg-white px-3.5 py-3 text-[13px] text-[#3d4d63]">Lịch chỉ xuất hiện sau khi bác sĩ đăng ký ca và quản lý đã phê duyệt.</div>
        </aside>
      </section>

      {loading ? <LoadingState /> : null}
      {error ? <div className="mt-4"><ErrorState message={error} onRetry={load} /></div> : null}

      {!loading && !error && patient ? (
        <>
          <section className="mt-[18px] rounded-xl border border-line bg-white p-[18px] shadow-card">
            <h2 className="mb-3 text-base font-semibold">Lịch khám sắp tới</h2>
            {items.length === 0 ? (
              <EmptyState title="Chưa có lịch khám" description="Khi bạn đặt được giờ, lịch sẽ hiện tại đây." />
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {items.map((item) => (
                  <article key={item.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-white px-4 py-3.5">
                    <div>
                      <strong>{formatDate(item.ngayHen)} · {formatTime(item.gioBatDau)}</strong>
                      <div className="text-[13px] text-muted">{item.bacSi?.hoTen || 'Bác sĩ'} · {item.bacSi?.chuyenKhoa?.ten || 'Chuyên khoa'}</div>
                      <div className="text-[13px] text-muted">{item.lyDoKham}</div>
                    </div>
                    <StatusBadge status={item.trangThai} label={appointmentLabel(item.trangThai)} />
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="mt-3.5 rounded-xl border border-line bg-white p-[18px] shadow-card" id="ho-so">
            <h2 className="mb-3 text-base font-semibold">Thông tin của tôi</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 desk:grid-cols-2 wide:grid-cols-4">
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Họ tên</span><strong>{patient.hoTen}</strong></div>
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Ngày sinh</span><strong>{formatDate(patient.ngaySinh)}{ageLabel(patient.ngaySinh) ? ` · ${ageLabel(patient.ngaySinh)}` : ''}</strong></div>
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Giới tính</span><strong>{genderLabel(patient.gioiTinh)}</strong></div>
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Điện thoại</span><strong>{patient.soDienThoai || '—'}</strong></div>
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Email</span><strong>{patient.email || '—'}</strong></div>
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Địa chỉ</span><strong>{patient.diaChi || '—'}</strong></div>
              <div className="rounded-xl bg-[#f8fbff] p-3"><span className="mb-1 block text-xs text-muted">Bảo hiểm y tế</span><strong>{patient.soBaoHiemYTe || 'Chưa có'}</strong></div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
