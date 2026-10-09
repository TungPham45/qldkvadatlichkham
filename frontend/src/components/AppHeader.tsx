import { roleLabel } from '../utils/format';
import { useAuth } from '../stores/auth-store';

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-[5] flex h-[68px] items-center justify-between gap-4 border-b border-line bg-white px-6">
      <div className="flex items-center gap-3">
        <button className="grid size-[38px] cursor-pointer place-items-center rounded-[10px] border border-transparent bg-surface text-navy-900 desk:hidden" onClick={onMenu} aria-label="Mở menu">☰</button>
        <strong>{user ? roleLabel(user.role) : ''}</strong>
      </div>
      <div className="text-right">
        <strong className="block text-sm">{user?.username}</strong>
        <span className="text-xs text-muted">{user ? roleLabel(user.role) : ''}</span>
      </div>
    </header>
  );
}
