import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: reservation-management, Property 3: Manual creation status.
 *
 * `Manual_Reservation_Creator` zakládá rezervaci jménem majitele se statusem
 * VŽDY `approved`, NEZÁVISLE na `business.auto_approve_reservations` (R12.4).
 * Property ověřuje nad mock DB pro libovolnou hodnotu auto-approve:
 *
 *  - ruční tvorba routuje na approved-only RPC `create_manual_reservation`
 *    (NIKDY na `create_reservation`, které ctí auto-approve), a
 *  - do RPC NEPŘEDÁVÁ žádný `auto_approve` parametr — rozhodnutí o statusu tedy
 *    nemůže na auto-approve záviset, a
 *  - výsledek je úspěšný (`ok: true`) bez ohledu na auto-approve.
 *
 * Pozn.: Samotné přiřazení `status = 'approved'` provádí DB funkce
 * `create_manual_reservation` v okamžiku insertu (uvnitř transakce). Na hranici
 * TypeScriptu proto ověřujeme, že creator vždy volí tuto approved-only cestu a
 * auto-approve do rozhodování vůbec nevstupuje — to je TS-úroveň invariantu
 * „status == 'approved' pro libovolný auto_approve_reservations".
 *
 * Validates: Requirements 12.4
 */

const createClientMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const loadAvailableSlotsMock = vi.hoisted(() => vi.fn());
const upsertClientMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@/server/slots/loadAvailableSlots', () => ({ loadAvailableSlots: loadAvailableSlotsMock }));
vi.mock('@/server/ClientUpsertor', () => ({ upsertClientFromReservation: upsertClientMock }));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { createManualReservation } from '@/server/ManualReservationCreator';

import {
  buildManualAdmin,
  buildManualServerClient,
  type ManualRpcRow,
} from './_support/mutation-harness';

const NUM_RUNS = 100;
const DATE = '2025-06-16';
const TIME = '09:00';

/** Validní kontaktní pole pro ruční tvorbu (jméno + alespoň jeden kontakt). */
const contactArb = fc.record({
  clientName: fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 15 })
    .map((chars) => `Jan ${chars.join('')}`),
  clientPhone: fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 12 })
    .map((digits) => `+420${digits.join('')}`),
});

beforeEach(() => {
  vi.clearAllMocks();
  upsertClientMock.mockResolvedValue(undefined);
  // Slot je vždy dostupný v pre-lock listu, aby flow došel k zápisu.
  loadAvailableSlotsMock.mockResolvedValue([TIME]);
});

describe('Property 3: status ruční tvorby je vždy approved', () => {
  it("výsledek == approved-only RPC pro libovolný auto_approve_reservations", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), contactArb, async (autoApprove, contact) => {
        createClientMock.mockReset();
        createAdminClientMock.mockReset();

        createClientMock.mockResolvedValue(buildManualServerClient({ autoApprove }));

        const rpcRow: ManualRpcRow = {
          reservation_id: 'res-new',
          conflict: false,
          not_published: false,
        };
        const admin = buildManualAdmin({ rpcRow });
        createAdminClientMock.mockReturnValue(admin);

        const result = await createManualReservation({
          serviceIds: ['svc-1'],
          date: DATE,
          time: TIME,
          clientName: contact.clientName,
          clientPhone: contact.clientPhone,
          clientEmail: '',
        });

        // (1) Úspěch nezávisí na auto-approve.
        expect(result.ok).toBe(true);

        // (2) Routuje VÝHRADNĚ na approved-only RPC (ne create_reservation_multi).
        expect(admin.__rpcCalls).toContain('create_manual_reservation_multi');
        expect(admin.__rpcCalls).not.toContain('create_reservation_multi');

        // (3) Do RPC se NEPŘEDÁVÁ žádný auto_approve parametr → status nemůže na něm záviset.
        const manualCall = admin.__rpcArgs.find(
          (entry) => entry.fn === 'create_manual_reservation_multi',
        );
        expect(manualCall).toBeDefined();
        const argKeys = Object.keys((manualCall?.args ?? {}) as Record<string, unknown>);
        expect(argKeys.some((key) => key.toLowerCase().includes('auto_approve'))).toBe(false);
        expect(argKeys.some((key) => key.toLowerCase().includes('approve'))).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
