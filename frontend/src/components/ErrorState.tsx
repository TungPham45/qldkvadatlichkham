import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-9 text-center text-muted">
      <h3 className="mb-1.5 font-semibold text-ink">Không tải được dữ liệu</h3>
      <p>{message}</p>
      {onRetry ? <div className="mt-3"><Button onClick={onRetry}>Thử lại</Button></div> : null}
    </div>
  );
}
