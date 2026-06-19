/**
 * Sdílené typy zobrazovaných rezervací v dashboardu majitele.
 * Hodnoty stavu a docházky odpovídají DB enumům (viz `labels.ts`).
 */

import type { AttendanceStatus, ReservationStatus } from './labels';

/** Řádek seznamu rezervací (tabulkový pohled, R2.2). */
export type ReservationListItem = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  serviceName: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
};

/** Volba služby pro filtr a select (R3.4). */
export type ServiceOption = {
  id: string;
  name: string;
};

/**
 * Výsledek mutační server action nad rezervací (stavové přechody R6–R8,
 * docházka R11). Konzistentní napříč Reservation_Approver / Reservation_Rejecter
 * / Reservation_Canceller / Attendance_Marker.
 */
export type ReservationMutationResult = { ok: true } | { ok: false; message: string };

/** Plný detail rezervace pro `Reservation_Detail_View` (R5.1). */
export type ReservationDetail = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  serviceName: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  note: string | null;
  statusReason: string | null;
};
