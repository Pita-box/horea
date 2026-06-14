'use server';

import { setPlanFeature } from '@/lib/admin/plan-feature-manager';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { BUSINESS_FEATURE_KEYS, type BusinessFeatureKey } from '@/lib/plans/features';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const VALID_PLANS: ReadonlySet<SubscriptionPlan> = new Set(['start', 'pokrocily', 'max']);

export type SetPlanFeatureActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = 'Změnu se nepodařilo uložit. Zkuste to prosím znovu.';

function isValidKey(key: string): key is BusinessFeatureKey {
  return (BUSINESS_FEATURE_KEYS as string[]).includes(key);
}

/**
 * Admin přepnutí dostupnosti funkce v tarifu. Přístup k `/admin/*` chrání
 * Access_Guard middleware; akce navíc ověří admin roli (defense-in-depth) a
 * provede upsert + auditní záznam přes service-role klienta.
 */
export async function setPlanFeatureAction(
  plan: string,
  featureKey: string,
  enabled: boolean,
): Promise<SetPlanFeatureActionResult> {
  if (!VALID_PLANS.has(plan as SubscriptionPlan) || !isValidKey(featureKey)) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle<{ is_admin: boolean }>();

  if (profile?.is_admin !== true) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const result = await setPlanFeature(
    admin,
    user.id,
    plan as SubscriptionPlan,
    featureKey,
    enabled,
  );

  return result.ok ? { ok: true } : { ok: false, message: GENERIC_ERROR };
}
