import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import { sendBestEffort } from '@/lib/email/outbox';
import type { GopayClient } from '@/lib/payments/gopay/client';
import { nextVariableSymbol } from '@/lib/payments/variable-symbol-source';
import { serverLog } from '@/lib/log-server';

/**
 * Billing_Engine — měsíční automatické strhnutí přes recurring schedule (R2.2–2.5).
 *
 * Tok (design.md, sekce *Billing_Engine* a *Sekvence 2*):
 *
 *  1. Přidělí unikátní variabilní symbol z monotónní sekvence.
 *  2. Vytvoří Payment `pending` / `auto_charge` **PŘED** voláním GoPay (R2.4) —
 *     aby každý pokus o strhnutí měl perzistentní záznam i kdyby GoPay selhalo.
 *  3. Iniciuje strhnutí přes existující schedule (`chargeRecurrence`).
 *  4. Při úspěšné *iniciaci* uloží `gopay_payment_id` k platbě, aby ji webhook
 *     dohledal. Skutečný výsledek (paid/failed → prodloužení období / grace) doručí
 *     asynchronně webhook (task 9.3), ne tato funkce.
 *
 * **Selhání iniciace** (GoPay nedostupné, R2.5): zaloguje chybu, upozorní
 * administrátora e-mailem a ponechá `subscription.status` na `active` (funkce se
 * stavu předplatného nedotýká). Pending Payment se označí `failed`, aby nezůstal
 * viset; Billing_Cron strhnutí zopakuje v dalším běhu. Volá výhradně server-side
 * service role; klient i GoPay se předávají jako parametry.
 */

/** Kontext jednoho splatného předplatného pro měsíční strhnutí. */
export interface MonthlyChargeContext {
  /** ID předplatného (`subscriptions.id`). */
  subscriptionId: string;
  /** ID podniku (`businesses.id`). */
  businessId: string;
  /** ID recurring schedule (`subscriptions.gopay_schedule_id` = rodičovská platba). */
  scheduleId: string;
  /** Aktuální tarif (zdroj účtované částky). */
  plan: SubscriptionPlan;
}

export type MonthlyChargeResult =
  | { ok: true; paymentId: string; gopayPaymentId: string }
  | { ok: false; error: 'vs_allocation_failed' | 'payment_create_failed' | 'initiation_failed' };

function planDescription(plan: SubscriptionPlan): string {
  const label: Record<SubscriptionPlan, string> = {
    start: 'Start',
    pokrocily: 'Pokročilý',
    max: 'Max',
  };
  return `Předplatné Horea — tarif ${label[plan]}`;
}

/**
 * Best-effort notifikace administrátora o selhání iniciace strhnutí (R2.5).
 *
 * Adresa administrátora se čte z env `HOREA_ADMIN_EMAIL`; bez ní se notifikace
 * přeskočí (zaloguje se jen upozornění). E-mail neobsahuje žádné PII — jen
 * neidentifikující ID předplatného/podniku. Funkce NIKDY nevyhodí výjimku.
 */
export async function notifyAdminChargeInitiationFailed(context: {
  subscriptionId: string;
  businessId: string;
}): Promise<void> {
  const adminEmail = process.env.HOREA_ADMIN_EMAIL;
  if (!adminEmail) {
    await serverLog.warn('admin_notification_skipped_no_email', {
      subscriptionId: context.subscriptionId,
    });
    return;
  }

  const subject = 'Horea — selhala iniciace automatického strhnutí';
  const text = [
    'Automatické strhnutí předplatného se nepodařilo iniciovat (platební brána nedostupná).',
    '',
    `Předplatné: ${context.subscriptionId}`,
    `Podnik: ${context.businessId}`,
    '',
    'Předplatné zůstává aktivní; strhnutí se zopakuje v dalším běhu úlohy.',
  ].join('\n');

  try {
    await sendBestEffort({ category: 'admin', to: adminEmail, subject, text, logLabel: 'admin_notification' });
  } catch {
    await serverLog.warn('admin_notification_failed', { subscriptionId: context.subscriptionId });
  }
}

/**
 * Iniciuje měsíční automatické strhnutí pro jedno splatné předplatné (R2.2–2.5).
 *
 * @param supabase Service-role Supabase klient.
 * @param gopay GoPay klient (injektovatelný kvůli testům).
 * @param context Kontext splatného předplatného (schedule, tarif, identifikátory).
 */
export async function chargeMonthly(
  supabase: SupabaseClient,
  gopay: GopayClient,
  context: MonthlyChargeContext,
): Promise<MonthlyChargeResult> {
  // (1) Přidělení unikátního variabilního symbolu.
  const vs = await nextVariableSymbol(supabase);
  if (!vs.ok) {
    return { ok: false, error: 'vs_allocation_failed' };
  }

  const amountCzk = planPriceCzk(context.plan);

  // (2) Payment `pending` / `auto_charge` PŘED voláním GoPay (R2.4).
  const { data: payment, error: insertError } = await supabase
    .from('payments')
    .insert({
      business_id: context.businessId,
      subscription_id: context.subscriptionId,
      amount_czk: amountCzk,
      currency: 'CZK',
      variable_symbol: vs.variableSymbol,
      status: 'pending',
      method: 'auto_charge',
    })
    .select('id')
    .maybeSingle();

  if (insertError || !payment) {
    await serverLog.error('billing_charge_payment_insert_failed', {
      subscriptionId: context.subscriptionId,
      businessId: context.businessId,
    });
    return { ok: false, error: 'payment_create_failed' };
  }

  const paymentId = (payment as { id: string }).id;

  // (3) Iniciace strhnutí přes recurring schedule.
  let charged;
  try {
    charged = await gopay.chargeRecurrence({
      scheduleId: context.scheduleId,
      amountCzk,
      variableSymbol: vs.variableSymbol,
      description: planDescription(context.plan),
    });
  } catch {
    // (R2.5) Selhání iniciace: log + admin notifikace, stav zůstává `active`.
    await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentId);
    await serverLog.error('billing_charge_initiation_failed', {
      subscriptionId: context.subscriptionId,
      businessId: context.businessId,
      paymentId,
    });
    await notifyAdminChargeInitiationFailed({
      subscriptionId: context.subscriptionId,
      businessId: context.businessId,
    });
    return { ok: false, error: 'initiation_failed' };
  }

  // (4) Uložení GoPay payment ID, aby ho webhook dohledal podle gopay_payment_id.
  await supabase
    .from('payments')
    .update({ gopay_payment_id: charged.paymentId })
    .eq('id', paymentId);

  return { ok: true, paymentId, gopayPaymentId: charged.paymentId };
}
