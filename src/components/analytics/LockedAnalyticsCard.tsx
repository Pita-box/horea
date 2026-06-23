import { IconLock } from '@tabler/icons-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';

/**
 * Zástupná karta pro analytický widget, který není dostupný v tarifu podniku
 * (matice `plan_features`). Zachová rozložení mřížky a nabídne upgrade.
 */
export function LockedAnalyticsCard({ title, id }: { title: string; id?: string }) {
  return (
    <Card
      as="section"
      id={id}
      className="flex min-h-[180px] flex-col items-center justify-center gap-3 border border-[var(--color-border-vychozi)] p-[var(--card-padding)] text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-light-violet)]">
        <IconLock size={24} stroke={2} aria-hidden="true" className="text-[var(--color-action-violet)]" />
      </span>
      <h3 className="text-[16px] font-bold text-[var(--color-rich-violet)]">{title}</h3>
      <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
        Tato analýza není dostupná ve vašem tarifu.
      </p>
      <Link
        href="/dashboard/plans"
        className="text-sm font-semibold text-[var(--color-action-violet)] hover:underline"
      >
        Zobrazit tarify
      </Link>
    </Card>
  );
}
