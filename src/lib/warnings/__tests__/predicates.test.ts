import { describe, expect, it } from 'vitest';

import {
  EXPIRED_TO_DELETED_WARNING_DAY,
  GRACE_TO_EXPIRED_WARNING_DAY,
  warningKindFor,
} from '@/lib/warnings/predicates';

/**
 * Unit test warning predikátů (task 12.5 — R6.10, R6.11).
 *
 * Varovný e-mail se odesílá jen v den 23 (před `grace_period` → `expired`) a
 * den 83 (před `expired` → `deleted_data`) od kotvy `first_failed_charge_at`,
 * jinak `null`. Cron běží jednou denně, proto se varování posílá v jednodenním
 * okně `[den N, den N+1)` — testujeme i hranice dne.
 */

const ANCHOR = new Date('2025-01-01T00:00:00.000Z');
const ONE_DAY_SECONDS = 86_400;

/** Vrátí okamžik vzdálený `seconds` sekund od kotvy. */
function at(seconds: number): Date {
  return new Date(ANCHOR.getTime() + seconds * 1000);
}

/** Vrátí okamžik vzdálený `days` dní od kotvy. */
function atDay(days: number): Date {
  return at(days * ONE_DAY_SECONDS);
}

describe('warningKindFor (R6.10, R6.11)', () => {
  it('konstanty oken jsou 23 a 83 dní od kotvy', () => {
    expect(GRACE_TO_EXPIRED_WARNING_DAY).toBe(23);
    expect(EXPIRED_TO_DELETED_WARNING_DAY).toBe(83);
  });

  it('kotva null → žádné varování', () => {
    expect(warningKindFor(null, atDay(23))).toBeNull();
  });

  describe('grace_period → expired (den 23)', () => {
    it('přesně na začátku dne 23 → grace_to_expired', () => {
      expect(warningKindFor(ANCHOR, atDay(23))).toBe('grace_to_expired');
    });

    it('na konci okna dne 23 (těsně před dnem 24) → grace_to_expired', () => {
      expect(warningKindFor(ANCHOR, at(24 * ONE_DAY_SECONDS - 1))).toBe('grace_to_expired');
    });

    it('těsně před dnem 23 → null', () => {
      expect(warningKindFor(ANCHOR, at(23 * ONE_DAY_SECONDS - 1))).toBeNull();
    });

    it('přesně na začátku dne 24 → null (okno už skončilo)', () => {
      expect(warningKindFor(ANCHOR, atDay(24))).toBeNull();
    });
  });

  describe('expired → deleted_data (den 83)', () => {
    it('přesně na začátku dne 83 → expired_to_deleted', () => {
      expect(warningKindFor(ANCHOR, atDay(83))).toBe('expired_to_deleted');
    });

    it('na konci okna dne 83 (těsně před dnem 84) → expired_to_deleted', () => {
      expect(warningKindFor(ANCHOR, at(84 * ONE_DAY_SECONDS - 1))).toBe('expired_to_deleted');
    });

    it('těsně před dnem 83 → null', () => {
      expect(warningKindFor(ANCHOR, at(83 * ONE_DAY_SECONDS - 1))).toBeNull();
    });

    it('přesně na začátku dne 84 → null', () => {
      expect(warningKindFor(ANCHOR, atDay(84))).toBeNull();
    });
  });

  it.each([0, 1, 22, 24, 30, 50, 82, 84, 90, 100])(
    'den %i (mimo okna 23 a 83) → null',
    (day) => {
      expect(warningKindFor(ANCHOR, atDay(day))).toBeNull();
    },
  );

  it('akceptuje kotvu i now jako ISO řetězec', () => {
    expect(warningKindFor(ANCHOR.toISOString(), atDay(23).toISOString())).toBe('grace_to_expired');
  });
});
