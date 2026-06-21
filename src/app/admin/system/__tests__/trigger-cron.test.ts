import { afterEach, describe, expect, it, vi } from 'vitest';

import { triggerCron } from '../actions';

// Integrační test server action `triggerCron` (task 26.8, feature `admin-system-tools`).
//
// `triggerCron` je server-only I/O vrstva, která:
//  - nezávisle ověří admin oprávnění (`requireAdmin`),
//  - server-side zavolá interní cron endpoint `/api/cron/<job>?trigger=manual`
//    s hlavičkou `Authorization: Bearer <CRON_SECRET>` (R12.1),
//  - při chybějícím `CRON_SECRET` odmítne BEZ jakéhokoli `fetch` (R12.4),
//  - tajemství nikdy nevrátí klientovi ani nezaloguje (R12.5, R15.4).
//
// V testech proto:
//  - mockujeme `@/lib/admin/require-admin` → admin ok (odpojení reálné auth/DB),
//  - mockujeme `@/lib/log-server`, abychom se vyhnuli reálnému `next/headers`,
//  - mockujeme `fetch` přes `vi.stubGlobal`,
//  - nastavujeme/rušíme `CRON_SECRET` přes `vi.stubEnv`.
// Po každém testu vše uklízíme (`vi.unstubAllGlobals` / `vi.unstubAllEnvs`).

// Admin ověření vždy uspěje — `admin` klient zde není potřeba (triggerCron ho nepoužívá).
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    actorUserId: 'admin-user-id',
    admin: {},
  })),
}));

// serverLog jako spy — sledujeme, CO se loguje (bezpečnostní invariant R12.5/R15.4),
// a zároveň odpojíme reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

import { serverLog } from '@/lib/log-server';

/** Smyšlené cron tajemství — nikdy reálná hodnota. */
const TEST_CRON_SECRET = 'test-cron-secret-abc123';

/** Posbírá všechny argumenty předané do kteréhokoli `serverLog` volání do jednoho JSON řetězce. */
function allServerLogArgsAsString(): string {
  const calls = [
    ...vi.mocked(serverLog.info).mock.calls,
    ...vi.mocked(serverLog.warn).mock.calls,
    ...vi.mocked(serverLog.error).mock.calls,
  ];
  return JSON.stringify(calls);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('triggerCron', () => {
  it('s nastaveným secretem volá cron endpoint s Bearer autorizací a vrací výsledek (R12.1, R12.3)', async () => {
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);

    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await triggerCron('cleanup');

    // Fetch byl volán právě jednou.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // URL míří na interní cron endpoint daného jobu s ručním triggerem (R12.1).
    expect(String(url)).toContain('/api/cron/cleanup');
    expect(String(url)).toContain('trigger=manual');

    // Autorizace přes Bearer s CRON_SECRET (R12.1).
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TEST_CRON_SECRET}`);

    // Výsledek nese HTTP status/ok běhu (R12.3).
    expect(result).toEqual({ ok: true, job: 'cleanup', httpStatus: 200, httpOk: true });
  });

  it('promítne neúspěšný HTTP status běhu (httpOk=false) do výsledku (R12.3)', async () => {
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);

    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await triggerCron('billing');

    expect(result).toEqual({ ok: true, job: 'billing', httpStatus: 500, httpOk: false });
  });

  it('bez CRON_SECRET odmítne a NEvolá fetch (R12.4)', async () => {
    // Tajemství výslovně vyprázdníme.
    vi.stubEnv('CRON_SECRET', '');

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await triggerCron('cleanup');

    expect(result).toEqual({ ok: false, message: 'cron tajemství není nastaveno' });
    // Žádný fetch — secret se nikam neodesílá (R12.4).
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET neunikne do výsledku ani do logu (R12.5, R15.4)', async () => {
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);

    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await triggerCron('warnings');

    // Hodnota tajemství se nesmí objevit ve výsledku vráceném klientovi.
    expect(JSON.stringify(result)).not.toContain(TEST_CRON_SECRET);
    // Ani v žádném logu.
    expect(allServerLogArgsAsString()).not.toContain(TEST_CRON_SECRET);
  });
});
