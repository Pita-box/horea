import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'icon';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-[var(--color-canvas-white)] hover:brightness-95 focus-visible:outline-[var(--color-action-violet)]',
  ghost:
    'rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-transparent px-5 py-0 text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline-[var(--color-cloud-mist)]',
  outline:
    'rounded-[var(--radius-lg)] border border-[var(--color-slate-text)] bg-transparent px-[5px] py-0 text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline-[var(--color-slate-text)]',
  icon: 'size-10 rounded-[var(--radius-2xl)] bg-transparent p-0 text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline-[var(--color-slate-text)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'inline-flex h-10 items-center justify-center text-sm font-normal leading-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
});
