import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { serverLog } from '@/lib/log-server';
import { r2DeleteByPrefix } from '@/lib/storage/r2';

/**
 * Vynucené smazání podniku administrátorem (GDPR / zneužití) — feature
 * `admin-dashboard`, BusinessManager, task 12.1 (R6.1–R6.4, Property 7 + 2).
 *
 * ZNOVUPOUŽITÍ, NE DUPLIKACE: vlastní mazání tenant dat NEDUPLIKUJEME. Skutečná
 * atomicita „smazání tenant dat + zachování historie + auditní záznam" žije v
 * plpgsql funkci `admin_force_delete_business` (migrace 0038), která UVNITŘ své
 * transakce volá existující `delete_business_tenant_data` (migrace 0030, vlastněná
 * `subscription-payments`) a `write_audit_log` (migrace 0035). Supabase JS klient
 * neumí držet jednu DB transakci přes více volání, proto akce + audit žijí v RPC.
 *
 * Tenant data (rezervace, klienti, služby, otevírací doby) jsou smazána a profil
 * podniku vyprázdněn (R6.2); historie `subscriptions`/`payments` zůstává zachována
 * (R6.3). Akce je auditně zaznamenána ve stejné transakci (R6.4, Property 2).
 *
 * NAVÍC (varianta „uvolnit e-mail, zachovat anonymizovanou historii"): po smazání
 * tenant dat se smaže i účet vlastníka v `auth.users`. Díky FK `ON DELETE SET NULL`
 * (migrace 0054) se tím podnik jen odpojí (`owner_user_id = NULL`) a účetní
 * historie zůstane zachována (anonymizovaná). Uvolní se e-mail pro novou registraci.
 *
 * Funkci volá výhradně server-side service role (admin server action); klient i
 * actor (admin user id z auth kontextu) se předávají jako parametry.
 */

/** Vstup pro vynucené smazání podniku (R6.1, R6.2). */
export type ForceDeleteBusinessInput = {
  /** Administrátor (actor) provádějící akci — z auth kontextu. */
  actorUserId: string;
  /** Identifikátor cílového podniku. */
  businessId: string;
  /**
   * Explicitní potvrzení akce (R6.1). Smazání se provede pouze při `true`;
   * potvrzovací dialog v UI (task 17.1) tuto hodnotu nastaví. Server-side guard
   * brání nechtěnému nevratnému smazání i mimo UI.
   */
  confirmed: boolean;
};

/** Výsledek vynuceného smazání podniku. */
export type ForceDeleteBusinessResult =
  | { ok: true; businessId: string; subscriptionId: string | null }
  | { ok: false; error: 'not_confirmed' | 'not_found' | 'force_delete_failed' };

type ForceDeleteRow = {
  business_id: string;
  subscription_id: string | null;
};

/**
 * Vynuceně smaže podnik — po explicitním potvrzení znovupoužije cleanup logiku
 * ze `subscription-payments` ke smazání tenant dat (zachová historii
 * `subscriptions`/`payments`) a ve stejné transakci zapíše auditní záznam
 * `force_delete_business` s before/after (R6.1–R6.4, Property 7 + 2).
 *
 * @param supabase Service-role Supabase klient.
 * @param input Actor, cílový podnik a explicitní potvrzení.
 * @returns `ok: true` s identifikátorem podniku a zachovaného předplatného;
 *   `not_confirmed`, pokud chybí explicitní potvrzení (R6.1); `not_found`, pokud
 *   podnik neexistuje; `force_delete_failed` při selhání transakce.
 */
export async function forceDeleteBusiness(
  supabase: SupabaseClient,
  input: ForceDeleteBusinessInput,
): Promise<ForceDeleteBusinessResult> {
  // Explicitní potvrzení akce před jejím provedením (R6.1).
  if (!input.confirmed) {
    return { ok: false, error: 'not_confirmed' };
  }

  // Vlastníka si dohledáme PŘED smazáním (RPC `owner_user_id` nemění). Po smazání
  // tenant dat ho použijeme ke smazání auth účtu (uvolnění e-mailu).
  const { data: ownerRow } = await supabase
    .from('businesses')
    .select('owner_user_id')
    .eq('id', input.businessId)
    .maybeSingle<{ owner_user_id: string | null }>();

  const { data, error } = await supabase.rpc('admin_force_delete_business', {
    p_actor_user_id: input.actorUserId,
    p_business_id: input.businessId,
  });

  if (error) {
    return { ok: false, error: 'force_delete_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ForceDeleteRow | undefined;

  if (!row) {
    return { ok: false, error: 'not_found' };
  }

  // Smazání účtu vlastníka v auth.users → uvolní e-mail pro novou registraci.
  // Díky FK ON DELETE SET NULL (migrace 0054) se podnik jen odpojí
  // (owner_user_id = NULL) a anonymizovaná historie subscriptions/payments
  // zůstane zachována. Best-effort: selhání nesmí shodit už provedené (a
  // auditované) smazání tenant dat — admin může akci zopakovat.
  const ownerUserId = ownerRow?.owner_user_id ?? null;
  if (ownerUserId) {
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(ownerUserId);
    if (authDeleteError) {
      await serverLog.warn('force_delete_auth_delete_failed', { businessId: row.business_id });
    }
  }

  // Médiá podniku (logo, cover, fotky zaměstnanců) žijí pod jedním R2 prefixem
  // `{businessId}/`. Po úspěšném smazání tenant dat smažeme celou složku najednou.
  // Best-effort: selhání úklidu R2 nesmí shodit už provedené (a auditované) smazání.
  try {
    await r2DeleteByPrefix(`${row.business_id}/`);
  } catch {
    await serverLog.warn('force_delete_r2_cleanup_failed', { businessId: row.business_id });
  }

  return {
    ok: true,
    businessId: row.business_id,
    subscriptionId: row.subscription_id,
  };
}
