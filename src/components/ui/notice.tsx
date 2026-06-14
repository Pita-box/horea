import { IconAlertTriangle, IconInfoCircle, type IconProps } from '@tabler/icons-react';
import type { ComponentType, HTMLAttributes } from 'react';

type NoticeVariant = 'neutral' | 'error';

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  variant?: NoticeVariant;
};

const variants: Record<NoticeVariant, string> = {
  neutral: 'border-[var(--color-border-vychozi)] bg-[var(--color-dark)] text-[white]',
  error:
    'border-[color-mix(in_srgb,var(--color-neon-pink)_35%,white)] bg-[var(--color-canvas-white)] text-[var(--color-neon-pink)]',
};

const icons: Record<NoticeVariant, ComponentType<IconProps>> = {
  neutral: IconInfoCircle,
  error: IconAlertTriangle,
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
