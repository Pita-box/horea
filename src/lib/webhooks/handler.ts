import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { generateAndStoreInvoice } from '@/lib/invoices/invoice-generator';
import { extendPeriod } from '@/lib/subscription/period';
import {
  activateSubscription,
  transitionToGracePeriod,
} from '@/lib/subscription/transitions';
import { notifyPaymentConfirmed } from '@/lib/telegram/notifications';
import { serverLog } from '@/lib/log-server';

/**
 * Webhook_Handler — idempotentní zpracování platebních notifikací GoPay (R3.3–R3.6).
 *
 * Doménová logika webhooku žije zde; route handler `app/api/webhooks/gopay/route.ts`
 * je tenký adaptér, který ověří HMAC (R3.1, R3.2) a předá service-role klienta.
 *
 * **Idempotence (R3.4, R3.5)** stojí na dvou liniích obrany — opakované i
 * souběžné doručení téhož webhooku vede ke stejnému koncovému stavu Payment i
 * Subscription, bez duplicitního záznamu a bez opakovaného přechodu automatu:
 *
 *  1. **Kontrola cílového stavu PŘED aplikací** — pokud už Payment je ve stavu
 *     hlášeném GoPay, vrátíme `noop` bez jakékoli změny (R3.5). Levný odbavení
 *     běžného opakovaného doručení.
 *  2. **Podmíněný (guarded) flip stavu** — vlastní změna `payments.status` běží
 *     jako `UPDATE ... WHERE id = ? AND status <> cíl`. Postgres serializuje
 *     souběžné zápisy přes zámek řádku, takže právě jedno doručení řádek změní
 *     (vrátí jej) a ostatní dostanou prázdný výsledek → `noop`. Doprovodné efekty
 *     (přechod automatu, prodloužení období, faktura) provádí výhradně to
 *     doručení, které řádek skutečně překlopilo — tedy přesně jednou.
 *
 * Neznámé `gopay_payment_id` (žádný odpovídající Payment) → žádná změna, výsledek
 * `unknown_payment`; route vrátí HTTP 200 (R3.4). Viz design.md, sekce
 * *Webhook idempotence* a Property 2.
 */

/** Stav Payment (DB enum `payment_status`). */
type PaymentStatus = 'pending' | 'paid' | 'failed';

/** Normalizovaná platební událost z webhooku GoPay. */
export interface GopayWebhookEvent {
  /** GoPay ID platby (`payments.gopay_payment_id`). */
  gopayPaymentId: string;
  /** Stav platby hlášený GoPay (např. `PAID`, `CANCELED`, `TIMEOUTED`). */
  state: string;
}

/** Výsledek zpracování webhooku — kategorie, ne PII. */
export type WebhookOutcome =
  | 'unknown_payment'
  | 'ignored_state'
  | 'noop'
  | 'paid_applied'
  | 'failed_applied';

export type WebhookResult =
  | { ok: true; outcome: WebhookOutcome }
  | { ok: false; error: 'lookup_failed' | 'transition_failed' };

/** Řádek Payment načtený pro zpracování webhooku. */
interface PaymentRow {
  id: string;
  status: PaymentStatus;
  subscription_id: string;
  business_id: string;
  amount_czk: number;
  variable_symbol: string;
  invoice_number: string | null;
}

/**
 * Mapuje stav hlášený GoPay na cílový stav Payment. Pouze `PAID` a stavy
 * znamenající neúspěch jsou akční; ostatní (CREATED, PAYMENT_METHOD_CHOSEN, …)
 * nevedou k žádné změně.
 */
function mapGopayState(state: string): Extract<PaymentStatus, 'paid' | 'failed'> | null {
  switch (state.toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'CANCELED':
    case 'CANCELLED':
    case 'TIMEOUTED':
      return 'failed';
    default:
      return null;
  }
}

function planDescription(plan: SubscriptionPlan): string {
  const label: Record<SubscriptionPlan, string> = {
    start: 'Start',
    pokrocily: 'Pokročilý',
    max: 'Max',
  };
  return `Předplatné Horea — tarif ${label[plan]}`;
}

/**
 * Zpracuje platební notifikaci GoPay idempotentně (R3.3–R3.6).
 *
 * @param supabase Service-role Supabase klient (route ověřil HMAC).
 * @param event Normalizovaná událost (`gopay_payment_id`, stav).
 * @param now Okamžik zpracování — určuje rok číselné řady faktury; default `new Date()`.
 */
export async function processGopayWebhook(
  supabase: SupabaseClient,
  event: GopayWebhookEvent,
  now: Date = new Date(),
): Promise<WebhookResult> {
  const targetStatus = mapGopayState(event.state);

  // Neakční stav (např. CREATED) — nic neměníme (R3.3 jen pro hlášené stavy).
  if (targetStatus === null) {
    return { ok: true, outcome: 'ignored_state' };
  }

  // (1) Dohledání Payment podle gopay_payment_id (R3.3).
  const { data, error } = await supabase
    .from('payments')
    .select('id, status, subscription_id, business_id, amount_czk, variable_symbol, invoice_number')
    .eq('gopay_payment_id', event.gopayPaymentId)
    .maybeSingle();

  if (error) {
    await serverLog.error('webhook_payment_lookup_failed', { state: event.state });
    return { ok: false, error: 'lookup_failed' };
  }

  // Neznámé gopay_payment_id → ignorovat, žádná změna (R3.4).
  if (!data) {
    return { ok: true, outcome: 'unknown_payment' };
  }

  const payment = data as PaymentRow;

  // (2) Idempotence — Payment už je v hlášeném stavu → žádná změna (R3.5).
  if (payment.status === targetStatus) {
    return { ok: true, outcome: 'noop' };
  }

  return targetStatus === 'paid'
    ? applyPaid(supabase, payment, now)
    : applyFailed(supabase, payment);
}

/**
 * Aplikuje úspěšnou platbu: překlopí Payment na `paid` (guarded), aktivuje
 * předplatné, prodlouží období o Jeden_Mesic a vygeneruje fakturu (R3.6, R1.5).
 */
async function applyPaid(
  supabase: SupabaseClient,
  payment: PaymentRow,
  now: Date,
): Promise<WebhookResult> {
  // Guarded flip — projde jen jednou i při souběžném doručení (R3.5).
  const { data: flipped, error: flipError } = await supabase
    .from('payments')
    .update({ status: 'paid' })
    .eq('id', payment.id)
    .neq('status', 'paid')
    .select('id')
    .maybeSingle();

  if (flipError) {
    await serverLog.error('webhook_payment_flip_failed', { outcome: 'paid' });
    return { ok: false, error: 'transition_failed' };
  }

  // Jiné doručení už řádek překlopilo → doprovodné efekty neopakujeme (R3.5).
  if (!flipped) {
    return { ok: true, outcome: 'noop' };
  }

  // Přechod stavového automatu: aktivace + vymazání kotvy (R3.6, R1.3/R5.6/R6.6).
  const transition = await activateSubscription(supabase, payment.subscription_id);
  if (!transition.ok) {
    await serverLog.error('webhook_activate_failed', { reason: transition.error });
    return { ok: false, error: 'transition_failed' };
  }

  // Prodloužení období přesně o Jeden_Mesic (R1.5, Property 6).
  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .select('current_period_end, plan')
    .eq('id', payment.subscription_id)
    .maybeSingle();

  if (subError || !subscription) {
    await serverLog.error('webhook_subscription_lookup_failed', {});
    return { ok: false, error: 'transition_failed' };
  }

  const sub = subscription as { current_period_end: string; plan: SubscriptionPlan };
  const newEnd = extendPeriod(sub.current_period_end);

  const { error: periodError } = await supabase
    .from('subscriptions')
    .update({ current_period_end: newEnd.toISOString() })
    .eq('id', payment.subscription_id);

  if (periodError) {
    await serverLog.error('webhook_period_extend_failed', {});
    return { ok: false, error: 'transition_failed' };
  }

  // Faktura — přidělí se jen jednou (guarded flip nás sem pustí jen jednou,
  // a jen pokud platba dosud číslo faktury nemá). Selhání generování fakturu
  // nezablokuje úspěch webhooku; zaloguje se k pozdějšímu řešení.
  // Název podniku — pro fakturu i pro notifikaci operátorovi (R4.2).
  let businessName = 'Podnik';

  if (payment.invoice_number === null) {
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', payment.business_id)
      .maybeSingle();

    businessName = (business as { name: string } | null)?.name ?? 'Podnik';

    const invoice = await generateAndStoreInvoice(supabase, {
      paymentId: payment.id,
      issuedAt: now,
      businessName,
      description: planDescription(sub.plan),
      amountCzk: payment.amount_czk,
      variableSymbol: payment.variable_symbol,
    });

    if (!invoice.ok) {
      await serverLog.error('webhook_invoice_failed', { reason: invoice.error });
    }
  }

  // Best-effort notifikace operátorovi o potvrzené platbě — výhradně na cestě
  // paid_applied (guarded flip skutečně překlopil status), tím je zajištěn dedup
  // (R6.1). Selhání jen zalogujeme; výsledek webhooku se nemění (R4.1, R5.2).
  try {
    await notifyPaymentConfirmed({
      businessName,
      plan: sub.plan,
      amountCzk: payment.amount_czk,
    });
  } catch {
    // best-effort: notifikace nesmí ovlivnit výsledek webhooku (R5.2)
  }

  return { ok: true, outcome: 'paid_applied' };
}

/**
 * Aplikuje neúspěšnou platbu: překlopí Payment na `failed` (guarded) a převede
 * předplatné do `grace_period` (R3.6, R4.1) — kotva se nastaví jen pokud chybí.
 */
async function applyFailed(supabase: SupabaseClient, payment: PaymentRow): Promise<WebhookResult> {
  const { data: flipped, error: flipError } = await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('id', payment.id)
    .neq('status', 'failed')
    .select('id')
    .maybeSingle();

  if (flipError) {
    await serverLog.error('webhook_payment_flip_failed', { outcome: 'failed' });
    return { ok: false, error: 'transition_failed' };
  }

  if (!flipped) {
    return { ok: true, outcome: 'noop' };
  }

  const transition = await transitionToGracePeriod(supabase, payment.subscription_id);
  if (!transition.ok) {
    await serverLog.error('webhook_grace_transition_failed', { reason: transition.error });
    return { ok: false, error: 'transition_failed' };
  }

  return { ok: true, outcome: 'failed_applied' };
}
