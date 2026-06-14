import { describe, expect, it } from 'vitest';

import {
  attendanceLabel,
  reservationStatusLabel,
  type ReservationStatus,
} from '../labels';

// Pokrývá R2.3 (mapování stavu) a R11.7 (mapování docházky) do češtiny.
describe('reservationStatusLabel', () => {
  it('mapuje všechny stavy na české labely (R2.3)', () => {
    const cases: Record<ReservationStatus, string> = {
      pending: 'Čeká na schválení',
      approved: 'Schváleno',
      rejected: 'Odmítnuto',
      cancelled: 'Zrušeno',
    };

    for (const [status, label] of Object.entries(cases)) {
      expect(reservationStatusLabel(status as ReservationStatus)).toBe(label);
    }
  });
});

describe('attendanceLabel', () => {
  it('mapuje docházku na české labely a null na „—" (R11.7)', () => {
    expect(attendanceLabel(null)).toBe('—');
    expect(attendanceLabel('attended')).toBe('Dorazil');
    expect(attendanceLabel('no_show')).toBe('Nedorazil');
  });
});
