import { describe, expect, it } from 'vitest';

import { calculateSlots } from '../calculator';
import { formatTime, intervalsOverlap, parseTime } from '../time';
import type { BusinessConfig, OpeningHours, Service } from '../types';

const baseConfig: BusinessConfig = {
  allowParallelSlots: false,
  timezone: 'Europe/Prague',
};

const openNineToFive: OpeningHours = {
  closed: false,
  opensAt: '09:00',
  closesAt: '17:00',
};

const hourService: Service = {
  durationMinutes: 60,
};

describe('slot time helpers', () => {
  it('parses and formats HH:mm times', () => {
    expect(parseTime('09:15')).toBe(555);
    expect(formatTime(555)).toBe('09:15');
  });

  it('treats touching half-open intervals as non-overlapping', () => {
    expect(
      intervalsOverlap(
        parseTime('10:00'),
        parseTime('11:00'),
        parseTime('11:00'),
        parseTime('12:00'),
      ),
    ).toBe(false);
  });

  it('detects overlapping half-open intervals', () => {
    expect(
      intervalsOverlap(
        parseTime('10:00'),
        parseTime('11:00'),
        parseTime('10:30'),
        parseTime('11:30'),
      ),
    ).toBe(true);
  });
});

describe('calculateSlots', () => {
  it('returns an empty list for a closed day', () => {
    expect(
      calculateSlots({
        config: baseConfig,
        openingHours: { closed: true },
        service: hourService,
        reservations: [],
      }),
    ).toEqual([]);
  });

  it('returns an empty list for invalid opening hours', () => {
    expect(
      calculateSlots({
        config: baseConfig,
        openingHours: { closed: false, opensAt: '17:00', closesAt: '09:00' },
        service: hourService,
        reservations: [],
      }),
    ).toEqual([]);
  });

  it('builds a 15-minute grid with closes_at tolerance', () => {
    const slots = calculateSlots({
      config: baseConfig,
      openingHours: openNineToFive,
      service: hourService,
      reservations: [],
    });

    expect(slots).toHaveLength(30);
    expect(slots[0]).toBe('09:00');
    expect(slots.at(-1)).toBe('16:15');
    expect(slots).toContain('16:15');
    expect(slots).not.toContain('16:30');
  });

  it('allows a slot that starts when an existing reservation ends', () => {
    const slots = calculateSlots({
      config: baseConfig,
      openingHours: { closed: false, opensAt: '10:00', closesAt: '12:00' },
      service: hourService,
      reservations: [{ start: '10:00', end: '11:00' }],
    });

    expect(slots).toContain('11:00');
    expect(slots).toContain('11:15');
  });

  it('filters a slot that overlaps an existing reservation', () => {
    const slots = calculateSlots({
      config: baseConfig,
      openingHours: { closed: false, opensAt: '10:00', closesAt: '12:00' },
      service: hourService,
      reservations: [{ start: '10:00', end: '11:00' }],
    });

    expect(slots).not.toContain('10:30');
  });

  it('ignores reservations when parallel slots are allowed', () => {
    const withoutReservations = calculateSlots({
      config: { ...baseConfig, allowParallelSlots: true },
      openingHours: { closed: false, opensAt: '10:00', closesAt: '12:00' },
      service: hourService,
      reservations: [],
    });
    const withReservations = calculateSlots({
      config: { ...baseConfig, allowParallelSlots: true },
      openingHours: { closed: false, opensAt: '10:00', closesAt: '12:00' },
      service: hourService,
      reservations: [{ start: '10:00', end: '11:00' }],
    });

    expect(withReservations).toEqual(withoutReservations);
  });
});
