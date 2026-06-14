import type { OpeningHoursWeek } from './schema';

export type OpeningHoursActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<number, string>;
    };

export type ListOpeningHoursResult =
  | {
      ok: true;
      week: OpeningHoursWeek;
    }
  | {
      ok: false;
      message: string;
    };
