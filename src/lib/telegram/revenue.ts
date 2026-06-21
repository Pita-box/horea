import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fromPragueInput } from '@/lib/datetime';

/**
 * Revenue_Calculator — výpočet měsíčních tržeb pro Telegram příkaz `/trzby`
 * (feature `telegram-operator-notifications`, Requirements 9.1, 9.2, 9.3, 13.1, 13.3).
 *
 * Čistá logika (`calculateRevenueCzk`) je oddělená od I/O: filtr na platby se
 * `status='paid'` v daném kalendářním období i čtení z DB provádí server-only
 * I/O wrapper `getCurrentMonthRevenueCzk`, který předá už filtrovaná data čisté
 * funkci. Tím zůstává výpočet triviálně testovatelný a nezávislý na čase a databázi.
 */

/**
 * Minimální tvar platby pro výpočet tržeb. Čte se pouze `amount_czk`;
 * filtr `paid`/období řeší volající I/O vrstva.
 */
export interface RevenuePaymentRow {
  amount_czk: number;
}

/**
 * Čistá funkce (R13.1): součet `amount_czk` vstupních plateb. Volající (I/O vrstva)
 * předá pouze platby se `status='paid'` v daném kalendářním měsíci (R9.2).
 * Prázdný vstup → 0 (R9.3, R13.3).
 */
export function calculateRevenueCzk(payments: ReadonlyArray<RevenuePaymentRow>): number {
  return payments.reduce((total, payment) => total + payment.amount_czk, 0);
}

/**
 * Spočítá hranice aktuálního kalendářního měsíce v pásmu Europe/Prague jako UTC
 * okamžiky `[start, nextStart)`. `start` je první den měsíce 00:00 nástěnného času
 * v Praze, `nextStart` je první den následujícího měsíce 00:00 — převod na UTC
 * korektně ošetří letní/zimní čas (přes `fromPragueInput`).
 */
function pragueCurrentMonthRange(now: Date): { startIso: string; nextStartIso: string } {
  // Rok a měsíc okamžiku `now` tak, jak je vidět v Praze (tvar `YYYY-MM-DD`).
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);

  // Následující měsíc s přetečením do dalšího roku.
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const pad = (value: number) => String(value).padStart(2, '0');
  const startIso = fromPragueInput(`${year}-${pad(month)}-01T00:00:00`).toISOString();
  const nextStartIso = fromPragueInput(`${nextYear}-${pad(nextMonth)}-01T00:00:00`).toISOString();

  return { startIso, nextStartIso };
}

/**
 * I/O wrapper (R9.1, R9.2): načte platby se `status='paid'` a `created_at` v aktuálním
 * kalendářním měsíci (Europe/Prague) a vrátí součet jejich `amount_czk` přes čistou
 * funkci `calculateRevenueCzk`. Vzor dotazu odpovídá `sumPaidRevenueCzk` v
 * `src/lib/admin/stats.ts`. Při prázdném výsledku vrátí 0 (R9.3).
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 * @param now Referenční okamžik pro určení aktuálního měsíce.
 */
export async function getCurrentMonthRevenueCzk(
  supabase: SupabaseClient,
  now: Date,
): Promise<number> {
  const { startIso, nextStartIso } = pragueCurrentMonthRange(now);

  const { data: paidPayments } = await supabase
    .from('payments')
    .select('amount_czk')
    .eq('status', 'paid')
    .gte('created_at', startIso)
    .lt('created_at', nextStartIso);

  const rows: RevenuePaymentRow[] = (
    (paidPayments ?? []) as ReadonlyArray<{ amount_czk: number | string }>
  ).map((row) => ({ amount_czk: Number(row.amount_czk) }));

  return calculateRevenueCzk(rows);
}
