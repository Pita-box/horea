import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { extendPeriod } from '@/lib/subscription/period';
import { JEDEN_MESIC_SECONDS } from '@/lib/subscription/state-machine';

/**
 * Feature: subscription-payments, Property 6: Prodloužení období o přesně jeden
 * měsíc.
 *
 * `extendPeriod(currentPeriodEnd)` posune konec období přesně o Jeden_Mesic
 * (2 592 000 s). Pro LIBOVOLNÝ vstupní okamžik (a každý druh úspěšné platby —
 * první, recurring i ručně spárovaný používá tutéž funkci) platí, že nový konec
 * je přesně `vstup + 2 592 000 s`. Generátor varíruje vstupní čas v širokém
 * rozsahu i jeho reprezentaci (`Date` vs. ISO řetězec) a ověřuje navíc
 * idempotenci výpočtu a neměnnost vstupní hodnoty.
 *
 * Validates: Requirements 1.5, 2.3, 5.5
 */

const NUM_RUNS = 200;

const JEDEN_MESIC_MS = JEDEN_MESIC_SECONDS * 1000;

/** Vstupní okamžik (ms) v širokém, ale realistickém rozsahu kolem současnosti. */
const periodEndMsArb = fc.integer({
  min: Date.parse('2024-01-01T00:00:00.000Z'),
  max: Date.parse('2040-12-31T23:59:59.000Z'),
});

describe('Property 6: prodloužení období o přesně Jeden_Mesic', () => {
  it('nový konec = vstup + 2 592 000 s (pro Date i ISO řetězec)', () => {
    fc.assert(
      fc.property(periodEndMsArb, fc.boolean(), (ms, asString) => {
        const input = asString ? new Date(ms).toISOString() : new Date(ms);
        const result = extendPeriod(input);
        expect(result.getTime()).toBe(ms + JEDEN_MESIC_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('vstupní Date se nemění (čistá funkce bez vedlejších efektů)', () => {
    fc.assert(
      fc.property(periodEndMsArb, (ms) => {
        const input = new Date(ms);
        extendPeriod(input);
        expect(input.getTime()).toBe(ms);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('opakovaná aplikace přičítá přesně N měsíců', () => {
    fc.assert(
      fc.property(periodEndMsArb, fc.integer({ min: 1, max: 24 }), (ms, n) => {
        let current: Date | string = new Date(ms);
        for (let i = 0; i < n; i += 1) {
          current = extendPeriod(current);
        }
        expect((current as Date).getTime()).toBe(ms + n * JEDEN_MESIC_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
