import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { computeAdminOverviewStats, type StatsPeriod } from '@/lib/admin/stats';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Přehledová stránka admin dashboardu `/admin` (feature `admin-dashboard`,
 * Requirement 2, task 5.2).
 *
 * SSR stránka zobrazující klíčové provozní metriky ze StatsAggregatoru
 * (`computeAdminOverviewStats`) pro zvolené časové období. Volba období probíhá
 * přes `searchParams` (`?obdobi=`); časově závislé metriky (registrace, churn,
 * tržby) se přepočítají při změně období (R2.6).
 *
 * Přístup je chráněn Access_Guard middlewarem (`/admin/*`), proto stránka
 * předpokládá přihlášeného admina a čte cross-tenant data přes service-role
 * klienta (dle vzoru `/dashboard` admin přehledu).
 */

export const dynamic = 'force-dynamic';

type OverviewPageProps = {
  searchParams: Promise<{ obdobi?: string | string[] }>;
};

type PeriodKey = '7d' | '30d' | '90d' | 'rok' | 'vse';

const DEFAULT_PERIOD: PeriodKey = '30d';

const PERIOD_OPTIONS: ReadonlyArray<{ key: PeriodKey; label: string }> = [
  { key: '7d', label: 'Posledních 7 dní' },
  { key: '30d', label: 'Posledních 30 dní' },
  { key: '90d', label: 'Posledních 90 dní' },
  { key: 'rok', label: 'Tento rok' },
  { key: 'vse', label: 'Celé období' },
];

const STATUS_LABELS: Record<'free' | 'active' | 'grace_period' | 'expired', string> = {
  free: 'Free',
  active: 'Aktivní',
  grace_period: 'Grace period',
  expired: 'Vypršelo',
};

function getParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolvePeriodKey(raw: string | undefined): PeriodKey {
  return PERIOD_OPTIONS.some((option) => option.key === raw) ? (raw as PeriodKey) : DEFAULT_PERIOD;
}

/** Přeloží volbu období na konkrétní hranice (od–do). `to` je vždy „teď". */
function periodToRange(key: PeriodKey, now: Date): StatsPeriod {
  const to = now;
  const from = new Date(now);

  switch (key) {
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case 'rok':
      return { from: new Date(now.getFullYear(), 0, 1), to };
    case 'vse':
      return { from: new Date(0), to };
  }

  return { from, to };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('cs-CZ').format(value);
}

function formatCzk(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({
  label,
  value,
  hint,
  info,
}: {
  label: string;
  value: string;
  hint?: string;
  info: string;
}) {
  return (
    <Card className="space-y-2 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-slate-text)]">{label}</p>
        <InfoTooltip text={info} />
      </div>
      <p className="font-[var(--font-polysans)] text-2xl font-semibold text-[var(--color-rich-violet)]">
        {value}
      </p>
      {hint ? <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">{hint}</p> : null}
    </Card>
  );
}

export default async function AdminOverviewPage({ searchParams }: OverviewPageProps) {
  const params = await searchParams;
  const periodKey = resolvePeriodKey(getParam(params.obdobi));
  const period = periodToRange(periodKey, new Date());

  const supabase = createAdminClient();
  const stats = await computeAdminOverviewStats(supabase, period);

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-3" aria-label="Volba časového období">
          {PERIOD_OPTIONS.map((option) => {
            const isActive = option.key === periodKey;
            return (
              <Link
                key={option.key}
                href={`/admin?obdobi=${option.key}`}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] border px-5 text-sm font-normal leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  isActive
                    ? 'border-[var(--color-action-violet)] bg-[var(--color-action-violet)] text-[var(--color-canvas-white)] focus-visible:outline-[var(--color-action-violet)]'
                    : 'border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)] hover:border-[var(--color-action-violet)] focus-visible:outline-[var(--color-cloud-mist)]',
                ].join(' ')}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Metriky">
          <MetricCard
            label="Nové registrace"
            value={formatCount(stats.newRegistrations)}
            hint="ve zvoleném období"
            info="Počet nově vytvořených podniků (dokončený onboarding) za zvolené období. Mění se podle vybraného filtru nahoře."
          />
          <MetricCard
            label="Aktivní předplatná"
            value={formatCount(stats.activeSubscriptions)}
            info="Kolik podniků má právě teď aktivní placené předplatné. Je to aktuální stav, nezávisí na zvoleném období."
          />
          <MetricCard
            label="Churn"
            value={formatCount(stats.churn)}
            hint="ve zvoleném období"
            info="Počet předplatných, která za zvolené období vypršela nebo skončila (odešli zákazníci). Čím nižší, tím lépe."
          />
          <MetricCard
            label="Tržby"
            value={formatCzk(stats.paidRevenueCzk)}
            hint="zaplacené platby v období"
            info="Součet skutečně zaplacených plateb za předplatné ve zvoleném období. Nezahrnuje nezaplacené ani čekající platby."
          />
        </section>

        <Card
          as="section"
          className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          aria-label="Rozpad podniků podle stavu předplatného"
        >
          <div className="space-y-2">
            <Badge>Podniky</Badge>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
                Rozpad podle stavu předplatného
              </h2>
              <InfoTooltip text="Kolik podniků je právě v jakém stavu předplatného: Free (bez platby), Aktivní (platí), Grace period (po splatnosti, ještě s přístupem) a Vypršelo (přístup pozastaven). Aktuální stav, nezávislý na zvoleném období." />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => (
              <div
                key={status}
                className="rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] p-4"
              >
                <p className="text-sm font-medium text-[var(--color-slate-text)]">
                  {STATUS_LABELS[status]}
                </p>
                <p className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
                  {formatCount(stats.businessesByStatus[status])}
                </p>
              </div>
            ))}
          </div>
        </Card>
    </div>
  );
}
