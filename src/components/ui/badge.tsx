import type { HTMLAttributes } from 'react';

type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex min-h-6 items-center rounded-[var(--radius-badges)] bg-transparent px-2 text-sm font-medium text-[var(--color-neon-pink)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
