import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: reservation-management, Property 1: Status transition validity.
 *
 * Konečný automat Reservation_Status je vynucován serverově přes ATOMICKÝ status
 * guard (podmíněný UPDATE `WHERE id = ? AND status = ?`). Property ověřuje nad
 * mock DB (jedna rezervace s nastavitelným výchozím stavem):
 *
 *  - Legální přechod změní `status` PRÁVĚ TEHDY, je-li výchozí stav povoleným
 *    zdrojem: approve `pending → approved`, reject `pending → rejected`,
 *    cancel `approved → cancelled`.
 *  - Nelegální přechod (výchozí stav mimo povolený zdroj) NEPROVEDE žádnou změnu
 *    a vrátí českou hlášku.
 *  - `Attendance_Marker` NIKDY nemění `status` — pro libovolný výchozí stav
 *    i docházkovou hodnotu zůstává `status` beze změny.
 *
 * Pozn.: Skutečnou atomicitu guardu proti reálnému Postgresu (race) ověřují
 * integrační testy; zde testujeme ROZHODOVACÍ LOGIKU akcí nad řízeným mockem,
 * který podmíněný UPDATE simuluje věrně (zápis jen při shodě statusu).
 *
 * Validates: Requirements 6.1, 6.2, 7.3, 7.4, 8.3, 8.4, 11.6
 */

const createClientMock = vi.hoisted(() => vi.fn());
const dispatchEmailMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/email/dispatcher', () => ({ dispatchTransactionalEmail: dispatchEmailMock }));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { markAttendance } from '@/server/AttendanceMarker';
import { approveReservation } from '@/server/ReservationApprover';
import { cancelReservation } from '@/server/ReservationCanceller';
import { rejectReservation } from '@/server/ReservationRejecter';

import {
  attendanceArb,
  buildMutationServerClient,
  makeState,
  RES_STATUSES,
  statusArb,
  type ResStatus,
} from './_support/mutation-harness';

const NUM_RUNS = 100;

/** Povolený zdrojový stav a cílový stav pro každou status mutaci. */
const TRANSITIONS = {
  approve: { from: 'pending' as ResStatus, to: 'approved' as ResStatus },
  reject: { from: 'pending' as ResStatus, to: 'rejected' as ResStatus },
  cancel: { from: 'approved' as ResStatus, to: 'cancelled' as ResStatus },
} as const;

type StatusAction = keyof typeof TRANSITIONS;

const statusActionArb = fc.constantFrom<StatusAction>('approve', 'reject', 'cancel');

beforeEach(() => {
  vi.clearAllMocks();
  dispatchEmailMock.mockResolvedValue({ ok: true });
});

describe('Property 1: validita stavových přechodů', () => {
  it('legální přechod změní status ⟺ výchozí stav je povolený zdroj; jinak žádná změna', async () => {
    await fc.assert(
      fc.asyncProperty(statusActionArb, statusArb, async (action, initialStatus) => {
        const state = makeState({ status: initialStatus });
        createClientMock.mockResolvedValue(buildMutationServerClient(state));

        const transition = TRANSITIONS[action];
        const shouldSucceed = initialStatus === transition.from;

        let result;
        if (action === 'approve') {
          result = await approveReservation(state.id);
        } else if (action === 'reject') {
          result = await rejectReservation(state.id);
        } else {
          result = await cancelReservation(state.id);
        }

        // Úspěch nastane PRÁVĚ TEHDY, je-li výchozí stav povoleným zdrojem.
        expect(result.ok).toBe(shouldSucceed);

        if (shouldSucceed) {
          // Legální přechod → status se změní na cílový.
          expect(state.status).toBe(transition.to);
        } else {
          // Nelegální přechod → žádná změna stavu a česká hláška.
          expect(state.status).toBe(initialStatus);
          if (!result.ok) {
            expect(result.message.length).toBeGreaterThan(0);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Attendance_Marker nikdy nemění status (pro libovolný výchozí stav i docházku)', async () => {
    await fc.assert(
      fc.asyncProperty(statusArb, attendanceArb, async (initialStatus, attendance) => {
        const state = makeState({ status: initialStatus, attendance: null });
        createClientMock.mockResolvedValue(buildMutationServerClient(state));

        const result = await markAttendance(state.id, attendance);

        // Docházka se nastaví (starts_at je v minulosti → časová brána propustí).
        expect(result.ok).toBe(true);
        // Klíčový invariant: status NIKDY nezměněn (R11.6).
        expect(state.status).toBe(initialStatus);
        expect(RES_STATUSES).toContain(state.status);
        // A naopak docházka se opravdu zapsala na zvolenou hodnotu.
        expect(state.attendance).toBe(attendance);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
