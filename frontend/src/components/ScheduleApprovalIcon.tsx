export type ScheduleApprovalIconName = 'print' | 'check' | 'calendar' | 'pending' | 'info' | 'feedback' | 'save' | 'select' | 'close' | 'grid' | 'chart' | 'search' | 'arrow' | 'previous' | 'next' | 'hospital' | 'bulk' | 'retry' | 'dot';

export function ScheduleApprovalIcon({ name }: { name: ScheduleApprovalIconName }) {
  const content = {
    print: <><path d="M7 8V3h10v5M7 16H4V9h16v7h-3M7 13h10v8H7zM17 11h.1" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m7.5 12 3 3 6-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h.1M7 18h2M12 18h2" /></>,
    pending: <><path d="M9 4H5v17h14v-8M9 3h6v4H9z" /><circle cx="17" cy="8" r="5" /><path d="M17 5v3l2 1M8 12h4M8 16h4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.1" /></>,
    feedback: <><path d="M3 5h12M3 9h10M3 13h7m3 5 6-6 3 3-6 6-4 1z" /></>,
    save: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
    select: <><path d="m3 5 2 2 3-4M11 5h10M3 12l2 2 3-4M11 12h10m-18 7 2 2 3-4M11 19h10" /></>,
    close: <><path d="m5 5 14 14M19 5 5 19" /></>,
    grid: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M8 4v16M13 4v16M18 4v16" /></>,
    chart: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9M12 12l-6 7" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
    previous: <><path d="m15 5-7 7 7 7" /></>,
    next: <><path d="m9 5 7 7-7 7" /></>,
    hospital: <><rect x="5" y="3" width="15" height="15" rx="1" /><path d="M2 7v14h14M9 10h7M12.5 6.5v7" /></>,
    bulk: <><path d="M3 5h10M3 12h8M3 19h7m5-14 2 2 4-4m-6 14 6 6m0-6-6 6" /></>,
    retry: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" /></>,
    dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  };

  return (
    <svg className="approval-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {content[name]}
    </svg>
  );
}
