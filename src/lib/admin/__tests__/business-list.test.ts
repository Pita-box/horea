import { describe, expect, it } from 'vitest';

import {
  applyBusinessFilters,
  listBusinesses,
  matchesBusinessFilters,
  type AdminBusinessListItem,
} from '@/lib/admin/business-manager';

import { makeFakeSupabase, type FakeRow } from './supabase-fake';

/**
 * Unit test seznamu a filtrů podniků (task 7.3 — R3.1, R3.2, R3.3, R3.4, R3.5).
 *
 * Ověřuje:
 *  - obsah položky: název, slug, stav předplatného, tarif, e-mail vlastníka (R3.1),
 *  - filtr dle stavu předplatného (R3.2),
 *  - filtr dle data registrace (R3.3),
 *  - fulltext nad e-mailem vlastníka / názvem / slugem (R3.4),
 *  - prázdný stav: žádná shoda → prázdný seznam (R3.5).
 *
 * Čisté funkce {@link matchesBusinessFilters}/{@link applyBusinessFilters} se testují
 * přímo; {@link listBusinesses} přes fake Supabase s vloženými relacemi.
 */

function item(overrides: Partial<AdminBusinessListItem> & { id: string }): AdminBusinessListItem {
  return {
    name: 'Salon',
    slug: 'salon',
    ownerEmail: 'owner@example.com',
    registeredAt: '2024-06-15T00:00:00.000Z',
    subscriptionStatus: 'active',
    subscriptionPlan: 'start',
    ...overrides,
  };
}

describe('matchesBusinessFilters — čistá funkce (R3.2, R3.3, R3.4)', () => {
  it('bez filtrů odpovídá vše', () => {
    expect(matchesBusinessFilters(item({ id: '1' }), {})).toBe(true);
  });

  it('filtr stavu předplatného (R3.2)', () => {
    expect(matchesBusinessFilters(item({ id: '1', subscriptionStatus: 'expired' }), { status: 'active' })).toBe(false);
    expect(matchesBusinessFilters(item({ id: '1', subscriptionStatus: 'active' }), { status: 'active' })).toBe(true);
  });

  it('filtr rozsahu data registrace včetně hranic (R3.3)', () => {
    const it1 = item({ id: '1', registeredAt: '2024-06-15T00:00:00.000Z' });
    expect(matchesBusinessFilters(it1, { registeredFrom: '2024-06-01', registeredTo: '2024-06-30' })).toBe(true);
    expect(matchesBusinessFilters(it1, { registeredFrom: '2024-07-01' })).toBe(false);
    expect(matchesBusinessFilters(it1, { registeredTo: '2024-06-01' })).toBe(false);
  });

  it('fulltext nad e-mailem vlastníka, názvem a slugem, case-insensitive (R3.4)', () => {
    const it1 = item({ id: '1', name: 'Kadeřnictví Lucie', slug: 'lucie-hair', ownerEmail: 'lucie@firma.cz' });
    expect(matchesBusinessFilters(it1, { search: 'lucie' })).toBe(true);
    expect(matchesBusinessFilters(it1, { search: 'HAIR' })).toBe(true);
    expect(matchesBusinessFilters(it1, { search: 'firma.cz' })).toBe(true);
    expect(matchesBusinessFilters(it1, { search: 'neexistuje' })).toBe(false);
  });
});

describe('applyBusinessFilters — kombinace filtrů', () => {
  it('aplikuje stav i fulltext zároveň', () => {
    const items = [
      item({ id: '1', name: 'Alfa', subscriptionStatus: 'active' }),
      item({ id: '2', name: 'Beta', subscriptionStatus: 'expired' }),
      item({ id: '3', name: 'Alfa Beta', subscriptionStatus: 'active' }),
    ];
    const result = applyBusinessFilters(items, { status: 'active', search: 'beta' });
    expect(result.map((i) => i.id)).toEqual(['3']);
  });
});

describe('listBusinesses (R3.1, R3.5)', () => {
  const rows: FakeRow[] = [
    {
      id: 'b-1',
      name: 'Kadeřnictví Lucie',
      slug: 'lucie-hair',
      created_at: '2024-06-20T00:00:00.000Z',
      users: { email: 'lucie@firma.cz' },
      subscriptions: { status: 'active', plan: 'pokrocily' },
    },
    {
      id: 'b-2',
      name: 'Masáže Petr',
      slug: 'petr-masaze',
      created_at: '2024-05-01T00:00:00.000Z',
      users: [{ email: 'petr@firma.cz' }],
      subscriptions: [{ status: 'expired', plan: 'start' }],
    },
  ];

  it('vrací položky s názvem, slugem, stavem, tarifem a e-mailem vlastníka (R3.1)', async () => {
    const supabase = makeFakeSupabase({ businesses: rows });
    const result = await listBusinesses(supabase);

    expect(result).toHaveLength(2);
    const lucie = result.find((b) => b.id === 'b-1');
    expect(lucie).toMatchObject({
      name: 'Kadeřnictví Lucie',
      slug: 'lucie-hair',
      ownerEmail: 'lucie@firma.cz',
      subscriptionStatus: 'active',
      subscriptionPlan: 'pokrocily',
    });
  });

  it('aplikuje filtr stavu (R3.2)', async () => {
    const supabase = makeFakeSupabase({ businesses: rows });
    const result = await listBusinesses(supabase, { status: 'expired' });
    expect(result.map((b) => b.id)).toEqual(['b-2']);
  });

  it('žádná shoda → prázdný seznam (R3.5)', async () => {
    const supabase = makeFakeSupabase({ businesses: rows });
    const result = await listBusinesses(supabase, { search: 'neexistujici-podnik' });
    expect(result).toEqual([]);
  });

  it('propaguje chybu čtení jako výjimku', async () => {
    const supabase = makeFakeSupabase({ businesses: rows }, 'businesses');
    await expect(listBusinesses(supabase)).rejects.toThrow(/Načtení seznamu podniků selhalo/);
  });
});
