import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { SubscriptionStatusCard, type SubscriptionStatus } from '@/components/subscription/SubscriptionStatusCard';
import { PlanCards } from '@/components/subscription/PlanCards';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { BUSINESS_FEATURES } from '@/lib/plans/features';
import { loadPlanFeatureMatrix, planHasFeature } from '@/lib/plans/feature-matrix';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { IconCircleCheck } from '@tabler/icons-react';
import type { Metadata } from 'next';
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

const greenClass = 'text-[color-mix(in_srgb,var(--color-electric-green)_60%,var(--color-slate-text))]';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]';

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
      <PlanCards
        id="tarify"
        currentPlan={currentPlan}
        status={status}
        periodEnd={periodEnd}
        matrix={matrix}
      />

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
