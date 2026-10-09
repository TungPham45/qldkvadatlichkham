import type { TextareaHTMLAttributes } from 'react';

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
      <span>{label}</span>
      <textarea className="min-h-24 resize-y rounded-[10px] border border-line bg-white px-3 py-2.5 text-sm font-normal text-ink" {...props} />
    </label>
  );
}
