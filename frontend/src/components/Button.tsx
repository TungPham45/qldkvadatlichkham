import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'border-transparent bg-primary-600 text-white hover:bg-primary-700',
  ghost: 'border-line bg-white text-ink',
  danger: 'border-transparent bg-danger text-white',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center rounded-[10px] border px-3.5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
