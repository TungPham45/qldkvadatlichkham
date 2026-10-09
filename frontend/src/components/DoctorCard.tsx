import type { DoctorProfile } from '../types';
import { initials } from '../utils/format';

export function DoctorCard({ doctor, active, onClick }: { doctor: DoctorProfile; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border bg-white p-3 text-left ${active ? 'border-primary-600 shadow-[0_0_0_3px_rgba(29,106,223,.12)]' : 'border-line'}`} onClick={onClick} type="button">
      <div className="flex items-center gap-2.5">
        <div className="grid size-[42px] shrink-0 place-items-center rounded-full bg-primary-50 font-bold text-primary-700">{initials(doctor.hoTen)}</div>
        <div>
          <strong>{doctor.hoTen}</strong>
          <div className="text-[13px] text-muted">{doctor.maBacSi || 'Chưa có mã'} · {doctor.chuyenKhoa?.ten || 'Chưa gán chuyên khoa'}</div>
        </div>
      </div>
    </button>
  );
}
