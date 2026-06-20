import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import {
  SubscriptionStatusCard,
  type SubscriptionStatus,
} from '@/components/subscription/SubscriptionStatusCard';
import { PlanCards } from '@/components/subscription/PlanCards';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { loadPlanFeatureMatrix } from '@/lib/plans/feature-matrix';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { SubscriptionManager } from '../subscription/SubscriptionManager';
import { AccountCredentialsForm } from './AccountCredentialsForm';

type SubscriptionRow = {
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  auto_renew: boolean;
  pending_plan_change: SubscriptionPlan | null;
};

export default async function AccountPage() {
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

  const { data: subscription } = business
    ? await admin
        .from('subscriptions')
        .select(
          'plan,status,current_period_start,current_period_end,auto_renew,pending_plan_change',
        )
        .eq('business_id', business.id)
        .maybeSingle<SubscriptionRow>()
    : { data: null };

  const matrix = await loadPlanFeatureMatrix(admin);

  return (
    <div className="flex flex-col gap-6">
      <Card
        as="section"
        id="prihlasovaci-udaje"
        className="scroll-mt-20 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      >
        <AccountCredentialsForm initialEmail={user.email ?? ''} />
      </Card>

      {subscription ? (
        <>
          <SubscriptionStatusCard
            status={subscription.status}
            plan={subscription.plan}
            periodStart={subscription.current_period_start}
            periodEnd={subscription.current_period_end}
          />

          <Card
            as="section"
            id="zmena-tarifu"
            className="scroll-mt-20 flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
                Změna tarifu
              </h2>
              <p className="text-sm leading-6 text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                Vyberte tarif a pokračujte k platbě. Aktuální tarif je zvýrazněný.
              </p>
            </div>

            <PlanCards
              currentPlan={subscription.plan}
              status={subscription.status}
              periodEnd={subscription.current_period_end}
              matrix={matrix}
            />
          </Card>

          {subscription.status === 'active' || subscription.status === 'grace_period' ? (
            <Card
              as="section"
              className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
            >
              {/* Změnu tarifu řeší karty výše; zde zůstává automatická obnova
                  a případné zrušení čekající změny tarifu (showPlanChange=false). */}
              <SubscriptionManager
                status={subscription.status}
                plan={subscription.plan}
                autoRenew={subscription.auto_renew}
                pendingPlanChange={subscription.pending_plan_change}
                initialPlan={null}
                showPlanChange={false}
              />
            </Card>
          ) : null}
        </>
      ) : (
        <Notice role="status" variant="neutral">
          Předplatné bude dostupné po dokončení onboardingu podniku.
        </Notice>
      )}
    </div>
  );
}
