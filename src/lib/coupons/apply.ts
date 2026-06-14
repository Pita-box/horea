import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CouponRecord, CouponType } from '@/lib/coupons/validate';
import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import { activateSubscription, type TransitionResult } from '@/lib/subscription/transitions';

/**
 * Aplikace slevy a aktivačních kupónů při checkoutu.
 *
 * Modul záměrně odděluje dvě nezávislé odpovědnosti (viz design.md, sekce
 * *Aplikace kupónu*):
 *
 *  1. **Čistý výpočet účtované částky** ({@link computeChargedAmountCzk}) — bez
 *     databáze, deterministický. Výsledná částka první platby není nikdy
 *     záporná (floor na 0 Kč, Property 7).
 *  2. **DB efekty aktivace** ({@link applyActivationCoupon}) — pro aktivační
 *     kupóny (free trial / comp účet), které předplatné rovnou aktivují bez
 *     stržení platby.
 *
 * Typy kupónů a jejich efekt:
 *
 * | Typ              | Efekt na částku / aktivaci |
 * |------------------|----------------------------|
 * | `percent`        | sníží částku o procento, floor 0 Kč (R9.3) |
 * | `fixed`          | sníží částku o CZK, floor 0 Kč (R9.4) |
 * | `free_trial_days`| aktivace: `active`, `is_published=true`, `current_period_end = now + dny`, bez stržení (R9.5) |
 * | `comp`           | aktivace: `active`, `is_published=true`, bez stržení a bez recurring schedule (R9.6) |
 *
 * Validace existence/platnosti/počtu použití řeší `coupons/validate.ts`; sem
 * vstupuje již zvalidovaný {@link CouponRecord}.
 */

/** Počet sekund v jednom dni — pro výpočet konce zkušebního období. */
const DEN_SECONDS = 86_400;

/** Klasifikace efektu kupónu na průběh checkoutu. */
export type CouponEffectKind = 'discount' | 'activation';

/**
 * Rozhodne, zda kupón vede ke slevě první platby (`discount`) nebo k přímé
 * aktivaci předplatného bez stržení (`activation`).
 *
 * Aktivační kupóny (`free_trial_days`, `comp`) nezahajují platbu — předplatné
 * aktivují rovnou. Slevové kupóny (`percent`, `fixed`) jen upraví účtovanou
 * částku, samotná platba proběhne dál standardně.
 */
export function couponEffectKind(type: CouponType): CouponEffectKind {
  return type === 'free_trial_days' || type === 'comp' ? 'activation' : 'discount';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toMillis(value: Date | string): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro aplikaci kupónu: "${String(value)}".`);
  }
  return ms;
}

/**
 * Čistý výpočet účtované částky první platby po aplikaci kupónu (R9.3, R9.4).
 *
 * - `percent` — `base × (1 − procento/100)`, procento omezeno na 0–100,
 *   zaokrouhleno na celé koruny.
 * - `fixed` — `base − sleva`, sleva nezáporná, zaokrouhleno na celé koruny.
 * - `free_trial_days` / `comp` — žádné stržení, vrací `0`.
 *
 * Výsledek je **vždy ≥ 0 Kč** (floor na 0), takže žádný kupón nemůže vést k
 * záporné účtované částce (Property 7).
 *
 * @param plan Zvolený tarif (zdroj základní ceny, viz {@link planPriceCzk}).
 * @param coupon Typ a hodnota slevy zvalidovaného kupónu.
 * @returns Účtovaná částka první platby v CZK, vždy ≥ 0.
 */
export function computeChargedAmountCzk(
  plan: SubscriptionPlan,
  coupon: Pick<CouponRecord, 'type' | 'discount_value'>,
): number {
  const base = planPriceCzk(plan);
  const value = coupon.discount_value ?? 0;

  switch (coupon.type) {
    case 'percent': {
      const percent = clamp(value, 0, 100);
      return Math.max(0, Math.round(base * (1 - percent / 100)));
    }
    case 'fixed': {
      const discount = Math.max(0, value);
      return Math.max(0, Math.round(base - discount));
    }
    case 'free_trial_days':
    case 'comp':
      // Aktivační kupóny nestrhávají platbu — účtovaná částka je nulová.
      return 0;
    default:
      return base;
  }
}

/**
 * Čistý výpočet konce zkušebního období: `now + dny` (R9.5).
 *
 * @param now Okamžik aktivace zkušebního období.
 * @param days Počet dní zkušebního období (nezáporný).
 * @returns Nový `Date` posunutý o `days` dní dopředu.
 */
export function freeTrialPeriodEnd(now: Date | string, days: number): Date {
  return new Date(toMillis(now) + Math.max(0, days) * DEN_SECONDS * 1000);
}

/**
 * DB efekt aktivačního kupónu — aktivace předplatného bez stržení platby.
 *
 * - **free_trial_days** (R9.5): nejdřív nastaví `current_period_end = now + dny`,
 *   poté aktivuje předplatné (`status=active`, `is_published=true`, kotva=NULL).
 *   Pořadí (období → aktivace) zaručuje, že případné selhání mezi kroky zanechá
 *   nanejvýš neaktivní předplatné s přednastaveným obdobím (neškodný stav), ne
 *   aktivní předplatné se špatným obdobím.
 * - **comp** (R9.6): pouze aktivuje předplatné, období se nemění a recurring
 *   schedule se nezakládá — účet je trvale aktivní bez plateb. Nezaložení
 *   recurring schedule je věcí checkoutu (task 8.3): aktivační kupóny neprochází
 *   první platbou, takže není z čeho odvodit kartový token pro GoPay schedule.
 *
 * Aktivaci (`status` + `businesses.is_published` + kotva) atomicky perzistuje
 * {@link activateSubscription} přes RPC `apply_subscription_transition`.
 *
 * Volá výhradně server-side (service role / server action) — proto se klient
 * předává jako parametr.
 *
 * @throws Error pokud je předán slevový kupón (`percent` / `fixed`).
 */
export function applyActivationCoupon(
  supabase: SupabaseClient,
  subscriptionId: string,
  coupon: Pick<CouponRecord, 'type' | 'discount_value'>,
  now: Date | string,
): Promise<TransitionResult> {
  if (coupon.type !== 'free_trial_days' && coupon.type !== 'comp') {
    throw new Error(
      'applyActivationCoupon lze volat jen pro aktivační kupóny (free_trial_days, comp).',
    );
  }

  if (coupon.type === 'free_trial_days') {
    return activateFreeTrial(supabase, subscriptionId, coupon.discount_value ?? 0, now);
  }

  // comp účet — aktivace beze změny období a bez recurring schedule.
  return activateSubscription(supabase, subscriptionId);
}

async function activateFreeTrial(
  supabase: SupabaseClient,
  subscriptionId: string,
  days: number,
  now: Date | string,
): Promise<TransitionResult> {
  const periodEnd = freeTrialPeriodEnd(now, days);

  // Nejdřív období (R9.5 určuje pouze current_period_end), pak teprve aktivace.
  const { error } = await supabase
    .from('subscriptions')
    .update({ current_period_end: periodEnd.toISOString() })
    .eq('id', subscriptionId);

  if (error) {
    return { ok: false, error: 'transaction_failed' };
  }

  return activateSubscription(supabase, subscriptionId);
}
