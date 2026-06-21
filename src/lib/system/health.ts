import 'server-only';

import { AwsClient } from 'aws4fetch';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  aggregateStatus,
  mapProbeStatus,
  type AggregateStatus,
  type ProbeOutcome,
  type ServiceStatus,
} from '@/lib/system/status';

/**
 * Health_Checker — orchestrace a I/O vrstva health checků klíčových služeb
 * (feature `admin-system-tools`, Requirements 3, 4, 5, 6).
 *
 * Čisté mapování stavu (`mapProbeStatus`/`aggregateStatus`) i typy
 * `ProbeOutcome`/`ServiceStatus` se reuse z `./status` (přímo pokryté PBT).
 * Tento modul drží jen I/O: read-only/non-mutating probe šesti služeb, měření
 * latence, timeouty a paralelní běh. Běží **výhradně server-side** (`server-only`),
 * čte `process.env` a dělá síťové dotazy.
 *
 * **Bezpečnost (R6.1, R6.4).** Každá probe je read-only — žádný zápis, žádné
 * odeslání e-mailu/platby. Při chybě se do výsledku NIKDY nepropaguje původní
 * zpráva ani tajemství (klíče, tokeny), jen bezpečná **kategorie** `errorKind`.
 */

/** Sledované služby (R3.1). Pořadí určuje pořadí ve výsledku. */
export type ServiceName =
  | 'supabase'
  | 'resend'
  | 'smtp2go'
  | 'gopay'
  | 'r2'
  | 'google';

/** Jeden řádek health tabulky — BEZ Secret_Value (R3.4, R3.5, R6.4). */
export type ServiceProbeResult = {
  service: ServiceName;
  /** Lidský název služby pro UI (R3.5). */
  label: string;
  status: ServiceStatus;
  /** Naměřená latence v ms; `null` u timeoutu/chyby bez měření (R3.4). */
  latencyMs: number | null;
  /**
   * Bezpečná kategorie chyby BEZ Secret_Value/původní zprávy (R6.4):
   * `'http_error' | 'network_error' | 'timeout' | 'unexpected'`. `null` při úspěchu.
   */
  errorKind: string | null;
};

/** Celý výsledek health checku (R5.4). */
export type HealthReport = {
  aggregate: AggregateStatus;
  services: ServiceProbeResult[];
  /** Čas spuštění kontroly (ISO, UTC). */
  checkedAt: string;
};

/** Surový výsledek probe + bezpečná kategorie chyby (NIKDY tajemství). */
type ProbeResult = ProbeOutcome & { errorKind?: string };

/** Probe jedné služby; dostává `AbortSignal` z `withTimeout` (R4.2). */
type ServiceProbe = (signal: AbortSignal) => Promise<ProbeResult>;

/** Probe_Timeout jedné služby (R4.2). */
const PROBE_TIMEOUT_MS = 5_000;

/** Tvrdý strop nad celým během health checku (R4.3). */
const OVERALL_TIMEOUT_MS = 6_000;

/** Měkká hranice latence: úspěch nad ní je `degraded` (R5.3). */
const DEGRADED_LATENCY_MS = 2_000;

/**
 * Kategorizuje vyhozenou chybu na bezpečný `errorKind` — NIKDY nevrací původní
 * zprávu ani tajemství (R6.4). `AbortError` (prohraný závod s timeoutem) → timeout.
 */
function classifyThrown(error: unknown, latencyMs: number): ProbeResult {
  if (error instanceof Error && error.name === 'AbortError') {
    return { kind: 'timeout', errorKind: 'timeout' };
  }
  // `fetch` hlásí selhání síťové vrstvy jako TypeError.
  if (error instanceof TypeError) {
    return { kind: 'error', latencyMs, errorKind: 'network_error' };
  }
  return { kind: 'error', latencyMs, errorKind: 'unexpected' };
}

/** Bez nastavené konfigurace nemá smysl probovat → chyba (nikdy nevyzradí hodnotu). */
const UNCONFIGURED: ProbeResult = { kind: 'error', latencyMs: 0, errorKind: 'unexpected' };

/**
 * Supabase — service-role HEAD `count` na malou tabulku (read-only, žádný zápis).
 * Klíč zůstává v klientu; do výsledku jde jen status/latence.
 */
async function probeSupabase(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('businesses')
      .select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - start;
    if (error) {
      return { kind: 'error', latencyMs, errorKind: 'http_error' };
    }
    return { kind: 'success', latencyMs };
  } catch (error) {
    return classifyThrown(error, Date.now() - start);
  }
}

/** Resend — autentizovaný GET na výpis domén (idempotentní, nic nevytváří). */
async function probeResend(signal: AbortSignal): Promise<ProbeResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return UNCONFIGURED;
  }
  const start = Date.now();
  try {
    const response = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const latencyMs = Date.now() - start;
    return response.ok
      ? { kind: 'success', latencyMs }
      : { kind: 'error', latencyMs, errorKind: 'http_error' };
  } catch (error) {
    return classifyThrown(error, Date.now() - start);
  }
}

/** SMTP2GO — read-only ověření tokenu přes stats endpoint (NEodesílá e-mail). */
async function probeSmtp2go(signal: AbortSignal): Promise<ProbeResult> {
  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) {
    return UNCONFIGURED;
  }
  const start = Date.now();
  try {
    const response = await fetch('https://api.smtp2go.com/v3/stats/email_summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: '{}',
      signal,
    });
    const latencyMs = Date.now() - start;
    return response.ok
      ? { kind: 'success', latencyMs }
      : { kind: 'error', latencyMs, errorKind: 'http_error' };
  } catch (error) {
    return classifyThrown(error, Date.now() - start);
  }
}

/** GoPay — OAuth token check (`client_credentials`), žádná platba se nezakládá. */
async function probeGopay(signal: AbortSignal): Promise<ProbeResult> {
  const base = process.env.GOPAY_API_BASE_URL;
  const clientId = process.env.GOPAY_CLIENT_ID;
  const clientSecret = process.env.GOPAY_CLIENT_SECRET;
  if (!base || !clientId || !clientSecret) {
    return UNCONFIGURED;
  }
  const start = Date.now();
  try {
    // Basic auth jen pro získání tokenu; token se nikam neukládá ani nevrací.
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${base.replace(/\/+$/, '')}/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials&scope=payment-all',
      signal,
    });
    const latencyMs = Date.now() - start;
    return response.ok
      ? { kind: 'success', latencyMs }
      : { kind: 'error', latencyMs, errorKind: 'http_error' };
  } catch (error) {
    return classifyThrown(error, Date.now() - start);
  }
}

/** Cloudflare R2 — podepsaný `ListObjectsV2` s `max-keys=1` (pouze list, žádný zápis). */
async function probeR2(signal: AbortSignal): Promise<ProbeResult> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return UNCONFIGURED;
  }
  const start = Date.now();
  try {
    const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
    const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}?list-type=2&max-keys=1`;
    const response = await aws.fetch(url, { method: 'GET', signal });
    const latencyMs = Date.now() - start;
    return response.ok
      ? { kind: 'success', latencyMs }
      : { kind: 'error', latencyMs, errorKind: 'http_error' };
  } catch (error) {
    return classifyThrown(error, Date.now() - start);
  }
}

/** Google — refresh OAuth tokenu (read-only liveness), refresh token se nikdy nevrací. */
async function probeGoogle(signal: AbortSignal): Promise<ProbeResult> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return UNCONFIGURED;
  }
  const start = Date.now();
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal,
    });
    const latencyMs = Date.now() - start;
    return response.ok
      ? { kind: 'success', latencyMs }
      : { kind: 'error', latencyMs, errorKind: 'http_error' };
  } catch (error) {
    return classifyThrown(error, Date.now() - start);
  }
}

/** Definice jedné probe — pořadí určuje pořadí ve výsledku. */
type ProbeDefinition = {
  service: ServiceName;
  /** Český/lidský název služby (není tajemství). */
  label: string;
  probe: ServiceProbe;
};

const PROBES: ReadonlyArray<ProbeDefinition> = [
  { service: 'supabase', label: 'Supabase', probe: probeSupabase },
  { service: 'resend', label: 'Resend', probe: probeResend },
  { service: 'smtp2go', label: 'SMTP2GO', probe: probeSmtp2go },
  { service: 'gopay', label: 'GoPay', probe: probeGopay },
  { service: 'r2', label: 'Cloudflare R2', probe: probeR2 },
  { service: 'google', label: 'Google', probe: probeGoogle },
];

/**
 * Obalí probe Probe_Timeout přes `Promise.race` (R4.2): když probe nedoběhne do
 * `timeoutMs`, aktivní `fetch` se zruší (`abort`) a vrátí se outcome
 * `{ kind: 'timeout' }`. Časovač se vždy uklidí.
 */
function withTimeout(probe: ServiceProbe, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<ProbeResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'timeout', errorKind: 'timeout' });
    }, timeoutMs);
  });
  return Promise.race([probe(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Spustí všech 6 probe **paralelně** přes `Promise.allSettled` (R4.1, R4.4 — jeden
 * pád neshodí ostatní), každou s Probe_Timeout 5 s (R4.2). Nad celým během je tvrdý
 * strop 6 s (R4.3): co do té doby nedoběhne, se vrátí jako `down`. Z výsledků sestaví
 * per-service `ServiceStatus` (`mapProbeStatus`) a `Aggregate_Status` (`aggregateStatus`).
 * `checkedAt` je čas spuštění kontroly (ISO, UTC).
 */
export async function runHealthChecks(): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();

  let capTimer: ReturnType<typeof setTimeout>;
  const hardCap = new Promise<'capped'>((resolve) => {
    capTimer = setTimeout(() => resolve('capped'), OVERALL_TIMEOUT_MS);
  });

  const allProbes = Promise.allSettled(
    PROBES.map((definition) => withTimeout(definition.probe, PROBE_TIMEOUT_MS)),
  );

  const raced = await Promise.race([allProbes, hardCap]).finally(() => clearTimeout(capTimer));

  const services: ServiceProbeResult[] = PROBES.map((definition, index) => {
    // Tvrdý strop překročen → bezpečně reportujeme vše jako down/timeout (R4.3).
    if (raced === 'capped') {
      return {
        service: definition.service,
        label: definition.label,
        status: 'down',
        latencyMs: null,
        errorKind: 'timeout',
      };
    }

    const settled = raced[index];
    // `withTimeout` chyby zachytává, ale rejected stav pro jistotu mapujeme na down.
    const outcome: ProbeResult =
      settled.status === 'fulfilled'
        ? settled.value
        : { kind: 'timeout', errorKind: 'unexpected' };

    const status = mapProbeStatus(outcome, { degradedLatencyMs: DEGRADED_LATENCY_MS });
    const latencyMs = outcome.kind === 'timeout' ? null : outcome.latencyMs;
    const errorKind = outcome.kind === 'success' ? null : (outcome.errorKind ?? 'unexpected');

    return {
      service: definition.service,
      label: definition.label,
      status,
      latencyMs,
      errorKind,
    };
  });

  return {
    aggregate: aggregateStatus(services.map((service) => service.status)),
    services,
    checkedAt,
  };
}
