// Feature: admin-system-tools — příkladové unit testy I/O wrapperu getWebhookFreshness.
//
// Ověřuje, že wrapper odvodí proxy čas poslední platebně řízené aktivity jako
// `max(nejnovější subscriptions.updated_at, nejnovější payments.created_at)`,
// nastaví `isProxy=true`, správně vyhodnotí `stale` vůči 48h hranici, při prázdných
// zdrojích vrátí `{ hasActivity: false }`, při chybě dotazu vrátí `null` (fallback)
// a výstup nikdy nenese PII (jen časové razítko a příznaky).
// Validates: Requirements 20.1, 20.7

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Zachycené názvy dotazovaných tabulek a vybíraných sloupců — pro ověření,
// že čteme jen ne-PII časové sloupce.
const fromCalls = vi.hoisted(() => [] as string[]);
const selectCalls = vi.hoisted(() => [] as string[]);
// Řízené výsledky `from(table).select().order().limit()` per tabulka — měníme je
// v jednotlivých testech.
const results = vi.hoisted(() => ({
  subscriptions: { data: null as unknown, error: null as unknown },
  payments: { data: null as unknown, error: null as unknown },
}));

// Mock service-role klienta: replikuje chaining z implementace
// `from(table).select(cols).order(col, opts).limit(n)` → Promise<{ data, error }>.
// Výsledek se vybírá podle názvu tabulky, aby šlo nezávisle řídit subscriptions/payments.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      return {
        select: (columns: string) => {
          selectCalls.push(columns);
          return {
            order: () => ({
              limit: () =>
                Promise.resolve(
                  results[table as 'subscriptions' | 'payments'] ?? {
                    data: null,
                    error: null,
                  },
                ),
            }),
          };
        },
      };
    },
  }),
}));

import { getWebhookFreshness, WEBHOOK_FRESHNESS_THRESHOLD_HOURS } from '../webhook-freshness';

// Pevný „teď" pro deterministické vyhodnocení stale (věk > 48 h).
const NOW = new Date('2024-06-01T12:00:00.000Z');
const MS_PER_HOUR = 60 * 60 * 1000;

beforeEach(() => {
  fromCalls.length = 0;
  selectCalls.length = 0;
  results.subscriptions = { data: null, error: null };
  results.payments = { data: null, error: null };
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getWebhookFreshness — výběr ne-PII sloupců (R20.1)', () => {
  it('čte jen subscriptions.updated_at a payments.created_at', async () => {
    results.subscriptions = { data: [], error: null };
    results.payments = { data: [], error: null };

    await getWebhookFreshness();

    // Čte se z obou tabulek.
    expect(fromCalls).toEqual(['subscriptions', 'payments']);
    // Vybírají se přesně ne-PII časové sloupce.
    expect(selectCalls).toEqual(['updated_at', 'created_at']);
  });
});

describe('getWebhookFreshness — proxy čas = max(subscriptions, payments) (R20.1)', () => {
  it('vrátí pozdější z časů (subscriptions novější) s isProxy=true', async () => {
    // subscriptions novější (před 1 h) → proxy = tento čas, čerstvé.
    const subAt = new Date(NOW.getTime() - 1 * MS_PER_HOUR).toISOString();
    const payAt = new Date(NOW.getTime() - 10 * MS_PER_HOUR).toISOString();
    results.subscriptions = { data: [{ updated_at: subAt }], error: null };
    results.payments = { data: [{ created_at: payAt }], error: null };

    const result = await getWebhookFreshness();

    expect(result).toEqual({
      hasActivity: true,
      lastActivityAt: subAt,
      stale: false,
      isProxy: true,
    });
  });

  it('vrátí pozdější z časů (payments novější) s isProxy=true', async () => {
    // payments novější (před 2 h) → proxy = tento čas, čerstvé.
    const subAt = new Date(NOW.getTime() - 20 * MS_PER_HOUR).toISOString();
    const payAt = new Date(NOW.getTime() - 2 * MS_PER_HOUR).toISOString();
    results.subscriptions = { data: [{ updated_at: subAt }], error: null };
    results.payments = { data: [{ created_at: payAt }], error: null };

    const result = await getWebhookFreshness();

    expect(result).toEqual({
      hasActivity: true,
      lastActivityAt: payAt,
      stale: false,
      isProxy: true,
    });
  });

  it('použije dostupný čas, když druhý zdroj je prázdný', async () => {
    const payAt = new Date(NOW.getTime() - 3 * MS_PER_HOUR).toISOString();
    results.subscriptions = { data: [], error: null };
    results.payments = { data: [{ created_at: payAt }], error: null };

    const result = await getWebhookFreshness();

    expect(result).toEqual({
      hasActivity: true,
      lastActivityAt: payAt,
      stale: false,
      isProxy: true,
    });
  });
});

describe('getWebhookFreshness — práh zastaralosti 48 h (R20.1)', () => {
  it('označí aktivitu starší než 48 h jako stale', async () => {
    // Proxy čas o 1 h starší než hranice → stale.
    const oldAt = new Date(
      NOW.getTime() - (WEBHOOK_FRESHNESS_THRESHOLD_HOURS + 1) * MS_PER_HOUR,
    ).toISOString();
    results.subscriptions = { data: [{ updated_at: oldAt }], error: null };
    results.payments = { data: [], error: null };

    const result = await getWebhookFreshness();

    expect(result).toEqual({
      hasActivity: true,
      lastActivityAt: oldAt,
      stale: true,
      isProxy: true,
    });
  });

  it('aktivita přesně na hranici 48 h není stale (věk není ostře větší)', async () => {
    const edgeAt = new Date(
      NOW.getTime() - WEBHOOK_FRESHNESS_THRESHOLD_HOURS * MS_PER_HOUR,
    ).toISOString();
    results.subscriptions = { data: [{ updated_at: edgeAt }], error: null };
    results.payments = { data: [], error: null };

    const result = await getWebhookFreshness();

    expect(result).toMatchObject({ hasActivity: true, stale: false });
  });
});

describe('getWebhookFreshness — bez zaznamenané aktivity', () => {
  it('vrátí { hasActivity: false }, když jsou oba zdroje prázdné', async () => {
    results.subscriptions = { data: [], error: null };
    results.payments = { data: [], error: null };

    const result = await getWebhookFreshness();

    expect(result).toEqual({ hasActivity: false });
  });
});

describe('getWebhookFreshness — fallback při nedostupnosti (R20.7)', () => {
  it('vrátí null, když dotaz na subscriptions selže', async () => {
    results.subscriptions = { data: null, error: { message: 'spojení selhalo' } };
    results.payments = { data: [], error: null };

    const result = await getWebhookFreshness();

    expect(result).toBeNull();
  });

  it('vrátí null, když dotaz na payments selže', async () => {
    results.subscriptions = { data: [], error: null };
    results.payments = { data: null, error: { message: 'spojení selhalo' } };

    const result = await getWebhookFreshness();

    expect(result).toBeNull();
  });
});

describe('getWebhookFreshness — výstup bez PII (R20.5)', () => {
  it('serializovaný výstup obsahuje jen časové razítko a příznaky', async () => {
    const subAt = new Date(NOW.getTime() - 5 * MS_PER_HOUR).toISOString();
    results.subscriptions = { data: [{ updated_at: subAt }], error: null };
    results.payments = { data: [], error: null };

    const result = await getWebhookFreshness();

    // Výstup nese pouze povolené klíče — žádné PII (e-mail, jméno, ID klienta apod.).
    expect(Object.keys(result ?? {}).sort()).toEqual(
      ['hasActivity', 'isProxy', 'lastActivityAt', 'stale'].sort(),
    );
  });
});
