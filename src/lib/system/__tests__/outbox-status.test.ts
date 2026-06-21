// Feature: admin-system-tools — příkladové unit testy I/O wrapperu getOutboxStatus.
//
// Ověřuje, že wrapper čte z `email_outbox` POUZE ne-PII sloupce
// (`status, created_at, next_attempt_at`), korektně agreguje mock řádky,
// při chybě dotazu vrací null (fallback) a ignoruje neznámé stavy.
// Validates: Requirements 17.5, 17.6, 17.7

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Zachycené argumenty volání mock klienta — pro ověření, že čteme jen ne-PII sloupce.
const fromCalls = vi.hoisted(() => [] as string[]);
const selectCalls = vi.hoisted(() => [] as string[]);
// Řízený výsledek `from().select()` — měníme ho v jednotlivých testech.
const selectResult = vi.hoisted(() => ({
  value: { data: null as unknown, error: null as unknown },
}));

// Mock service-role klienta: `from(table).select(columns)` vrací řízený výsledek
// a zaznamenává argumenty, aby šlo ověřit, že se nečtou žádné PII sloupce.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      return {
        select: (columns: string) => {
          selectCalls.push(columns);
          return Promise.resolve(selectResult.value);
        },
      };
    },
  }),
}));

import { getOutboxStatus } from '../outbox-status';

// Pevný „teď" pro deterministické vyhodnocení readyToRetry (next_attempt_at <= now).
const NOW = new Date('2024-06-01T12:00:00.000Z');

beforeEach(() => {
  fromCalls.length = 0;
  selectCalls.length = 0;
  selectResult.value = { data: null, error: null };
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getOutboxStatus — výběr sloupců (R17.5)', () => {
  it('dotazuje tabulku email_outbox jen na ne-PII sloupce status, created_at, next_attempt_at', async () => {
    selectResult.value = { data: [], error: null };

    await getOutboxStatus();

    // Čte se právě z tabulky email_outbox.
    expect(fromCalls).toEqual(['email_outbox']);

    // Vybírá se přesně trojice ne-PII sloupců (R17.5).
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0]).toBe('status, created_at, next_attempt_at');

    // Pojistka: výběr neobsahuje žádný PII sloupec (adresát/předmět/obsah těla).
    const selected = selectCalls[0];
    expect(selected).not.toMatch(/to_email/);
    expect(selected).not.toMatch(/subject/);
    expect(selected).not.toMatch(/html_body/);
    expect(selected).not.toMatch(/text_body/);
  });
});

describe('getOutboxStatus — agregace mock řádků (R17.1–R17.4)', () => {
  it('správně spočítá counts, oldestPendingAt a readyToRetry', async () => {
    selectResult.value = {
      data: [
        // pending, next_attempt v minulosti → připraveno k retry.
        {
          status: 'pending',
          created_at: '2024-05-01T00:00:00.000Z',
          next_attempt_at: '2024-05-02T00:00:00.000Z',
        },
        // pending, nejstarší created_at, next_attempt null → není připraveno.
        {
          status: 'pending',
          created_at: '2024-04-01T00:00:00.000Z',
          next_attempt_at: null,
        },
        // pending, next_attempt v budoucnosti → není připraveno.
        {
          status: 'pending',
          created_at: '2024-05-15T00:00:00.000Z',
          next_attempt_at: '2024-07-01T00:00:00.000Z',
        },
        // sent a dead se do oldestPendingAt/readyToRetry nepočítají.
        {
          status: 'sent',
          created_at: '2024-03-01T00:00:00.000Z',
          next_attempt_at: null,
        },
        {
          status: 'dead',
          created_at: '2024-02-01T00:00:00.000Z',
          next_attempt_at: null,
        },
      ],
      error: null,
    };

    const result = await getOutboxStatus();

    expect(result).not.toBeNull();
    expect(result!.counts).toEqual({ pending: 3, sent: 1, dead: 1 });
    // Nejstarší pending podle created_at (R17.2).
    expect(result!.oldestPendingAt).toBe('2024-04-01T00:00:00.000Z');
    // Jen jediný pending má next_attempt_at <= now (R17.3).
    expect(result!.readyToRetry).toBe(1);
  });

  it('při prázdné frontě vrací nulové counts, oldestPendingAt null a readyToRetry 0 (R17.4)', async () => {
    selectResult.value = { data: [], error: null };

    const result = await getOutboxStatus();

    expect(result).toEqual({
      counts: { pending: 0, sent: 0, dead: 0 },
      oldestPendingAt: null,
      readyToRetry: 0,
    });
  });

  it('ignoruje řádky s neznámým stavem', async () => {
    selectResult.value = {
      data: [
        {
          status: 'pending',
          created_at: '2024-05-01T00:00:00.000Z',
          next_attempt_at: null,
        },
        // Neznámý stav — musí se bezpečně ignorovat (nezapočítat).
        {
          status: 'queued',
          created_at: '2024-05-10T00:00:00.000Z',
          next_attempt_at: null,
        },
        {
          status: 'bogus',
          created_at: '2024-05-11T00:00:00.000Z',
          next_attempt_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    };

    const result = await getOutboxStatus();

    expect(result).not.toBeNull();
    // Započítá se jen jediný známý (pending) řádek.
    expect(result!.counts).toEqual({ pending: 1, sent: 0, dead: 0 });
    expect(result!.oldestPendingAt).toBe('2024-05-01T00:00:00.000Z');
    expect(result!.readyToRetry).toBe(0);
  });
});

describe('getOutboxStatus — fallback při nedostupnosti (R17.7)', () => {
  it('vrací null, když dotaz vrátí chybu', async () => {
    selectResult.value = { data: null, error: { message: 'spojení selhalo' } };

    const result = await getOutboxStatus();

    expect(result).toBeNull();
  });

  it('vrací null, když dotaz nevrátí žádná data', async () => {
    selectResult.value = { data: null, error: null };

    const result = await getOutboxStatus();

    expect(result).toBeNull();
  });
});
