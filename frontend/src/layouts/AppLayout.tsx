import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { AppSidebar } from '../components/AppSidebar';
import '../styles/admin.css';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen items-start bg-[#f8fafc]">
      <AppSidebar open={open} onNavigate={() => setOpen(false)} />
      {open ? <div className="fixed inset-0 z-20 bg-black/35 desk:hidden" onClick={() => setOpen(false)} /> : null}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppHeader onMenu={() => setOpen((value) => !value)} />
        <Outlet />
      </div>
    </div>
  );
}

