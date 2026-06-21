import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runServiceProbes,
  type MonitoredService,
  type ServiceHealth,
} from '../health';

// Unit testy I/O vrstvy `runServiceProbes()` (task 7.4).
//
// Probe jsou read-only síťové dotazy přes globální `fetch` a čtou konfiguraci
// z `process.env`. V testech proto:
//  - mockujeme `fetch` přes `vi.stubGlobal` (kontrolujeme úspěch/selhání per URL),
//  - nastavujeme env přes `vi.stubEnv` (názvy proměnných odpovídají `health.ts`).
// Po každém testu vše uklízíme (`vi.unstubAllGlobals` / `vi.unstubAllEnvs`).

/** Všech šest sledovaných služeb (R11.2) — očekávané pokrytí výsledku. */
const MONITORED_SERVICES: ReadonlyArray<MonitoredService> = [
  'supabase',
  'resend',
  'smtp2go',
  'gopay',
  'r2',
  'google',
];

/** Nastaví kompletní (neprázdnou) konfiguraci všech služeb, aby žádná probe neskončila na chybějícím env. */
function stubFullConfig(): void {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  vi.stubEnv('SMTP2GO_API_KEY', 'test-smtp2go-key');
  vi.stubEnv('GOPAY_API_BASE_URL', 'https://gw.example.gopay.com/api');
  vi.stubEnv('GOPAY_GOID', '1234567890');
  vi.stubEnv('R2_PUBLIC_BASE_URL', 'https://media.example.com');
  vi.stubEnv('R2_ACCOUNT_ID', 'test-r2-account');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-google-client-id');
  vi.stubEnv('GOOGLE_OAUTH_REFRESH_TOKEN', 'test-google-refresh-token');
}

/** Pomocník: vrátí mapu service → status z výsledku probe. */
function statusByService(
  results: ReadonlyArray<ServiceHealth>,
): Record<string, string> {
  return Object.fromEntries(results.map((r) => [r.service, r.status]));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('runServiceProbes — read-only probe šesti služeb', () => {
  beforeEach(() => {
    stubFullConfig();
  });

  it('při kompletní konfiguraci a dostupných službách jsou všechny ok', async () => {
    // Každá HTTP odpověď znamená „služba odpovídá" → ok.
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await runServiceProbes();
    const byService = statusByService(results);

    for (const service of MONITORED_SERVICES) {
      expect(byService[service]).toBe('ok');
    }
  });

  it('selhání JEDNÉ probe (reject) neshodí ostatní — výsledek má všech 6 služeb', async () => {
    // `fetch` selže pouze pro Resend host; ostatní služby odpovídají normálně.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://api.resend.com')) {
        throw new Error('network down');
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await runServiceProbes();

    // Pokrytí: výsledek obsahuje právě těchto šest služeb (R11.5 — ostatní se vyhodnotí dál).
    expect(results).toHaveLength(MONITORED_SERVICES.length);
    expect(new Set(results.map((r) => r.service))).toEqual(
      new Set(MONITORED_SERVICES),
    );

    const byService = statusByService(results);
    // Selhavší služba je down...
    expect(byService.resend).toBe('down');
    // ...ostatní (s dostupnou sítí) zůstávají ok.
    expect(byService.supabase).toBe('ok');
    expect(byService.gopay).toBe('ok');
    expect(byService.r2).toBe('ok');
    expect(byService.smtp2go).toBe('ok');
    expect(byService.google).toBe('ok');
  });

  it('výsledek obsahuje pouze pole service, label, status (žádné tajemství)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await runServiceProbes();

    for (const item of results) {
      // Přesně tři očekávaná pole — nic, kde by mohlo prosáknout Secret_Value (R11.6).
      expect(Object.keys(item).sort()).toEqual(['label', 'service', 'status']);
      expect(typeof item.label).toBe('string');
    }
  });

  it('probe jsou read-only — fetch je volán metodou GET (žádný zápis)', async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await runServiceProbes();

    // Aspoň jeden dotaz proběhl a každý je GET (žádný POST/PUT/DELETE).
    expect(fetchMock).toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method).toBe('GET');
    }
  });
});

describe('runServiceProbes — chybějící kritická konfigurace', () => {
  it('bez NEXT_PUBLIC_SUPABASE_URL je Supabase down bez volání fetch a bez prosáknutí env (R11.6)', async () => {
    // Nastavíme všechny env kromě kritické Supabase URL — ta zůstane chybějící.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    vi.stubEnv('SMTP2GO_API_KEY', 'test-smtp2go-key');
    vi.stubEnv('GOPAY_API_BASE_URL', 'https://gw.example.gopay.com/api');
    vi.stubEnv('GOPAY_GOID', '1234567890');
    vi.stubEnv('R2_PUBLIC_BASE_URL', 'https://media.example.com');
    vi.stubEnv('R2_ACCOUNT_ID', 'test-r2-account');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-google-client-id');
    vi.stubEnv('GOOGLE_OAUTH_REFRESH_TOKEN', 'test-google-refresh-token');

    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await runServiceProbes();
    const byService = statusByService(results);

    // Chybějící kritická konfigurace → služba down (probe ani nevolá fetch).
    expect(byService.supabase).toBe('down');

    // Žádné volání fetch nesmělo mířit na Supabase auth health endpoint
    // (probe se zkratuje na chybějící konfiguraci, žádný síťový dotaz).
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('/auth/v1/health');
    }

    // Výsledek neobsahuje žádnou hodnotu env — jen service/label/status (R11.6).
    for (const item of results) {
      expect(Object.keys(item).sort()).toEqual(['label', 'service', 'status']);
    }
  });
});
