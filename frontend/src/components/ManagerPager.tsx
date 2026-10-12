export function ManagerPager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const groupStart = Math.floor((page - 1) / 4) * 4 + 1;
  const pages = Array.from({ length: Math.min(4, totalPages - groupStart + 1) }, (_, index) => groupStart + index);
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="manager-pager">
      <span>Hiển thị <strong>{start} - {end}</strong> trên tổng số <strong>{total}</strong></span>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</button>
        {pages.map((value) => <button type="button" className={value === page ? 'is-active' : ''} key={value} onClick={() => onPage(value)}>{value}</button>)}
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Sau</button>
      </div>
    </div>
  );
}
