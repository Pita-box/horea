import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { joinServiceNames, type CombinableService } from '../combine';

// Feature: multi-service-reservations, Property 13: CSV spojuje názvy služeb oddělovačem " + "
// Validates: Requirements 14.1
describe('joinServiceNames — Property 13: CSV spojuje názvy oddělovačem " + " v pořadí position', () => {
  const serviceArb: fc.Arbitrary<CombinableService> = fc.record({
    name: fc.string(),
    durationMinutes: fc.integer({ min: 0, max: 600 }),
    priceCzk: fc.integer({ min: 0, max: 100_000 }),
    position: fc.integer({ min: 0, max: 1000 }),
  });

  it('spojený řetězec se rovná názvům seřazeným podle position spojeným " + "', () => {
    fc.assert(
      fc.property(fc.array(serviceArb, { maxLength: 10 }), (services) => {
        const expected = services
          .map((service, index) => ({ service, index }))
          .sort((a, b) => {
            const posA = a.service.position ?? a.index;
            const posB = b.service.position ?? b.index;
            return posA !== posB ? posA - posB : a.index - b.index;
          })
          .map(({ service }) => service.name)
          .join(' + ');

        expect(joinServiceNames(services)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('bez position zachovává pořadí prvků ve vstupu (stabilní)', () => {
    const serviceNoPositionArb: fc.Arbitrary<CombinableService> = fc.record({
      name: fc.string(),
      durationMinutes: fc.integer({ min: 0, max: 600 }),
      priceCzk: fc.integer({ min: 0, max: 100_000 }),
    });

    fc.assert(
      fc.property(fc.array(serviceNoPositionArb, { maxLength: 10 }), (services) => {
        const expected = services.map((service) => service.name).join(' + ');
        expect(joinServiceNames(services)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});
