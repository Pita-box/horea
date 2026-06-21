// Čistá funkce výpočtu hranice retence běhů cronů (bez I/O, deterministická).
// Tento modul je přímo pokrytý property-based testem (úkol 8.2).
// Záměrně neobsahuje žádné `server-only`, DB přístup ani jiné I/O.

/** Výchozí počet dní retence běhů cronů (R19.2). */
export const DEFAULT_CRON_RETENTION_DAYS = 90;

/**
 * Spočítá ISO hranici retence: záznamy se `started_at` (resp. `created_at`)
 * STARŠÍ než cutoff jsou kandidáty na smazání. cutoff = now - days.
 * Monotonie: větší `days` → starší (≤) cutoff (maže se méně nebo stejně řádků).
 *
 * Záznam je kandidátem na smazání právě tehdy, když je jeho čas ostře starší
 * než vrácený cutoff (záznamy uvnitř rozsahu retence se nikdy nemažou) (R19.1).
 */
export function computePruneCutoff(now: Date, days: number): string {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}
