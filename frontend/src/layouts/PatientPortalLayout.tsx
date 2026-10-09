import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { patientApi } from '../features/patient/api';
import { useAuth } from '../stores/auth-store';
import { hospitalHotline, hospitalName, hospitalSubtitle, initials } from '../utils/format';

export function PatientPortalLayout() {
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.username || '');
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    patientApi.me().then((profile) => setName(profile.hoTen)).catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen bg-portal">
      <header className="sticky top-0 z-[8] border-b border-line bg-white shadow-[0_1px_0_rgba(16,42,78,.03)]">
        <div className="relative mx-auto flex min-h-[72px] max-w-[1180px] items-center gap-[22px] px-5 py-2.5">
          <NavLink to="/patient/dashboard" className="flex min-w-0 items-center gap-2.5 desk:min-w-[220px]" onClick={() => setMenu(false)}>
            <span className="grid size-10 place-items-center rounded-[10px] bg-primary-600 font-bold text-white">+</span>
            <span>
              <strong className="block text-sm text-navy-900">{hospitalName}</strong>
              <em className="block text-xs font-normal text-muted not-italic">{hospitalSubtitle}</em>
            </span>
          </NavLink>
          <button className="ml-auto grid size-[38px] cursor-pointer place-items-center rounded-[10px] border border-transparent bg-surface text-navy-900 desk:hidden" type="button" aria-label="Mở menu" onClick={() => setMenu((open) => !open)}>☰</button>
          <nav className={`${menu ? 'flex' : 'hidden'} absolute top-[72px] right-3 left-3 z-20 flex-col rounded-[14px] border border-line bg-white p-2 shadow-card desk:static desk:flex desk:flex-1 desk:flex-row desk:gap-1.5 desk:border-0 desk:bg-transparent desk:p-0 desk:shadow-none`}>
            <NavLink end to="/patient/dashboard" onClick={() => setMenu(false)} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? 'bg-primary-50 text-primary-700' : 'text-[#3d4d63] hover:bg-primary-50 hover:text-primary-700'}`}>Trang chủ</NavLink>
            <NavLink to="/patient/appointments/book" onClick={() => setMenu(false)} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? 'bg-primary-50 text-primary-700' : 'text-[#3d4d63] hover:bg-primary-50 hover:text-primary-700'}`}>Đặt khám</NavLink>
            <NavLink end to="/patient/appointments" onClick={() => setMenu(false)} className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? 'bg-primary-50 text-primary-700' : 'text-[#3d4d63] hover:bg-primary-50 hover:text-primary-700'}`}>Lịch khám</NavLink>
          </nav>
          {hospitalHotline ? <a className="text-sm font-bold whitespace-nowrap text-primary-700" href={`tel:${hospitalHotline.replace(/\s/g, '')}`}>Hotline {hospitalHotline}</a> : null}
          <div className="ml-auto flex items-center gap-2.5">
            <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-primary-50 font-bold text-primary-700">{initials(name)}</span>
            <span className="hidden desk:block">
              <strong className="block">{name}</strong>
              <em className="block text-xs font-normal text-muted not-italic">Bệnh nhân</em>
            </span>
            <button className="cursor-pointer rounded-full border border-line bg-white px-3 py-2 font-semibold text-navy-900" type="button" onClick={() => { void logout(); }}>Đăng xuất</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 pt-[22px] pb-10">
        <Outlet />
      </main>
    </div>
  );
}
