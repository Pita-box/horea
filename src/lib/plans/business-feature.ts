import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { loadPlanFeatureMatrix, planHasFeature } from '@/lib/plans/feature-matrix';
import type { BusinessFeatureKey } from '@/lib/plans/features';

/**
 * Server-side vynucení entitlementů (`plan_features`) pro chování podniku
 * (online rezervace, auto-schvalování, paralelní sloty, e-mailové notifikace).
 *
 * Vrací funkci `has(featureKey)`, která řekne, zda tarif podniku danou funkci má.
 * Načte tarif podniku + matici jednou (dva dotazy), aby šlo levně zkontrolovat
 * více klíčů v jednom requestu. `plan IS NULL` (free / bez tarifu) → entitlementy
 * se neaplikují (vše povoleno; free se řídí stavovým gatem).
 *
 * VYŽADUJE klienta s přístupem k `subscriptions` + `plan_features` (service-role
 * / admin) — anon klient tato data přes RLS nepřečte.
 */
export async function loadBusinessFeatureChecker(
  supabase: SupabaseClient,
  businessId: string,
): Promise<(key: BusinessFeatureKey) => boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('business_id', businessId)
    .maybeSingle<{ plan: SubscriptionPlan | null }>();

  const plan = data?.plan ?? null;
  if (plan === null) {
    return () => true;
  }

  const matrix = await loadPlanFeatureMatrix(supabase);
  return (key: BusinessFeatureKey) => planHasFeature(matrix, plan, key);
}
