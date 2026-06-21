import 'server-only';

/**
 * Estimate_Calculator — odhad tržeb příštího měsíce (R10, R13).
 *
 * Modul drží čistou výpočetní logiku odhadu (`estimateNextMonthRevenueCzk`) i tenký
 * server-only I/O wrapper (`getNextMonthEstimateCzk`), který načte vstupní předplatná
 * z DB a předá je čisté funkci. Cenu každého předplatného odvozuje výhradně z jednotného
 * ceníku `planPriceCzk` (`src/lib/checkout/pricing.ts`), který je jediným zdrojem pravdy
 * o cenách. Viz design.md, sekce *8. Estimate_Calculator*.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import { fromPragueInput } from '@/lib/datetime';

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

/**
 * Vrátí pražské „nástěnné" hranice příštího kalendářního měsíce jako UTC ISO řetězce.
 * `startIso` je půlnoc prvního dne příštího měsíce, `endIso` půlnoc prvního dne měsíce
 * po něm — tedy polootevřený interval [start, end). Přechody letního/zimního času řeší
 * `fromPragueInput`.
 */
function nextMonthBoundsIso(now: Date): { startIso: string; endIso: string } {
  // Aktuální rok a měsíc v pražském pásmu (nástěnný čas).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }

  // Příští měsíc (1–12) a měsíc po něm — s přetečením do dalšího roku.
  const nextMonth = map.month === 12 ? 1 : map.month + 1;
  const nextMonthYear = map.month === 12 ? map.year + 1 : map.year;
  const followingMonth = nextMonth === 12 ? 1 : nextMonth + 1;
  const followingMonthYear = nextMonth === 12 ? nextMonthYear + 1 : nextMonthYear;

  const pad = (value: number) => String(value).padStart(2, '0');
  const startIso = fromPragueInput(
    `${nextMonthYear}-${pad(nextMonth)}-01T00:00:00`,
  ).toISOString();
  const endIso = fromPragueInput(
    `${followingMonthYear}-${pad(followingMonth)}-01T00:00:00`,
  ).toISOString();

  return { startIso, endIso };
}

/**
 * I/O wrapper (R10.1, R10.2): spočítá hranice příštího kalendářního měsíce v pásmu
 * Europe/Prague, načte předplatná se `status='active'`, `auto_renew=true` a
 * `current_period_end` spadajícím do toho měsíce, a předá je čisté funkci
 * `estimateNextMonthRevenueCzk`. Service-role čtení (cross-tenant). Vrací odhad v CZK;
 * žádná odpovídající předplatná → 0.
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 * @param now Referenční okamžik, z něhož se odvodí příští kalendářní měsíc.
 */
export async function getNextMonthEstimateCzk(
  supabase: SupabaseClient,
  now: Date,
): Promise<number> {
  const { startIso, endIso } = nextMonthBoundsIso(now);

  // Aktivní předplatná s auto-renew, jejichž období končí v příštím měsíci [start, end).
  const { data: subscriptionRows } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('status', 'active')
    .eq('auto_renew', true)
    .gte('current_period_end', startIso)
    .lt('current_period_end', endIso);

  const subscriptions: EstimateSubscriptionRow[] = (subscriptionRows ?? []).map((row) => ({
    plan: (row as { plan: SubscriptionPlan }).plan,
  }));

  return estimateNextMonthRevenueCzk(subscriptions);
}
