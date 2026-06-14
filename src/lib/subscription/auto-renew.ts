import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { expireForCanceledAutoRenew, type TransitionResult } from '@/lib/subscription/transitions';

/**
 * Přepínání automatické obnovy předplatného (Auto_Obnova).
 *
 * Příznak `subscriptions.auto_renew` (migrace 0024) řídí, zda Platforma na konci
 * období iniciuje automatické strhnutí:
 *
 *  - **Zrušení** ({@link cancelAutoRenew}, R11.1): `auto_renew = false`, status
 *    zůstává `active`. Profil zůstává publikovaný do konce zaplaceného období
 *    (R11.2) — protože status je dál `active`, `businesses.is_published` se
 *    nemění, takže žádný zásah do publikovanosti zde není potřeba.
 *  - **Opětovné zapnutí** ({@link enableAutoRenew}, R11.4): `auto_renew = true`.
 *  - **Konec období bez obnovy** ({@link expireCanceledSubscription}, R11.3):
 *    při dosažení `current_period_end` s `auto_renew = false` přechod do
 *    `expired`, skrytí profilu, uzamčení dashboardu (přes status) a uložení
 *    kotvy = `current_period_end`. Reuse {@link expireForCanceledAutoRenew}.
 *
 * Přepínání příznaku mění jediný řádek `subscriptions` a pracuje pouze nad
 * předplatným ve stavu `active` (R11.1, R11.4) — filtr `status = 'active'`.
 * Klient se předává jako parametr (server-side).
 */

export type AutoRenewResult =
  | { ok: true; autoRenew: boolean }
  | { ok: false; error: 'not_active' | 'write_failed' };

type AutoRenewRow = {
  auto_renew: boolean;
};

async function writeAutoRenew(
  supabase: SupabaseClient,
  subscriptionId: string,
  autoRenew: boolean,
): Promise<AutoRenewResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ auto_renew: autoRenew })
    .eq('id', subscriptionId)
    .eq('status', 'active')
    .select('auto_renew')
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'write_failed' };
  }

  // Žádný dotčený řádek = předplatné neexistuje nebo není ve stavu `active`.
  if (!data) {
    return { ok: false, error: 'not_active' };
  }

  return { ok: true, autoRenew: (data as AutoRenewRow).auto_renew };
}

/**
 * Zruší automatickou obnovu (R11.1).
 *
 * Nastaví `auto_renew = false`; status zůstává `active` a profil publikovaný do
 * konce období. Funguje pouze pro předplatné ve stavu `active`.
 */
export function cancelAutoRenew(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<AutoRenewResult> {
  return writeAutoRenew(supabase, subscriptionId, false);
}

/**
 * Znovu zapne automatickou obnovu (R11.4).
 *
 * Nastaví `auto_renew = true`. Funguje pouze pro předplatné ve stavu `active`.
 */
export function enableAutoRenew(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<AutoRenewResult> {
  return writeAutoRenew(supabase, subscriptionId, true);
}

/**
 * Přechod do `expired` při dosažení konce období s vypnutou auto-obnovou (R11.3).
 *
 * Tenký wrapper nad {@link expireForCanceledAutoRenew} — drží celý životní
 * cyklus auto-obnovy v jednom modulu. Volá ji Billing_Cron (task 12.1) při
 * zpracování předplatných, u nichž `auto_renew = false` a bylo dosaženo
 * `current_period_end`. Nastaví `status = expired`, `is_published = false`,
 * uzamkne dashboard (přes status) a uloží kotvu = `current_period_end`.
 */
export function expireCanceledSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
  currentPeriodEnd: Date | string,
): Promise<TransitionResult> {
  return expireForCanceledAutoRenew(supabase, subscriptionId, currentPeriodEnd);
}
