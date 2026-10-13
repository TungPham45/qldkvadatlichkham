import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doctorApi } from '../features/doctor/api';
import { initials, roleLabel } from '../utils/format';
import { useAuth } from '../stores/auth-store';
import { NotificationBell } from './NotificationBell';

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role !== 'DOCTOR') return;
    let active = true;
    setDoctorName(user.username);
    doctorApi.me().then((profile) => { if (active) setDoctorName(profile.hoTen || user.username); })
      .catch(() => { if (active) setDoctorName(user.username); });
    return () => { active = false; };
  }, [user?.id, user?.role, user?.username, pathname]);

  useEffect(() => {
    if (user?.role === 'DOCTOR') setOpen(false);
  }, [pathname, user?.role]);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && user?.role === 'DOCTOR') {
        setOpen(false);
        avatarRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, user?.role]);

  if (user?.role === 'MANAGER') {
    const title = pathname.includes('diseases') ? 'Danh mục tên bệnh'
      : pathname.includes('medicines') ? 'Quản lý Thuốc'
      : pathname.includes('medical-history') ? 'Lịch sử khám'
      : pathname.includes('reception') ? 'Tiếp nhận bệnh nhân'
      : pathname.includes('notifications') ? 'Thông báo'
      : pathname.includes('doctor-schedules')
      ? 'Quản lý Lịch khám'
      : pathname.includes('accounts')
        ? 'Quản lý Tài khoản'
        : pathname.includes('doctors')
          ? 'Quản lý Bác sĩ'
          : pathname.includes('specialties')
            ? 'Quản lý Chuyên khoa'
            : 'Quản lý Bệnh nhân';
    return (
      <header className="admin-header">
        <div className="admin-header__crumbs">
          <button type="button" onClick={onMenu} aria-label="Mở menu">☰</button>
          <span>Admin</span><b>/</b><strong>{title}</strong>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><div className="admin-account" ref={menuRef}>
          <button className="admin-account__trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span className="admin-account__avatar">{initials(user.username)}</span>
            <span><strong>{user.username}</strong><small>Quản trị viên</small></span>
            <b aria-hidden="true">⌄</b>
          </button>
          {open ? (
            <div className="admin-account__menu">
              <button type="button" onClick={() => void logout().then(() => navigate('/', { replace: true }))}>Đăng xuất</button>
            </div>
          ) : null}
        </div></div>
      </header>
    );
  }
  if (user?.role === 'DOCTOR') {
    const name = doctorName || user.username;
    return (
      <header className="sticky top-0 z-[5] flex min-h-[68px] items-center justify-between gap-4 border-b border-line bg-white px-5 py-2.5 desk:px-6">
        <div className="flex items-center gap-3">
          <button className="grid size-[38px] cursor-pointer place-items-center rounded-[10px] border border-transparent bg-surface text-navy-900 desk:hidden" type="button" aria-label="Mở menu" onClick={() => { setOpen(false); onMenu(); }}>☰</button>
          <strong className="text-navy-900">Bác sĩ</strong>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button
              ref={avatarRef}
              className="flex cursor-pointer items-center gap-2.5 rounded-full bg-white p-1 text-left focus-visible:outline-2 focus-visible:outline-primary-600"
              type="button"
              aria-label="Mở menu tài khoản bác sĩ"
              aria-expanded={open}
              aria-controls="doctor-account-menu"
              onClick={() => setOpen((value) => !value)}
            >
              <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-primary-50 font-bold text-primary-700">{initials(name)}</span>
              <span className="hidden desk:block">
                <strong className="block text-sm text-navy-900">{name}</strong>
                <span className="block text-xs text-muted">Bác sĩ</span>
              </span>
              <span className="text-muted" aria-hidden="true">⌄</span>
            </button>
            {open ? (
              <div id="doctor-account-menu" className="absolute top-full right-0 z-30 mt-3 min-w-[210px] rounded-xl border border-line bg-white p-2 shadow-card">
                <button className="block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-danger hover:bg-primary-50" type="button" onClick={() => { setOpen(false); void logout().then(() => navigate('/', { replace: true })); }}>Đăng xuất</button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
    );
  }
  return (
    <header className="sticky top-0 z-[5] flex h-[68px] items-center justify-between gap-4 border-b border-line bg-white px-6">
      <div className="flex items-center gap-3">
        <button className="grid size-[38px] cursor-pointer place-items-center rounded-[10px] border border-transparent bg-surface text-navy-900 desk:hidden" onClick={onMenu} aria-label="Mở menu">☰</button>
        <strong>{user ? roleLabel(user.role) : ''}</strong>
      </div>
      <div className="ml-auto"><NotificationBell /></div><div className="text-right">
        <strong className="block text-sm">{user?.username}</strong>
        <span className="text-xs text-muted">{user ? roleLabel(user.role) : ''}</span>
      </div>
    </header>
  );
}
