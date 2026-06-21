import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { recordCronRun } from '@/lib/cron/record-run';
import { drainEmailOutbox, purgeOldOutbox } from '@/lib/email/outbox';

// Task 24.5 — test neměnnosti návratových hodnot cron rout (R11.4).
//
// Cíl: ověřit, že obalení doménové logiky wrapperem `recordCronRun` (best-effort
// zápis do `cron_runs`) NEMĚNÍ HTTP status ani JSON tělo žádné ze 4 cron rout.
// Postup mockování (tenké adaptéry → izolujeme jen kontrakt routy):
//
//  - `@/lib/cron/record-run` → `recordCronRun` jako TRANSPARENTNÍ průchod:
//    jen zavolá předaný `run()` a vrátí jeho výsledek (žádný DB zápis). Zároveň
//    spy → můžeme ověřit, že byl volán se správným `job` a `trigger`.
//  - `@/lib/cron/auth` → `verifyCronAuthorization` vrací `{ ok: true }`
//    (autorizovaný požadavek), takže se vykoná doménová větev routy.
//  - `@/lib/supabase/admin` → `createAdminClient` vrací chainable query builder,
//    který každý dotaz rozhodne jako prázdný úspěch (`{ data: [], error: null }`)
//    → routy projdou „happy path" s nulovými metrikami.
//  - Doménové závislosti (`chargeMonthly`, `createGopayClient`,
//    `transitionToGracePeriod`, `dispatchTransactionalEmail`,
//    `notifyAdminCronFailure`, `drainEmailOutbox`, `purgeOldOutbox`) mockujeme na
//    minimální úspěšný průchod, aby se neimportovaly reálné server-only moduly.
//  - `@/lib/log-server` → `serverLog` jako no-op spy.
//
// Po obalení musí platit: status 200 + očekávané JSON tělo metrik beze změny.

// `recordCronRun` jako transparentní průchod + spy na (job, trigger).
vi.mock('@/lib/cron/record-run', () => ({
  recordCronRun: vi.fn(
    async (_job: string, _trigger: string, run: () => Promise<unknown>) => run(),
  ),
}));

// Autorizace vždy OK → vykoná se doménová větev.
vi.mock('@/lib/cron/auth', () => ({
  verifyCronAuthorization: vi.fn(() => ({ ok: true })),
}));

/**
 * Chainable Supabase query builder: každá metoda vrací týž builder a builder je
 * „thenable" → await na libovolném řetězci dotazu vrátí prázdný úspěch. Tím všechny
 * routy projdou happy path bez kandidátů (nulové metriky).
 */
function createQueryBuilder() {
  const result = { data: [] as unknown[], error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'not', 'lte', 'lt', 'neq', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete']) {
    builder[method] = () => builder;
  }
  builder.single = () => Promise.resolve({ data: { id: 'run-id' }, error: null });
  builder.then = (resolve: (v: typeof result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => createQueryBuilder()),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  })),
}));

// Doménové závislosti — minimální mock (s prázdnými daty se reálně nevolají).
vi.mock('@/lib/billing/charge', () => ({
  chargeMonthly: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/payments/gopay/client', () => ({
  createGopayClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/subscription/transitions', () => ({
  transitionToGracePeriod: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/cron/admin-notify', () => ({
  notifyAdminCronFailure: vi.fn(async () => {}),
}));
vi.mock('@/lib/email/dispatcher', () => ({
  dispatchTransactionalEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/email/outbox', () => ({
  drainEmailOutbox: vi.fn(async () => ({ processed: 0, sent: 0, requeued: 0, dead: 0 })),
  purgeOldOutbox: vi.fn(async () => 0),
}));
vi.mock('@/lib/log-server', () => ({
  serverLog: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

/** Sestaví autorizovaný GET request na daný cron endpoint (bez query → `scheduled`). */
function buildRequest(path: string): NextRequest {
  return new Request(`https://app.example${path}`, {
    method: 'GET',
    headers: { authorization: 'Bearer test-secret' },
  }) as unknown as NextRequest;
}

const recordCronRunMock = vi.mocked(recordCronRun);

beforeEach(() => {
  // CRON_SECRET pro úplnost (autorizace je mockovaná, ale routy čtou trigger z URL).
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.example');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Cron routy — neměnnost kontraktu po obalení recordCronRun (R11.4)', () => {
  it('cleanup: 200 + nezměněné metriky, recordCronRun volán s job=cleanup, trigger=scheduled', async () => {
    const { GET } = await import('../cleanup/route');
    const response = await GET(buildRequest('/api/cron/cleanup'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 0, deleted: 0, failed: 0 });
    expect(recordCronRunMock).toHaveBeenCalledWith('cleanup', 'scheduled', expect.any(Function));
  });

  it('billing: 200 + nezměněné metriky, recordCronRun volán s job=billing, trigger=scheduled', async () => {
    const { GET } = await import('../billing/route');
    const response = await GET(buildRequest('/api/cron/billing'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 0,
      charged: 0,
      graced: 0,
      kept: 0,
      failed: 0,
    });
    expect(recordCronRunMock).toHaveBeenCalledWith('billing', 'scheduled', expect.any(Function));
  });

  it('warnings: 200 + nezměněné metriky, recordCronRun volán s job=warnings, trigger=scheduled', async () => {
    const { GET } = await import('../warnings/route');
    const response = await GET(buildRequest('/api/cron/warnings'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    expect(recordCronRunMock).toHaveBeenCalledWith('warnings', 'scheduled', expect.any(Function));
  });

  it('email-retry: 200 + nezměněné metriky, recordCronRun volán s job=email-retry, trigger=scheduled', async () => {
    const { GET } = await import('../email-retry/route');
    const response = await GET(buildRequest('/api/cron/email-retry'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 0,
      sent: 0,
      requeued: 0,
      dead: 0,
      purged: 0,
    });
    expect(recordCronRunMock).toHaveBeenCalledWith('email-retry', 'scheduled', expect.any(Function));
    // Doménová logika se uvnitř transparentního wrapperu skutečně vykonala.
    expect(drainEmailOutbox).toHaveBeenCalledOnce();
    expect(purgeOldOutbox).toHaveBeenCalledOnce();
  });

  it('manual trigger: ?trigger=manual se propíše do recordCronRun beze změny kontraktu', async () => {
    const { GET } = await import('../cleanup/route');
    const response = await GET(buildRequest('/api/cron/cleanup?trigger=manual'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 0, deleted: 0, failed: 0 });
    expect(recordCronRunMock).toHaveBeenCalledWith('cleanup', 'manual', expect.any(Function));
  });
});
