import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: reservation-management, Property 2: Edit atomicity.
 *
 * `Reservation_Editor` sdílí atomický blok s `ReservationCreator` přes
 * `atomicSlotWrite`, ale s jedním rozdílem — VYLUČUJE upravovanou rezervaci
 * z konfliktní kontroly (`excludeReservationId`). Property ověřuje nad mock DB
 * (reálný `atomicSlotWrite` + mock `loadAvailableSlots` modelující exkluzi):
 *
 *  - Úprava ponechávající čas (a/nebo měnící jen službu) NESELŽE kvůli konfliktu
 *    se sebou — vlastní slot je z pre-lock listu vyloučen, takže je vždy dostupný.
 *  - Zápis (RPC `edit_reservation`) proběhne PRÁVĚ TEHDY, je-li zvolený slot
 *    dostupný v pre-lock listu; jinak se RPC VŮBEC nevolá a vrátí se 409.
 *  - Pokud slot pod zámkem mezitím obsadí jiný zápis (race → RPC vrátí
 *    `conflict`/`!updated`), úprava se NEPROVEDE (rollback) a vrátí 409
 *    s aktualizovaným Available_Slot_List.
 *
 * Pozn.: Skutečná DB exkluze `id != excludeReservationId` žije v
 * `loadAvailableSlots` / RPC (overlap re-check pod advisory lockem). Na hranici
 * TypeScriptu ověřujeme, že editor exkluzi VŽDY zapojí (předá `excludeReservationId`)
 * a že rozhodovací logika kolem zápisu je správná; samotnou exkluzi modeluje mock.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.7
 */

const createClientMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const loadAvailableSlotsMock = vi.hoisted(() => vi.fn());
const dispatchEmailMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@/server/slots/loadAvailableSlots', () => ({ loadAvailableSlots: loadAvailableSlotsMock }));
vi.mock('@/lib/email/dispatcher', () => ({ dispatchTransactionalEmail: dispatchEmailMock }));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { editReservation } from '@/server/ReservationEditor';

import {
  buildEditorAdmin,
  buildMutationServerClient,
  makeState,
  TIME_POOL,
  type EditRpcRow,
} from './_support/mutation-harness';

const NUM_RUNS = 100;
const DATE = '2025-06-16';
const RESERVATION_ID = 'res-1';
/** Čas, který upravovaná rezervace aktuálně zabírá (její „vlastní" slot). */
const SELF_TIME = '10:00';

/** Výsledek RPC `edit_reservation` pod zámkem (success / race conflict / invalid stav). */
type RaceOutcome = 'updated' | 'conflict' | 'invalid';

const raceOutcomeArb = fc.constantFrom<RaceOutcome>('updated', 'conflict', 'invalid');

function rpcRowFor(outcome: RaceOutcome): EditRpcRow {
  switch (outcome) {
    case 'updated':
      return { updated: true, conflict: false, invalid: false };
    case 'conflict':
      return { updated: false, conflict: true, invalid: false };
    case 'invalid':
      return { updated: false, conflict: false, invalid: true };
  }
}

/**
 * Scénář: které časy zabírají JINÉ aktivní rezervace, na jaký čas upravujeme
 * a jak dopadne zápis pod zámkem.
 */
const scenarioArb = fc.record({
  occupiedByOthers: fc.uniqueArray(fc.constantFrom(...TIME_POOL), {
    minLength: 0,
    maxLength: 5,
  }),
  targetTime: fc.constantFrom(...TIME_POOL),
  race: raceOutcomeArb,
});

beforeEach(() => {
  vi.clearAllMocks();
  dispatchEmailMock.mockResolvedValue({ ok: true });
});

describe('Property 2: atomicita úpravy (vyloučení sebe sama)', () => {
  it('zápis ⟺ slot dostupný pod exkluzí; vlastní slot nikdy nekoliduje sám se sebou; race → rollback', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        createClientMock.mockReset();
        createAdminClientMock.mockReset();
        loadAvailableSlotsMock.mockReset();

        const state = makeState({ id: RESERVATION_ID, status: 'approved' });
        createClientMock.mockResolvedValue(buildMutationServerClient(state));

        const admin = buildEditorAdmin({ rpcRow: rpcRowFor(scenario.race) });
        createAdminClientMock.mockReturnValue(admin);

        // Model `loadAvailableSlots` s exkluzí: vlastní rezervaci (excludeReservationId
        // === RESERVATION_ID) z obsazenosti VYŘADÍ, takže její vlastní slot je dostupný.
        // Pokud by editor exkluzi nezapojil, vlastní slot by chyběl a self-úprava by selhala.
        loadAvailableSlotsMock.mockImplementation(
          async (_client: unknown, params: { excludeReservationId?: string }) => {
            const occupied = new Set<string>(scenario.occupiedByOthers);
            if (params.excludeReservationId !== RESERVATION_ID) {
              occupied.add(SELF_TIME);
            }
            return TIME_POOL.filter((time) => !occupied.has(time));
          },
        );

        const result = await editReservation({
          reservationId: RESERVATION_ID,
          serviceId: 'svc-1',
          date: DATE,
          time: scenario.targetTime,
        });

        const slotAvailable = !scenario.occupiedByOthers.includes(scenario.targetTime);
        const rpcCalled = admin.__rpcCalls.includes('edit_reservation');

        if (!slotAvailable) {
          // Slot obsazen jinou rezervací → pre-lock list ho nemá → RPC se NEVOLÁ (R9.4).
          expect(rpcCalled).toBe(false);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe(409);
          }
          return;
        }

        // Slot dostupný (vč. vlastního slotu při ponechání času) → RPC proběhne.
        expect(rpcCalled).toBe(true);

        if (scenario.race === 'updated') {
          // Úspěšný zápis pod zámkem → úprava uložena.
          expect(result.ok).toBe(true);
        } else {
          // Race conflict NEBO nelegální stav → žádná změna, rollback, 409 (R9.4).
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBe(409);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('úprava ponechávající vlastní čas neselže kvůli konfliktu se sebou', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.constantFrom(...TIME_POOL.filter((t) => t !== SELF_TIME)), {
          minLength: 0,
          maxLength: 5,
        }),
        async (occupiedByOthers) => {
          createClientMock.mockReset();
          createAdminClientMock.mockReset();
          loadAvailableSlotsMock.mockReset();

          const state = makeState({ id: RESERVATION_ID, status: 'approved' });
          createClientMock.mockResolvedValue(buildMutationServerClient(state));

          const admin = buildEditorAdmin({ rpcRow: { updated: true, conflict: false, invalid: false } });
          createAdminClientMock.mockReturnValue(admin);

          loadAvailableSlotsMock.mockImplementation(
            async (_client: unknown, params: { excludeReservationId?: string }) => {
              const occupied = new Set<string>(occupiedByOthers);
              if (params.excludeReservationId !== RESERVATION_ID) {
                occupied.add(SELF_TIME);
              }
              return TIME_POOL.filter((time) => !occupied.has(time));
            },
          );

          // Úprava ponechávající VLASTNÍ čas (SELF_TIME) — typický „změna jen služby".
          const result = await editReservation({
            reservationId: RESERVATION_ID,
            serviceId: 'svc-2',
            date: DATE,
            time: SELF_TIME,
          });

          // Nikdy neselže kvůli konfliktu se sebou: RPC proběhne a zápis uspěje.
          expect(admin.__rpcCalls).toContain('edit_reservation');
          expect(result.ok).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
