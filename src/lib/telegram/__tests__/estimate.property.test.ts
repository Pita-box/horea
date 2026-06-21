import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';
import { estimateNextMonthRevenueCzk, type EstimateSubscriptionRow } from '../estimate';

// Feature: telegram-operator-notifications, Property 4: Odhad odpovídá ceníku a je nezáporný
// Validates: Requirements 10.2, 10.3, 10.4, 13.2, 13.4

/** Platné hodnoty tarifu (DB enum `subscription_plan`). */
const VALID_PLANS: ReadonlyArray<SubscriptionPlan> = ['start', 'pokrocily', 'max'];

/** Generátor jednoho předplatného s tarifem z množiny platných hodnot. */
const subscriptionArb: fc.Arbitrary<EstimateSubscriptionRow> = fc.record({
  plan: fc.constantFrom(...VALID_PLANS),
});

describe('estimateNextMonthRevenueCzk — Property 4: Odhad odpovídá ceníku a je nezáporný', () => {
  it('odhad je roven součtu planPriceCzk přes předplatná a je vždy nezáporný', () => {
    fc.assert(
      fc.property(fc.array(subscriptionArb), (subscriptions) => {
        const result = estimateNextMonthRevenueCzk(subscriptions);

        // R10.2, R10.3, R13.2: výsledek odpovídá součtu z jednotného ceníku.
        const expected = subscriptions.reduce((sum, s) => sum + planPriceCzk(s.plan), 0);
        expect(result).toBe(expected);

        // R10.4, R13.4: výsledek je vždy nezáporný.
        expect(result).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 },
    );
  });

  it('prázdný seznam předplatných → odhad 0', () => {
    expect(estimateNextMonthRevenueCzk([])).toBe(0);
  });
});
