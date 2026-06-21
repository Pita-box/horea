// Feature: admin-system-tools, Property 3: Výsledek health checku nikdy neobsahuje tajnou hodnotu
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property 3: Výsledek health checku nikdy neobsahuje tajnou hodnotu.
 *
 * Invariant: `runHealthChecks()` vrací `HealthReport`, jehož každý
 * `ServiceProbeResult` nese VÝHRADNĚ pole `service`, `label`, `status`,
 * `latencyMs` a `errorKind` (bezpečná kategorie). I když probe selžou s chybou
 * obsahující tajemství (API klíče, tokeny) — ať už proto, že tajemství je v
 * `process.env`, nebo v chybové zprávě z `fetch`/klienta — do výsledku se
 * NIKDY nepropaguje původní zpráva ani Secret_Value (R6.1, R6.4).
 *
 * **Pragmatická volba (dle zadání tasku):** typ `ServiceProbeResult` je interní
 * a sám o sobě nemá pole pro tajemství; skutečný invariant je ale o chování
 * orchestrace, která interně dělá I/O. Probe proto NELZE rozumně otestovat bez
 * mockování. Mockujeme tedy `fetch`, `aws4fetch` (R2) a service-role Supabase
 * klienta tak, aby probe „vrátily“ chybu se secret-like detailem, nastavíme
 * `process.env` na secret-like hodnoty, zavoláme skutečný `runHealthChecks()`
 * a ověříme, že se v `JSON.stringify(report)` neobjeví žádný tajný token a že
 * každý řádek nese jen povolené klíče.
 *
 * **Validates: Requirements 6.1, 6.4**
 */

// Sdílený mutovatelný stav mocků — naplňuje se v každém běhu property testu
// (vi.mock factory je hoistovaná, proto čteme přes tento holder).
const mockState = vi.hoisted(() => ({
  // Tajemství, které mocky vloží do chybových zpráv / návratových hodnot probe.
  errorSecret: '__SECRET__init__',
  // Režim selhání probe (řídí, kterou chybovou větev classifyThrown zasáhneme).
  mode: 'http-error' as
    | 'http-error'
    | 'throw-network'
    | 'throw-unexpected'
    | 'abort',
}));

// Sestaví chybu/odpověď dle aktuálního režimu; vždy nese tajemství v message.
function failLikeFetch(): never | Response {
  const secret = mockState.errorSecret;
  switch (mockState.mode) {
    case 'throw-network':
      throw new TypeError(secret);
    case 'throw-unexpected':
      throw new Error(secret);
    case 'abort':
      throw Object.assign(new Error(secret), { name: 'AbortError' });
    case 'http-error':
    default:
      // Non-ok odpověď, jejíž statusText/body nese tajemství (probe ho ignoruje).
      return {
        ok: false,
        status: 503,
        statusText: secret,
        text: async () => secret,
        json: async () => ({ message: secret }),
      } as unknown as Response;
  }
}

// Mock service-role Supabase klienta: `.from().select()` buď vyhodí chybu se
// secret message, nebo vrátí `{ error }` s tajemstvím (http_error větev).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: async () => {
        if (mockState.mode === 'http-error') {
          return { error: { message: mockState.errorSecret, code: 'PGRST' } };
        }
        return failLikeFetch();
      },
    }),
  }),
}));

// Mock R2 klienta (aws4fetch): jeho `.fetch()` se chová jako selhávající probe.
vi.mock('aws4fetch', () => ({
  AwsClient: class {
    async fetch(): Promise<Response> {
      return failLikeFetch();
    }
  },
}));

import { runHealthChecks } from '../health';

// Klíče prostředí, které jednotlivé probe čtou. Naplníme je secret-like
// hodnotami, aby se probe nezkratovaly na „unconfigured“ a aby tajemství
// reálně bylo v prostředí během běhu.
const ENV_KEYS = [
  'RESEND_API_KEY',
  'SMTP2GO_API_KEY',
  'GOPAY_API_BASE_URL',
  'GOPAY_CLIENT_ID',
  'GOPAY_CLIENT_SECRET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
] as const;

// Přesná množina povolených klíčů jednoho řádku health tabulky (R3.4, R3.5, R6.4).
const ALLOWED_KEYS = [
  'errorKind',
  'label',
  'latencyMs',
  'service',
  'status',
] as const;

describe('health — Property 3: výsledek health checku nikdy neobsahuje tajnou hodnotu', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => failLikeFetch()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('žádný tajný token neuniká do výsledku a řádky nesou jen povolené klíče', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Distinktní tajemství vkládané do chybových zpráv / návratů probe.
        fc.string({ minLength: 1 }).map((s) => `__SECRET__err__${s}__`),
        // Distinktní tajemství vkládané do každé env proměnné.
        fc.string({ minLength: 1 }).map((s) => `__SECRET__env__${s}__`),
        // Režim selhání probe — pokrývá http_error/network/unexpected/timeout.
        fc.constantFrom(
          'http-error' as const,
          'throw-network' as const,
          'throw-unexpected' as const,
          'abort' as const,
        ),
        async (errorSecret, envSecret, mode) => {
          mockState.errorSecret = errorSecret;
          mockState.mode = mode;

          // Nastav všechny env proměnné na secret-like hodnotu (probe „configured“).
          for (const key of ENV_KEYS) {
            vi.stubEnv(key, `${envSecret}__${key}`);
          }

          const report = await runHealthChecks();

          // Pokrytí všech 6 služeb (R3.1).
          expect(report.services).toHaveLength(6);

          const serialized = JSON.stringify(report);

          // R6.1/R6.4: žádné tajemství (z chyb ani z prostředí) ve výstupu.
          expect(serialized.includes(errorSecret)).toBe(false);
          expect(serialized.includes(envSecret)).toBe(false);

          for (const result of report.services) {
            // Každý řádek nese VÝHRADNĚ povolené klíče (žádné Secret_Value pole).
            expect(Object.keys(result).sort()).toEqual([...ALLOWED_KEYS]);
            // errorKind je jen bezpečná kategorie, nikdy původní zpráva.
            expect([
              'http_error',
              'network_error',
              'timeout',
              'unexpected',
              null,
            ]).toContain(result.errorKind);
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
