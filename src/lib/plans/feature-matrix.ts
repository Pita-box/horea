import 'server-only';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import type { SupabaseClient } from '@supabase/supabase-js';

import { BUSINESS_FEATURES, type BusinessFeatureKey } from './features';

const PLANS: SubscriptionPlan[] = ['start', 'pokrocily', 'max'];

export type PlanFeatureMatrix = Record<SubscriptionPlan, Record<BusinessFeatureKey, boolean>>;

type PlanFeatureRow = {
  plan: SubscriptionPlan;
  feature_key: string;
  enabled: boolean;
};

/** Výchozí matice: vše povoleno (chybějící řádek v DB = povoleno). */
export function defaultPlanFeatureMatrix(): PlanFeatureMatrix {
  const matrix = {} as PlanFeatureMatrix;
  for (const plan of PLANS) {
    const row = {} as Record<BusinessFeatureKey, boolean>;
    for (const feature of BUSINESS_FEATURES) {
      row[feature.key] = true;
    }
    matrix[plan] = row;
  }
  return matrix;
}

function isKnownKey(key: string): key is BusinessFeatureKey {
  return BUSINESS_FEATURES.some((feature) => feature.key === key);
}

/**
 * Načte matici entitlements z DB (`plan_features`). Výchozí stav je „vše povoleno";
 * řádky v DB pouze přepisují jednotlivé buňky (typicky na `false`). Neznámé klíče
 * (zbylé po změně katalogu) se ignorují. Při chybě čtení vrací výchozí matici
 * (fail-open — gating raději nepustí false negative).
 */
export async function loadPlanFeatureMatrix(
  supabase: SupabaseClient,
): Promise<PlanFeatureMatrix> {
  const matrix = defaultPlanFeatureMatrix();

  const { data, error } = await supabase
    .from('plan_features')
    .select('plan,feature_key,enabled')
    .returns<PlanFeatureRow[]>();

  if (error || !data) {
    return matrix;
  }

  for (const row of data) {
    if (PLANS.includes(row.plan) && isKnownKey(row.feature_key)) {
      matrix[row.plan][row.feature_key] = row.enabled;
    }
  }

  return matrix;
}

export function planHasFeature(
  matrix: PlanFeatureMatrix,
  plan: SubscriptionPlan,
  key: BusinessFeatureKey,
): boolean {
  return matrix[plan][key];
}
