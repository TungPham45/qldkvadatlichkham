import { NavLink } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';
import { roleNavigation } from '../features/auth/navigation';
import { hospitalName, hospitalSubtitle } from '../utils/format';

const linkClass = 'flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-[#d5e2f2] hover:bg-white/10 hover:text-white';

export function AppSidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { user, logout } = useAuth();
  if (!user) return null;
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
        <button className={`${linkClass} cursor-pointer border-0 bg-transparent`} onClick={() => logout().then(() => { window.location.href = '/login'; })}>Đăng xuất</button>
      </nav>
      <div className="mt-auto p-4 text-xs text-[#8ea3bd]">Phiên làm việc được bảo vệ</div>
    </aside>
  );
}
