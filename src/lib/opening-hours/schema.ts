import { z } from 'zod';

import { WEEK_DAYS } from '@/lib/onboarding/data';

export const OPENING_HOURS_MESSAGES = {
  opensBeforeCloses: 'Čas otevření musí předcházet času zavření',
  atLeastOneOpenDay: 'Nastavte otevírací dobu alespoň pro jeden den',
} as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function dayLabel(dayOfWeek: number): string {
  return WEEK_DAYS[dayOfWeek]?.label ?? 'Vybraný den';
}

export function opensBeforeClosesMessage(dayOfWeek: number): string {
  return `${dayLabel(dayOfWeek)}: ${OPENING_HOURS_MESSAGES.opensBeforeCloses}`;
}

const closedDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  closed: z.literal(true),
});

const openDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  closed: z.literal(false),
  opensAt: z.string(),
  closesAt: z.string(),
});

const openingHoursDaySchema = z.discriminatedUnion('closed', [closedDaySchema, openDaySchema]);

export const openingHoursWeekSchema = z.array(openingHoursDaySchema).superRefine((week, ctx) => {
  let hasOpenDay = false;

  week.forEach((day, index) => {
    if (day.closed) {
      return;
    }

    hasOpenDay = true;

    const opensAt = toMinutes(day.opensAt);
    const closesAt = toMinutes(day.closesAt);

    if (opensAt === null || closesAt === null || opensAt >= closesAt) {
      ctx.addIssue({
        code: 'custom',
        message: opensBeforeClosesMessage(day.dayOfWeek),
        path: [index],
      });
    }
  });

  if (!hasOpenDay) {
    ctx.addIssue({
      code: 'custom',
      message: OPENING_HOURS_MESSAGES.atLeastOneOpenDay,
      path: [],
    });
  }
});

export type OpeningHoursDay = z.infer<typeof openingHoursDaySchema>;
export type OpeningHoursWeek = z.infer<typeof openingHoursWeekSchema>;
