import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: public-business-page, Property 4: Email best-effort.
 *
 * Pro libovolnou kombinaci selhání obou transakčních e-mailů
 * (`sendReservationConfirmation` / `sendReservationNotification` vrátí
 * `{ ok: false }` NEBO odmítne promise) platí, že `createReservation` při
 * úspěšném RPC stále vrátí `ok: true` se správným statusem — selhání e-mailu
 * NEZMĚNÍ úspěšný výsledek rezervace (rezervace „existuje" po commitu).
 *
 * Validates: Requirements 10.3, 11.3
 *
 * ---
 *
 * Feature: reservation-management, Property 7: Email best-effort.
 *
 * Tentýž best-effort invariant platí i pro MUTACE dashboardu majitele
 * (`Reservation_Approver` / `Reservation_Rejecter` / `Reservation_Canceller` /
 * `Reservation_Editor`), které odesílají e-mail přes sdílený `Email_Dispatcher`
 * AŽ po commitu DB změny. Pro libovolný výsledek odeslání (úspěch i selhání,
 * `dispatchTransactionalEmail` vrátí `{ ok: true | false }`) přetrvá DB změna
 * mutace a selhání e-mailu NIKDY nezpůsobí rollback. Druhý describe blok níže
 * pokrývá tuto feature; horní blok ponechává původní pokrytí veřejné cesty.
 *
 * Validates: Requirements 6.4, 7.6, 8.6, 9.6, 18.6, 18.7
 */

const createAdminClientMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const loadAvailableSlotsMock = vi.hoisted(() => vi.fn());
const sendConfirmationMock = vi.hoisted(() => vi.fn());
const sendNotificationMock = vi.hoisted(() => vi.fn());
const dispatchEmailMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createServerClientMock }));
vi.mock('@/server/slots/loadAvailableSlots', () => ({ loadAvailableSlots: loadAvailableSlotsMock }));
vi.mock('@/server/EmailNotifier', () => ({
  sendReservationConfirmation: sendConfirmationMock,
  sendReservationNotification: sendNotificationMock,
}));
vi.mock('@/lib/email/dispatcher', () => ({ dispatchTransactionalEmail: dispatchEmailMock }));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { approveReservation } from '@/server/ReservationApprover';
import { cancelReservation } from '@/server/ReservationCanceller';
import { editReservation } from '@/server/ReservationEditor';
import { rejectReservation } from '@/server/ReservationRejecter';
import { createReservation } from '@/server/ReservationCreator';

import { buildAdminClient, buildInput, rpcSuccess, validContactArb } from './_support/reservation-harness';
import {
  buildEditorAdmin,
  buildMutationServerClient,
  makeState,
} from './_support/mutation-harness';

const NUM_RUNS = 100;
const SLOT = '09:00';

/** Tři způsoby chování e-mailového kanálu: úspěch, ok:false, odmítnutá promise. */
type EmailBehavior = 'ok' | 'soft_fail' | 'reject';

const emailBehaviorArb = fc.constantFrom<EmailBehavior>('ok', 'soft_fail', 'reject');

function applyBehavior(mock: ReturnType<typeof vi.fn>, behavior: EmailBehavior): void {
  if (behavior === 'ok') {
    mock.mockResolvedValue({ ok: true });
  } else if (behavior === 'soft_fail') {
    mock.mockResolvedValue({ ok: false });
  } else {
    // `EmailNotifier` je async, takže „hození" odpovídá odmítnuté promise.
    mock.mockRejectedValue(new Error('resend_unavailable'));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  loadAvailableSlotsMock.mockResolvedValue([SLOT]);
});

describe('Property 4: e-maily jsou best-effort', () => {
  it('selhání confirmation i notification e-mailu nezmění úspěšný výsledek rezervace', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailBehaviorArb,
        emailBehaviorArb,
        fc.constantFrom<'approved' | 'pending'>('approved', 'pending'),
        validContactArb(),
        async (confirmationBehavior, notificationBehavior, rpcStatus, contact) => {
          createAdminClientMock.mockReset();
          sendConfirmationMock.mockReset();
          sendNotificationMock.mockReset();

          createAdminClientMock.mockReturnValue(
            buildAdminClient({ createReservation: rpcSuccess(rpcStatus) }),
          );
          applyBehavior(sendConfirmationMock, confirmationBehavior);
          applyBehavior(sendNotificationMock, notificationBehavior);

          const result = await createReservation(buildInput({ time: SLOT, ...contact }));

          // Rezervace existuje po commitu bez ohledu na osud e-mailů.
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.status).toBe(rpcStatus);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

/** Výsledek odeslání přes sdílený Email_Dispatcher (kontrakt: nikdy nevyhodí). */
type DispatchOutcome = 'ok' | 'fail';

const dispatchOutcomeArb = fc.constantFrom<DispatchOutcome>('ok', 'fail');

/** Status mutace s embeds (e-mail klientovi) + jejich povolený výchozí stav a cíl. */
const STATUS_MUTATIONS = {
  approve: { from: 'pending' as const, to: 'approved' as const },
  reject: { from: 'pending' as const, to: 'rejected' as const },
  cancel: { from: 'approved' as const, to: 'cancelled' as const },
} as const;

type StatusMutation = keyof typeof STATUS_MUTATIONS;

const statusMutationArb = fc.constantFrom<StatusMutation>('approve', 'reject', 'cancel');

describe('Property 7: e-maily mutací jsou best-effort (reservation-management)', () => {
  it('selhání e-mailu po status mutaci (approve/reject/cancel) nezruší DB změnu', async () => {
    await fc.assert(
      fc.asyncProperty(statusMutationArb, dispatchOutcomeArb, async (mutation, outcome) => {
        createServerClientMock.mockReset();
        dispatchEmailMock.mockReset();
        dispatchEmailMock.mockResolvedValue({ ok: outcome === 'ok' });

        const transition = STATUS_MUTATIONS[mutation];
        // withEmbeds + client_email ⇒ akce dojde k odeslání e-mailu.
        const state = makeState({
          status: transition.from,
          withEmbeds: true,
          client_email: 'klient@example.cz',
        });
        createServerClientMock.mockResolvedValue(buildMutationServerClient(state));

        let result;
        if (mutation === 'approve') {
          result = await approveReservation(state.id);
        } else if (mutation === 'reject') {
          result = await rejectReservation(state.id, 'duvod');
        } else {
          result = await cancelReservation(state.id, 'duvod');
        }

        // DB změna proběhla (po commitu) a přetrvá bez ohledu na osud e-mailu.
        expect(result.ok).toBe(true);
        expect(state.status).toBe(transition.to);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('selhání Reservation_Modified_Email nezruší uloženou úpravu', async () => {
    await fc.assert(
      fc.asyncProperty(dispatchOutcomeArb, async (outcome) => {
        createServerClientMock.mockReset();
        createAdminClientMock.mockReset();
        loadAvailableSlotsMock.mockReset();
        dispatchEmailMock.mockReset();

        dispatchEmailMock.mockResolvedValue({ ok: outcome === 'ok' });
        loadAvailableSlotsMock.mockResolvedValue([SLOT]);

        const state = makeState({ status: 'approved' });
        createServerClientMock.mockResolvedValue(buildMutationServerClient(state));
        createAdminClientMock.mockReturnValue(
          buildEditorAdmin({
            rpcRow: { updated: true, conflict: false, invalid: false },
            clientEmail: 'klient@example.cz',
          }),
        );

        const result = await editReservation({
          reservationId: state.id,
          serviceIds: ['svc-1'],
          date: '2025-06-16',
          time: SLOT,
        });

        // RPC commitnul úpravu PŘED odesláním e-mailu → selhání e-mailu nerollbackuje.
        expect(result.ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
