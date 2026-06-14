import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { calculateSlots } from '../calculator';
import { formatTime, intervalsOverlap, parseTime } from '../time';
import type { BusinessConfig, OpeningHours, Reservation, SlotCalculatorInput } from '../types';

const NUM_RUNS = 100;

const config: BusinessConfig = {
  allowParallelSlots: false,
  timezone: 'Europe/Prague',
};

function minutesToTime(minutes: number): string {
  return formatTime(minutes);
}

function gridSlots(opensAt: number, closesAt: number, durationMinutes: number): string[] {
  const result: string[] = [];
  const lastCandidateStart = closesAt + 15 - durationMinutes;

  for (
    let candidate = opensAt;
    candidate <= lastCandidateStart && candidate < 24 * 60;
    candidate += 15
  ) {
    result.push(formatTime(candidate));
  }

  return result;
}

function validReservations(): fc.Arbitrary<Reservation[]> {
  return fc.array(
    fc
      .tuple(fc.integer({ min: 0, max: 94 }), fc.integer({ min: 1, max: 8 }))
      .filter(([startStep, durationSteps]) => startStep + durationSteps <= 95)
      .map(([startStep, durationSteps]) => ({
        start: minutesToTime(startStep * 15),
        end: minutesToTime((startStep + durationSteps) * 15),
      })),
    { maxLength: 12 },
  );
}

function validInput(): fc.Arbitrary<SlotCalculatorInput> {
  return fc
    .record({
      allowParallelSlots: fc.boolean(),
      openStep: fc.integer({ min: 0, max: 80 }),
      openLengthSteps: fc.integer({ min: 1, max: 16 }),
      duration: fc.integer({ min: 1, max: 96 }).map((value) => value * 5),
      reservations: validReservations(),
    })
    .filter(({ openLengthSteps, openStep }) => openStep + openLengthSteps < 96)
    .map(({ allowParallelSlots, duration, openLengthSteps, openStep, reservations }) => ({
      config: {
        allowParallelSlots,
        timezone: 'Europe/Prague',
      },
      openingHours: {
        closed: false,
        opensAt: minutesToTime(openStep * 15),
        closesAt: minutesToTime((openStep + openLengthSteps) * 15),
      },
      service: {
        durationMinutes: duration,
      },
      reservations,
    }));
}

describe('calculateSlots properties', () => {
  it('Feature: services-and-availability, Property 1: adjacency is not a conflict', () => {
    fc.assert(
      fc.property(
        fc.record({
          durationSteps: fc.integer({ min: 1, max: 8 }),
          reservationStartStep: fc.integer({ min: 0, max: 16 }),
        }),
        ({ durationSteps, reservationStartStep }) => {
          const opensAt = parseTime('09:00');
          const closesAt = parseTime('17:00');
          const duration = durationSteps * 15;
          const reservationStart = opensAt + reservationStartStep * 15;
          const reservationEnd = reservationStart + duration;

          fc.pre(reservationEnd + duration <= closesAt + 15);

          const slots = calculateSlots({
            config,
            openingHours: { closed: false, opensAt: '09:00', closesAt: '17:00' },
            service: { durationMinutes: duration },
            reservations: [
              { start: minutesToTime(reservationStart), end: minutesToTime(reservationEnd) },
            ],
          });

          expect(slots).toContain(minutesToTime(reservationEnd));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: services-and-availability, Property 2: overlap conflict is symmetric', () => {
    fc.assert(
      fc.property(
        fc.record({
          aStart: fc.integer({ min: 0, max: 94 }),
          aDuration: fc.integer({ min: 1, max: 8 }),
          bStart: fc.integer({ min: 0, max: 94 }),
          bDuration: fc.integer({ min: 1, max: 8 }),
        }),
        ({ aDuration, aStart, bDuration, bStart }) => {
          const a1 = aStart * 15;
          const a2 = a1 + aDuration * 15;
          const b1 = bStart * 15;
          const b2 = b1 + bDuration * 15;

          fc.pre(a2 <= 24 * 60 && b2 <= 24 * 60);

          expect(intervalsOverlap(a1, a2, b1, b2)).toBe(intervalsOverlap(b1, b2, a1, a2));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: services-and-availability, Property 3: output equals grid constrained by tolerance', () => {
    fc.assert(
      fc.property(
        fc
          .record({
            openStep: fc.integer({ min: 0, max: 80 }),
            openLengthSteps: fc.integer({ min: 1, max: 16 }),
            duration: fc.integer({ min: 1, max: 96 }).map((value) => value * 5),
          })
          .filter(({ openLengthSteps, openStep }) => openStep + openLengthSteps < 96),
        ({ duration, openLengthSteps, openStep }) => {
          const opensAt = openStep * 15;
          const closesAt = (openStep + openLengthSteps) * 15;
          const input: SlotCalculatorInput = {
            config,
            openingHours: {
              closed: false,
              opensAt: minutesToTime(opensAt),
              closesAt: minutesToTime(closesAt),
            },
            service: { durationMinutes: duration },
            reservations: [],
          };

          expect(calculateSlots(input)).toEqual(gridSlots(opensAt, closesAt, duration));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: services-and-availability, Property 4: parallel slots ignore reservations', () => {
    fc.assert(
      fc.property(validInput(), (input) => {
        const parallelInput: SlotCalculatorInput = {
          ...input,
          config: { ...input.config, allowParallelSlots: true },
        };

        expect(calculateSlots(parallelInput)).toEqual(
          calculateSlots({ ...parallelInput, reservations: [] }),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: services-and-availability, Property 5: calculation is deterministic', () => {
    fc.assert(
      fc.property(validInput(), (input) => {
        expect(calculateSlots(input)).toEqual(calculateSlots(input));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: services-and-availability, Property 6: no valid opening returns empty slots', () => {
    fc.assert(
      fc.property(
        fc.record({
          closed: fc.boolean(),
          allowParallelSlots: fc.boolean(),
          duration: fc.integer({ min: 1, max: 96 }).map((value) => value * 5),
          openingMinute: fc.integer({ min: 0, max: 95 }).map((value) => value * 15),
          reservations: validReservations(),
        }),
        ({ allowParallelSlots, closed, duration, openingMinute, reservations }) => {
          const openingHours: OpeningHours = closed
            ? { closed: true }
            : {
                closed: false,
                opensAt: minutesToTime(openingMinute),
                closesAt: minutesToTime(openingMinute),
              };

          expect(
            calculateSlots({
              config: { ...config, allowParallelSlots },
              openingHours,
              service: { durationMinutes: duration },
              reservations,
            }),
          ).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: services-and-availability, Property 7: output is strictly ascending', () => {
    fc.assert(
      fc.property(validInput(), (input) => {
        const slots = calculateSlots(input);
        const parsedSlots = slots.map(parseTime);

        for (let index = 1; index < parsedSlots.length; index += 1) {
          expect(parsedSlots[index]).toBeGreaterThan(parsedSlots[index - 1]);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
