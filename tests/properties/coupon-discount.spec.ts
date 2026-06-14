import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { computeChargedAmountCzk } from '@/lib/coupons/apply';
import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import type { CouponType } from '@/lib/coupons/validate';

/**
 * Feature: subscription-payments, Property 7: Korektnost slevy kupónu.
 *
 * `computeChargedAmountCzk(plan, coupon)` je čistá funkce výpočtu účtované
 * částky první platby po aplikaci kupónu (R9.3, R9.4). Pro libovolný tarif
 * (199/299/599 Kč) a libovolný typ/velikost slevy — včetně hranic 0 % a 100 %
 * a fixní slevy ≥ cena (floor 0) — platí:
 *
 *  - účtovaná částka je **vždy ≥ 0 Kč** (floor na 0, nikdy záporná),
 *  - `percent`: `base × (1 − clamp(procento, 0, 100) / 100)`, zaokrouhleno,
 *  - `fixed`: `base − max(0, sleva)`, floor 0, zaokrouhleno,
 *  - `free_trial_days` / `comp`: aktivační kupóny nestrhávají platbu ⇒ `0`.
 *
 * Generátor cíleně varíruje hranice procent (0, 100, mimo rozsah pro test
 * clampu) i fixní slevy (0, přesně cena, nad cenu, záporná). Očekávanou hodnotu
 * počítá NEZÁVISLÝ oracle (jiná cesta než implementace), takže test ověřuje
 * korektnost výpočtu, ne tautologii.
 *
 * Validates: Requirements 9.3, 9.4
 */

const NUM_RUNS = 200;

const PLANS = ['start', 'pokrocily', 'max'] as const;

const planArb = fc.constantFrom<SubscriptionPlan>(...PLANS);

/**
 * Nezávislý oracle účtované částky — deklarativní reformulace pravidel R9.3/R9.4,
 * záměrně napsaná jinak než implementace (žádné sdílené volání), aby srovnání
 * nebylo tautologické.
 */
function expectedAmount(plan: SubscriptionPlan, type: CouponType, value: number): number {
  const base = planPriceCzk(plan);

  if (type === 'free_trial_days' || type === 'comp') {
    return 0;
  }

  if (type === 'percent') {
    const percent = Math.min(100, Math.max(0, value));
    const charged = Math.round(base * ((100 - percent) / 100));
    return charged < 0 ? 0 : charged;
  }

  // fixed
  const discount = value < 0 ? 0 : value;
  const charged = Math.round(base - discount);
  return charged < 0 ? 0 : charged;
}

/** Hodnota slevy se silným zastoupením hranic dle typu kupónu. */
function discountValueArb(type: CouponType): fc.Arbitrary<number> {
  if (type === 'percent') {
    return fc.oneof(
      // Přesné hranice 0 % a 100 % + těsné okolí, plus hodnoty mimo rozsah
      // (záporné / > 100) pro ověření clampu.
      fc.constantFrom(0, 1, 50, 99, 100, 101, 150, -10),
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: -50, max: 200 }),
    );
  }

  if (type === 'fixed') {
    return fc.oneof(
      // 0, malé částky, přesně/nad cenu tarifu (floor 0), záporná hodnota.
      fc.constantFrom(0, 1, 100, 199, 299, 599, 600, 1000, -50),
      fc.integer({ min: 0, max: 2000 }),
      fc.integer({ min: -100, max: 2000 }),
    );
  }

  // Aktivační kupóny: discount_value se nepoužívá k výpočtu částky.
  return fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 365 }));
}

const couponTypeArb = fc.constantFrom<CouponType>('percent', 'fixed', 'free_trial_days', 'comp');

describe('Property 7: korektnost slevy kupónu', () => {
  it('účtovaná částka je vždy ≥ 0 a odpovídá nezávislému oracle', () => {
    fc.assert(
      fc.property(
        planArb,
        couponTypeArb.chain((type) =>
          discountValueArb(type).map((discount_value) => ({ type, discount_value })),
        ),
        (plan, coupon) => {
          const charged = computeChargedAmountCzk(plan, coupon);

          // (a) Floor na 0 — nikdy záporná částka (Property 7, R9.4).
          expect(charged).toBeGreaterThanOrEqual(0);

          // (b) Korektní výpočet vůči nezávislému oracle (R9.3, R9.4).
          expect(charged).toBe(expectedAmount(plan, coupon.type, coupon.discount_value));

          // (c) Účtovaná částka nikdy nepřesáhne základní cenu tarifu.
          expect(charged).toBeLessThanOrEqual(planPriceCzk(plan));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('hranice procentuální slevy: 0 % ⇒ plná cena, 100 % ⇒ 0 Kč', () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        expect(computeChargedAmountCzk(plan, { type: 'percent', discount_value: 0 })).toBe(
          planPriceCzk(plan),
        );
        expect(computeChargedAmountCzk(plan, { type: 'percent', discount_value: 100 })).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('fixní sleva ≥ cena tarifu ⇒ floor 0 Kč', () => {
    fc.assert(
      fc.property(
        planArb,
        fc.integer({ min: 0, max: 5000 }),
        (plan, extra) => {
          const discount_value = planPriceCzk(plan) + extra;
          expect(computeChargedAmountCzk(plan, { type: 'fixed', discount_value })).toBe(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('aktivační kupóny (free_trial_days / comp) ⇒ 0 Kč', () => {
    fc.assert(
      fc.property(
        planArb,
        fc.constantFrom<CouponType>('free_trial_days', 'comp'),
        fc.integer({ min: 0, max: 365 }),
        (plan, type, discount_value) => {
          expect(computeChargedAmountCzk(plan, { type, discount_value })).toBe(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
