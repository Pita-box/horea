import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Metrics_Inspector — agregované provozní metriky databáze a úložiště (feature
 * `admin-system-tools`, Requirement 23).
 *
 * V duchu *Simplicity First* jde výhradně o agregační `count` dotazy přes
 * service-role klienta (`select('*', { count: 'exact', head: true })`) — vrací
 * **pouze počty**, nikdy data řádků ani osobní údaje (R23.1, R23.4). Velikost
 * úložiště se zjišťuje jen tam, kde je levně dostupná; jinak `{ available: false }`
 * → UI „nedostupné" a žádné nákladné volání (R23.2, R23.3). Při selhání DB count
 * → `db: null` → UI „metriky databáze jsou momentálně nedostupné" místo pádu
 * stránky (R23.5).
 */

/** Agregované počty klíčových entit (R23.1). Pouze čísla, žádná PII. */
export type DbMetrics = {
  businesses: number;
  reservations: number;
  clients: number;
};

/**
 * Velikost úložiště, pokud je levně zjistitelná (R23.2); jinak `available: false`
 * → UI „nedostupné" (R23.3).
 */
export type StorageMetrics =
  | { available: true; bytes: number }
  | { available: false };

/** Souhrnný výstup provozních metrik. */
export type OperationalMetrics = {
  /** `null` → „metriky databáze jsou momentálně nedostupné" (R23.5). */
  db: DbMetrics | null;
  storage: StorageMetrics;
};

/**
 * Spočítá agregované provozní metriky. DB počty se zjišťují paralelně přes
 * service-role `count` (`head: true`) — táhne se jen číslo, žádné řádky ani PII.
 * Selhání kteréhokoli count dotazu → `db: null`. Velikost úložiště se levně
 * zjistit nedá, proto vždy `{ available: false }` — bez nákladného volání.
 */
export async function getOperationalMetrics(): Promise<OperationalMetrics> {
  const db = await getDbMetrics();
  return {
    db,
    storage: getStorageMetrics(),
  };
}

/**
 * Agregované DB počty přes service-role `count`. Vrací `null`, pokud se kterýkoli
 * count nezdaří (R23.5) — volající zobrazí stav nedostupnosti místo pádu stránky.
 */
async function getDbMetrics(): Promise<DbMetrics | null> {
  try {
    const supabase = createAdminClient();

    // Paralelní head counts — žádná data řádků, jen agregovaný počet (R23.1, R23.4).
    const [businesses, reservations, clients] = await Promise.all([
      supabase.from('businesses').select('*', { count: 'exact', head: true }),
      supabase.from('reservations').select('*', { count: 'exact', head: true }),
      supabase.from('clients').select('*', { count: 'exact', head: true }),
    ]);

    if (businesses.error || reservations.error || clients.error) {
      return null;
    }

    return {
      businesses: businesses.count ?? 0,
      reservations: reservations.count ?? 0,
      clients: clients.count ?? 0,
    };
  } catch {
    // Např. chybějící service-role env nebo síťová chyba → nedostupné (R23.5).
    return null;
  }
}

/**
 * Velikost úložiště (Cloudflare R2, bucket faktur) není levně zjistitelná bez
 * nákladného listování objektů, proto se hlásí jako nedostupná (R23.3) a žádné
 * takové volání se neprovádí (R23.2).
 */
function getStorageMetrics(): StorageMetrics {
  return { available: false };
}
