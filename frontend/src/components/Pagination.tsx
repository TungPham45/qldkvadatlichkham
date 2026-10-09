import { Button } from './Button';

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted">{total} bản ghi</span>
      <div className="flex items-center gap-3">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</Button>
        <span>{page}/{pages}</span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau</Button>
      </div>
    </div>
  );
}
