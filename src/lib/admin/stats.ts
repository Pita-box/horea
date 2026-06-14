import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * StatsAggregator — výpočet přehledových metrik admin dashboardu nad existujícími
 * tabulkami pro zvolené časové období (feature `admin-dashboard`, Requirement 2,
 * Property 5).
 *
 * V duchu *Simplicity First* jde o jednoduché agregáty nad malými tabulkami
 * (cílový rozsah ~200 podniků) — žádné materializované pohledy ani cache. Funkce
 * běží výhradně server-side se service-role klientem (cross-tenant čtení).
 *
 * Metriky:
 *  - **Nové registrace** (časově závislé) — počet `users` s `created_at` v období.
 *  - **Aktivní předplatná** (aktuální stav) — počet `subscriptions` se `status = active`.
 *  - **Churn** (časově závislé) — počet předplatných, která v období přešla do
 *    `expired`/`deleted_data`. Bez dedikované tabulky přechodů se používá pragmatický
 *    proxy: aktuální stav `expired`/`deleted_data` s `updated_at` v období (viz pozn.).
 *  - **Rozpad podniků dle stavu** (aktuální stav) — partition počtu podniků dle
 *    `subscription.status` pro `free`/`active`/`grace_period`/`expired`.
 *  - **Tržby** (časově závislé) — součet `amount_czk` plateb se `status = paid` v období.
 */

/** Zvolené časové období přehledu (hranice včetně). */
export type StatsPeriod = {
  from: Date | string;
  to: Date | string;
};

/** Rozpad počtu podniků podle stavu předplatného (R2.4). */
export type BusinessStatusBreakdown = {
  free: number;
  active: number;
  grace_period: number;
  expired: number;
};

/** Přehledové metriky admin dashboardu. */
export type AdminOverviewStats = {
  /** Počet nově registrovaných uživatelů ve zvoleném období (R2.1). */
  newRegistrations: number;
  /** Počet předplatných se stavem `active` — aktuální stav (R2.2). */
  activeSubscriptions: number;
  /** Hodnota Churn za zvolené období (R2.3). */
  churn: number;
  /** Rozpad počtu podniků podle stavu předplatného (R2.4). */
  businessesByStatus: BusinessStatusBreakdown;
  /** Součet `amount_czk` plateb se stavem `paid` ve zvoleném období (R2.5). */
  paidRevenueCzk: number;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Součet `amount_czk` přes platby. Čistá funkce — usnadňuje testování správnosti
 * tržeb (Property 5a). Předpokládá, že vstupní platby jsou již filtrované na
 * `paid` v období; sčítá pouze `amount_czk`.
 */
export function sumPaidRevenueCzk(payments: ReadonlyArray<{ amount_czk: number | string }>): number {
  return payments.reduce((total, payment) => total + Number(payment.amount_czk), 0);
}

/**
 * Rozdělí (partition) seznam stavů předplatných do reportovaných kategorií. Čistá
 * funkce — usnadňuje testování partition vlastnosti (Property 5b). Stavy mimo
 * reportované kategorie (`deleted_data`) se do žádné ze čtyř kategorií nezapočítají.
 */
export function partitionByStatus(
  statuses: ReadonlyArray<string | null>,
): BusinessStatusBreakdown {
  const breakdown: BusinessStatusBreakdown = {
    free: 0,
    active: 0,
    grace_period: 0,
    expired: 0,
  };

  for (const status of statuses) {
    if (status === 'free' || status === 'active' || status === 'grace_period' || status === 'expired') {
      breakdown[status] += 1;
    }
  }

  return breakdown;
}

/**
 * Spočítá přehledové metriky pro zvolené období. Časově závislé metriky (nové
 * registrace, Churn, tržby) se přepočítají dle hranic období (R2.6); metriky
 * aktuálního stavu (aktivní předplatná, rozpad dle stavu) na období nezávisí.
 *
 * @param supabase Service-role Supabase klient (cross-tenant čtení).
 * @param period Zvolené časové období (hranice včetně).
 */
export async function computeAdminOverviewStats(
  supabase: SupabaseClient,
  period: StatsPeriod,
): Promise<AdminOverviewStats> {
  const fromIso = toIso(period.from);
  const toIsoValue = toIso(period.to);

  // Nové registrace (R2.1) — počet uživatelů registrovaných v období.
  const { count: newRegistrations } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', fromIso)
    .lte('created_at', toIsoValue);

  // Aktivní předplatná (R2.2) — aktuální stav, nezávisí na období.
  const { count: activeSubscriptions } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  // Churn (R2.3) — proxy: aktuální stav expired/deleted_data s přechodem v období.
  // Pozn.: bez dedikované tabulky přechodů je `updated_at` nejbližší dostupný
  // signál okamžiku přechodu; přesné sledování by vyžadovalo events tabulku, což
  // MVP v duchu Simplicity First nezavádí.
  const { count: churn } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .in('status', ['expired', 'deleted_data'])
    .gte('updated_at', fromIso)
    .lte('updated_at', toIsoValue);

  // Rozpad podniků dle stavu (R2.4) — partition aktuálních stavů předplatných.
  // Každý podnik má nejvýše jedno předplatné (subscriptions.business_id unique),
  // takže počet předplatných v daném stavu = počet podniků v daném stavu.
  const { data: subscriptionRows } = await supabase.from('subscriptions').select('status');
  const businessesByStatus = partitionByStatus(
    (subscriptionRows ?? []).map((row) => (row as { status: string | null }).status),
  );

  // Tržby (R2.5) — součet amount_czk plateb paid v období.
  const { data: paidPayments } = await supabase
    .from('payments')
    .select('amount_czk')
    .eq('status', 'paid')
    .gte('created_at', fromIso)
    .lte('created_at', toIsoValue);
  const paidRevenueCzk = sumPaidRevenueCzk(
    (paidPayments ?? []) as ReadonlyArray<{ amount_czk: number | string }>,
  );

  return {
    newRegistrations: newRegistrations ?? 0,
    activeSubscriptions: activeSubscriptions ?? 0,
    churn: churn ?? 0,
    businessesByStatus,
    paidRevenueCzk,
  };
}
