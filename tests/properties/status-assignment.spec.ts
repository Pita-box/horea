import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: public-business-page, Property 3: Status assignment.
 *
 * `createReservation` vrací `status` přesně podle toho, co vrátí RPC
 * `create_reservation`: výstupní status je `'approved'` PRÁVĚ TEHDY, když
 * `rpc.status === 'approved'`, jinak `'pending'`.
 *
 * Pozn.: Iff vazbu `approved ⟺ business.auto_approve_reservations` rozhoduje DB
 * funkce `create_reservation` v okamžiku zápisu (uvnitř transakce). Na hranici
 * TypeScriptu proto ověřujeme, že `ReservationCreator` status RPC pouze věrně
 * přemapuje a nepřidává vlastní rozhodování.
 *
 * Validates: Requirements 9.6
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

import { buildAdminClient, buildInput, rpcSuccess, validContactArb } from './_support/reservation-harness';

const NUM_RUNS = 100;
const SLOT = '09:00';

beforeEach(() => {
  vi.clearAllMocks();
  sendConfirmationMock.mockResolvedValue({ ok: true });
  sendNotificationMock.mockResolvedValue({ ok: true });
  // Slot je vždy dostupný v pre-lock listu, aby flow došel k zápisu.
  loadAvailableSlotsMock.mockResolvedValue([SLOT]);
});

describe('Property 3: přiřazení statusu rezervace', () => {
  it("výstupní status === 'approved' ⟺ rpc.status === 'approved'", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'approved' | 'pending'>('approved', 'pending'),
        validContactArb(),
        async (rpcStatus, contact) => {
          createAdminClientMock.mockReset();
          createAdminClientMock.mockReturnValue(
            buildAdminClient({ createReservation: rpcSuccess(rpcStatus) }),
          );

          const result = await createReservation(buildInput({ time: SLOT, ...contact }));

          expect(result.ok).toBe(true);
          if (result.ok) {
            // Iff vazba na status z RPC, oběma směry.
            expect(result.status === 'approved').toBe(rpcStatus === 'approved');
            expect(result.status).toBe(rpcStatus);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
