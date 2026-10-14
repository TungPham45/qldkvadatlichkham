import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';
import { roleNavigation } from '../features/auth/navigation';
import { doctorApi } from '../features/doctor/api';
import type { DoctorProfile } from '../types';
import { hospitalName, hospitalSubtitle, initials } from '../utils/format';
import { ScheduleShellIcon, scheduleNavigationIcon } from './ScheduleShellIcon';

const linkClass = 'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-[#d5e2f2] hover:bg-white/10 hover:text-white';

function ManagerIcon({ path }: { path: string }) {
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

export function AppSidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const schedulePage = pathname === '/manager/doctor-schedules' || pathname === '/doctor/schedule';

  useEffect(() => {
    if (pathname !== '/doctor/schedule' || user?.role !== 'DOCTOR') return;
    let active = true;
    doctorApi.me().then((profile) => { if (active) setDoctorProfile(profile); }).catch(() => {});
    return () => { active = false; };
  }, [pathname, user?.id, user?.role]);

  if (!user) return null;
  if (schedulePage && (user.role === 'MANAGER' || user.role === 'DOCTOR')) {
    const isDoctor = user.role === 'DOCTOR';
    const items = [...roleNavigation[user.role]];
    if (!isDoctor) {
      const scheduleIndex = items.findIndex((item) => item.to === '/manager/doctor-schedules');
      if (scheduleIndex >= 0) items.splice(2, 0, ...items.splice(scheduleIndex, 1));
    }
    return (
      <aside className={`schedule-sidebar ${open ? 'is-open' : ''}`}>
        <div className="schedule-sidebar__brand">
          <span className="schedule-sidebar__mark"><ScheduleShellIcon name="hospital" /></span>
          <span><strong>{hospitalName}</strong><small>{isDoctor ? 'Cổng thông tin bác sĩ' : 'AEGIS CLINICAL HEALTH'}</small></span>
        </div>
        {isDoctor ? (
          <div className="schedule-sidebar__profile">
            <span className="schedule-sidebar__avatar">{initials(doctorProfile?.hoTen || user.username)}</span>
            <span><strong>{doctorProfile?.hoTen || user.username}</strong><small>{doctorProfile?.chuyenKhoa?.ten || 'Bác sĩ'}</small></span>
          </div>
        ) : null}
        <nav aria-label={isDoctor ? 'Điều hướng bác sĩ' : 'Điều hướng quản trị'}>
          {items.map((item) => (
            <NavLink end key={item.to} to={item.to} onClick={onNavigate} className={({ isActive }) => isActive ? 'is-active' : ''}>
              <ScheduleShellIcon name={scheduleNavigationIcon(item.to)} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="schedule-sidebar__status"><i />{isDoctor ? 'Cổng thông tin bác sĩ' : 'Hệ thống ổn định (LIVE)'}</div>
      </aside>
    );
  }
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
    <aside className={`fixed inset-y-0 left-0 z-30 flex h-screen w-[268px] shrink-0 -translate-x-[105%] flex-col bg-gradient-to-b from-navy-900 to-navy-950 text-white transition-transform duration-200 desk:sticky desk:top-0 desk:translate-x-0 ${open ? 'translate-x-0' : ''}`}>
      <div className="flex items-center gap-3 px-[18px] pb-[18px] pt-[22px]">
        <div className="grid size-10 place-items-center rounded-[10px] bg-primary-600 font-bold">+</div>
        <div>
          <strong className="block text-sm leading-snug">{hospitalName}</strong>
          <span className="mt-0.5 block text-xs text-[#b7c6da]">{hospitalSubtitle}</span>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-2">
        {roleNavigation[user.role].map((item) => (
          <NavLink
            end
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => `${linkClass} ${isActive ? 'bg-white/10 text-white' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        {user.role !== 'DOCTOR' ? <button className={`${linkClass} cursor-pointer border-0 bg-transparent`} onClick={() => logout().then(() => { window.location.href = '/login'; })}>Đăng xuất</button> : null}
      </nav>
      <div className="mt-auto p-4 text-xs text-[#8ea3bd]">Phiên làm việc được bảo vệ</div>
    </aside>
  );
}
