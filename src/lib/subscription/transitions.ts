import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionStatus } from '@/lib/auth/free-user-guard';
import { computeState } from '@/lib/subscription/state-machine';

/**
 * Aplikace přechodů stavového automatu předplatného a jejich doprovodných efektů.
 *
 * Skutečná atomicita NEŽIJE v TypeScriptu — Supabase JS klient neumí držet
 * jednu DB transakci přes více volání. Žije v plpgsql funkci
 * `public.apply_subscription_transition` (migrace 0027), která pod zámkem řádku
 * `subscriptions` perzistuje v JEDNÉ transakci tři efekty: `subscriptions.status`,
 * kotvu `subscriptions.first_failed_charge_at` a `businesses.is_published`.
 *
 * Tento modul je tenký TS orchestrátor: pro každou doménovou událost zvolí cílový
 * `status`, odvodí publikovanost a předá akci nad kotvou. Cílový stav je buď dán
 * konkrétní událostí (úspěšná platba, první selhání, konec období bez auto-obnovy),
 * nebo se počítá z kotvy a času přes {@link computeState} (časová materializace
 * cronem). Viz design.md, sekce *Stavový automat předplatného*, a Property 1.
 *
 * **Zámek dashboardu** není samostatný sloupec — vynucuje ho `free-user-guard`
 * odvozením ze `status` (expired/deleted_data ⇒ uzamčeno), takže perzistence
 * `status` zámek zařídí (R6.5).
 *
 * Funkce volá výhradně server-side service role (Webhook_Handler, cron úlohy);
 * klient se proto předává jako parametr (service-role Supabase klient).
 */

/** Akce nad kotvou Prvni_Selhani — viz migrace 0027. */
type AnchorAction = 'set_if_null' | 'set' | 'clear' | 'leave';

export type TransitionResult =
  | {
      ok: true;
      status: SubscriptionStatus;
      isPublished: boolean;
      firstFailedChargeAt: string | null;
    }
  | { ok: false; error: 'not_found' | 'transaction_failed' };

type TransitionRow = {
  subscription_id: string;
  business_id: string;
  status: SubscriptionStatus;
  is_published: boolean;
  first_failed_charge_at: string | null;
};

/**
 * Publikovanost podniku odvozená ze stavu předplatného: `active` a `grace_period`
 * jsou publikované (R4.2), `expired` a `deleted_data` skryté (R6.5). `free` je
 * rovněž nepublikované (podnik před první platbou).
 */
export function isPublishedForStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'grace_period';
}

function toIso(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro přechod předplatného: "${String(value)}".`);
  }
  return date.toISOString();
}

async function applyTransition(
  supabase: SupabaseClient,
  subscriptionId: string,
  status: SubscriptionStatus,
  anchorAction: AnchorAction,
  anchorValue: Date | string | null = null,
): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('apply_subscription_transition', {
    p_subscription_id: subscriptionId,
    p_status: status,
    p_is_published: isPublishedForStatus(status),
    p_anchor_action: anchorAction,
    p_anchor_value: anchorValue === null ? null : toIso(anchorValue),
  });

  if (error) {
    return { ok: false, error: 'transaction_failed' };
  }

  const row = (Array.isArray(data) ? data[0] : data) as TransitionRow | undefined;

  if (!row) {
    return { ok: false, error: 'not_found' };
  }

  return {
    ok: true,
    status: row.status,
    isPublished: row.is_published,
    firstFailedChargeAt: row.first_failed_charge_at,
  };
}

/**
 * Aktivace předplatného po úspěšné platbě nebo reaktivaci.
 *
 * Nastaví `status = active`, `is_published = true` a **vymaže kotvu** (NULL),
 * čímž končí neplacená epizoda. Pokrývá první úspěšnou platbu (R1.3) i reaktivaci
 * z `grace_period`/`expired` úspěšnou platbou (R5.6, R6.6).
 */
export function activateSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<TransitionResult> {
  return applyTransition(supabase, subscriptionId, 'active', 'clear');
}

/**
 * Přechod do `grace_period` při selhání automatického strhnutí (R4.1).
 *
 * Ponechá `is_published = true` (R4.2) a nastaví kotvu Prvni_Selhani **pouze
 * pokud dosud není** — opakované selhání ve stejné epizodě kotvu nepřepíše
 * (R4.3). Bez `failedAt` se použije aktuální čas DB (`now()`).
 */
export function transitionToGracePeriod(
  supabase: SupabaseClient,
  subscriptionId: string,
  failedAt?: Date | string,
): Promise<TransitionResult> {
  return applyTransition(supabase, subscriptionId, 'grace_period', 'set_if_null', failedAt ?? null);
}

/**
 * Přechod do `expired` při dosažení konce období s vypnutou auto-obnovou (R11.3).
 *
 * Nastaví `status = expired`, `is_published = false`, uzamkne dashboard (přes
 * status) a uloží kotvu rovnou na `current_period_end`, takže reaktivační a
 * mazací lhůty běží od konce zaplaceného období.
 */
export function expireForCanceledAutoRenew(
  supabase: SupabaseClient,
  subscriptionId: string,
  currentPeriodEnd: Date | string,
): Promise<TransitionResult> {
  return applyTransition(supabase, subscriptionId, 'expired', 'set', currentPeriodEnd);
}

/**
 * Časová materializace stavu z kotvy a aktuálního času (R6.5).
 *
 * Cílový stav je čistá funkce `(first_failed_charge_at, now)` (viz
 * {@link computeState}); kotva zůstává beze změny (`leave`). Slouží cronu k
 * „zhmotnění" přechodů `grace_period`→`expired`→`deleted_data` — cron nezavádí
 * vlastní logiku časování, jen perzistuje vypočtený stav a jeho efekty.
 */
export function materializeAnchoredState(
  supabase: SupabaseClient,
  subscriptionId: string,
  firstFailedChargeAt: Date | string,
  now: Date | string,
): Promise<TransitionResult> {
  const status = computeState(firstFailedChargeAt, now);
  return applyTransition(supabase, subscriptionId, status, 'leave');
}
