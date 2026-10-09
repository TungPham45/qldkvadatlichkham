import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { patientApi, patientProfileChangedEvent } from '../features/patient/api';
import { useAuth } from '../stores/auth-store';
import { hospitalHotline, hospitalName, hospitalSubtitle, initials } from '../utils/format';

export function PatientPortalLayout() {
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.username || '');
  const [menu, setMenu] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    function refreshName() {
      patientApi.me().then((profile) => { if (active) setName(profile.hoTen); })
        .catch(() => { if (active) setName(user?.username || ''); });
    }
    refreshName();
    window.addEventListener(patientProfileChangedEvent, refreshName);
    return () => {
      active = false;
      window.removeEventListener(patientProfileChangedEvent, refreshName);
    };
  }, [user?.username, pathname]);

  useEffect(() => { setProfileMenu(false); }, [pathname]);

  useEffect(() => {
    if (!profileMenu) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) setProfileMenu(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileMenu(false);
        avatarRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenu]);

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
          <div className="relative ml-auto flex items-center gap-2.5" ref={profileMenuRef}>
            <button ref={avatarRef} className="grid size-[42px] shrink-0 cursor-pointer place-items-center rounded-full bg-primary-50 font-bold text-primary-700 focus-visible:outline-2 focus-visible:outline-primary-600" type="button" aria-label="Mở menu tài khoản" aria-expanded={profileMenu} aria-controls="patient-account-menu" onClick={() => { setMenu(false); setProfileMenu((open) => !open); }}>{initials(name)}</button>
            <span className="hidden desk:block">
              <strong className="block">{name}</strong>
              <em className="block text-xs font-normal text-muted not-italic">Bệnh nhân</em>
            </span>
            {profileMenu ? (
              <div id="patient-account-menu" className="absolute top-full right-0 z-30 mt-3 min-w-[210px] rounded-xl border border-line bg-white p-2 shadow-card">
                <Link className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-900 hover:bg-primary-50" to="/patient/profile" onClick={() => setProfileMenu(false)}>Thông tin cá nhân</Link>
                <button className="block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-danger hover:bg-primary-50" type="button" onClick={() => { setProfileMenu(false); void logout(); }}>Đăng xuất</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-5 pt-[22px] pb-10">
        <Outlet />
      </main>
    </div>
  );
}
