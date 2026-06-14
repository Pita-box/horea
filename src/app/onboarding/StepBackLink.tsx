import { IconArrowLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type StepBackLinkProps = {
  href: string;
  children?: ReactNode;
};

export function StepBackLink({ href, children = 'Zpět' }: StepBackLinkProps) {
  return (
    <a
      className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-slate-text)] transition-colors hover:text-[var(--color-action-violet)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
      href={href}
    >
      <IconArrowLeft size={18} stroke={2} aria-hidden="true" />
      {children}
    </a>
  );
}
