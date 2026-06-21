import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { calculateRevenueCzk, type RevenuePaymentRow } from '../revenue';

const NUM_RUNS = 100;

// Generátor jedné platby — čte se pouze `amount_czk`. Používáme celá čísla,
// aby byl součet přesný (bez chyb plovoucí desetinné čárky).
function payment(): fc.Arbitrary<RevenuePaymentRow> {
  return fc.record({ amount_czk: fc.integer({ min: 0, max: 1_000_000 }) });
}

function payments(): fc.Arbitrary<RevenuePaymentRow[]> {
  return fc.array(payment(), { maxLength: 50 });
}

describe('calculateRevenueCzk properties', () => {
  // Feature: telegram-operator-notifications, Property 3: Výpočet tržeb je součet částek
  // Validates: Requirements 9.2, 9.3, 13.1, 13.3
  it('Feature: telegram-operator-notifications, Property 3: Výpočet tržeb je součet částek', () => {
    fc.assert(
      fc.property(payments(), payments(), (a, b) => {
        // Výsledek je roven prostému součtu `amount_czk` všech plateb.
        const expectedA = a.reduce((sum, p) => sum + p.amount_czk, 0);
        expect(calculateRevenueCzk(a)).toBe(expectedA);

        // Aditivita vůči zřetězení dvou seznamů.
        expect(calculateRevenueCzk([...a, ...b])).toBe(
          calculateRevenueCzk(a) + calculateRevenueCzk(b),
        );
      }),
      { numRuns: NUM_RUNS },
    );

    // Prázdný vstup → 0 (R9.3, R13.3).
    expect(calculateRevenueCzk([])).toBe(0);
  });
});
