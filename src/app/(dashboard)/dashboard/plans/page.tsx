import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { SubscriptionStatusCard, type SubscriptionStatus } from '@/components/subscription/SubscriptionStatusCard';
import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import { BUSINESS_FEATURES } from '@/lib/plans/features';
import { loadPlanFeatureMatrix, planHasFeature } from '@/lib/plans/feature-matrix';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { IconCircleCheck } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Tarify | Horea',
  description: 'Přehled tarifů a funkcí — porovnání balíčků Start, Pokročilý a Max.',
};

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

const greenClass = 'text-[color-mix(in_srgb,var(--color-electric-green)_60%,var(--color-slate-text))]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]';

type CtaKind = 'current' | 'upgrade' | 'select';

function getCta(planIndex: number, currentIndex: number, isActive: boolean): CtaKind {
  if (isActive && planIndex === currentIndex) {
    return 'current';
  }
  if (currentIndex >= 0 && planIndex > currentIndex) {
    return 'upgrade';
  }
  return 'select';
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string | string[] }>;
}) {
  const { locked } = await searchParams;
  const isLocked = Array.isArray(locked) ? locked.length > 0 : Boolean(locked);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const admin = createAdminClient();
  const { data: business } = await admin
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (!business) {
    redirect('/onboarding/1');
  }

  const { data: subscription } = await admin
    .from('subscriptions')
    .select('plan,status,current_period_start,current_period_end')
    .eq('business_id', business.id)
    .maybeSingle<{
      plan: SubscriptionPlan | null;
      status: SubscriptionStatus;
      current_period_start: string | null;
      current_period_end: string | null;
    }>();

  const currentPlan = subscription?.plan ?? null;
  const status: SubscriptionStatus = subscription?.status ?? 'free';
  const isActive = status === 'active' && currentPlan !== null;
  const currentIndex = currentPlan ? PLAN_ORDER.indexOf(currentPlan) : -1;
  const periodEnd = subscription?.current_period_end ?? null;
  const matrix = await loadPlanFeatureMatrix(admin);

  return (
    <div className="flex flex-col gap-[var(--section-gap)]">
      {isLocked ? (
        <Notice>Odemkněte tuto funkci volbou správného balíčku.</Notice>
      ) : null}

      <SubscriptionStatusCard
        status={status}
        plan={currentPlan}
        periodStart={subscription?.current_period_start ?? null}
        periodEnd={periodEnd}
      />

      {/* Karty tarifů */}
      <div className="grid gap-[var(--section-gap)] md:grid-cols-3">
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
                  <h2 className="font-[var(--font-polysans)] text-2xl font-bold text-[var(--color-rich-violet)]">
                    {PLAN_LABELS[plan]}
                  </h2>
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
                        : 'border border-[var(--color-border-vychozi)] text-[var(--color-slate-text)] hover:border-[var(--color-action-violet)]',
                    ].join(' ')}
                  >
                    {cta === 'upgrade' ? 'Upgradovat tarif' : 'Zvolit tento tarif'}
                  </Link>
                )}

                <ul className="flex flex-col gap-2 border-t border-[var(--color-border-vychozi)] pt-5">
                  {BUSINESS_FEATURES.filter((feature) => planHasFeature(matrix, plan, feature.key)).map(
                    (feature) => (
                      <li key={feature.key} className="flex items-center gap-2 text-sm">
                        <IconCircleCheck
                          size={18}
                          stroke={2}
                          aria-hidden="true"
                          className={`shrink-0 ${greenClass}`}
                        />
                        <span className="text-[var(--color-slate-text)]">{feature.label}</span>
                      </li>
                    ),
                  )}
                </ul>
              </Card>
            );
          })}
        </div>

        {/* Porovnávací tabulka funkcí */}
        <Card className="overflow-hidden border border-[var(--color-border-vychozi)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
                  <th className="px-5 py-4 font-semibold">Funkce</th>
                  {PLAN_ORDER.map((plan) => (
                    <th key={plan} className="px-5 py-4 text-center font-semibold">
                      {PLAN_LABELS[plan]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BUSINESS_FEATURES.map((feature) => (
                  <tr
                    key={feature.key}
                    className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                  >
                    <td className="px-5 py-3">
                      <span className="block font-medium text-[var(--color-slate-text)]">
                        {feature.label}
                      </span>
                      <span className={`block text-xs ${mutedClass}`}>{feature.description}</span>
                    </td>
                    {PLAN_ORDER.map((plan) => (
                      <td key={plan} className="px-5 py-3 text-center">
                        {planHasFeature(matrix, plan, feature.key) ? (
                          <IconCircleCheck
                            size={20}
                            stroke={2}
                            aria-label="Zahrnuto"
                            className={`mx-auto ${greenClass}`}
                          />
                        ) : (
                          <span aria-label="Nezahrnuto" className={mutedClass}>
                            —
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
    </div>
  );
}
