import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import {
  SubscriptionStatusCard,
  type SubscriptionStatus,
} from '@/components/subscription/SubscriptionStatusCard';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
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

  return (
    <div className="flex flex-col gap-6">
      <Card
        as="section"
        className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
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
            className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          >
            <SubscriptionManager
              status={subscription.status}
              plan={subscription.plan}
              autoRenew={subscription.auto_renew}
              pendingPlanChange={subscription.pending_plan_change}
              initialPlan={null}
            />
          </Card>
        </>
      ) : (
        <Notice role="status" variant="neutral">
          Předplatné bude dostupné po dokončení onboardingu podniku.
        </Notice>
      )}
    </div>
  );
}
