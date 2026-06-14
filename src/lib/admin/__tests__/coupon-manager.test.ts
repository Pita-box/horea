import { describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  COUPON_MUTATION_MESSAGES,
  createCoupon,
  deactivateCoupon,
  deleteCoupon,
  listCoupons,
  updateCoupon,
  type CouponInput,
} from '@/lib/admin/coupon-manager';

import { makeFakeSupabase, type FakeRow } from './supabase-fake';

/**
 * Unit test CRUD kupónů (task 14.4 — R7.1, R7.4, R7.5, R7.6, R7.7).
 *
 * Atomicita „mutace + auditní záznam" žije v plpgsql funkcích (`admin_create/
 * update/deactivate/delete_coupon`), ne v TS — wrappery jen předávají parametry do
 * RPC a mapují návrat. Reálně testovatelná TS logika je proto:
 *  - **persistence atributů** při vytvoření a úpravě = správné parametry předané do
 *    RPC (vč. ISO konverze `valid_until`),
 *  - **deaktivace** (cesta `is_active=false`) a **smazání** přes dedikované RPC,
 *  - **obsah seznamu** s počtem použití (`used_count`) přes čtecí vrstvu,
 *  - **mapování chyb** na české hlášky (23505→`duplicate_code`, 22023→
 *    `invalid_percent`, prázdný výsledek→`not_found`, jinak→`mutation_failed`).
 *
 * Validaci unikátnosti `code` a rozsahu `percent` jako vlastnost pokrývá PBT 14.3 —
 * zde se testuje pouze CRUD persistence, seznam a mapování návratu. RPC i čtení se
 * mockují (žádná reálná DB), ve stylu `subscription-override` / `grants` testů.
 */

type RpcResponse = { data: unknown; error: { code?: string; message: string } | null };

/** Fake Supabase klient, který zaznamená volání `rpc` a vrátí připravenou odpověď. */
function makeRpcClient(response: RpcResponse) {
  const rpc = vi.fn(async () => response);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

/** Validní vstup kupónu s možností přepsat jednotlivá pole. */
function makeInput(overrides: Partial<CouponInput> = {}): CouponInput {
  return {
    code: 'SLEVA10',
    type: 'percent',
    discountValue: 10,
    validUntil: '2025-12-31T00:00:00.000Z',
    maxUses: 100,
    ...overrides,
  };
}

/** Surový řádek kupónu, jak jej vrací RPC / čtení z `coupons`. */
function couponRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 'c-1',
    code: 'SLEVA10',
    type: 'percent',
    discount_value: 10,
    valid_until: '2025-12-31T00:00:00.000Z',
    max_uses: 100,
    used_count: 0,
    is_active: true,
    ...overrides,
  };
}

describe('listCoupons (R7.4)', () => {
  it('vrátí kupóny s počtem použití seřazené sestupně dle data vytvoření', async () => {
    const supabase = makeFakeSupabase({
      coupons: [
        couponRow({ id: 'c-old', code: 'STARY', used_count: 3, created_at: '2024-01-01T00:00:00.000Z' }),
        couponRow({ id: 'c-new', code: 'NOVY', used_count: 7, created_at: '2024-06-01T00:00:00.000Z' }),
      ],
    });

    const records = await listCoupons(supabase);

    expect(records.map((r) => r.id)).toEqual(['c-new', 'c-old']);
    expect(records.map((r) => r.usedCount)).toEqual([7, 3]);
  });

  it('normalizuje řádek vč. číselného discount_value z textu a is_active', async () => {
    const supabase = makeFakeSupabase({
      coupons: [couponRow({ discount_value: '25', is_active: false, used_count: 4 })],
    });

    const [record] = await listCoupons(supabase);

    expect(record).toEqual({
      id: 'c-1',
      code: 'SLEVA10',
      type: 'percent',
      discountValue: 25,
      validUntil: '2025-12-31T00:00:00.000Z',
      maxUses: 100,
      usedCount: 4,
      isActive: false,
    });
  });

  it('prázdná tabulka → prázdný seznam', async () => {
    const supabase = makeFakeSupabase({ coupons: [] });

    expect(await listCoupons(supabase)).toEqual([]);
  });

  it('chyba čtení → vyhodí výjimku', async () => {
    const supabase = makeFakeSupabase({ coupons: [couponRow()] }, 'coupons');

    await expect(listCoupons(supabase)).rejects.toThrow(/Načtení kupónů selhalo/);
  });
});

describe('createCoupon (R7.1)', () => {
  it('předá actora a atributy kupónu do RPC (valid_until jako ISO) a vrátí vytvořený kupón', async () => {
    const { client, rpc } = makeRpcClient({ data: couponRow(), error: null });

    const result = await createCoupon(client, 'admin-1', makeInput({ validUntil: new Date('2025-12-31T00:00:00.000Z') }));

    expect(rpc).toHaveBeenCalledWith('admin_create_coupon', {
      p_actor_user_id: 'admin-1',
      p_code: 'SLEVA10',
      p_type: 'percent',
      p_discount_value: 10,
      p_valid_until: '2025-12-31T00:00:00.000Z',
      p_max_uses: 100,
    });
    expect(result).toEqual({
      ok: true,
      coupon: {
        id: 'c-1',
        code: 'SLEVA10',
        type: 'percent',
        discountValue: 10,
        validUntil: '2025-12-31T00:00:00.000Z',
        maxUses: 100,
        usedCount: 0,
        isActive: true,
      },
    });
  });

  it('předá null pro valid_until i max_uses (neomezeně)', async () => {
    const { client, rpc } = makeRpcClient({
      data: couponRow({ type: 'comp', discount_value: null, valid_until: null, max_uses: null }),
      error: null,
    });

    await createCoupon(client, 'admin-1', makeInput({ type: 'comp', discountValue: null, validUntil: null, maxUses: null }));

    expect(rpc).toHaveBeenCalledWith('admin_create_coupon', {
      p_actor_user_id: 'admin-1',
      p_code: 'SLEVA10',
      p_type: 'comp',
      p_discount_value: null,
      p_valid_until: null,
      p_max_uses: null,
    });
  });

  it('duplicitní kód (SQLSTATE 23505) → duplicate_code s českou hláškou', async () => {
    const { client } = makeRpcClient({ data: null, error: { code: '23505', message: 'unique_violation' } });

    const result = await createCoupon(client, 'admin-1', makeInput());

    expect(result).toEqual({
      ok: false,
      error: 'duplicate_code',
      message: COUPON_MUTATION_MESSAGES.duplicate_code,
    });
  });

  it('pojistka rozsahu percent z RPC (SQLSTATE 22023) → invalid_percent s českou hláškou', async () => {
    const { client } = makeRpcClient({ data: null, error: { code: '22023', message: 'check_violation' } });

    const result = await createCoupon(client, 'admin-1', makeInput());

    expect(result).toEqual({
      ok: false,
      error: 'invalid_percent',
      message: COUPON_MUTATION_MESSAGES.invalid_percent,
    });
  });

  it('obecná chyba RPC → mutation_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'spojení selhalo' } });

    const result = await createCoupon(client, 'admin-1', makeInput());

    expect(result).toEqual({
      ok: false,
      error: 'mutation_failed',
      message: COUPON_MUTATION_MESSAGES.mutation_failed,
    });
  });

  it('prázdný návrat bez chyby → mutation_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: null });

    const result = await createCoupon(client, 'admin-1', makeInput());

    expect(result).toEqual({
      ok: false,
      error: 'mutation_failed',
      message: COUPON_MUTATION_MESSAGES.mutation_failed,
    });
  });
});

describe('updateCoupon (R7.5)', () => {
  it('předá actora, id a změněné atributy do RPC a vrátí upravený kupón', async () => {
    const { client, rpc } = makeRpcClient({
      data: couponRow({ id: 'c-9', code: 'JARO', discount_value: 30, max_uses: 50 }),
      error: null,
    });

    const result = await updateCoupon(
      client,
      'admin-1',
      'c-9',
      makeInput({ code: 'JARO', discountValue: 30, maxUses: 50 }),
    );

    expect(rpc).toHaveBeenCalledWith('admin_update_coupon', {
      p_actor_user_id: 'admin-1',
      p_coupon_id: 'c-9',
      p_code: 'JARO',
      p_type: 'percent',
      p_discount_value: 30,
      p_valid_until: '2025-12-31T00:00:00.000Z',
      p_max_uses: 50,
    });
    expect(result).toEqual({
      ok: true,
      coupon: {
        id: 'c-9',
        code: 'JARO',
        type: 'percent',
        discountValue: 30,
        validUntil: '2025-12-31T00:00:00.000Z',
        maxUses: 50,
        usedCount: 0,
        isActive: true,
      },
    });
  });

  it('prázdný výsledek → not_found (kupón neexistuje)', async () => {
    const { client } = makeRpcClient({ data: null, error: null });

    const result = await updateCoupon(client, 'admin-1', 'neznamy', makeInput());

    expect(result).toEqual({ ok: false, error: 'not_found', message: COUPON_MUTATION_MESSAGES.not_found });
  });

  it('duplicitní kód při úpravě (23505) → duplicate_code', async () => {
    const { client } = makeRpcClient({ data: null, error: { code: '23505', message: 'unique_violation' } });

    const result = await updateCoupon(client, 'admin-1', 'c-9', makeInput({ code: 'EXISTUJE' }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáváno selhání');
    expect(result.error).toBe('duplicate_code');
  });
});

describe('deactivateCoupon (R7.6)', () => {
  it('předá actora a id do RPC a vrátí kupón s is_active=false', async () => {
    const { client, rpc } = makeRpcClient({
      data: couponRow({ is_active: false, used_count: 12 }),
      error: null,
    });

    const result = await deactivateCoupon(client, 'admin-1', 'c-1');

    expect(rpc).toHaveBeenCalledWith('admin_deactivate_coupon', {
      p_actor_user_id: 'admin-1',
      p_coupon_id: 'c-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('očekáván úspěch');
    expect(result.coupon.isActive).toBe(false);
    // Deaktivace nemaže záznam — počet použití zůstává zachován (R7.6).
    expect(result.coupon.usedCount).toBe(12);
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeRpcClient({ data: [], error: null });

    const result = await deactivateCoupon(client, 'admin-1', 'neznamy');

    expect(result).toEqual({ ok: false, error: 'not_found', message: COUPON_MUTATION_MESSAGES.not_found });
  });

  it('chyba RPC → mutation_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'selhání' } });

    const result = await deactivateCoupon(client, 'admin-1', 'c-1');

    expect(result).toEqual({ ok: false, error: 'mutation_failed', message: COUPON_MUTATION_MESSAGES.mutation_failed });
  });
});

describe('deleteCoupon (R7.7)', () => {
  it('předá actora a id do RPC a vrátí poslední stav smazaného kupónu', async () => {
    const { client, rpc } = makeRpcClient({ data: couponRow({ used_count: 5 }), error: null });

    const result = await deleteCoupon(client, 'admin-1', 'c-1');

    expect(rpc).toHaveBeenCalledWith('admin_delete_coupon', {
      p_actor_user_id: 'admin-1',
      p_coupon_id: 'c-1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('očekáván úspěch');
    expect(result.coupon.id).toBe('c-1');
    expect(result.coupon.usedCount).toBe(5);
  });

  it('prázdný výsledek → not_found', async () => {
    const { client } = makeRpcClient({ data: null, error: null });

    const result = await deleteCoupon(client, 'admin-1', 'neznamy');

    expect(result).toEqual({ ok: false, error: 'not_found', message: COUPON_MUTATION_MESSAGES.not_found });
  });

  it('chyba RPC → mutation_failed', async () => {
    const { client } = makeRpcClient({ data: null, error: { message: 'selhání' } });

    const result = await deleteCoupon(client, 'admin-1', 'c-1');

    expect(result).toEqual({ ok: false, error: 'mutation_failed', message: COUPON_MUTATION_MESSAGES.mutation_failed });
  });
});
