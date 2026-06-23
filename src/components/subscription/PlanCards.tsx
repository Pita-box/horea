import Link from 'next/link';
import { IconCircleCheck, IconCircleMinus } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';
import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import { BUSINESS_FEATURES } from '@/lib/plans/features';
import { planHasFeature, type PlanFeatureMatrix } from '@/lib/plans/feature-matrix';
import type { SubscriptionStatus } from '@/components/subscription/SubscriptionStatusCard';

const PLAN_ORDER: SubscriptionPlan[] = ['start', 'pokrocily', 'max'];
const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};
const PLAN_TAGLINES: Record<SubscriptionPlan, string> = {
  start: 'Pro začínající podniky',
  pokrocily: 'Pro rostoucí provozy',
  max: 'Pro maximální využití',
};

const currency = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});

const renewalDate = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Prague',
});

const greenClass =
  'text-[color-mix(in_srgb,var(--color-electric-green)_60%,var(--color-slate-text))]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]';

type CtaKind = 'current' | 'upgrade' | 'select';

/** Určí typ CTA karty podle pozice tarifu vůči aktuálnímu. */
function getCta(planIndex: number, currentIndex: number, isActive: boolean): CtaKind {
  if (isActive && planIndex === currentIndex) {
    return 'current';
  }
  if (currentIndex >= 0 && planIndex > currentIndex) {
    return 'upgrade';
  }
  return 'select';
}

type PlanCardsProps = {
  currentPlan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  periodEnd: string | null;
  matrix: PlanFeatureMatrix;
  /** Volitelné `id`/scroll-margin pro odkaz z vyhledávání. */
  id?: string;
};

/**
 * Sdílená mřížka karet tarifů (Start / Pokročilý / Max). Aktuální tarif je
 * zvýrazněn (pokud je předplatné aktivní, tj. není free); ostatní karty nabízejí
 * upgrade/zvolení s prokliknutím na `/dashboard/subscription?plan=…` → platba.
 * Používá se na `/dashboard/plans` i v sekci „Změna tarifu" na `/dashboard/account`.
 */
export function PlanCards({ currentPlan, status, periodEnd, matrix, id }: PlanCardsProps) {
  const isActive = status === 'active' && currentPlan !== null;
  const currentIndex = currentPlan ? PLAN_ORDER.indexOf(currentPlan) : -1;

  return (
    <div
      id={id}
      className={['grid gap-[var(--section-gap)] md:grid-cols-3', id ? 'scroll-mt-20' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {PLAN_ORDER.map((plan, index) => {
        const cta = getCta(index, currentIndex, isActive);
        const highlighted = cta === 'current';

        return (
          <Card
            key={plan}
            className={[
              'relative flex flex-col gap-5 p-[var(--card-padding)]',
              highlighted
                ? 'border-2 border-[var(--color-action-violet)]'
                : 'border border-[var(--color-border-vychozi)]',
            ].join(' ')}
          >
            {highlighted ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-action-violet)] px-4 py-1 text-xs font-semibold text-[var(--color-canvas-white)]">
                Váš aktuální tarif
              </span>
            ) : null}

            <div className="space-y-1">
              <h3 className="font-[var(--font-polysans)] text-2xl font-bold text-[var(--color-rich-violet)]">
                {PLAN_LABELS[plan]}
              </h3>
              <p className={`text-sm ${mutedClass}`}>{PLAN_TAGLINES[plan]}</p>
            </div>

            <p className="flex items-baseline gap-1">
              <span className="font-[var(--font-polysans)] text-[32px] font-bold text-[var(--color-rich-violet)]">
                {currency.format(planPriceCzk(plan))}
              </span>
              <span className={`text-sm ${mutedClass}`}>/ měsíc</span>
            </p>

            {cta === 'current' ? (
              <span className="inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-soft-gray-fill)] px-3 text-center text-sm font-semibold text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                {periodEnd ? `Obnoví se ${renewalDate.format(new Date(periodEnd))}` : 'Aktivní'}
              </span>
            ) : (
              <Link
                href={`/dashboard/subscription?plan=${plan}`}
                className={[
                  'inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-buttons)] px-5 text-sm font-semibold transition-colors',
                  cta === 'upgrade'
                    ? 'bg-[var(--color-action-violet)] text-[var(--color-canvas-white)] hover:brightness-95'
                    : 'border border-[var(--color-border-vychozi)] text-[var(--color-slate-text)] hover:border-[var(--color-action-violet)] bg-[var(--color-electric-green)] hover:bg-[var(--color-action-violet)] hover:text-[white]',
                ].join(' ')}
              >
                {cta === 'upgrade' ? 'Upgradovat tarif' : 'Zvolit tento tarif'}
              </Link>
            )}

            <ul className="flex flex-col gap-2 border-t border-[var(--color-border-vychozi)] pt-5">
              {/* Vypisujeme VŠECHNY funkce ve stejném pořadí katalogu, aby shodné
                  položky držely stejnou pozici napříč kartami. Nezahrnuté funkce
                  jsou tlumené (přeškrtnuté) místo vynechání, takže řádky lícují. */}
              {BUSINESS_FEATURES.map((feature) => {
                const included = planHasFeature(matrix, plan, feature.key);
                return (
                  <li key={feature.key} className="flex items-center gap-2 text-sm">
                    {included ? (
                      <IconCircleCheck
                        size={18}
                        stroke={2}
                        aria-hidden="true"
                        className={`shrink-0 ${greenClass}`}
                      />
                    ) : (
                      <IconCircleMinus
                        size={18}
                        stroke={2}
                        aria-hidden="true"
                        className={`shrink-0 ${mutedClass}`}
                      />
                    )}
                    <span
                      className={
                        included
                          ? 'text-[var(--color-slate-text)]'
                          : `line-through ${mutedClass}`
                      }
                    >
                      {feature.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
