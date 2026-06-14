import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';

/**
 * Žádost o změnu tarifu a její zrušení.
 *
 * Změna tarifu se eviduje jako **nevyřízená** ve sloupci
 * `subscriptions.pending_plan_change` (migrace 0024) — aktuální `plan` se
 * nemění a **neúčtuje se žádná poměrná (proratovaná) částka** (R8.3). Cílový
 * tarif se aplikuje až na konci aktuálního období přes {@link applyPlanChange}
 * (R8.2).
 *
 * Dokud změna nevyřízená čeká, lze ji zrušit ({@link cancelPlanChange})
 * nastavením `pending_plan_change = NULL` (R8.4). Po dosažení
 * `current_period_end` se změna aplikuje, takže zrušení je vždy „před koncem
 * období".
 *
 * Obě operace mění jediný řádek tabulky `subscriptions`, proto nepotřebují
 * transakční RPC. Pracují pouze nad předplatným ve stavu `active` (R8.1) —
 * filtr `status = 'active'` zajistí, že se nevyřízená změna neeviduje u
 * předplatného mimo aktivní stav. Klient se předává jako parametr (server-side).
 */

export type PlanChangeResult =
  | { ok: true; pendingPlanChange: SubscriptionPlan | null }
  | { ok: false; error: 'not_active' | 'write_failed' };

/**
 * Výsledek aplikace nevyřízené změny tarifu na konci období.
 *
 * `applied` rozlišuje, zda nějaká nevyřízená změna existovala (a byla
 * aplikována), nebo zda nebylo co měnit — `plan` vždy nese aktuální (případně
 * nově nastavený) tarif.
 */
export type ApplyPlanChangeResult =
  | { ok: true; applied: boolean; plan: SubscriptionPlan }
  | { ok: false; error: 'not_found' | 'write_failed' };

type PlanChangeRow = {
  pending_plan_change: SubscriptionPlan | null;
};

async function writePendingPlanChange(
  supabase: SupabaseClient,
  subscriptionId: string,
  pendingPlanChange: SubscriptionPlan | null,
): Promise<PlanChangeResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ pending_plan_change: pendingPlanChange })
    .eq('id', subscriptionId)
    .eq('status', 'active')
    .select('pending_plan_change')
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'write_failed' };
  }

  // Žádný dotčený řádek = předplatné neexistuje nebo není ve stavu `active`.
  if (!data) {
    return { ok: false, error: 'not_active' };
  }

  return { ok: true, pendingPlanChange: (data as PlanChangeRow).pending_plan_change };
}

/**
 * Zaznamená žádost o změnu tarifu jako nevyřízenou změnu (R8.1, R8.3).
 *
 * Nastaví `pending_plan_change = targetPlan` bez změny aktuálního `plan` a bez
 * jakékoli prorace. Funguje pouze pro předplatné ve stavu `active`.
 *
 * @param targetPlan Požadovaný cílový tarif.
 */
export function requestPlanChange(
  supabase: SupabaseClient,
  subscriptionId: string,
  targetPlan: SubscriptionPlan,
): Promise<PlanChangeResult> {
  return writePendingPlanChange(supabase, subscriptionId, targetPlan);
}

/**
 * Zruší nevyřízenou změnu tarifu před koncem období (R8.4).
 *
 * Nastaví `pending_plan_change = NULL`. Operace je idempotentní — zrušení
 * neexistující nevyřízené změny je neškodné. Funguje pouze pro předplatné ve
 * stavu `active`.
 */
export function cancelPlanChange(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<PlanChangeResult> {
  return writePendingPlanChange(supabase, subscriptionId, null);
}

/**
 * Aplikuje nevyřízenou změnu tarifu při dosažení konce období (R8.2).
 *
 * Pokud je u předplatného evidována nevyřízená změna (`pending_plan_change`),
 * nastaví `plan` na cílový tarif a `pending_plan_change` vynuluje. Od dalšího
 * období se tak strhává částka odpovídající novému tarifu (charge čte aktuální
 * `subscription.plan`) — **bez jakékoli prorace** (R8.3). Pokud žádná změna
 * nečeká, vrací `applied = false` a aktuální tarif beze změny.
 *
 * Volá se z billing cyklu při obnově období (typicky Billing_Cron, task 12.1).
 * Operace je idempotentní: opakované volání po aplikaci najde
 * `pending_plan_change = NULL` a vrátí `applied = false`. Mění jediný řádek
 * `subscriptions`, proto nepotřebuje transakční RPC. Klient se předává jako
 * parametr (server-side service role).
 */
export async function applyPlanChange(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<ApplyPlanChangeResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, pending_plan_change')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'write_failed' };
  }

  if (!data) {
    return { ok: false, error: 'not_found' };
  }

  const row = data as { plan: SubscriptionPlan; pending_plan_change: SubscriptionPlan | null };

  // Žádná nevyřízená změna — aktuální tarif zůstává.
  if (row.pending_plan_change === null) {
    return { ok: true, applied: false, plan: row.plan };
  }

  const target = row.pending_plan_change;

  const { data: updated, error: updateError } = await supabase
    .from('subscriptions')
    .update({ plan: target, pending_plan_change: null })
    .eq('id', subscriptionId)
    .select('plan')
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: 'write_failed' };
  }

  if (!updated) {
    return { ok: false, error: 'not_found' };
  }

  return { ok: true, applied: true, plan: (updated as { plan: SubscriptionPlan }).plan };
}
