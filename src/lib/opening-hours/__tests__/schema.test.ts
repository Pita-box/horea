import { describe, expect, it } from 'vitest';

import {
  OPENING_HOURS_MESSAGES,
  openingHoursWeekSchema,
  opensBeforeClosesMessage,
  type OpeningHoursWeek,
} from '../schema';

function closedWeek(): OpeningHoursWeek {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, closed: true }) as const);
}

function openDay(dayOfWeek: number, opensAt: string, closesAt: string) {
  return { dayOfWeek, closed: false as const, opensAt, closesAt };
}

describe('openingHoursWeekSchema', () => {
  it('accepts a week with at least one valid open day', () => {
    const week = closedWeek();
    week[0] = openDay(0, '09:00', '17:00');

    const result = openingHoursWeekSchema.safeParse(week);

    expect(result.success).toBe(true);
  });

  it('rejects an open day whose opensAt is later than closesAt and identifies the day', () => {
    const week = closedWeek();
    week[2] = openDay(2, '18:00', '09:00');

    const result = openingHoursWeekSchema.safeParse(week);

    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((current) => current.path[0] === 2);
      expect(issue?.message).toBe(opensBeforeClosesMessage(2));
      // Identifies the day by label (Středa = day 2).
      expect(issue?.message).toContain('Středa');
    }
  });

  it('rejects an open day with equal opens and closes times (boundary)', () => {
    const week = closedWeek();
    week[1] = openDay(1, '10:00', '10:00');

    const result = openingHoursWeekSchema.safeParse(week);

    expect(result.success).toBe(false);

    if (!result.success) {
      const issue = result.error.issues.find((current) => current.path[0] === 1);
      expect(issue?.message).toBe(opensBeforeClosesMessage(1));
    }
  });

  it('rejects a week where every day is closed', () => {
    const result = openingHoursWeekSchema.safeParse(closedWeek());

    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(OPENING_HOURS_MESSAGES.atLeastOneOpenDay);
    }
  });
});
