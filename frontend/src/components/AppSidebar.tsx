import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';
import { roleNavigation } from '../features/auth/navigation';
import { clinicalApi } from '../features/clinical/api';
import { doctorApi } from '../features/doctor/api';
import type { DoctorProfile } from '../types';
import { hospitalName, hospitalSubtitle, initials } from '../utils/format';

const linkClass = 'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-[#d5e2f2] hover:bg-white/10 hover:text-white';

function ManagerIcon({ path }: { path: string }) {
  if (path.includes('clinical-services')) return <span aria-hidden="true">❖</span>;
  if (path.includes('medicine-suggestions')) return <span aria-hidden="true">✦</span>;
  if (path.includes('medicines')) return <span aria-hidden="true">⬡</span>;
  if (path.includes('diseases')) return <span aria-hidden="true">✚</span>;
  if (path.includes('reception')) return <span aria-hidden="true">⌁</span>;
  if (path.includes('history')) return <span aria-hidden="true">▤</span>;
  if (path.includes('accounts')) return <span aria-hidden="true">◎</span>;
  if (path.includes('schedules')) return <span aria-hidden="true">▣</span>;
  if (path.includes('patients')) return <span aria-hidden="true">♟</span>;
  if (path.includes('doctors')) return <span aria-hidden="true">♙</span>;
  return <span aria-hidden="true">▦</span>;
}

function DoctorIcon({ path }: { path: string }) {
  if (path.includes('confirmation')) return <span className="doctor-nav-icon" aria-hidden="true">☑</span>;
  if (path.includes('examinations')) return <span className="doctor-nav-icon" aria-hidden="true">♧</span>;
  if (path.includes('schedule')) return <span className="doctor-nav-icon" aria-hidden="true">▣</span>;
  if (path.includes('history')) return <span className="doctor-nav-icon" aria-hidden="true">▤</span>;
  return <span className="doctor-nav-icon" aria-hidden="true">▦</span>;
}

function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function AppSidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [doctorBadges, setDoctorBadges] = useState({ pending: 0, waiting: 0 });

  useEffect(() => {
    if (user?.role !== 'DOCTOR') return;
    let active = true;
    doctorApi.me().then((profile) => { if (active) setDoctorProfile(profile); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'DOCTOR') return;
    let active = true;
    clinicalApi.receptions({ page: 1, limit: 1, date: vietnamToday() })
      .then((result) => { if (active) setDoctorBadges({ pending: result.tabs.pending, waiting: result.tabs.waiting }); })
      .catch(() => { if (active) setDoctorBadges({ pending: 0, waiting: 0 }); });
    return () => { active = false; };
  }, [pathname, user?.role]);

  if (!user) return null;
  if (user.role === 'MANAGER') {
    return (
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__mark">+</span>
          <span><strong>{hospitalName}</strong><small>Hệ thống quản trị</small></span>
        </div>
        <nav>
          {roleNavigation.MANAGER.map((item) => (
            <NavLink end key={item.to} to={item.to} onClick={onNavigate} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <ManagerIcon path={item.to} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__status"><i /> Hệ thống ổn định</div>
      </aside>
    );
  }
  return (
    <aside className={`doctor-sidebar fixed inset-y-0 left-0 z-30 flex h-screen w-[268px] shrink-0 -translate-x-[105%] flex-col overflow-y-auto bg-gradient-to-b from-navy-900 to-navy-950 text-white transition-transform duration-200 desk:sticky desk:top-0 desk:self-start desk:translate-x-0 ${open ? 'translate-x-0' : ''}`}>
      <div className="flex items-center gap-3 px-[18px] pb-[18px] pt-[22px]">
        <div className="grid size-10 place-items-center rounded-[10px] bg-primary-600 font-bold">+</div>
        <div>
          <strong className="block text-sm leading-snug">{hospitalName}</strong>
          <span className="mt-0.5 block text-xs text-[#b7c6da]">{hospitalSubtitle}</span>
        </div>
      </div>
      {user.role === 'DOCTOR' ? (
        <div className="doctor-sidebar-profile">
          <span>{initials(doctorProfile?.hoTen || user.username)}</span>
          <div><strong>{doctorProfile?.hoTen || user.username}</strong><small>{doctorProfile?.chuyenKhoa?.ten || 'Bác sĩ phụ trách'}</small></div>
        </div>
      ) : null}
      <nav className="flex flex-col gap-1 px-3 py-2">
        {roleNavigation[user.role].map((item) => (
          <NavLink
            end={item.to !== '/doctor/examinations'}
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => `${linkClass} ${isActive ? 'bg-white/10 text-white' : ''}`}
          >
            {user.role === 'DOCTOR' ? <DoctorIcon path={item.to} /> : null}
            <span className="doctor-nav-label">{item.label}</span>
            {user.role === 'DOCTOR' && item.to.includes('confirmation') && doctorBadges.pending > 0 ? <b className="doctor-nav-badge">{doctorBadges.pending > 99 ? '99+' : doctorBadges.pending}</b> : null}
            {user.role === 'DOCTOR' && item.to.includes('examinations') && doctorBadges.waiting > 0 ? <b className="doctor-nav-badge is-blue">{doctorBadges.waiting > 99 ? '99+' : doctorBadges.waiting}</b> : null}
          </NavLink>
        ))}
        {user.role !== 'DOCTOR' ? <button className={`${linkClass} cursor-pointer border-0 bg-transparent`} onClick={() => logout().then(() => { window.location.href = '/login'; })}>Đăng xuất</button> : null}
      </nav>
      {user.role === 'DOCTOR' ? (
        <div className="doctor-sidebar-footer"><span><i /> Hệ thống trực tuyến</span><button type="button" onClick={() => logout().then(() => { window.location.href = '/login'; })}>Đăng xuất</button></div>
      ) : <div className="mt-auto p-4 text-xs text-[#8ea3bd]">Phiên làm việc được bảo vệ</div>}
    </aside>
  );
}
