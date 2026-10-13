import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { initials, roleLabel } from '../utils/format';
import { useAuth } from '../stores/auth-store';
import { NotificationBell } from './NotificationBell';

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

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
