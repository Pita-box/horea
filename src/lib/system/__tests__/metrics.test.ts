// Feature: admin-system-tools — příkladové unit testy I/O funkce getOperationalMetrics.
//
// Ověřuje, že funkce přes service-role čte agregované `count` (head: true) pro
// businesses/reservations/clients (žádná data řádků ani PII), správně sestaví
// DB_Metrics z mock countů, hlásí storage jako „nedostupné" bez nákladného
// volání a při selhání kteréhokoli countu vrací db: null (fallback).
// Validates: Requirements 23.1, 23.2, 23.3, 23.4, 23.5

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Zachycené argumenty volání mock klienta — pro ověření, že se nečtou data řádků.
const fromCalls = vi.hoisted(() => [] as string[]);
const selectCalls = vi.hoisted(
  () => [] as Array<{ columns: string; options: unknown }>,
);
// Řízené výsledky `from(table).select(...)` per tabulka — měníme je v testech.
type CountResult = { count: number | null; error: unknown };
const tableResults = vi.hoisted(
  () =>
    ({
      value: {} as Record<string, CountResult>,
    }) as { value: Record<string, CountResult> },
);

// Mock service-role klienta: `from(table).select(columns, options)` vrací řízený
// výsledek `{ count, error }` dle tabulky a zaznamenává argumenty, aby šlo ověřit,
// že se táhne jen agregovaný count (head: true), nikoli data řádků.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      return {
        select: (columns: string, options: unknown) => {
          selectCalls.push({ columns, options });
          const result = tableResults.value[table] ?? { count: 0, error: null };
          return Promise.resolve(result);
        },
      };
    },
  }),
}));

import { getOperationalMetrics } from '../metrics';

beforeEach(() => {
  fromCalls.length = 0;
  selectCalls.length = 0;
  tableResults.value = {
    businesses: { count: 0, error: null },
    reservations: { count: 0, error: null },
    clients: { count: 0, error: null },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getOperationalMetrics — úspěšné počty (R23.1)', () => {
  it('sestaví DB_Metrics z mock countů pro businesses, reservations a clients', async () => {
    tableResults.value = {
      businesses: { count: 7, error: null },
      reservations: { count: 142, error: null },
      clients: { count: 53, error: null },
    };

    const result = await getOperationalMetrics();

    expect(result.db).toEqual({
      businesses: 7,
      reservations: 142,
      clients: 53,
    });

    // Čtou se právě tři klíčové tabulky.
    expect(fromCalls).toEqual(['businesses', 'reservations', 'clients']);
  });

  it('nahradí chybějící count (null) nulou', async () => {
    tableResults.value = {
      businesses: { count: null, error: null },
      reservations: { count: null, error: null },
      clients: { count: null, error: null },
    };

    const result = await getOperationalMetrics();

    expect(result.db).toEqual({ businesses: 0, reservations: 0, clients: 0 });
  });
});

describe('getOperationalMetrics — jen agregovaný count, žádná data řádků (R23.4)', () => {
  it('volá select se { count: "exact", head: true } pro každou tabulku', async () => {
    await getOperationalMetrics();

    expect(selectCalls).toHaveLength(3);
    for (const call of selectCalls) {
      // head: true → táhne se jen číslo, žádné řádky (R23.4).
      expect(call.options).toEqual({ count: 'exact', head: true });
    }
  });

  it('výsledek neobsahuje žádná data řádků ani PII — pouze agregované počty', async () => {
    tableResults.value = {
      businesses: { count: 1, error: null },
      reservations: { count: 2, error: null },
      clients: { count: 3, error: null },
    };

    const result = await getOperationalMetrics();

    // db obsahuje výhradně tři číselné počty, nic víc.
    expect(Object.keys(result.db ?? {}).sort()).toEqual([
      'businesses',
      'clients',
      'reservations',
    ]);
    for (const value of Object.values(result.db ?? {})) {
      expect(typeof value).toBe('number');
    }

    // Žádný PII řetězec (e-mail, jméno, telefon) nikde ve výstupu.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/@/);
    expect(serialized).not.toMatch(/name/i);
    expect(serialized).not.toMatch(/email/i);
    expect(serialized).not.toMatch(/phone/i);
  });
});

describe('getOperationalMetrics — storage „nedostupné" bez nákladného volání (R23.2, R23.3)', () => {
  it('hlásí storage jako nedostupné', async () => {
    const result = await getOperationalMetrics();

    expect(result.storage).toEqual({ available: false });
  });

  it('nezjišťuje velikost úložiště žádným dotazem nad tabulkami (žádné nákladné volání)', async () => {
    await getOperationalMetrics();

    // Dotazují se výhradně tři count tabulky; žádný dotaz kvůli storage navíc.
    expect(fromCalls).toEqual(['businesses', 'reservations', 'clients']);
    expect(selectCalls).toHaveLength(3);
  });
});

describe('getOperationalMetrics — fallback při selhání DB (R23.5)', () => {
  it('vrací db: null, když jeden z countů skončí chybou', async () => {
    tableResults.value = {
      businesses: { count: 7, error: null },
      reservations: { count: null, error: { message: 'spojení selhalo' } },
      clients: { count: 53, error: null },
    };

    const result = await getOperationalMetrics();

    expect(result.db).toBeNull();
    // Storage zůstává nezávisle na selhání DB nedostupné.
    expect(result.storage).toEqual({ available: false });
  });

  it('vrací db: null, když createAdminClient vyhodí výjimku', async () => {
    const adminModule = await import('@/lib/supabase/admin');
    vi.spyOn(adminModule, 'createAdminClient').mockImplementationOnce(() => {
      throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
    });

    const result = await getOperationalMetrics();

    expect(result.db).toBeNull();
    expect(result.storage).toEqual({ available: false });
  });
});
