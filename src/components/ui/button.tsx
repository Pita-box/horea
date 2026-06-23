import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'icon';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  'inline-flex h-10 items-center justify-center text-sm font-normal leading-none transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const variants: Record<ButtonVariant, string> = {
  primary:
    'rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-[var(--color-canvas-white)] hover:brightness-95 focus-visible:outline-[var(--color-action-violet)]',
  ghost:
    'rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-transparent px-5 py-0 text-[var(--color-slate-text)] hover:bg-[var(--color-light-violet)] focus-visible:outline-[var(--color-cloud-mist)]',
  outline:
    'rounded-[var(--radius-lg)] border border-[var(--color-action-violet)] bg-transparent px-5 py-0 text-[var(--color-action-violet)] hover:bg-[var(--color-light-violet)] focus-visible:outline-[var(--color-slate-text)]',
  icon: 'size-10 rounded-[var(--radius-2xl)] bg-transparent p-0 text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline-[var(--color-slate-text)]',
};

/**
 * Třídy tlačítka pro danou variantu — jediný zdroj pravdy sdílený s `Button`.
 * Použij na ne-button prvky stylované jako tlačítko (např. `next/link` `Link`),
 * kde nelze použít přímo komponentu `Button` (renderuje `<button>`).
 */
export function buttonClassName(variant: ButtonVariant = 'primary', className?: string): string {
  return [baseClasses, variants[variant], className].filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClassName(variant, className)} {...props} />;
});
