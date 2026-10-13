import { useEffect, useState } from 'react';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { TextField } from '../TextField';

export function BookingOtpModal({
  phoneMask,
  simulatedCode,
  message,
  busy,
  error,
  cooldownLeft,
  onResend,
  onConfirm,
  onClose,
}: {
  phoneMask: string;
  simulatedCode: string;
  message: string;
  busy: boolean;
  error: string;
  cooldownLeft: number;
  onResend: () => void;
  onConfirm: (maOtp: string) => void;
  onClose: () => void;
}) {
  const [maOtp, setMaOtp] = useState(simulatedCode || '');

  useEffect(() => {
    if (simulatedCode) setMaOtp(simulatedCode);
  }, [simulatedCode]);

  return (
    <Modal title="Xác minh OTP đặt lịch" onClose={() => { if (!busy) onClose(); }}>
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted">
          Hệ thống giả lập gửi mã OTP tới <strong className="text-ink">{phoneMask || 'SĐT người tới khám'}</strong> để xác minh người đặt lịch.
        </p>
        {message ? <p className="rounded-xl bg-[#f3fbf7] px-3 py-2 text-sm text-success">{message}</p> : null}
        {simulatedCode ? (
          <div className="rounded-2xl border border-dashed border-primary-600 bg-primary-50 px-3 py-3 text-center">
            <span className="block text-xs font-semibold uppercase tracking-wide text-primary-700">Mã OTP giả lập</span>
            <strong className="mt-1 block font-mono text-2xl tracking-[0.35em] text-navy-900">{simulatedCode}</strong>
            <span className="mt-1 block text-xs text-muted">Chỉ hiển thị khi chưa kết nối SMS thật</span>
          </div>
        ) : null}
        <TextField
          label="Nhập mã OTP (*)"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={maOtp}
          onChange={(event) => setMaOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6 chữ số"
          autoFocus
          required
        />
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || cooldownLeft > 0}
            onClick={onResend}
          >
            {cooldownLeft > 0 ? `Gửi lại sau ${cooldownLeft}s` : 'Gửi lại mã'}
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Hủy</Button>
            <Button
              type="button"
              disabled={busy || maOtp.length !== 6}
              onClick={() => onConfirm(maOtp)}
            >
              {busy ? 'Đang đặt...' : 'Xác nhận đặt lịch'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
