import type { SelectHTMLAttributes } from 'react';

export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
      <span>{label}</span>
      <select className="rounded-[10px] border border-line bg-white px-3 py-2.5 text-sm font-normal text-ink" {...props}>{children}</select>
    </label>
  );
}
