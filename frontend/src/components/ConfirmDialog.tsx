import { Button } from './Button';
import { Modal } from './Modal';

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Xác nhận',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>Hủy</Button>
        <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
