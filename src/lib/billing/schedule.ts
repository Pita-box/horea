import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { GopayClient } from '@/lib/payments/gopay/client';

/**
 * Billing_Engine — založení recurring schedule po první úspěšné platbě (R2.1).
 *
 * Model recurring plateb GoPay je on-demand: recurrence se definuje na první
 * (rodičovské) platbě už při checkoutu (task 8.3). Jakmile je rodičovská platba
 * potvrzena jako zaplacená (webhook), je schedule v GoPay „založen" a jeho
 * kotvou je ID rodičovské platby. Tento modul tu skutečnost zhmotní na naší
 * straně: přes {@link GopayClient} ověří, že recurrence rodičovské platby je
 * aktivní, a uloží její identifikátor do `subscriptions.gopay_schedule_id`.
 *
 * Identifikátor schedule je následně vstupem pro měsíční strhávání (task 10.2,
 * mimo rozsah). Funkce mění jediný řádek `subscriptions` a volá ji výhradně
 * server-side service role (Webhook_Handler / Billing_Engine), proto se klient
 * předává jako parametr. Viz design.md, sekce *Billing_Engine* a *Sekvence 1*.
 */

/** Vstup pro založení recurring schedule. */
export interface EstablishRecurringScheduleInput {
  /** Předplatné, kterému se schedule přiřazuje. */
  subscriptionId: string;
  /** GoPay ID první (rodičovské) platby, na které je recurrence definována. */
  parentPaymentId: string;
}

export type EstablishRecurringScheduleResult =
  | { ok: true; scheduleId: string }
  | { ok: false; error: 'not_recurring' | 'gopay_failed' | 'write_failed' | 'not_found' };

/**
 * Založí (zhmotní) recurring schedule po první úspěšné platbě a uloží jeho
 * identifikátor do `subscriptions.gopay_schedule_id` (R2.1).
 *
 * Postup:
 *  1. Přes GoPay klienta ověří stav recurrence rodičovské platby. Selhání volání
 *     GoPay → `gopay_failed` (volající zaloguje a ponechá k opakování).
 *  2. Pokud recurrence není aktivní → `not_recurring` (schedule nelze založit).
 *  3. Jinak zapíše `gopay_schedule_id` do předplatného. Žádný dotčený řádek →
 *     `not_found`; chyba zápisu → `write_failed`.
 *
 * @param supabase Service-role Supabase klient.
 * @param gopay GoPay klient (injektovatelný kvůli testům).
 * @param input Identifikátory předplatného a rodičovské platby.
 */
export async function establishRecurringSchedule(
  supabase: SupabaseClient,
  gopay: GopayClient,
  input: EstablishRecurringScheduleInput,
): Promise<EstablishRecurringScheduleResult> {
  let recurrence;
  try {
    recurrence = await gopay.getRecurrence(input.parentPaymentId);
  } catch {
    return { ok: false, error: 'gopay_failed' };
  }

  if (!recurrence.active) {
    return { ok: false, error: 'not_recurring' };
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .update({ gopay_schedule_id: recurrence.scheduleId })
    .eq('id', input.subscriptionId)
    .select('id')
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'write_failed' };
  }

  if (!data) {
    return { ok: false, error: 'not_found' };
  }

  return { ok: true, scheduleId: recurrence.scheduleId };
}
