import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  listPendingPayments,
  matchPayment,
  searchPendingPaymentsByVariableSymbol,
} from '@/lib/admin/payment-matcher';

import { makeFakeSupabase, type FakeRow, type FakeTables } from './supabase-fake';

/**
 * Unit test ručního párování plateb (task 15.3 — R8.1, R8.2, R8.4).
 *
 * Ověřuje:
 *  - obsah řádku čekající platby (VS, částka, podnik, název, datum) a filtr
 *    `pending` + `qr_manual` se sestupným řazením dle data (R8.1),
 *  - vyhledání čekající platby podle variabilního symbolu (R8.2),
 *  - `matchPayment` deleguje na RPC `admin_match_payment`; edge-case selhání
 *    (`error`) → `match_failed` (platba zůstává pending, R8.4); prázdný výsledek
 *    → `not_found`.
 *
 * Čtení používá sdílený fake (`from`), spárování mockuje `rpc` (žádná reálná DB).
 */

const PENDING_NEW: FakeRow = {
  id: 'p-new',
  variable_symbol: '202401',
  amount_czk: 300,
  business_id: 'b-1',
  created_at: '2024-09-01T00:00:00.000Z',
  status: 'pending',
  method: 'qr_manual',
  businesses: { name: 'Kadeřnictví Lucie' },
};

const PENDING_OLD: FakeRow = {
  id: 'p-old',
  variable_symbol: '202402',
  amount_czk: '450',
  business_id: 'b-2',
  created_at: '2024-03-01T00:00:00.000Z',
  status: 'pending',
  method: 'qr_manual',
  businesses: { name: 'Studio Klára' },
};

/** Platba, která NEodpovídá filtru (paid / jiná metoda) — nesmí se objevit. */
const PAID_AUTO: FakeRow = {
  id: 'p-paid',
  variable_symbol: '202403',
  amount_czk: 200,
  business_id: 'b-3',
  created_at: '2024-10-01T00:00:00.000Z',
  status: 'paid',
  method: 'auto_charge',
  businesses: { name: 'Salon Eva' },
};

function makeReadClient(rows: FakeRow[] = [PENDING_NEW, PENDING_OLD, PAID_AUTO]): SupabaseClient {
  const tables: FakeTables = { payments: rows };
  return makeFakeSupabase(tables);
}

type RpcResponse = { data: unknown; error: { message: string } | null };

function makeMatchClient(response: RpcResponse) {
  const rpc = vi.fn(async () => response);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('listPendingPayments (R8.1)', () => {
  it('vrací jen pending + qr_manual platby seřazené sestupně dle data', async () => {
    const result = await listPendingPayments(makeReadClient());

    expect(result.map((p) => p.id)).toEqual(['p-new', 'p-old']);
  });

  it('normalizuje obsah řádku (VS, částka, podnik, název, datum)', async () => {
    const result = await listPendingPayments(makeReadClient());

    expect(result[0]).toEqual({
      id: 'p-new',
      variableSymbol: '202401',
      amountCzk: 300,
      businessId: 'b-1',
      businessName: 'Kadeřnictví Lucie',
      createdAt: '2024-09-01T00:00:00.000Z',
    });
    // amount_czk uložený jako string se převede na číslo.
    expect(result[1].amountCzk).toBe(450);
  });

  it('prázdný seznam, když žádná čekající platba neexistuje', async () => {
    const result = await listPendingPayments(makeReadClient([PAID_AUTO]));
    expect(result).toEqual([]);
  });
});

describe('searchPendingPaymentsByVariableSymbol (R8.2)', () => {
  it('vrací jen čekající platby s odpovídajícím variabilním symbolem', async () => {
    const result = await searchPendingPaymentsByVariableSymbol(makeReadClient(), '202402');

    expect(result.map((p) => p.id)).toEqual(['p-old']);
    expect(result[0].variableSymbol).toBe('202402');
  });

  it('neshoda VS → prázdný seznam', async () => {
    const result = await searchPendingPaymentsByVariableSymbol(makeReadClient(), '999999');
    expect(result).toEqual([]);
  });
});

describe('matchPayment (R8.3, R8.4)', () => {
  it('deleguje na RPC admin_match_payment s actorem a platbou', async () => {
    const { client, rpc } = makeMatchClient({
      data: { payment_id: 'p-new', subscription_id: 's-1', business_id: 'b-1', current_period_end: '2025-01-01T00:00:00.000Z' },
      error: null,
    });

    await matchPayment(client, { actorUserId: 'admin-1', paymentId: 'p-new' });

    expect(rpc).toHaveBeenCalledWith('admin_match_payment', {
      p_actor_user_id: 'admin-1',
      p_payment_id: 'p-new',
    });
  });

  it('úspěch → ok s novým koncem období', async () => {
    const { client } = makeMatchClient({
      data: [{ payment_id: 'p-new', subscription_id: 's-1', business_id: 'b-1', current_period_end: '2025-01-01T00:00:00.000Z' }],
      error: null,
    });

    const result = await matchPayment(client, { actorUserId: 'admin-1', paymentId: 'p-new' });

    expect(result).toEqual({
      ok: true,
      paymentId: 'p-new',
      subscriptionId: 's-1',
      businessId: 'b-1',
      currentPeriodEnd: '2025-01-01T00:00:00.000Z',
    });
  });

  it('edge-case: selhání nastavení paid → match_failed (platba zůstává pending)', async () => {
    const { client } = makeMatchClient({ data: null, error: { message: 'nelze nastavit paid' } });

    const result = await matchPayment(client, { actorUserId: 'admin-1', paymentId: 'p-new' });

    expect(result).toEqual({ ok: false, error: 'match_failed' });
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeMatchClient({ data: [], error: null });

    const result = await matchPayment(client, { actorUserId: 'admin-1', paymentId: 'neznama' });

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});
