import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createCoupon } from '@/lib/admin/coupon-manager';
import type { CouponType } from '@/lib/coupons/validate';

/**
 * Feature: admin-dashboard, Property 4: Validace kupónu.
 *
 * Validace hodnoty u typu `percent` (R7.3) žije v `createCoupon` PŘED voláním
 * RPC: pro `percent` mimo rozsah 0–100 (nebo `null`) vrátí `invalid_percent` a
 * RPC se vůbec nevolá. Pro ostatní typy (`fixed`/`free_trial_days`/`comp`) se
 * rozsahové omezení neuplatní. Unikátnost `code` (R7.2) vynucuje DB unique
 * constraint — duplicitní kód se z RPC chyby (SQLSTATE 23505) mapuje na
 * `duplicate_code`.
 *
 * Test cílí na čistou rozhodovací logiku `createCoupon` nad řízeným mockem
 * Supabase klienta. Množina existujících kódů je modelována deklarativně
 * (nezávislý oracle), takže srovnání není tautologické: ověřujeme, že
 *
 *   úspěch ⟺ (typ `percent` ⟹ 0 ≤ value ≤ 100) ∧ kód není duplicitní.
 *
 * Skutečnou atomicitu „mutace + audit" a unikátnost na úrovni DB ověřují
 * integrační testy; zde jde o validační kontrakt na hranici TypeScriptu.
 *
 * Validates: Requirements 7.2, 7.3
 */

const NUM_RUNS = 200;

/** Malý pool kódů, aby kolize proti existující množině nastávaly často. */
const CODE_POOL = ['SLEVA10', 'LETO', 'VIP', 'TEST', 'PROMO'] as const;

const couponTypeArb = fc.constantFrom<CouponType>('percent', 'fixed', 'free_trial_days', 'comp');

/** Hodnota slevy se silným zastoupením hranic 0/100 i hodnot mimo rozsah. */
const discountValueArb: fc.Arbitrary<number | null> = fc.oneof(
  fc.constantFrom(0, 100, 1, 50, 99, 101, 150, -1, -50),
  fc.integer({ min: -50, max: 200 }),
  fc.constant<number | null>(null),
);

type Scenario = {
  type: CouponType;
  discountValue: number | null;
  code: string;
  existing: string[];
};

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  type: couponTypeArb,
  discountValue: discountValueArb,
  code: fc.constantFrom(...CODE_POOL),
  existing: fc.uniqueArray(fc.constantFrom(...CODE_POOL)),
});

/**
 * Nezávislý oracle pravidla R7.3 — záměrně reformulovaný (ne sdílí kód s
 * implementací): pro `percent` je hodnota validní právě v rozsahu 0–100 včetně
 * a nesmí být `null`; ostatní typy bez omezení.
 */
function percentValueValidOracle(type: CouponType, value: number | null): boolean {
  if (type !== 'percent') {
    return true;
  }
  return value !== null && value >= 0 && value <= 100;
}

/**
 * Řízený mock Supabase klienta: RPC `admin_create_coupon` modeluje DB unique
 * constraint — pokud kód existuje v modelované množině, vrátí chybu 23505;
 * jinak vrátí vložený řádek. Zaznamenává, zda bylo RPC vůbec voláno.
 */
function buildSupabaseMock(existingCodes: ReadonlySet<string>): {
  client: SupabaseClient;
  wasRpcCalled: () => boolean;
} {
  let rpcCalled = false;

  const client = {
    rpc(_fn: string, params: Record<string, unknown>) {
      rpcCalled = true;
      const code = params.p_code as string;
      if (existingCodes.has(code)) {
        return Promise.resolve({ data: null, error: { code: '23505', message: 'unique' } });
      }
      const row = {
        id: 'generated-id',
        code,
        type: params.p_type as CouponType,
        discount_value: params.p_discount_value as number | null,
        valid_until: params.p_valid_until as string | null,
        max_uses: params.p_max_uses as number | null,
        used_count: 0,
        is_active: true,
      };
      return Promise.resolve({ data: [row], error: null });
    },
  } as unknown as SupabaseClient;

  return { client, wasRpcCalled: () => rpcCalled };
}

describe('Property 4: validace kupónu', () => {
  it('úspěch ⟺ percent v rozsahu 0–100 ∧ kód není duplicitní', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const existing = new Set(scenario.existing);
        const { client, wasRpcCalled } = buildSupabaseMock(existing);

        const result = await createCoupon(client, 'admin-1', {
          code: scenario.code,
          type: scenario.type,
          discountValue: scenario.discountValue,
          validUntil: null,
          maxUses: null,
        });

        const percentOk = percentValueValidOracle(scenario.type, scenario.discountValue);
        const isDuplicate = existing.has(scenario.code);
        const expectedOk = percentOk && !isDuplicate;

        expect(result.ok).toBe(expectedOk);

        if (!percentOk) {
          // Neplatný percent → odmítnuto PŘED RPC (R7.3); RPC se nevolá.
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toBe('invalid_percent');
          }
          expect(wasRpcCalled()).toBe(false);
          return;
        }

        // Validní percent / ostatní typy → RPC proběhne; rozhodne duplicita kódu.
        expect(wasRpcCalled()).toBe(true);
        if (isDuplicate) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error).toBe('duplicate_code');
          }
        } else {
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.coupon.code).toBe(scenario.code);
            // Uložený percent kupón má hodnotu v rozsahu 0–100 (R7.3).
            if (result.coupon.type === 'percent') {
              expect(result.coupon.discountValue).not.toBeNull();
              expect(result.coupon.discountValue as number).toBeGreaterThanOrEqual(0);
              expect(result.coupon.discountValue as number).toBeLessThanOrEqual(100);
            }
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('hranice percent: 0 a 100 jsou validní, -1 a 101 jsou odmítnuty', async () => {
    const cases: ReadonlyArray<{ value: number; valid: boolean }> = [
      { value: 0, valid: true },
      { value: 100, valid: true },
      { value: -1, valid: false },
      { value: 101, valid: false },
    ];

    for (const { value, valid } of cases) {
      const { client } = buildSupabaseMock(new Set());
      const result = await createCoupon(client, 'admin-1', {
        code: 'UNIQUE',
        type: 'percent',
        discountValue: value,
        validUntil: null,
        maxUses: null,
      });
      expect(result.ok).toBe(valid);
      if (!valid && !result.ok) {
        expect(result.error).toBe('invalid_percent');
      }
    }
  });
});
