import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runHealthChecks, type ServiceName } from '../health';

// Integrační test orchestrace health checku (task 13.3).
//
// `runHealthChecks` spouští 6 read-only probe paralelně (`Promise.allSettled`),
// každou s Probe_Timeout 5 s (`withTimeout`/`Promise.race`) a tvrdým stropem 6 s
// nad celým během. Probe používají různé I/O kanály, které tu kontrolovaně
// mockujeme, aby žádná nešla na reálnou síť:
//  - supabase  → `@/lib/supabase/admin` (`createAdminClient().from().select()`),
//  - r2        → `aws4fetch` (`new AwsClient().fetch()`),
//  - resend/smtp2go/gopay/google → globální `fetch` (routováno podle URL).
//
// Pro determinismus a ověření paralelismu/stropů používáme **fake timers**:
// každá mock-odpověď se vyřeší až po nastaveném `delayMs` přes `setTimeout`,
// takže virtuální čas posouváme přes `vi.advanceTimersByTimeAsync`. Latence
// uvnitř probe se počítá z `Date.now()`, které fake timers také řídí.
// Po každém testu vše uklidíme.

/** Pořadí služeb dle definice `PROBES` v `health.ts` (R3.1). */
const SERVICE_ORDER: ReadonlyArray<ServiceName> = [
  'supabase',
  'resend',
  'smtp2go',
  'gopay',
  'r2',
  'google',
];

// Sdílený, per-test přenastavitelný popis chování jednotlivých probe.
// Je v `vi.hoisted`, aby na něj mohly sahat i hoistnuté `vi.mock` factory.
const h = vi.hoisted(() => {
  type ProbeMode = 'ok' | 'httpError' | 'throw' | 'hang';
  type ProbeBehavior = { delayMs: number; mode: ProbeMode };

  // Mutovatelná konfigurace chování per služba (resetuje se v beforeEach).
  const config: Record<string, ProbeBehavior> = {
    supabase: { delayMs: 100, mode: 'ok' },
    resend: { delayMs: 100, mode: 'ok' },
    smtp2go: { delayMs: 100, mode: 'ok' },
    gopay: { delayMs: 100, mode: 'ok' },
    r2: { delayMs: 100, mode: 'ok' },
    google: { delayMs: 100, mode: 'ok' },
  };

  // Vrátí `Response` (nebo vyhodí) až po `delayMs`; `hang` se nikdy nevyřeší.
  function makeResponse(behavior: ProbeBehavior): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      if (behavior.mode === 'hang') {
        return; // záměrně visí — zachytí ho Probe_Timeout/tvrdý strop
      }
      setTimeout(() => {
        if (behavior.mode === 'throw') {
          reject(new Error('network down'));
          return;
        }
        resolve(new Response(null, { status: behavior.mode === 'httpError' ? 500 : 200 }));
      }, behavior.delayMs);
    });
  }

  // Obdoba pro supabase probe, která čeká na `{ error }` z PostgREST dotazu.
  function makeSupabaseResult(behavior: ProbeBehavior): Promise<{ error: unknown }> {
    return new Promise<{ error: unknown }>((resolve, reject) => {
      if (behavior.mode === 'hang') {
        return;
      }
      setTimeout(() => {
        if (behavior.mode === 'throw') {
          reject(new Error('db down'));
          return;
        }
        resolve({ error: behavior.mode === 'httpError' ? { message: 'boom' } : null });
      }, behavior.delayMs);
    });
  }

  return { config, makeResponse, makeSupabaseResult };
});

// Supabase probe používá service-role klient (žádná reálná DB ani env).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => h.makeSupabaseResult(h.config.supabase),
    }),
  }),
}));

// R2 probe používá podepsaný `AwsClient.fetch` — nahrazujeme řízenou odpovědí.
vi.mock('aws4fetch', () => ({
  AwsClient: class {
    fetch(): Promise<Response> {
      return h.makeResponse(h.config.r2);
    }
  },
}));

/** Nastaví kompletní konfiguraci přes env, aby žádná probe neskončila na UNCONFIGURED. */
function stubFullConfig(): void {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  vi.stubEnv('SMTP2GO_API_KEY', 'test-smtp2go-key');
  vi.stubEnv('GOPAY_API_BASE_URL', 'https://gw.example.gopay.com/api');
  vi.stubEnv('GOPAY_CLIENT_ID', 'test-gopay-client');
  vi.stubEnv('GOPAY_CLIENT_SECRET', 'test-gopay-secret');
  vi.stubEnv('R2_ACCOUNT_ID', 'test-r2-account');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-r2-access-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-r2-secret');
  vi.stubEnv('R2_BUCKET', 'test-bucket');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-google-client');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-google-secret');
  vi.stubEnv('GOOGLE_OAUTH_REFRESH_TOKEN', 'test-google-refresh');
}

/** Globální `fetch` mock — routuje na chování podle hostitele v URL. */
function stubRoutingFetch(): void {
  const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes('api.resend.com')) {
      return h.makeResponse(h.config.resend);
    }
    if (url.includes('api.smtp2go.com')) {
      return h.makeResponse(h.config.smtp2go);
    }
    if (url.includes('gopay')) {
      return h.makeResponse(h.config.gopay);
    }
    if (url.includes('googleapis.com')) {
      return h.makeResponse(h.config.google);
    }
    throw new Error(`Neočekávané volání fetch na ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

/** Pomocník: mapa service → status z reportu. */
function statusByService(services: Array<{ service: ServiceName; status: string }>): Record<string, string> {
  return Object.fromEntries(services.map((item) => [item.service, item.status]));
}

beforeEach(() => {
  vi.useFakeTimers();
  // Reset chování na výchozí „ok za 100 ms" pro každou službu.
  for (const service of SERVICE_ORDER) {
    h.config[service] = { delayMs: 100, mode: 'ok' };
  }
  stubFullConfig();
  stubRoutingFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('runHealthChecks — orchestrace', () => {
  it('pokrývá všech 6 služeb ve správném pořadí a vrací aggregate + checkedAt', async () => {
    const promise = runHealthChecks();
    await vi.advanceTimersByTimeAsync(100);
    const report = await promise;

    // Pokrytí: výsledek nese právě těchto 6 služeb, ve fixním pořadí (R3.1).
    expect(report.services.map((s) => s.service)).toEqual([...SERVICE_ORDER]);
    expect(new Set(report.services.map((s) => s.service)).size).toBe(6);

    // Při dostupných službách (latence 100 ms ≤ práh) je vše ok (R3.4).
    for (const item of report.services) {
      expect(item.status).toBe('ok');
      expect(item.errorKind).toBeNull();
      expect(item.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(report.aggregate).toBe('ok');
    expect(typeof report.checkedAt).toBe('string');
  });

  it('běží paralelně — všech 6 probe dokončí za dobu JEDNÉ probe, ne za jejich součet', async () => {
    // Každá probe trvá 1000 ms. Sériově by běh trval 6×1000 = 6000 ms,
    // paralelně ~1000 ms. Ověříme, že report NENÍ hotový těsně pod 1000 ms,
    // ale je hotový hned po dovršení jedné probe (důkaz paralelismu, R4.1).
    for (const service of SERVICE_ORDER) {
      h.config[service] = { delayMs: 1000, mode: 'ok' };
    }

    let resolved = false;
    const promise = runHealthChecks().then((report) => {
      resolved = true;
      return report;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false); // sériově by tu teprve dobíhala 1. probe

    await vi.advanceTimersByTimeAsync(1);
    const report = await promise;

    expect(resolved).toBe(true);
    expect(report.aggregate).toBe('ok');
    for (const item of report.services) {
      expect(item.status).toBe('ok');
    }
  });

  it('tvrdý časový strop — když probe „visí", běh se vrátí a služby jsou down/timeout', async () => {
    // Všechny probe visí (nikdy se samy nevyřeší). Běh se přesto musí vrátit
    // v rámci časového stropu (Probe_Timeout 5 s + tvrdý strop 6 s, R4.3).
    for (const service of SERVICE_ORDER) {
      h.config[service] = { delayMs: 0, mode: 'hang' };
    }

    let resolved = false;
    const promise = runHealthChecks().then((report) => {
      resolved = true;
      return report;
    });

    // Posuneme čas přes tvrdý strop 6 s.
    await vi.advanceTimersByTimeAsync(6000);
    const report = await promise;

    // Klíčová garance: funkce se vrátila (nevisí donekonečna).
    expect(resolved).toBe(true);
    for (const item of report.services) {
      expect(item.status).toBe('down');
      expect(item.errorKind).toBe('timeout');
      expect(item.latencyMs).toBeNull();
    }
    expect(report.aggregate).toBe('down');
  });

  it('izoluje selhání jedné probe — ostatní zůstanou ok a běh se nevyhodí', async () => {
    // Resend selže (síťová chyba), ostatní odpovídají normálně (R4.4).
    h.config.resend = { delayMs: 100, mode: 'throw' };

    const promise = runHealthChecks();
    await vi.advanceTimersByTimeAsync(100);
    const report = await promise;

    // Pořád máme všech 6 služeb — jeden pád neshodil orchestraci.
    expect(report.services).toHaveLength(6);

    const byService = statusByService(report.services);
    expect(byService.resend).toBe('down');
    expect(byService.supabase).toBe('ok');
    expect(byService.smtp2go).toBe('ok');
    expect(byService.gopay).toBe('ok');
    expect(byService.r2).toBe('ok');
    expect(byService.google).toBe('ok');

    // Selhavší služba má bezpečnou kategorii chyby (žádné tajemství).
    const resend = report.services.find((s) => s.service === 'resend');
    expect(resend?.errorKind).not.toBeNull();
    expect(report.aggregate).toBe('down');
  });
});
