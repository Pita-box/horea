import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-[var(--radius-cards)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
