import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'outline';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-action-violet)] text-[var(--color-canvas-white)] hover:brightness-95 focus-visible:outline-[var(--color-action-violet)]',
  ghost:
    'border border-[var(--color-cloud-mist)] bg-transparent text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline-[var(--color-cloud-mist)]',
  outline:
    'border border-[var(--color-slate-text)] bg-transparent text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline-[var(--color-slate-text)]',
};

export function Button({ className, variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex min-h-10 items-center justify-center rounded-[var(--radius-buttons)] px-5 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
