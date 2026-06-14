import { describe, expect, it } from 'vitest';

import { isBusinessOpenNow, type OpenStatusHours } from '@/lib/business/open-status';

// Po–Pá 09:00–17:00 (dayOfWeek 0..4). So/Ne chybí → zavřeno.
const HOURS: OpenStatusHours[] = [
  { dayOfWeek: 0, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 1, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 2, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 3, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 4, opensAt: '09:00:00', closesAt: '17:00:00' },
];

describe('isBusinessOpenNow (Europe/Prague)', () => {
  it('otevřeno během pracovní doby (zimní čas, UTC+1)', () => {
    // Po 2024-01-08 10:00 Prague = 09:00 UTC.
    expect(isBusinessOpenNow(HOURS, new Date('2024-01-08T09:00:00Z'))).toBe(true);
  });

  it('zavřeno před otevřením', () => {
    // Po 2024-01-08 08:30 Prague = 07:30 UTC.
    expect(isBusinessOpenNow(HOURS, new Date('2024-01-08T07:30:00Z'))).toBe(false);
  });

  it('zavřeno přesně v čase zavření (exkluzivní horní mez)', () => {
    // Po 2024-01-08 17:00 Prague = 16:00 UTC.
    expect(isBusinessOpenNow(HOURS, new Date('2024-01-08T16:00:00Z'))).toBe(false);
  });

  it('otevřeno během pracovní doby (letní čas, UTC+2)', () => {
    // Po 2024-07-08 12:00 Prague = 10:00 UTC.
    expect(isBusinessOpenNow(HOURS, new Date('2024-07-08T10:00:00Z'))).toBe(true);
  });

  it('zavřeno o víkendu (chybějící den)', () => {
    // So 2024-01-13 12:00 Prague = 11:00 UTC.
    expect(isBusinessOpenNow(HOURS, new Date('2024-01-13T11:00:00Z'))).toBe(false);
  });
});
