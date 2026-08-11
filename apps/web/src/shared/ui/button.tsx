import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-zinc-50 hover:bg-zinc-800',
  secondary: 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
