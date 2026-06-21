// Health_Reporter — čistá agregace technického stavu sledovaných služeb.
//
// Tento soubor obsahuje ZÁMĚRNĚ jen čisté funkce a typy (žádný `import 'server-only'`,
// žádné I/O), aby byly přímo pokryté property testy. I/O `runServiceProbes()` doplní
// až task 7.3.
//
// Status-model je sladěn s `admin-system-tools` (`ServiceStatus`, precedence
// `down > degraded > ok`), aby šly probe v budoucnu sjednotit.

/** Sladěno s `admin-system-tools`. */
export type ServiceStatus = 'ok' | 'degraded' | 'down';

/** Sledované služby (R11.2). */
export type MonitoredService =
  | 'supabase'
  | 'resend'
  | 'smtp2go'
  | 'gopay'
  | 'r2'
  | 'google';

/** Per-service výsledek BEZ Secret_Value (R11.6). */
export interface ServiceHealth {
  service: MonitoredService;
  label: string; // český název pro odpověď
  status: ServiceStatus;
}

/** Návratová hodnota `buildHealthReport` — seznam služeb + agregovaný stav. */
export interface HealthReport {
  services: ReadonlyArray<ServiceHealth>;
  aggregate: ServiceStatus;
}

/**
 * Čistá funkce: agreguje per-service statusy s precedencí `down > degraded > ok`
 * (R11.3). Když jsou všechny `ok` (i prázdný vstup) → `ok` (R11.4).
 */
export function aggregateHealth(
  statuses: ReadonlyArray<ServiceStatus>,
): ServiceStatus {
  if (statuses.includes('down')) {
    return 'down';
  }
  if (statuses.includes('degraded')) {
    return 'degraded';
  }
  return 'ok';
}

/**
 * Čistá funkce: z výsledků probe sestaví report (seznam služeb + agregovaný stav).
 * Selhání probe je už reprezentováno jako status `down` u dané služby (R11.5) —
 * agregace pokračuje přes ostatní. Výstup neobsahuje žádné Secret_Value, jen
 * `service`, `label`, `status` (R11.6).
 */
export function buildHealthReport(
  services: ReadonlyArray<ServiceHealth>,
): HealthReport {
  return {
    services,
    aggregate: aggregateHealth(services.map((s) => s.status)),
  };
}
