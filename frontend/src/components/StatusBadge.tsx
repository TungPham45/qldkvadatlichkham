const tone: Record<string, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-primary-50 text-primary-600',
  neutral: 'bg-[#eef2f6] text-[#5d6b80]',
};

export function statusTone(status: string) {
  if (['APPROVED', 'Da duyet', 'Active', 'Da xac nhan', 'Hoan thanh'].includes(status)) return 'success';
  if (['PENDING', 'Cho duyet', 'Cho xac nhan', 'SELECTED'].includes(status)) return 'warning';
  if (['REJECTED', 'Tu choi', 'Huy'].includes(status)) return 'danger';
  if (['Da check-in', 'Dang kham'].includes(status)) return 'info';
  return 'neutral';
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${tone[statusTone(status)]}`}>{label}</span>;
}
