import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Validace a aplikace kupónu při checkoutu.
 *
 * Kupón se zde pouze *aplikuje* — ověří se existence, platnost (datum
 * `valid_until`) a dostupný počet použití (`used_count < max_uses`), a při
 * aplikaci se inkrementuje `used_count`. CRUD kupónů (vytváření/editace/mazání)
 * je mimo rozsah této feature (spec `admin-dashboard`). Viz design.md, sekce
 * *Aplikace kupónu*, a Requirements 9.1, 9.2.
 *
 * Čistá validační logika ({@link validateCoupon}) je oddělena od DB čtení
 * ({@link loadCouponByCode}) a zápisu ({@link incrementCouponUsage}), aby šla
 * testovat bez databáze.
 */

/** Typ kupónu (DB enum `coupon_type`). */
export type CouponType = 'percent' | 'fixed' | 'free_trial_days' | 'comp';

/** Záznam kupónu načtený z tabulky `coupons` (relevantní sloupce). */
export interface CouponRecord {
  id: string;
  code: string;
  type: CouponType;
  discount_value: number | null;
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
}

/** Důvod neplatnosti kupónu. */
export type CouponInvalidReason = 'not_found' | 'expired' | 'exhausted';

/** České chybové hlášky pro neplatný kupón (R9.2). */
export const COUPON_ERROR_MESSAGES: Record<CouponInvalidReason, string> = {
  not_found: 'Zadaný kupón neexistuje.',
  expired: 'Platnost kupónu vypršela.',
  exhausted: 'Kupón již byl vyčerpán.',
};

export type CouponValidationResult =
  | { ok: true; coupon: CouponRecord }
  | { ok: false; reason: CouponInvalidReason; message: string };

function invalid(reason: CouponInvalidReason): CouponValidationResult {
  return { ok: false, reason, message: COUPON_ERROR_MESSAGES[reason] };
}

function toMillis(value: Date | string): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Neplatné datum pro validaci kupónu: "${String(value)}".`);
  }
  return ms;
}

/**
 * Čistá validace kupónu vůči aktuálnímu času (R9.1, R9.2).
 *
 * Kupón je neplatný, pokud: neexistuje (`null`), je po platnosti
 * (`valid_until < now`), nebo nemá dostupné použití (`used_count >= max_uses`).
 * `valid_until = null` znamená neomezenou platnost; `max_uses = null` znamená
 * neomezený počet použití.
 *
 * @param coupon Načtený záznam kupónu, nebo `null` pokud kód neexistuje.
 * @param now Aktuální okamžik pro kontrolu platnosti.
 */
export function validateCoupon(
  coupon: CouponRecord | null,
  now: Date | string,
): CouponValidationResult {
  if (!coupon) {
    return invalid('not_found');
  }

  if (coupon.valid_until !== null && toMillis(coupon.valid_until) < toMillis(now)) {
    return invalid('expired');
  }

  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return invalid('exhausted');
  }

  return { ok: true, coupon };
}

/**
 * Načte kupón podle kódu (DB čtení, read-only).
 *
 * @returns Záznam kupónu, nebo `null` pokud kód neexistuje / čtení selže.
 */
export async function loadCouponByCode(
  supabase: SupabaseClient,
  code: string,
): Promise<CouponRecord | null> {
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, type, discount_value, valid_until, max_uses, used_count')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CouponRecord;
}

/**
 * Načte a zvaliduje kupón podle kódu (orchestrace čtení + čisté validace).
 */
export async function validateCouponByCode(
  supabase: SupabaseClient,
  code: string,
  now: Date | string,
): Promise<CouponValidationResult> {
  const coupon = await loadCouponByCode(supabase, code);
  return validateCoupon(coupon, now);
}

export type IncrementCouponUsageResult =
  | { ok: true; usedCount: number }
  | { ok: false; error: 'exhausted' | 'write_failed' };

/**
 * Inkrementuje `used_count` kupónu při jeho aplikaci.
 *
 * Používá optimistický zámek (`eq('used_count', …)`): zápis projde jen pokud se
 * `used_count` mezitím nezměnil, takže souběžné aplikace nemohou vyčerpat kupón
 * vícekrát, než dovoluje `max_uses`. DB check constraint
 * `coupons_used_count_within_max` slouží jako poslední pojistka. Konflikt nebo
 * porušení limitu se mapuje na `exhausted`.
 *
 * @param coupon Kupón ve stavu, v jakém byl naposledy přečten/zvalidován.
 */
export async function incrementCouponUsage(
  supabase: SupabaseClient,
  coupon: CouponRecord,
): Promise<IncrementCouponUsageResult> {
  const nextUsedCount = coupon.used_count + 1;

  const { data, error } = await supabase
    .from('coupons')
    .update({ used_count: nextUsedCount })
    .eq('id', coupon.id)
    .eq('used_count', coupon.used_count)
    .select('id');

  if (error) {
    // 23514 = check constraint violation (used_count <= max_uses) → kupón vyčerpán.
    if (error.code === '23514') {
      return { ok: false, error: 'exhausted' };
    }
    return { ok: false, error: 'write_failed' };
  }

  // Žádný dotčený řádek = optimistický zámek selhal (souběžná aplikace) → vyčerpáno.
  if (!data || data.length === 0) {
    return { ok: false, error: 'exhausted' };
  }

  return { ok: true, usedCount: nextUsedCount };
}
