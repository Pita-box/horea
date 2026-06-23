import { Card } from '@/components/ui/card';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { toPragueDisplay } from '@/lib/datetime';

export type SubscriptionStatus = 'free' | 'active' | 'grace_period' | 'expired' | 'deleted_data';

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  free: 'Neplacené (Free)',
  active: 'Aktivní',
  grace_period: 'Obnovení selhalo',
  expired: 'Vypršelo',
  deleted_data: 'Data smazána',
};

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

function formatPeriod(value: string | null): string {
  return value ? toPragueDisplay(value) : '—';
}

type SubscriptionStatusCardProps = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  periodStart: string | null;
  periodEnd: string | null;
  id?: string;
};

/**
 * Sdílená karta se stavem předplatného (Stav / Tarif / Začátek a Konec období).
 * Používá se na `/dashboard/subscription` i `/dashboard/plans`.
 */
export function SubscriptionStatusCard({
  status,
  plan,
  periodStart,
  periodEnd,
  id,
}: SubscriptionStatusCardProps) {
  return (
    <Card
      as="section"
      id={id}
      className={[
        'border border-[var(--color-border-vychozi)] p-[var(--card-padding)]',
        id ? 'scroll-mt-20' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <dl className="grid gap-[var(--spacing-16)] sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <dt className="text-sm font-medium text-[var(--color-slate-text)]">Stav</dt>
          <dd className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            {STATUS_LABELS[status]}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-[var(--color-slate-text)]">Tarif</dt>
          <dd className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            {plan ? PLAN_LABELS[plan] : '—'}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-[var(--color-slate-text)]">Začátek období</dt>
          <dd className="text-base font-semibold text-[var(--color-rich-violet)]">
            {formatPeriod(periodStart)}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-sm font-medium text-[var(--color-slate-text)]">Konec období</dt>
          <dd className="text-base font-semibold text-[var(--color-rich-violet)]">
            {formatPeriod(periodEnd)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
