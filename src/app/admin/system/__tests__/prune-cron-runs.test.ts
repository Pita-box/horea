// Feature: admin-system-tools — integrační test server action pruneCronRuns.
//
// Ověřuje, že action maže VÝHRADNĚ tabulku `cron_runs`, používá správný cutoff
// (computePruneCutoff podle počtu dní) a vrací počet smazaných řádků. Klíčová
// pojistka R19.5: nikdy se nedotkne append-only `audit_log`.
// Validates: Requirements 19.1, 19.4, 19.5

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computePruneCutoff, DEFAULT_CRON_RETENTION_DAYS } from '@/lib/system/prune-cutoff';

// Zachycené argumenty volání mock klienta.
const fromCalls = vi.hoisted(() => [] as string[]); // názvy tabulek předané do from()
const ltCalls = vi.hoisted(() => [] as Array<{ column: string; value: string }>); // argumenty lt()
const selectCalls = vi.hoisted(() => [] as string[]); // sloupce předané do select()
// Řízený výsledek `delete().lt().select()` — měníme ho v jednotlivých testech.
const deleteResult = vi.hoisted(() => ({
  value: { data: null as unknown, error: null as unknown },
}));

// Mock service-role klienta. Builder zachycuje from(table), lt(col, val) a select(col)
// a nakonec vrací řízený výsledek. requireAdmin vracíme jako úspěšného admina.
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: vi.fn(async () => ({
    ok: true,
    actorUserId: 'a',
    admin: {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = {
          delete: () => builder,
          lt: (column: string, value: string) => {
            ltCalls.push({ column, value });
            return builder;
          },
          select: (columns: string) => {
            selectCalls.push(columns);
            return Promise.resolve(deleteResult.value);
          },
        };
        return builder;
      },
    },
  })),
}));

// serverLog jako spy — odpojí reálnou závislost na `next/headers`.
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { pruneCronRuns } from '../actions';

// Pevný „teď" pro deterministické porovnání cutoffu.
const NOW = new Date('2024-06-01T12:00:00.000Z');

beforeEach(() => {
  fromCalls.length = 0;
  ltCalls.length = 0;
  selectCalls.length = 0;
  deleteResult.value = { data: [], error: null };
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('pruneCronRuns — výchozí retence (R19.1, R19.2, R19.4)', () => {
  it('bez parametru použije DEFAULT_CRON_RETENTION_DAYS a vrátí počet smazaných řádků', async () => {
    // Tři smazané řádky → deleted = 3.
    deleteResult.value = { data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null };

    const result = await pruneCronRuns();

    expect(result).toEqual({ ok: true, deleted: 3 });

    // Cutoff odpovídá výchozí retenci (porovnání na milisekundy přesně — fake timers).
    const expectedCutoff = computePruneCutoff(NOW, DEFAULT_CRON_RETENTION_DAYS);
    expect(ltCalls).toHaveLength(1);
    expect(ltCalls[0].column).toBe('started_at');
    expect(ltCalls[0].value).toBe(expectedCutoff);

    // Vybírá se jen sloupec id (počet řádků), žádná PII.
    expect(selectCalls).toEqual(['id']);
  });
});

describe('pruneCronRuns — explicitní počet dní (R19.1, R19.4)', () => {
  it('s days=30 použije cutoff podle 30 dní', async () => {
    deleteResult.value = { data: [{ id: 'x' }], error: null };

    const result = await pruneCronRuns(30);

    expect(result).toEqual({ ok: true, deleted: 1 });

    const expectedCutoff = computePruneCutoff(NOW, 30);
    expect(ltCalls).toHaveLength(1);
    expect(ltCalls[0]).toEqual({ column: 'started_at', value: expectedCutoff });
  });

  it('při prázdném výsledku vrátí deleted = 0', async () => {
    deleteResult.value = { data: [], error: null };

    const result = await pruneCronRuns(7);

    expect(result).toEqual({ ok: true, deleted: 0 });
  });
});

describe('pruneCronRuns — maže výhradně cron_runs, nikdy audit_log (R19.5)', () => {
  it('from() je volán jen s cron_runs a nikdy s audit_log', async () => {
    deleteResult.value = { data: [{ id: '1' }], error: null };

    await pruneCronRuns();

    // Dotčena je výhradně tabulka cron_runs.
    expect(fromCalls).toEqual(['cron_runs']);
    // Append-only audit_log se nikdy nedotkne (R19.5).
    expect(fromCalls).not.toContain('audit_log');
  });
});
