import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: public-business-page, Property 2: Reservation creation atomicity.
 *
 * Invariant na hranici TypeScriptu (nad mock DB): rezervace je úspěšně vytvořena
 * (`ok: true`) PRÁVĚ TEHDY, když vybraný slot prošel pre-lock re-checkem
 * (`Slot_Calculator` ho vrátil v listu) A RPC `create_reservation` vrátil
 * `reservation_id` bez příznaku `conflict` a `not_published`.
 *
 * Pozn.: Skutečnou DB atomicitu (advisory lock proti reálnému Postgresu) ověřuje
 * integrační test 8.1. Tento property test ověřuje pouze ROZHODOVACÍ LOGIKU
 * `ReservationCreator` nad řízeným mockem — zejména že při nedostupném slotu
 * v pre-lock listu se RPC `create_reservation` vůbec NEVOLÁ.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7
 */

const createAdminClientMock = vi.hoisted(() => vi.fn());
const loadAvailableSlotsMock = vi.hoisted(() => vi.fn());
const sendConfirmationMock = vi.hoisted(() => vi.fn());
const sendNotificationMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@/server/slots/loadAvailableSlots', () => ({ loadAvailableSlots: loadAvailableSlotsMock }));
vi.mock('@/server/EmailNotifier', () => ({
  sendReservationConfirmation: sendConfirmationMock,
  sendReservationNotification: sendNotificationMock,
}));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { createReservation } from '@/server/ReservationCreator';

import {
  buildAdminClient,
  buildInput,
  rpcConflict,
  rpcNotPublished,
  rpcSuccess,
  TIME_POOL,
  validContactArb,
  type CreateReservationRpcRow,
  type SupabaseResult,
} from './_support/reservation-harness';

const NUM_RUNS = 100;

type RpcOutcome =
  | { kind: 'success'; status: 'approved' | 'pending' }
  | { kind: 'conflict' }
  | { kind: 'not_published' };

const rpcOutcomeArb: fc.Arbitrary<RpcOutcome> = fc.oneof(
  fc.record({
    kind: fc.constant<'success'>('success'),
    status: fc.constantFrom<'approved' | 'pending'>('approved', 'pending'),
  }),
  fc.constant<RpcOutcome>({ kind: 'conflict' }),
  fc.constant<RpcOutcome>({ kind: 'not_published' }),
);

/** Scénář: pre-lock slot list, zvolený čas (uvnitř/mimo list) a výsledek RPC. */
const scenarioArb = fc
  .record({
    slots: fc.uniqueArray(fc.constantFrom(...TIME_POOL), {
      minLength: 1,
      maxLength: TIME_POOL.length,
    }),
    wantInList: fc.boolean(),
    picker: fc.nat(),
    rpc: rpcOutcomeArb,
  })
  .map(({ slots, wantInList, picker, rpc }) => {
    let time: string;
    if (wantInList) {
      time = slots[picker % slots.length];
    } else {
      const outside = TIME_POOL.filter((slot) => !slots.includes(slot));
      // `23:45` není v poolu, takže je vždy mimo `slots` (fallback pro plný pool).
      time = outside.length > 0 ? outside[picker % outside.length] : '23:45';
    }
    return { slots: [...slots], time, inList: (slots as readonly string[]).includes(time), rpc };
  });

function rpcResultFor(outcome: RpcOutcome): SupabaseResult<CreateReservationRpcRow> {
  switch (outcome.kind) {
    case 'success':
      return rpcSuccess(outcome.status);
    case 'conflict':
      return rpcConflict();
    case 'not_published':
      return rpcNotPublished();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  sendConfirmationMock.mockResolvedValue({ ok: true });
  sendNotificationMock.mockResolvedValue({ ok: true });
});

describe('Property 2: atomicita vytvoření rezervace (nad mock DB)', () => {
  it('ok:true ⟺ slot prošel pre-lock re-checkem A RPC vrátil reservation_id', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, validContactArb(), async (scenario, contact) => {
        createAdminClientMock.mockReset();
        loadAvailableSlotsMock.mockReset();

        const client = buildAdminClient({ createReservation: rpcResultFor(scenario.rpc) });
        createAdminClientMock.mockReturnValue(client);
        loadAvailableSlotsMock.mockResolvedValue(scenario.slots);

        const result = await createReservation(buildInput({ time: scenario.time, ...contact }));

        const createReservationCalled = client.__rpcCalls.includes('create_reservation');

        // Hlavní invariant (iff): úspěch nastane právě při dostupném slotu + úspěšném RPC.
        const expectedOk = scenario.inList && scenario.rpc.kind === 'success';
        expect(result.ok).toBe(expectedOk);

        if (!scenario.inList) {
          // Slot není v pre-lock listu → 409 a RPC create_reservation se NEVOLÁ (R9.3/9.4).
          expect(createReservationCalled).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe(409);
          }
          return;
        }

        // Slot je dostupný → RPC create_reservation proběhne.
        expect(createReservationCalled).toBe(true);

        if (scenario.rpc.kind === 'conflict') {
          // Konflikt pod zámkem → žádná rezervace, 409 (R9.4, R9.7).
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe(409);
          }
        } else if (scenario.rpc.kind === 'not_published') {
          // Business mid-form přestal být publikovaný → 404 (R9.1).
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe(404);
          }
        } else {
          // reservation_id přítomno → právě jedna rezervace vytvořena (R9.5).
          expect(result.ok).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
