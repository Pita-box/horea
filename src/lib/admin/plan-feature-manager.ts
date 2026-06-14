import 'server-only';

import { writeAuditLog } from '@/lib/admin/audit-logger';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import type { BusinessFeatureKey } from '@/lib/plans/features';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * PlanFeatureManager — admin správa matice entitlements (`plan_features`).
 *
 * Toggle je jediný atomický upsert; auditní záznam (`plan_feature_update`) se
 * zapisuje samostatně přes `write_audit_log` (vzor „akce s jediným atomickým
 * příkazem" z `AuditLogger`). `before`/`after` nese předchozí a nový stav buňky.
 *
 * Volá výhradně server-side service role (admin server action); actor (admin
 * user id) se předává jako parametr.
 */
export type SetPlanFeatureResult = { ok: true } | { ok: false };

export async function setPlanFeature(
  supabase: SupabaseClient,
  actorUserId: string,
  plan: SubscriptionPlan,
  featureKey: BusinessFeatureKey,
  enabled: boolean,
): Promise<SetPlanFeatureResult> {
  // Předchozí stav buňky pro audit (chybějící řádek = povoleno).
  const { data: existing } = await supabase
    .from('plan_features')
    .select('enabled')
    .eq('plan', plan)
    .eq('feature_key', featureKey)
    .maybeSingle<{ enabled: boolean }>();

  const before = existing?.enabled ?? true;

  const { error } = await supabase
    .from('plan_features')
    .upsert(
      { plan, feature_key: featureKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'plan,feature_key' },
    );

  if (error) {
    return { ok: false };
  }

  try {
    await writeAuditLog(supabase, {
      actorUserId,
      actionType: 'plan_feature_update',
      targetType: 'plan_feature',
      targetId: null,
      before: { plan, feature_key: featureKey, enabled: before },
      after: { plan, feature_key: featureKey, enabled },
    });
  } catch {
    // Audit selhal — změna už je zapsaná; nešíříme chybu uživateli, jen ji
    // write_audit_log zaloguje. Config toggle je nízkorizikový.
  }

  return { ok: true };
}
