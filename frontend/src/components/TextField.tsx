import type { InputHTMLAttributes } from 'react';

const control = 'rounded-[10px] border border-line bg-white px-3 py-2.5 text-sm font-normal text-ink';

export function TextField({ label, error, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-[13px] font-semibold ${className}`}>
      <span>{label}</span>
      <input className={control} {...props} />
      {error ? <span className="text-[13px] font-normal text-danger">{error}</span> : null}
    </label>
  );
}
