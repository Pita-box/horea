import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  MAX_SERVICES_PER_RESERVATION,
  MIN_SERVICES_PER_RESERVATION,
  SERVICE_COUNT_ERROR_MESSAGES,
  validateServiceCount,
} from '../limits';

// Feature: multi-service-reservations, Property 6: Přijetí závisí jen na rozsahu počtu služeb
// Validates: Requirements 1.5, 1.6, 5.1, 5.2, 5.3, 5.4, 9.6
describe('validateServiceCount — Property 6: Přijetí závisí jen na rozsahu počtu služeb', () => {
  it('je přijat právě tehdy, když MIN <= floor(n) <= MAX', () => {
    fc.assert(
      fc.property(
        // Pokrytí celého rozsahu kolem hranic včetně hodnot mimo rozsah.
        fc.integer({ min: -50, max: 60 }),
        (n) => {
          const result = validateServiceCount(n);
          const inRange =
            MIN_SERVICES_PER_RESERVATION <= n && n <= MAX_SERVICES_PER_RESERVATION;
          expect(result.ok).toBe(inRange);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rozhodnutí závisí jen na floor(n) — neceločíselné vstupy se zaokrouhlí dolů', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 60, noNaN: true }),
        (n) => {
          const result = validateServiceCount(n);
          const count = Math.floor(n);
          const inRange =
            MIN_SERVICES_PER_RESERVATION <= count && count <= MAX_SERVICES_PER_RESERVATION;
          expect(result.ok).toBe(inRange);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('odmítnutí pod minimem má důvod "too_few" se správnou hláškou', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: MIN_SERVICES_PER_RESERVATION - 1 }), (n) => {
        const result = validateServiceCount(n);
        expect(result).toEqual({
          ok: false,
          reason: 'too_few',
          message: SERVICE_COUNT_ERROR_MESSAGES.too_few,
        });
      }),
      { numRuns: 100 },
    );
  });

  it('odmítnutí nad maximem má důvod "too_many" se správnou hláškou', () => {
    fc.assert(
      fc.property(fc.integer({ min: MAX_SERVICES_PER_RESERVATION + 1, max: 200 }), (n) => {
        const result = validateServiceCount(n);
        expect(result).toEqual({
          ok: false,
          reason: 'too_many',
          message: SERVICE_COUNT_ERROR_MESSAGES.too_many,
        });
      }),
      { numRuns: 100 },
    );
  });

  it('přijme každý počet uvnitř rozsahu [MIN, MAX]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_SERVICES_PER_RESERVATION, max: MAX_SERVICES_PER_RESERVATION }),
        (n) => {
          expect(validateServiceCount(n)).toEqual({ ok: true });
        },
      ),
      { numRuns: 100 },
    );
  });

  // Hraniční případy explicitně (n = 1, n = 10).
  it('přijme hraniční minimum n = 1 a maximum n = 10', () => {
    expect(validateServiceCount(MIN_SERVICES_PER_RESERVATION)).toEqual({ ok: true });
    expect(validateServiceCount(MAX_SERVICES_PER_RESERVATION)).toEqual({ ok: true });
    expect(validateServiceCount(MIN_SERVICES_PER_RESERVATION - 1).ok).toBe(false);
    expect(validateServiceCount(MAX_SERVICES_PER_RESERVATION + 1).ok).toBe(false);
  });
});
