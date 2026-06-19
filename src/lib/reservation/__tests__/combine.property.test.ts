import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { combinedDuration, combinedPrice, type CombinableService } from '../combine';

// Feature: multi-service-reservations, Property 2: Combined_Price je součet cen
// Validates: Requirements 3.1, 3.2, 9.2, 11.3, 15.3
describe('combinedPrice — Property 2: Combined_Price je součet cen', () => {
  const serviceArb: fc.Arbitrary<CombinableService> = fc.record({
    name: fc.string(),
    durationMinutes: fc.integer({ min: 0, max: 600 }),
    priceCzk: fc.integer({ min: 0, max: 100_000 }),
  });

  it('combinedPrice se rovná součtu priceCzk přes všechny služby', () => {
    fc.assert(
      fc.property(fc.array(serviceArb, { maxLength: 10 }), (services) => {
        const expected = services.reduce((sum, service) => sum + service.priceCzk, 0);
        expect(combinedPrice(services)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('je invariantní vůči pořadí služeb (součet je komutativní)', () => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, { minLength: 1, maxLength: 10 }),
        fc.integer(),
        (services, seed) => {
          const shuffled = [...services].sort(
            (a, b) => ((a.priceCzk + seed) % 7) - ((b.priceCzk + seed) % 7),
          );
          expect(combinedPrice(shuffled)).toBe(combinedPrice(services));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: multi-service-reservations, Property 1: Combined_Duration je součet délek
// Validates: Requirements 2.1, 2.3, 9.2, 11.3, 15.3
describe('combinedDuration — Property 1: Combined_Duration je součet délek', () => {
  const serviceArb: fc.Arbitrary<CombinableService> = fc.record({
    name: fc.string(),
    durationMinutes: fc.integer({ min: 1, max: 600 }),
    priceCzk: fc.integer({ min: 0, max: 100_000 }),
  });

  it('combinedDuration se rovná součtu durationMinutes přes všechny služby (vč. n = 1)', () => {
    fc.assert(
      fc.property(fc.array(serviceArb, { minLength: 1, maxLength: 10 }), (services) => {
        const expected = services.reduce((sum, service) => sum + service.durationMinutes, 0);
        expect(combinedDuration(services)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('je invariantní vůči pořadí služeb (součet je komutativní)', () => {
    fc.assert(
      fc.property(
        fc.array(serviceArb, { minLength: 1, maxLength: 10 }),
        fc.integer(),
        (services, seed) => {
          const shuffled = [...services].sort(
            (a, b) => ((a.durationMinutes + seed) % 7) - ((b.durationMinutes + seed) % 7),
          );
          expect(combinedDuration(shuffled)).toBe(combinedDuration(services));
        },
      ),
      { numRuns: 200 },
    );
  });
});
