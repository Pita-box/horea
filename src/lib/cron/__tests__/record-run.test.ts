import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit testy `recordCronRun` (task 23.2, R11.4 + R15.4).
 *
 * Co ověřujeme:
 *  1. Úspěšný handler → zapíše se start (insert) i finish (update) s finálním
 *     statusem z výsledku a `detail` jen s konečnými čísly. Vrací výsledek handleru.
 *  2. Best-effort: selhání zápisu startu i finiše (vrácený `error` i vyhozená
 *     výjimka) NESMÍ shodit job — handler proběhne, vrátí se jeho výsledek a
 *     zaloguje se `serverLog.warn`.
 *  3. Handler vyhodí výjimku → `recordCronRun` re-throw (chování routy se nemění)
 *     a pokusí se zapsat finish se statusem 'error'.
 *  4. `sanitizeDetail`: ne-číselné hodnoty / NaN / Infinity se do `update` nedostanou
 *     — projdou jen konečná čísla (žádné tajemství ani PII).
 *
 * Mockujeme `@/lib/supabase/admin` (service-role klient) a `@/lib/log-server`
 * (odpojí reálnou závislost na `next/headers` a umožní špehovat logování).
 */

// --- Řízení a záznamy mocku service-role klienta -----------------------------

// Zaznamenané argumenty volání, ať je můžeme aserovat.
const insertCalls = vi.hoisted(() => [] as Record<string, unknown>[]);
const updateCalls = vi.hoisted(
  () => [] as { id: unknown; payload: Record<string, unknown> }[],
);

// Konfigurovatelné chování jednotlivých kroků řetězce.
//   'ok'    → vrátí úspěch ({ data, error: null })
//   'error' → vrátí { error } (best-effort větev s `error`)
//   'throw' → vyhodí výjimku (best-effort catch větev)
const behavior = vi.hoisted(() => ({
  insert: 'ok' as 'ok' | 'error' | 'throw',
  update: 'ok' as 'ok' | 'error' | 'throw',
  insertedId: 'run-1' as string | null,
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      // start: insert(...).select('id').single()
      insert: (payload: Record<string, unknown>) => {
        insertCalls.push(payload);
        return {
          select: () => ({
            single: () => {
              if (behavior.insert === 'throw') {
                throw new Error('insert boom');
              }
              if (behavior.insert === 'error') {
                return Promise.resolve({ data: null, error: { message: 'insert failed' } });
              }
              return Promise.resolve({ data: { id: behavior.insertedId }, error: null });
            },
          }),
        };
      },
      // finish: update(...).eq('id', runId)
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          updateCalls.push({ id, payload });
          if (behavior.update === 'throw') {
            throw new Error('update boom');
          }
          if (behavior.update === 'error') {
            return Promise.resolve({ error: { message: 'update failed' } });
          }
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { serverLog } from '@/lib/log-server';
import { recordCronRun } from '../record-run';

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  behavior.insert = 'ok';
  behavior.update = 'ok';
  behavior.insertedId = 'run-1';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('recordCronRun', () => {
  it('úspěšný handler zapíše start i finish a vrátí výsledek', async () => {
    const result = await recordCronRun('cleanup', 'scheduled', async () => ({
      status: 'ok' as const,
      detail: { processed: 5, failed: 0 },
    }));

    // Vrací přesně výsledek handleru.
    expect(result).toEqual({ status: 'ok', detail: { processed: 5, failed: 0 } });

    // Start řádek: job + trigger + status 'running'.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ job: 'cleanup', trigger: 'scheduled', status: 'running' });
    expect(insertCalls[0]).toHaveProperty('started_at');

    // Finish update: na správné id, finální status z výsledku a detail jen čísla.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe('run-1');
    expect(updateCalls[0].payload).toMatchObject({ status: 'ok', detail: { processed: 5, failed: 0 } });
    expect(updateCalls[0].payload).toHaveProperty('finished_at');

    // Při úspěchu se nic nevaruje.
    expect(serverLog.warn).not.toHaveBeenCalled();
  });

  it('finish přenese status error z výsledku handleru', async () => {
    const result = await recordCronRun('billing', 'manual', async () => ({
      status: 'error' as const,
      detail: { failed: 2 },
    }));

    expect(result.status).toBe('error');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({ status: 'error', detail: { failed: 2 } });
  });

  it('best-effort: selhání zápisu startu (vrácený error) job neshodí', async () => {
    behavior.insert = 'error';

    const result = await recordCronRun('warnings', 'scheduled', async () => ({
      status: 'ok' as const,
      detail: { processed: 1 },
    }));

    // Handler i přes selhání startu proběhl a vrátil výsledek.
    expect(result).toEqual({ status: 'ok', detail: { processed: 1 } });
    // Bez `id` se finish update přeskočí.
    expect(updateCalls).toHaveLength(0);
    // Selhání startu se zaloguje jako warn.
    expect(serverLog.warn).toHaveBeenCalledWith('cron_run_record_start_failed', {
      job: 'warnings',
      trigger: 'scheduled',
    });
  });

  it('best-effort: vyhozená výjimka při zápisu startu job neshodí', async () => {
    behavior.insert = 'throw';

    const result = await recordCronRun('email-retry', 'manual', async () => ({
      status: 'ok' as const,
    }));

    expect(result).toEqual({ status: 'ok' });
    expect(updateCalls).toHaveLength(0);
    expect(serverLog.warn).toHaveBeenCalledWith('cron_run_record_start_failed', {
      job: 'email-retry',
      trigger: 'manual',
    });
  });

  it('best-effort: selhání zápisu finiše (vrácený error) job neshodí', async () => {
    behavior.update = 'error';

    const result = await recordCronRun('cleanup', 'scheduled', async () => ({
      status: 'ok' as const,
      detail: { processed: 3 },
    }));

    // Handler proběhl, výsledek se vrátil, jen finish selhal → warn.
    expect(result).toEqual({ status: 'ok', detail: { processed: 3 } });
    expect(updateCalls).toHaveLength(1);
    expect(serverLog.warn).toHaveBeenCalledWith('cron_run_record_finish_failed', {
      job: 'cleanup',
      trigger: 'scheduled',
    });
  });

  it('best-effort: vyhozená výjimka při zápisu finiše job neshodí', async () => {
    behavior.update = 'throw';

    const result = await recordCronRun('billing', 'manual', async () => ({
      status: 'ok' as const,
      detail: { processed: 9 },
    }));

    expect(result).toEqual({ status: 'ok', detail: { processed: 9 } });
    expect(serverLog.warn).toHaveBeenCalledWith('cron_run_record_finish_failed', {
      job: 'billing',
      trigger: 'manual',
    });
  });

  it('handler vyhodí výjimku → re-throw a finish se statusem error bez detailu', async () => {
    const boom = new Error('handler selhal');

    await expect(
      recordCronRun('cleanup', 'scheduled', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    // Pokusil se zapsat finish se statusem 'error' a bez detailu (sanitizace → null).
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({ status: 'error', detail: null });
  });

  it('sanitizeDetail: do update jdou jen konečná čísla, ne-čísla/NaN/Infinity se zahodí', async () => {
    const result = await recordCronRun('billing', 'scheduled', async () => ({
      status: 'ok' as const,
      // Schválně typově "ošizený" detail s nepovolenými hodnotami — pojistka proti
      // tomu, aby se do `cron_runs.detail` dostalo cokoli mimo číselné metriky.
      detail: {
        processed: 7,
        failed: 0,
        ratio: Number.NaN,
        peak: Number.POSITIVE_INFINITY,
        token: 'secret-value-123' as unknown as number,
        email: 'klient@priklad.cz' as unknown as number,
      },
    }));

    expect(result.status).toBe('ok');
    expect(updateCalls).toHaveLength(1);

    const detail = updateCalls[0].payload.detail as Record<string, number>;
    // Projdou jen konečná čísla.
    expect(detail).toEqual({ processed: 7, failed: 0 });
    // Žádné tajemství/PII ani nekonečné/NaN hodnoty.
    expect(detail).not.toHaveProperty('token');
    expect(detail).not.toHaveProperty('email');
    expect(detail).not.toHaveProperty('ratio');
    expect(detail).not.toHaveProperty('peak');
  });

  it('sanitizeDetail: prázdný/bez-číselný detail → null', async () => {
    await recordCronRun('warnings', 'manual', async () => ({
      status: 'ok' as const,
      detail: { bad: 'x' as unknown as number },
    }));

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload.detail).toBeNull();
  });
});
