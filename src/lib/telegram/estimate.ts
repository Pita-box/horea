/**
 * Estimate_Calculator — čistý odhad tržeb příštího měsíce (R10, R13).
 *
 * Tento modul drží jen čistou výpočetní logiku odhadu tržeb. Cenu každého
 * předplatného odvozuje výhradně z jednotného ceníku `planPriceCzk`
 * (`src/lib/checkout/pricing.ts`), který je jediným zdrojem pravdy o cenách.
 * I/O wrapper (načtení vstupních předplatných z DB) sem nepatří — řeší ho
 * samostatný server-only modul. Viz design.md, sekce *8. Estimate_Calculator*.
 */

import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';

/** Minimální tvar předplatného pro odhad. */
export interface EstimateSubscriptionRow {
  plan: SubscriptionPlan;
}

/**
 * Čistá funkce (R13.2): odhad = součet planPriceCzk přes vstupní předplatná (R10.2, R10.3).
 * Cenu každého předplatného odvozuje výhradně z jednotného ceníku planPriceCzk. Volající
 * předá jen aktivní předplatná s auto_renew, jejichž current_period_end spadá do příštího
 * kalendářního měsíce. Výsledek je vždy nezáporný (R10.4, R13.4) — ceník je nezáporný.
 *
 * @param subscriptions Předplatná zahrnutá do odhadu.
 * @returns Odhadovaná tržba příštího měsíce v CZK; prázdný vstup → 0.
 */
export function estimateNextMonthRevenueCzk(
  subscriptions: ReadonlyArray<EstimateSubscriptionRow>,
): number {
  return subscriptions.reduce((sum, subscription) => sum + planPriceCzk(subscription.plan), 0);
}
