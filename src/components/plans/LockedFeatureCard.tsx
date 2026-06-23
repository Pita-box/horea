import { IconLock } from '@tabler/icons-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';

/**
 * Zástupná „zamčená" karta pro funkci/rozšíření, které není součástí tarifu
 * podniku (matice `plan_features`). Vystředěná ikona zámku, oznámení a primární
 * tlačítko „Tarify" s prokliem na ceník (nový tab). Volitelný `title` doplní
 * kontext, co konkrétně je zamčené; volitelný `className` doladí rozložení.
 */
export function LockedFeatureCard({
  title,
  id,
  className,
}: {
  title?: string;
  id?: string;
  className?: string;
}) {
  return (
    <Card
      as="section"
      id={id}
      className={[
        'flex h-full min-h-[200px] flex-col items-center justify-center gap-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)] text-center',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-light-violet)]">
        <IconLock
          size={30}
          stroke={2}
          aria-hidden="true"
          className="text-[var(--color-action-violet)]"
        />
      </span>

      {title ? (
        <h3 className="text-[18px] font-bold text-[var(--color-rich-violet)]">{title}</h3>
      ) : null}

      <p className="max-w-[420px] text-[16px] leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
        Toto rozšíření není součástí vašeho tarifu. Odemkněte si ho přechodem na vyšší tarif.
      </p>

      <Link
        href="/dashboard/plans"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 text-[16px] font-semibold text-[var(--color-canvas-white)] transition-opacity hover:opacity-90"
      >
        Tarify
      </Link>
    </Card>
  );
}
