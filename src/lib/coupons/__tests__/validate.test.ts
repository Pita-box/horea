import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  COUPON_ERROR_MESSAGES,
  validateCoupon,
  validateCouponByCode,
  type CouponRecord,
} from '@/lib/coupons/validate';

/**
 * Unit test validace kupónu (task 7.2 — R9.1, R9.2).
 *
 * Ověřuje čistou validaci {@link validateCoupon} i orchestraci nad DB čtením
 * {@link validateCouponByCode}: neexistující / expirovaný / vyčerpaný kupón
 * vrací správný `reason` a českou hlášku; platný kupón projde. DB se nedotýkáme
 * — Supabase klient je nahrazen jednoduchým fakem (čtení jednoho řádku).
 */

const NOW = '2025-06-15T12:00:00.000Z';

/** Sestaví validní záznam kupónu s možností přepsat jednotlivá pole. */
function makeCoupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'coupon-1',
    code: 'SLEVA10',
    type: 'percent',
    discount_value: 10,
    valid_until: null,
    max_uses: null,
    used_count: 0,
    ...overrides,
  };
}

/** Fake Supabase klient, jehož `.from().select().eq().maybeSingle()` vrátí daný řádek. */
function fakeSupabase(row: CouponRecord | null, error: unknown = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe('validateCoupon — čistá validace (R9.1, R9.2)', () => {
  it('neexistující kupón → reason "not_found" + česká hláška', () => {
    const result = validateCoupon(null, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáván neplatný kupón');
    expect(result.reason).toBe('not_found');
    expect(result.message).toBe('Zadaný kupón neexistuje.');
    expect(result.message).toBe(COUPON_ERROR_MESSAGES.not_found);
  });

  it('expirovaný kupón (valid_until < now) → reason "expired" + česká hláška', () => {
    const coupon = makeCoupon({ valid_until: '2025-06-15T11:59:59.000Z' });

    const result = validateCoupon(coupon, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáván neplatný kupón');
    expect(result.reason).toBe('expired');
    expect(result.message).toBe('Platnost kupónu vypršela.');
  });

  it('vyčerpaný kupón (used_count >= max_uses) → reason "exhausted" + česká hláška', () => {
    const coupon = makeCoupon({ max_uses: 5, used_count: 5 });

    const result = validateCoupon(coupon, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáván neplatný kupón');
    expect(result.reason).toBe('exhausted');
    expect(result.message).toBe('Kupón již byl vyčerpán.');
  });

  it('platný kupón → ok s vráceným záznamem', () => {
    const coupon = makeCoupon({ valid_until: '2025-12-31T00:00:00.000Z', max_uses: 5, used_count: 2 });

    const result = validateCoupon(coupon, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('očekáván platný kupón');
    expect(result.coupon).toEqual(coupon);
  });

  it('null valid_until i null max_uses znamenají neomezenou platnost a počet použití', () => {
    const result = validateCoupon(makeCoupon({ valid_until: null, max_uses: null, used_count: 999 }), NOW);

    expect(result.ok).toBe(true);
  });

  it('platnost přesně v okamžiku "now" ještě platí (valid_until == now)', () => {
    const result = validateCoupon(makeCoupon({ valid_until: NOW }), NOW);

    expect(result.ok).toBe(true);
  });
});

describe('validateCouponByCode — orchestrace čtení + validace', () => {
  it('neexistující kód (DB vrátí null) → not_found', async () => {
    const result = await validateCouponByCode(fakeSupabase(null), 'NEEXISTUJE', NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáván neplatný kupón');
    expect(result.reason).toBe('not_found');
  });

  it('načtený platný kupón projde', async () => {
    const coupon = makeCoupon({ code: 'SLEVA10' });

    const result = await validateCouponByCode(fakeSupabase(coupon), 'SLEVA10', NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('očekáván platný kupón');
    expect(result.coupon.code).toBe('SLEVA10');
  });

  it('načtený expirovaný kupón → expired', async () => {
    const coupon = makeCoupon({ valid_until: '2020-01-01T00:00:00.000Z' });

    const result = await validateCouponByCode(fakeSupabase(coupon), 'STARY', NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáván neplatný kupón');
    expect(result.reason).toBe('expired');
  });
});
