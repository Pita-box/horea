import Link from 'next/link';
import { IconInfoCircle } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';
import { PERIOD_OPTIONS, formatPercent, type ResolvedPeriod } from '@/lib/analytics/analytics';

const MUTED = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

/**
 * Informační ikona s tooltipem (CSS-only: hover i fokus). Tooltip je vpravo
 * nahoře u karty a vysvětluje metriku lidskou řečí.
 */
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <IconInfoCircle
        size={16}
        stroke={2}
        tabIndex={0}
        role="img"
        aria-label="Vysvětlení"
        className="cursor-help text-[color-mix(in_srgb,var(--color-slate-text)_45%,white)] outline-none transition-colors hover:text-[var(--color-action-violet)] focus-visible:text-[var(--color-action-violet)]"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-6 z-30 hidden w-56 rounded-[var(--radius-lg)] bg-[var(--color-rich-violet)] px-3 py-2 text-xs font-medium leading-snug text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

/** Přepínač období (URL `?period=`). Zachovává se jen tento parametr. */
export function PeriodTabs({ period }: { period: ResolvedPeriod }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-buttons)] bg-[var(--color-cloud-mist)] p-1">
      {PERIOD_OPTIONS.map((option) => {
        const active = option.key === period.key;
        return (
          <Link
            key={option.key}
            href={`/dashboard/analytics?period=${option.key}`}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex h-9 items-center rounded-[var(--radius-buttons)] px-4 text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--color-action-violet)] text-white'
                : 'text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
            ].join(' ')}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

type KpiCardProps = {
  label: string;
  value: string;
  /** Relativní změna oproti minulému období (0.12 = +12 %); `null` = bez srovnání. */
  delta: number | null;
  /** Zda je růst pozitivní (true u tržeb, false u no-show). */
  higherIsBetter?: boolean;
  comparisonLabel: string;
  /** Lidské vysvětlení metriky do tooltipu. */
  info: string;
};

export function KpiCard({
  label,
  value,
  delta,
  higherIsBetter = true,
  comparisonLabel,
  info,
}: KpiCardProps) {
  let deltaNode = null;
  if (delta !== null && delta !== 0) {
    const up = delta > 0;
    const good = up === higherIsBetter;
    deltaNode = (
      <span
        className={[
          'inline-flex items-center gap-1 rounded-[var(--radius-badges)] px-2 py-0.5 text-xs font-semibold',
          good
            ? 'bg-[color-mix(in_srgb,var(--color-electric-green)_28%,white)] text-[var(--color-rich-violet)]'
            : 'bg-[color-mix(in_srgb,var(--color-red)_12%,white)] text-[var(--color-red)]',
        ].join(' ')}
      >
        {up ? '▲' : '▼'} {formatPercent(Math.abs(delta), 0)}
      </span>
    );
  }

  return (
    <Card className="flex flex-col gap-2 border border-[var(--color-border-vychozi)] p-[var(--spacing-20)]">
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm ${MUTED}`}>{label}</p>
        <InfoTooltip text={info} />
      </div>
      <p className="font-[var(--font-polysans)] text-[28px] font-bold leading-tight text-[var(--color-rich-violet)]">
        {value}
      </p>
      <div className="flex items-center gap-2">
        {deltaNode ?? <span className={`text-xs ${MUTED}`}>beze změny</span>}
        <span className={`text-xs ${MUTED}`}>{comparisonLabel}</span>
      </div>
    </Card>
  );
}
