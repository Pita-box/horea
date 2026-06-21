import 'server-only';

// Health_Reporter — agregace technického stavu sledovaných služeb + read-only probe.
//
// Čisté funkce a typy (`aggregateHealth`, `buildHealthReport`, `ServiceStatus`,
// `MonitoredService`, `ServiceHealth`, `HealthReport`) jsou přímo pokryté property
// testy a nezávisí na I/O. I/O vrstvu doplňuje `runServiceProbes()` (task 7.3), která
// paralelně a read-only ověří dostupnost šesti sledovaných služeb; proto soubor začíná
// `import 'server-only'` (čte se v něm `process.env`, dělají se síťové dotazy).
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

// ---------------------------------------------------------------------------
// I/O vrstva (task 7.3): read-only probe dostupnosti sledovaných služeb (R11.2).
//
// Každá probe je čistě read-only — žádný zápis, žádné odeslání e-mailu ani platby.
// Probe ověřuje (a) přítomnost povinné konfigurace a (b) síťovou dostupnost (liveness)
// endpointu služby. Stavové HTTP kódy se záměrně neřeší: jakákoli HTTP odpověď znamená,
// že služba odpovídá; síťová chyba / timeout znamená nedostupnost. Tím probe nepotřebuje
// žádné autorizační tajemství (kromě veřejné Supabase URL) a do výsledku se NIKDY
// nedostane Secret_Value — vrací jen `service`, `label`, `status` (R11.6).
// ---------------------------------------------------------------------------

/** Timeout jedné probe, aby jedna pomalá služba neshodila celé vyhodnocení. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Liveness probe: pošle lehký read-only GET dotaz s timeoutem. Jakákoli přijatá HTTP
 * odpověď → `ok` (služba odpovídá). Síťová chyba, timeout nebo abort → `down`.
 * Nikdy nevyhodí výjimku.
 */
async function probeLiveness(url: string): Promise<ServiceStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(url, { method: 'GET', signal: controller.signal });
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/** Odstraní koncová lomítka z base URL, aby šel bezpečně připojit suffix. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Supabase (kritické) — bez veřejné URL `down`; jinak liveness na auth health endpointu. */
async function probeSupabase(): Promise<ServiceStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return 'down';
  }
  return probeLiveness(`${trimTrailingSlash(url)}/auth/v1/health`);
}

/** Resend (kritické pro auth e-maily) — bez API klíče `down`; jinak liveness API hostu. */
async function probeResend(): Promise<ServiceStatus> {
  if (!process.env.RESEND_API_KEY) {
    return 'down';
  }
  return probeLiveness('https://api.resend.com');
}

/** SMTP2GO (volitelné, fallback na Resend) — bez klíče `degraded`; jinak liveness API hostu. */
async function probeSmtp2go(): Promise<ServiceStatus> {
  if (!process.env.SMTP2GO_API_KEY) {
    return 'degraded';
  }
  return probeLiveness('https://api.smtp2go.com');
}

/** GoPay (kritické) — bez base URL / GOID `down`; jinak liveness REST API base. */
async function probeGopay(): Promise<ServiceStatus> {
  const base = process.env.GOPAY_API_BASE_URL;
  if (!base || !process.env.GOPAY_GOID) {
    return 'down';
  }
  return probeLiveness(trimTrailingSlash(base));
}

/** Cloudflare R2 (kritické pro média) — bez veřejné base URL / účtu `down`; jinak liveness. */
async function probeR2(): Promise<ServiceStatus> {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (!base || !process.env.R2_ACCOUNT_ID) {
    return 'down';
  }
  return probeLiveness(trimTrailingSlash(base));
}

/** Google (volitelné, jen zálohy) — bez OAuth konfigurace `degraded`; jinak liveness OAuth hostu. */
async function probeGoogle(): Promise<ServiceStatus> {
  if (
    !process.env.GOOGLE_OAUTH_CLIENT_ID ||
    !process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return 'degraded';
  }
  return probeLiveness('https://oauth2.googleapis.com');
}

/** Definice probe jedné služby — pořadí určuje pořadí ve výsledku. */
interface ServiceProbe {
  service: MonitoredService;
  label: string; // český název pro odpověď (není tajemství)
  run: () => Promise<ServiceStatus>;
}

const SERVICE_PROBES: ReadonlyArray<ServiceProbe> = [
  { service: 'supabase', label: 'Supabase', run: probeSupabase },
  { service: 'resend', label: 'Resend', run: probeResend },
  { service: 'smtp2go', label: 'SMTP2GO', run: probeSmtp2go },
  { service: 'gopay', label: 'GoPay', run: probeGopay },
  { service: 'r2', label: 'Cloudflare R2', run: probeR2 },
  { service: 'google', label: 'Google', run: probeGoogle },
];

/**
 * I/O wrapper: paralelně spustí read-only probe všech šesti sledovaných služeb (R11.2)
 * přes `Promise.allSettled`. Selhání/timeout libovolné probe → `status: 'down'` u dané
 * služby a vyhodnocení ostatních pokračuje (R11.5). Výsledek obsahuje výhradně
 * `service`, `label`, `status` — žádné Secret_Value (R11.6). Výstup je kompatibilní
 * s `buildHealthReport`.
 */
export async function runServiceProbes(): Promise<ReadonlyArray<ServiceHealth>> {
  const results = await Promise.allSettled(SERVICE_PROBES.map((p) => p.run()));

  return SERVICE_PROBES.map((probe, index) => {
    const result = results[index];
    // Probe samy chyby zachytávají, ale rejected výsledek pro jistotu mapujeme na `down` (R11.5).
    const status: ServiceStatus =
      result.status === 'fulfilled' ? result.value : 'down';
    return { service: probe.service, label: probe.label, status };
  });
}
