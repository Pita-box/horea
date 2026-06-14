import type { HTMLAttributes } from 'react';

type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex min-h-6 items-center rounded-[var(--radius-badges)] bg-transparent px-2 py-0 text-sm font-medium leading-[1.1] text-[var(--color-neon-pink)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
