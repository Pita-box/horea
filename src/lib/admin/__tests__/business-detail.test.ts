import { describe, expect, it } from 'vitest';

import { getBusinessDetail } from '@/lib/admin/business-manager';

import { makeFakeSupabase, type FakeRow } from './supabase-fake';

/**
 * Unit test detailu podniku (task 8.3 — R4.1, R4.2, R4.3, R4.4).
 *
 * Ověřuje:
 *  - profil podniku + údaje vlastníka: e-mail a datum registrace (R4.1),
 *  - aktuální stav, tarif a `current_period_end` předplatného (R4.2),
 *  - historii plateb (částka, stav, metoda, VS, datum) seřazenou sestupně dle data (R4.3),
 *  - celkový počet rezervací (R4.4),
 *  - neexistující podnik → `null`.
 */

const BUSINESS_ROW: FakeRow = {
  id: 'b-1',
  name: 'Kadeřnictví Lucie',
  slug: 'lucie-hair',
  type: 'hair',
  description: 'Moderní salon',
  is_published: true,
  created_at: '2024-06-20T00:00:00.000Z',
  users: { email: 'lucie@firma.cz', created_at: '2024-01-10T00:00:00.000Z' },
  subscriptions: { status: 'active', plan: 'pokrocily', current_period_end: '2024-12-31T00:00:00.000Z' },
  payments: [
    { id: 'p-old', amount_czk: 200, status: 'paid', method: 'qr_manual', variable_symbol: '111', created_at: '2024-03-01T00:00:00.000Z' },
    { id: 'p-new', amount_czk: '300', status: 'paid', method: 'auto_charge', variable_symbol: '222', created_at: '2024-09-01T00:00:00.000Z' },
  ],
};

function makeSupabase() {
  return makeFakeSupabase({
    businesses: [BUSINESS_ROW],
    reservations: [
      { id: 'r-1', business_id: 'b-1' },
      { id: 'r-2', business_id: 'b-1' },
      { id: 'r-3', business_id: 'b-1' },
      { id: 'r-other', business_id: 'b-2' },
    ],
  });
}

describe('getBusinessDetail (R4.1–R4.4)', () => {
  it('vrací profil podniku a vlastníka (R4.1)', async () => {
    const detail = await getBusinessDetail(makeSupabase(), 'b-1');

    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      id: 'b-1',
      name: 'Kadeřnictví Lucie',
      slug: 'lucie-hair',
      type: 'hair',
      isPublished: true,
      registeredAt: '2024-06-20T00:00:00.000Z',
    });
    expect(detail?.owner).toEqual({
      email: 'lucie@firma.cz',
      registeredAt: '2024-01-10T00:00:00.000Z',
    });
  });

  it('vrací aktuální stav, tarif a current_period_end (R4.2)', async () => {
    const detail = await getBusinessDetail(makeSupabase(), 'b-1');
    expect(detail?.subscription).toEqual({
      status: 'active',
      plan: 'pokrocily',
      currentPeriodEnd: '2024-12-31T00:00:00.000Z',
    });
  });

  it('vrací historii plateb seřazenou sestupně dle data, s úplnými poli (R4.3)', async () => {
    const detail = await getBusinessDetail(makeSupabase(), 'b-1');

    expect(detail?.payments.map((p) => p.id)).toEqual(['p-new', 'p-old']);
    expect(detail?.payments[0]).toEqual({
      id: 'p-new',
      amountCzk: 300,
      status: 'paid',
      method: 'auto_charge',
      variableSymbol: '222',
      createdAt: '2024-09-01T00:00:00.000Z',
    });
  });

  it('vrací celkový počet rezervací podniku (R4.4)', async () => {
    const detail = await getBusinessDetail(makeSupabase(), 'b-1');
    expect(detail?.totalReservations).toBe(3);
  });

  it('neexistující podnik → null', async () => {
    const detail = await getBusinessDetail(makeSupabase(), 'neznamy-id');
    expect(detail).toBeNull();
  });
});
