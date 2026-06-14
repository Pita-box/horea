import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section';
};

export function Card({ as: Component = 'div', className, ...props }: CardProps) {
  return (
    <Component
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
