import { IconAlertCircle, IconBulb, IconCancel, type IconProps } from '@tabler/icons-react';
import type { ComponentType, HTMLAttributes } from 'react';

/**
 * Notice / Alert — sdílená in-page hláška (NE toast notifikace).
 *
 * Jediný zdroj pravdy pro vzhled in-page hlášek napříč webem. Tři varianty
 * (pravidla viz `.kiro/steering/design-system.md` › „Notice / Alert"):
 *  - `neutral` (general): IconBulb, rámeček i pozadí `--color-dark`, text bílý.
 *  - `warning`: IconAlertCircle, rámeček `--color-border-yellow`,
 *    pozadí `--color-bg-yellow`, text `--color-brown`.
 *  - `error`: IconCancel, rámeček `--color-red`, pozadí bílé, text `--color-red`.
 *
 * Pozn.: toto se NETÝKÁ toast notifikací (ty mají vlastní komponentu/styl).
 */
type NoticeVariant = 'neutral' | 'warning' | 'error';

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  variant?: NoticeVariant;
};

const variants: Record<NoticeVariant, string> = {
  neutral: 'border-[var(--color-dark)] bg-[var(--color-dark)] text-[white]',
  warning:
    'border-[var(--color-border-yellow)] bg-[var(--color-bg-yellow)] text-[var(--color-brown)]',
  error: 'border-[var(--color-red)] bg-[var(--color-canvas-white)] text-[var(--color-red)]',
};

const icons: Record<NoticeVariant, ComponentType<IconProps>> = {
  neutral: IconBulb,
  warning: IconAlertCircle,
  error: IconCancel,
};

export function Notice({ className, variant = 'neutral', children, ...props }: NoticeProps) {
  const Icon = icons[variant];

  return (
    <div
      className={[
        'flex items-center gap-2 rounded-[var(--radius-buttons)] border px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-sm font-medium leading-[1.1]',
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <Icon size={18} stroke={2} aria-hidden="true" className="mt-[1px] shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
