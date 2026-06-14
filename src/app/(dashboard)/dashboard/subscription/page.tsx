import Link from 'next/link';
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

import { SubscriptionManager } from './SubscriptionManager';

type SubscriptionRow = {
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  auto_renew: boolean;
  pending_plan_change: SubscriptionPlan | null;
};

const PLAN_VALUES: readonly SubscriptionPlan[] = ['start', 'pokrocily', 'max'];

/** Validuje `?plan=` z URL na známý tarif (předvýběr po příchodu z /plans). */
function parsePlanParam(value: string | string[] | undefined): SubscriptionPlan | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return PLAN_VALUES.includes(raw as SubscriptionPlan) ? (raw as SubscriptionPlan) : null;
}

type SubscriptionPageProps = {
  searchParams: Promise<{ plan?: string | string[] }>;
};

export default async function SubscriptionPage({ searchParams }: SubscriptionPageProps) {
  const { plan: planParam } = await searchParams;
  const initialPlan = parsePlanParam(planParam);

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

  const { data: subscription, error } = await admin
    .from('subscriptions')
    .select('plan,status,current_period_start,current_period_end,auto_renew,pending_plan_change')
    .eq('business_id', business.id)
    .maybeSingle<SubscriptionRow>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Link
          href="/dashboard/plans"
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-transparent px-5 text-sm font-normal leading-none text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cloud-mist)]"
        >
          Porovnat tarify
        </Link>
      </div>

      {error || !subscription ? (
        <Notice role="alert" variant="error">
          Předplatné podniku se nepodařilo načíst. Zkuste to prosím znovu.
        </Notice>
      ) : (
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
              initialPlan={initialPlan}
            />
          </Card>
        </>
      )}
    </div>
  );
}
