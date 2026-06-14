/**
 * Prezentační mapování stavu rezervace a docházky do češtiny (R2.3, R11.7).
 *
 * Čisté funkce bez I/O — sdílí je tabulkový i kalendářní pohled a detail
 * rezervace. Anglické hodnoty odpovídají DB enumům (`reservation_status`,
 * `attendance_status`); zobrazované labely jsou doslovné znění acceptance
 * criteria.
 */

/** Stav rezervace — hodnoty DB enumu `public.reservation_status`. */
export type ReservationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** Docházka klienta — hodnoty DB enumu `public.attendance_status` (+ `null` = nevyhodnoceno). */
export type AttendanceStatus = 'attended' | 'no_show' | null;

const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Čeká na schválení',
  approved: 'Schváleno',
  rejected: 'Odmítnuto',
  cancelled: 'Zrušeno',
};

const ATTENDANCE_LABELS: Record<'attended' | 'no_show', string> = {
  attended: 'Dorazil',
  no_show: 'Nedorazil',
};

/** Český label stavu rezervace (R2.3). */
export function reservationStatusLabel(status: ReservationStatus): string {
  return RESERVATION_STATUS_LABELS[status];
}

/** Český label docházky; `null` (nevyhodnoceno) → „—" (R11.7). */
export function attendanceLabel(attendance: AttendanceStatus): string {
  return attendance === null ? '—' : ATTENDANCE_LABELS[attendance];
}
