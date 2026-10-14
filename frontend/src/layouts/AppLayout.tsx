import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { AppSidebar } from '../components/AppSidebar';
import '../styles/admin.css';
import '../styles/schedule-shell.css';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const scheduleRole = pathname === '/manager/doctor-schedules' ? 'admin' : pathname === '/doctor/schedule' ? 'doctor' : '';
  return (
    <div className={`flex min-h-screen${scheduleRole ? ` schedule-shell schedule-shell--${scheduleRole}` : ''}`}>
      <AppSidebar open={open} onNavigate={() => setOpen(false)} />
      {open ? <div className="fixed inset-0 z-20 bg-black/35 desk:hidden" onClick={() => setOpen(false)} /> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onMenu={() => setOpen((value) => !value)} />
        <Outlet />
      </div>
    </div>
  );
}
