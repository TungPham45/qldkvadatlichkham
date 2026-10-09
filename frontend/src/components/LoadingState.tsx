export function LoadingState({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="px-4 py-9 text-center text-muted">
      <div className="mx-auto mb-2.5 size-7 animate-spin rounded-full border-[3px] border-[#d7e3f4] border-t-primary-600" />
      <div>{label}</div>
    </div>
  );
}
