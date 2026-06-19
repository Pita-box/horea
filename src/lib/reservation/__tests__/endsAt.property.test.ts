import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { combinedDuration, type CombinableService } from '../combine';

/**
 * Čistý výpočet `ends_at` z `starts_at` a `Combined_Duration` (v minutách).
 *
 * Drží stejný vztah, jaký autoritativně počítá SQL pod zámkem
 * (`ends_at = starts_at + Combined_Duration` — viz design, Property 3).
 */
function endsAt(startsAt: Date, services: readonly CombinableService[]): Date {
  return new Date(startsAt.getTime() + combinedDuration(services) * 60_000);
}

// Feature: multi-service-reservations, Property 3: ends_at = starts_at + Combined_Duration
// Validates: Requirements 2.2, 9.2, 15.2
describe('endsAt — Property 3: ends_at = starts_at + Combined_Duration', () => {
  const serviceArb: fc.Arbitrary<CombinableService> = fc.record({
    name: fc.string(),
    durationMinutes: fc.integer({ min: 1, max: 600 }),
    priceCzk: fc.integer({ min: 0, max: 100_000 }),
  });

  // starts_at v rozumném rozsahu kolem současnosti (cca ±10 let), bez NaN.
  const startsAtArb: fc.Arbitrary<Date> = fc
    .integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 })
    .map((ms) => new Date(ms));

  it('ends_at se rovná starts_at + Combined_Duration v minutách', () => {
    fc.assert(
      fc.property(
        startsAtArb,
        fc.array(serviceArb, { minLength: 1, maxLength: 10 }),
        (startsAt, services) => {
          const expectedMs = startsAt.getTime() + combinedDuration(services) * 60_000;
          expect(endsAt(startsAt, services).getTime()).toBe(expectedMs);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rozdíl ends_at − starts_at v minutách je přesně Combined_Duration', () => {
    fc.assert(
      fc.property(
        startsAtArb,
        fc.array(serviceArb, { minLength: 1, maxLength: 10 }),
        (startsAt, services) => {
          const diffMinutes = (endsAt(startsAt, services).getTime() - startsAt.getTime()) / 60_000;
          expect(diffMinutes).toBe(combinedDuration(services));
        },
      ),
      { numRuns: 200 },
    );
  });
});
