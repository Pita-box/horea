import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { log } from '@/lib/log';

/**
 * AuditLogger — zápis auditní stopy citlivých administrátorských akcí do
 * `audit_log` (feature `admin-dashboard`, Requirement 9, Property 2).
 *
 * NÁVRH „STEJNÉ TRANSAKCE" (design.md, *Audit logging strategy*): aby úspěšná
 * citlivá akce odpovídala **právě jednomu** auditnímu záznamu a obojí stálo/padalo
 * společně, probíhá vlastní `INSERT` přes SECURITY DEFINER funkci
 * `write_audit_log` (migrace 0035). Supabase JS klient neumí držet jednu transakci
 * přes více volání, proto:
 *  - **Akce běžící jako plpgsql RPC** (override, free trial/comp, vynucené smazání,
 *    párování platby — tasky 10/11/12/15) volají `write_audit_log(...)` UVNITŘ své
 *    transakce — záznam vznikne ve stejné transakci jako akce.
 *  - **Akce, jejichž změna je jediný atomický příkaz**, použijí TS helper
 *    {@link writeAuditLog}, který volá `write_audit_log` jako samostatnou (rovněž
 *    atomickou) RPC.
 *
 * BEST-EFFORT before/after (R9.4): zachycení stavu cílového objektu před a po akci
 * probíhá v TS přes {@link captureSnapshot}. Pokud zachycení z technických důvodů
 * selže, vrátí `null` a auditní záznam přesto vznikne (bez before/after) — selhání
 * zachycení kontextu NESMÍ shodit citlivou akci.
 *
 * Append-only charakter `audit_log` je vynucen na úrovni DB (migrace 0034); tento
 * modul pouze vkládá (přes write_audit_log), nikdy nemění ani nemaže.
 */

/**
 * Typ citlivé akce (R9.1). Hodnoty odpovídají komentáři u `audit_log.action_type`
 * (migrace 0031) a citlivým akcím vyjmenovaným v Requirement 9.
 */
export type AuditActionType =
  | 'subscription_override'
  | 'grant_free_trial'
  | 'grant_comp'
  | 'suspend_business'
  | 'force_delete_business'
  | 'coupon_create'
  | 'coupon_update'
  | 'coupon_deactivate'
  | 'coupon_delete'
  | 'payment_match'
  | 'plan_feature_update';

/** Typ cílového objektu auditní akce (R9.2). */
export type AuditTargetType = 'subscription' | 'business' | 'coupon' | 'payment' | 'plan_feature';

/**
 * Vstup pro zápis jednoho auditního záznamu.
 *
 * `before`/`after` jsou volitelné a best-effort: vynechání nebo `null` znamená, že
 * stav nebyl zachycen (R9.4). U akcí, které objekt vytvářejí, je `before`
 * přirozeně `null`; u akcí, které objekt ruší, vyjadřuje odstranění `after`.
 */
export type AuditLogEntry = {
  /** Identifikátor administrátora (actor), který akci provedl (R9.2). */
  actorUserId: string;
  /** Typ akce (R9.2). */
  actionType: AuditActionType;
  /** Typ cílového objektu (R9.2). */
  targetType: AuditTargetType;
  /** Identifikátor cílového objektu (R9.2); `null` připuštěno (např. hromadná akce). */
  targetId: string | null;
  /** Stav cílového objektu před akcí (R9.3); `null`/vynecháno = nezachyceno (R9.4). */
  before?: unknown;
  /** Stav cílového objektu po akci (R9.3); `null`/vynecháno = nezachyceno (R9.4). */
  after?: unknown;
};

/**
 * Best-effort zachycení snapshotu stavu cílového objektu pro `before`/`after`
 * (R9.3, R9.4). Pokud `capture` vyhodí výjimku nebo vrátí `undefined`, vrátí
 * `null` — auditní akce se kvůli selhání zachycení kontextu NESMÍ zhroutit.
 *
 * @param capture Funkce načítající aktuální stav cílového objektu.
 * @param context Volitelný kontext do logu při selhání zachycení.
 * @returns Zachycený stav, nebo `null` při selhání / chybějícím stavu.
 */
export async function captureSnapshot<T>(
  capture: () => Promise<T> | T,
  context?: Record<string, unknown>,
): Promise<T | null> {
  try {
    const snapshot = await capture();
    return snapshot ?? null;
  } catch (error) {
    log.warn('audit_snapshot_capture_failed', {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Zapíše právě jeden auditní záznam přes SECURITY DEFINER funkci `write_audit_log`
 * (R9.1, R9.2, Property 2). Vrací `id` vloženého záznamu.
 *
 * Selhání zápisu auditu (na rozdíl od selhání zachycení before/after) se propaguje
 * výjimkou — volající citlivou akci tak může zvrátit (princip „audit a akce stojí
 * a padají společně"). Pro skutečnou transakční atomicitu volá akční RPC funkci
 * `write_audit_log` přímo ve své transakci; tento helper je pro akce s jediným
 * atomickým příkazem.
 *
 * @param supabase Service-role Supabase klient.
 * @param entry Auditní záznam k zápisu.
 * @returns `id` nově vytvořeného `audit_log` záznamu.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry,
): Promise<string> {
  const { data, error } = await supabase.rpc('write_audit_log', {
    p_actor_user_id: entry.actorUserId,
    p_action_type: entry.actionType,
    p_target_type: entry.targetType,
    p_target_id: entry.targetId,
    p_before: entry.before ?? null,
    p_after: entry.after ?? null,
  });

  if (error) {
    log.error('audit_log_write_failed', {
      actionType: entry.actionType,
      targetType: entry.targetType,
      targetId: entry.targetId,
      error: error.message,
    });
    throw new Error(`Nepodařilo se zapsat auditní záznam: ${error.message}`);
  }

  return data as string;
}
