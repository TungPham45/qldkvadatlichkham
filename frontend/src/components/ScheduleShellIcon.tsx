export type ScheduleShellIconName = 'hospital' | 'calendar' | 'clock' | 'patients' | 'doctors' | 'specialties' | 'medicines' | 'diseases' | 'suggestions' | 'accounts' | 'history' | 'overview';

export function ScheduleShellIcon({ name }: { name: ScheduleShellIconName }) {
  const content = {
    hospital: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 12h6M12 9v6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h.1M7 18h2M12 18h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    patients: <><circle cx="12" cy="6" r="3" /><path d="M5 21v-4a7 7 0 0 1 14 0v4M9 14v6M15 14v6M8 21h8" /></>,
    doctors: <><rect x="3" y="7" width="18" height="14" rx="1" /><path d="M8 7V4h8v3M9 14h6M12 11v6" /></>,
    specialties: <><path d="M4 21V3h12v18M16 10h4v11M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1M9 21v-3h3v3" /></>,
    medicines: <><path d="M7 7h10v14H7zM6 3h12v4H6zM9 14h6M12 11v6" /></>,
    diseases: <><rect x="3" y="3" width="14" height="18" rx="1" /><path d="M6 7h8M6 11h5M6 15h3" /><circle cx="18" cy="15" r="2" /><path d="M14 22v-2a4 4 0 0 1 8 0v2" /></>,
    suggestions: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M12 3v4M7 13h.1M17 13h.1M8 17h8M1 11h2M21 11h2" /></>,
    accounts: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    history: <><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" /></>,
    overview: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M9 10h12" /></>,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content[name]}</svg>;
}

export function scheduleNavigationIcon(path: string): ScheduleShellIconName {
  if (path.includes('schedule')) return 'calendar';
  if (path.includes('medicine-suggestions')) return 'suggestions';
  if (path.includes('medicines')) return 'medicines';
  if (path.includes('diseases')) return 'diseases';
  if (path.includes('specialties')) return 'specialties';
  if (path.includes('doctors')) return 'doctors';
  if (path.includes('accounts')) return 'accounts';
  if (path.includes('history')) return 'history';
  if (path.includes('patients') || path.includes('reception')) return 'patients';
  return 'overview';
}
