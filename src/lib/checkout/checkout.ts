import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import {
  applyActivationCoupon,
  computeChargedAmountCzk,
  couponEffectKind,
} from '@/lib/coupons/apply';
import {
  incrementCouponUsage,
  validateCouponByCode,
  type CouponRecord,
} from '@/lib/coupons/validate';
import type { GopayClient } from '@/lib/payments/gopay/client';
import { nextVariableSymbol } from '@/lib/payments/variable-symbol-source';
import { serverLog } from '@/lib/log-server';

/**
 * Checkout — výběr tarifu, aplikace kupónu a iniciace první platby (R1, R9).
 *
 * Doménová logika čekoutu žije zde; route handler `app/api/checkout/route.ts` je
 * tenký adaptér, který ověří přihlášení + vlastnictví podniku a předá service-role
 * klienta. Tok (design.md, sekce *Checkout* a *Sekvence 1*):
 *
 *  1. Volitelný kupón se *zvaliduje* (existence, platnost, počet použití, R9.1/9.2).
 *  2. **Aktivační kupón** (`free_trial_days` / `comp`, R9.5/9.6): předplatné se
 *     aktivuje přímo bez platby přes {@link applyActivationCoupon}, kupón se
 *     označí za použitý a checkout končí výsledkem `activated`.
 *  3. **Jinak** (žádný kupón nebo slevový kupón): vytvoří se Payment `pending`
 *     (metoda `auto_charge`) s unikátním variabilním symbolem, na bráně GoPay se
 *     založí platba s inicializací recurring schedule (ON_DEMAND) a vrátí se URL
 *     pro přesměrování (R1.1, R1.2). Skutečnou aktivaci provede až webhook po
 *     potvrzení platby (mimo rozsah, task 9.3).
 *
 * Selhání / zrušení platby (R1.6) nemění předplatné — to zůstává `free` a
 * `is_published=false` (checkout se subscription stavu vůbec nedotýká na platební
 * cestě). Při selhání *iniciace* GoPay se Payment označí `failed` a vrátí se
 * chyba, takže uživatel může platbu zopakovat novým checkoutem.
 *
 * Recurring schedule se *iniciuje* zde (recurrence na první platbě); jeho
 * zhmotnění (`gopay_schedule_id`) provede webhook po úspěchu (`establishRecurringSchedule`).
 */

/** Kontext přihlášeného podniku (ověřený route handlerem). */
export interface CheckoutContext {
  /** ID podniku (`businesses.id`) ověřeného vlastníka. */
  businessId: string;
  /** ID předplatného podniku (`subscriptions.id`). */
  subscriptionId: string;
  /** Název podniku — popis objednávky na bráně GoPay. */
  businessName: string;
  /** E-mail plátce pro předvyplnění kontaktu na bráně (nepovinné). */
  payerEmail?: string;
}

/** Vstup checkoutu. */
export interface CheckoutInput {
  /** Zvolený tarif. */
  plan: SubscriptionPlan;
  /** Volitelný kód kupónu. */
  couponCode?: string | null;
  /** URL návratu po dokončení platby na bráně GoPay. */
  returnUrl: string;
  /** URL webhooku pro notifikaci o výsledku platby. */
  notificationUrl: string;
  /** Aktuální čas (pro výpočet konce free-trial období); default `new Date()`. */
  now?: Date;
}

export type CheckoutError =
  | 'invalid_plan'
  | 'coupon_invalid'
  | 'vs_allocation_failed'
  | 'payment_create_failed'
  | 'gopay_failed'
  | 'activation_failed';

export type CheckoutResult =
  | {
      ok: true;
      outcome: 'redirect';
      redirectUrl: string;
      paymentId: string;
      variableSymbol: string;
      amountCzk: number;
    }
  | { ok: true; outcome: 'activated'; reason: 'free_trial' | 'comp' }
  | { ok: false; error: CheckoutError; message: string };

const VALID_PLANS: ReadonlySet<SubscriptionPlan> = new Set(['start', 'pokrocily', 'max']);

/** České hlášky pro chyby checkoutu prezentované uživateli. */
const CHECKOUT_ERROR_MESSAGES: Record<Exclude<CheckoutError, 'coupon_invalid'>, string> = {
  invalid_plan: 'Neplatný tarif předplatného.',
  vs_allocation_failed: 'Platbu se nepodařilo založit. Zkuste to prosím znovu.',
  payment_create_failed: 'Platbu se nepodařilo založit. Zkuste to prosím znovu.',
  gopay_failed: 'Platební bránu se nepodařilo spustit. Zkuste to prosím znovu.',
  activation_failed: 'Předplatné se nepodařilo aktivovat. Zkuste to prosím znovu.',
};

function fail(error: Exclude<CheckoutError, 'coupon_invalid'>): CheckoutResult {
  return { ok: false, error, message: CHECKOUT_ERROR_MESSAGES[error] };
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
 * Provede checkout pro zvolený tarif s volitelným kupónem (R1, R9).
 *
 * @param supabase Service-role Supabase klient (route handler ověřil vlastnictví).
 * @param gopay GoPay klient (injektovatelný kvůli testům).
 * @param context Ověřený kontext podniku a předplatného.
 * @param input Tarif, volitelný kupón a URL návratu/notifikace.
 */
export async function checkout(
  supabase: SupabaseClient,
  gopay: GopayClient,
  context: CheckoutContext,
  input: CheckoutInput,
): Promise<CheckoutResult> {
  if (!VALID_PLANS.has(input.plan)) {
    return fail('invalid_plan');
  }

  const now = input.now ?? new Date();

  // (1) Validace kupónu (pokud zadán).
  let coupon: CouponRecord | null = null;
  if (input.couponCode && input.couponCode.trim().length > 0) {
    const validation = await validateCouponByCode(supabase, input.couponCode.trim(), now);
    if (!validation.ok) {
      return { ok: false, error: 'coupon_invalid', message: validation.message };
    }
    coupon = validation.coupon;
  }

  // (2) Aktivační kupón → přímá aktivace bez platby (R9.5, R9.6).
  if (coupon && couponEffectKind(coupon.type) === 'activation') {
    return activateWithCoupon(supabase, context.subscriptionId, coupon, now);
  }

  // (3) Slevový kupón nebo žádný kupón → platební cesta.
  return initiatePayment(supabase, gopay, context, input, coupon);
}

async function activateWithCoupon(
  supabase: SupabaseClient,
  subscriptionId: string,
  coupon: CouponRecord,
  now: Date,
): Promise<CheckoutResult> {
  const activation = await applyActivationCoupon(supabase, subscriptionId, coupon, now);
  if (!activation.ok) {
    await serverLog.error('checkout_activation_failed', {
      subscriptionId,
      couponType: coupon.type,
      reason: activation.error,
    });
    return fail('activation_failed');
  }

  // Kupón se po úspěšné aktivaci označí za použitý (R9.1 — inkrement při aplikaci).
  await incrementCouponUsage(supabase, coupon);

  return { ok: true, outcome: 'activated', reason: coupon.type === 'comp' ? 'comp' : 'free_trial' };
}

async function initiatePayment(
  supabase: SupabaseClient,
  gopay: GopayClient,
  context: CheckoutContext,
  input: CheckoutInput,
  coupon: CouponRecord | null,
): Promise<CheckoutResult> {
  const amountCzk = coupon
    ? computeChargedAmountCzk(input.plan, coupon)
    : planPriceCzk(input.plan);

  // (3a) Přidělení unikátního variabilního symbolu z monotónní sekvence.
  const vs = await nextVariableSymbol(supabase);
  if (!vs.ok) {
    return fail('vs_allocation_failed');
  }

  // (3b) Payment `pending` / `auto_charge` PŘED voláním GoPay (R1.1).
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
    await serverLog.error('checkout_payment_insert_failed', {
      businessId: context.businessId,
      subscriptionId: context.subscriptionId,
    });
    return fail('payment_create_failed');
  }

  const paymentId = (payment as { id: string }).id;

  // (3c) Slevový kupón se po vytvoření platby označí za použitý (R9.1).
  if (coupon) {
    await incrementCouponUsage(supabase, coupon);
  }

  // (3d) Vytvoření platby na bráně GoPay s inicializací recurring schedule (R1.2, R2.1).
  let created;
  try {
    created = await gopay.createPayment({
      amountCzk,
      variableSymbol: vs.variableSymbol,
      description: planDescription(input.plan),
      payerEmail: context.payerEmail,
      returnUrl: input.returnUrl,
      notificationUrl: input.notificationUrl,
      recurring: true,
    });
  } catch {
    // Selhání iniciace GoPay (R1.6): Payment označíme `failed`, předplatné
    // zůstává `free`. Uživatel může platbu zopakovat novým checkoutem.
    await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentId);
    await serverLog.error('checkout_gopay_create_failed', {
      businessId: context.businessId,
      subscriptionId: context.subscriptionId,
      paymentId,
    });
    return fail('gopay_failed');
  }

  // (3e) Uložení GoPay payment ID, aby ho webhook dohledal podle gopay_payment_id.
  await supabase
    .from('payments')
    .update({ gopay_payment_id: created.paymentId })
    .eq('id', paymentId);

  return {
    ok: true,
    outcome: 'redirect',
    redirectUrl: created.gatewayUrl,
    paymentId,
    variableSymbol: vs.variableSymbol,
    amountCzk,
  };
}
