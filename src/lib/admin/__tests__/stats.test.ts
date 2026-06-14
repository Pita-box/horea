import { describe, expect, it } from 'vitest';

import {
  computeAdminOverviewStats,
  partitionByStatus,
  sumPaidRevenueCzk,
} from '@/lib/admin/stats';

import { makeFakeSupabase } from './supabase-fake';

/**
 * Unit test metrik přehledu (task 5.4 — R2.1, R2.2, R2.3, R2.6).
 *
 * Ověřuje:
 *  - čisté agregační funkce {@link sumPaidRevenueCzk} a {@link partitionByStatus},
 *  - {@link computeAdminOverviewStats}: počty registrací / Churn pro dataset uvnitř
 *    i vně zvoleného období (časově závislé metriky) vs. metriky aktuálního stavu
 *    (aktivní předplatná, rozpad dle stavu), které na období nezávisí.
 *
 * Fake Supabase opravdu aplikuje `gte`/`lte`/`eq`/`in`, takže období se projeví.
 */

const PERIOD = { from: '2024-06-01T00:00:00.000Z', to: '2024-06-30T23:59:59.999Z' };

describe('sumPaidRevenueCzk (Property 5a)', () => {
  it('sečte amount_czk přes platby (i z řetězcových hodnot)', () => {
    expect(sumPaidRevenueCzk([{ amount_czk: 100 }, { amount_czk: '250' }, { amount_czk: 0 }])).toBe(350);
  });

  it('prázdný seznam → 0', () => {
    expect(sumPaidRevenueCzk([])).toBe(0);
  });
});

describe('partitionByStatus (Property 5b)', () => {
  it('rozdělí stavy do reportovaných kategorií', () => {
    const breakdown = partitionByStatus(['free', 'active', 'active', 'grace_period', 'expired']);
    expect(breakdown).toEqual({ free: 1, active: 2, grace_period: 1, expired: 1 });
  });

  it('stavy mimo reportované kategorie (deleted_data, null) se nezapočítají', () => {
    const breakdown = partitionByStatus(['active', 'deleted_data', null, 'expired']);
    expect(breakdown).toEqual({ free: 0, active: 1, grace_period: 0, expired: 1 });
  });
});

describe('computeAdminOverviewStats — časově závislé vs. aktuálně-stavové metriky', () => {
  it('počítá registrace a Churn jen v období, aktivní/rozpad dle aktuálního stavu (R2.1, R2.2, R2.3, R2.6)', async () => {
    const supabase = makeFakeSupabase({
      // Nové registrace (R2.1) — časově závislé dle created_at.
      users: [
        { id: 'u-in-1', created_at: '2024-06-10T08:00:00.000Z' }, // uvnitř
        { id: 'u-in-2', created_at: '2024-06-20T08:00:00.000Z' }, // uvnitř
        { id: 'u-before', created_at: '2024-05-31T23:59:59.000Z' }, // vně (před)
        { id: 'u-after', created_at: '2024-07-01T00:00:00.000Z' }, // vně (po)
      ],
      // Churn (R2.3) — expired/deleted_data s updated_at v období; aktivní = aktuální stav (R2.2).
      subscriptions: [
        { id: 's-active-1', status: 'active', updated_at: '2024-01-01T00:00:00.000Z' },
        { id: 's-active-2', status: 'active', updated_at: '2024-06-15T00:00:00.000Z' },
        { id: 's-free', status: 'free', updated_at: '2024-06-15T00:00:00.000Z' },
        { id: 's-grace', status: 'grace_period', updated_at: '2024-06-15T00:00:00.000Z' },
        { id: 's-churn-in', status: 'expired', updated_at: '2024-06-12T00:00:00.000Z' }, // churn uvnitř
        { id: 's-churn-out', status: 'expired', updated_at: '2024-05-01T00:00:00.000Z' }, // expired, ale vně období
        { id: 's-deleted-in', status: 'deleted_data', updated_at: '2024-06-28T00:00:00.000Z' }, // churn uvnitř
      ],
      payments: [
        { id: 'p1', status: 'paid', amount_czk: 500, created_at: '2024-06-05T00:00:00.000Z' }, // uvnitř
        { id: 'p2', status: 'paid', amount_czk: 300, created_at: '2024-07-05T00:00:00.000Z' }, // vně
        { id: 'p3', status: 'pending', amount_czk: 999, created_at: '2024-06-05T00:00:00.000Z' }, // nezaplaceno
      ],
    });

    const stats = await computeAdminOverviewStats(supabase, PERIOD);

    // R2.1 — jen 2 registrace v období.
    expect(stats.newRegistrations).toBe(2);
    // R2.2 — aktivní předplatná dle aktuálního stavu (nezávislé na období), 2x active.
    expect(stats.activeSubscriptions).toBe(2);
    // R2.3 — Churn: expired/deleted_data s přechodem v období → 2 (s-churn-in, s-deleted-in).
    expect(stats.churn).toBe(2);
    // R2.4 — rozpad dle aktuálního stavu (partition), deleted_data se nezapočítá.
    expect(stats.businessesByStatus).toEqual({ free: 1, active: 2, grace_period: 1, expired: 2 });
    // R2.5 — tržby jen z paid plateb v období.
    expect(stats.paidRevenueCzk).toBe(500);
  });

  it('změna období přepočítá časově závislé metriky, ale ne aktuálně-stavové (R2.6)', async () => {
    const tables = {
      users: [
        { id: 'u-jul', created_at: '2024-07-10T00:00:00.000Z' },
        { id: 'u-jun', created_at: '2024-06-10T00:00:00.000Z' },
      ],
      subscriptions: [
        { id: 's-active', status: 'active', updated_at: '2024-06-10T00:00:00.000Z' },
        { id: 's-churn-jul', status: 'expired', updated_at: '2024-07-15T00:00:00.000Z' },
      ],
      payments: [
        { id: 'p-jul', status: 'paid', amount_czk: 700, created_at: '2024-07-09T00:00:00.000Z' },
        { id: 'p-jun', status: 'paid', amount_czk: 200, created_at: '2024-06-09T00:00:00.000Z' },
      ],
    };

    const june = await computeAdminOverviewStats(makeFakeSupabase(tables), PERIOD);
    const july = await computeAdminOverviewStats(makeFakeSupabase(tables), {
      from: '2024-07-01T00:00:00.000Z',
      to: '2024-07-31T23:59:59.999Z',
    });

    // Časově závislé metriky se mezi obdobími liší.
    expect(june.newRegistrations).toBe(1);
    expect(july.newRegistrations).toBe(1);
    expect(june.paidRevenueCzk).toBe(200);
    expect(july.paidRevenueCzk).toBe(700);
    expect(june.churn).toBe(0);
    expect(july.churn).toBe(1);

    // Aktuálně-stavové metriky jsou v obou obdobích shodné.
    expect(june.activeSubscriptions).toBe(july.activeSubscriptions);
    expect(june.businessesByStatus).toEqual(july.businessesByStatus);
  });
});
