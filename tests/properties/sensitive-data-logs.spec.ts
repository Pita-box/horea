import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: public-business-page, Property 6: Sensitive data not in logs.
 *
 * Pro libovolný vstup a libovolnou cestu `ReservationCreator` (úspěch i různá
 * odmítnutí) NEOBSAHUJE žádná zalogovaná zpráva ani její kontext hodnoty
 * `clientPhone`, `clientEmail` ani `note` jako podřetězec. Logy smí nést jen
 * identifikátory entit a kategorii události (R18.4, R20.2 architektury).
 *
 * Validates: Requirements 18.4
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

import { anonymizeClient } from '@/server/ClientAnonymizer';
import { approveReservation } from '@/server/ReservationApprover';
import { cancelReservation } from '@/server/ReservationCanceller';
import { deleteReservation } from '@/server/ReservationDeleter';
import { editReservation } from '@/server/ReservationEditor';
import { markAttendance } from '@/server/AttendanceMarker';
import { rejectReservation } from '@/server/ReservationRejecter';
import { createManualReservation } from '@/server/ManualReservationCreator';
import { upsertClientFromReservation } from '@/server/ClientUpsertor';
import { createReservation } from '@/server/ReservationCreator';
import { exportReservationsCsv } from '@/server/CsvExporter';

import {
  buildAdminClient,
  buildInput,
  distinctiveContactArb,
  rpcConflict,
  rpcNotPublished,
  rpcSuccess,
} from './_support/reservation-harness';
import {
  buildEditorAdmin,
  buildMutationServerClient,
  makeState,
} from './_support/mutation-harness';

const NUM_RUNS = 100;
const SLOT = '09:00';

/** Logované cesty, které `ReservationCreator` prochází. */
type ScenarioKind =
  | 'business_not_found'
  | 'not_published'
  | 'service_not_found'
  | 'slot_unavailable'
  | 'rpc_conflict'
  | 'rpc_not_published'
  | 'success';

const scenarioKindArb = fc.constantFrom<ScenarioKind>(
  'business_not_found',
  'not_published',
  'service_not_found',
  'slot_unavailable',
  'rpc_conflict',
  'rpc_not_published',
  'success',
);

function configureScenario(kind: ScenarioKind): void {
  // Výchozí: slot dostupný v pre-lock listu.
  loadAvailableSlotsMock.mockResolvedValue([SLOT]);

  switch (kind) {
    case 'business_not_found':
      createAdminClientMock.mockReturnValue(buildAdminClient({ business: { data: null, error: null } }));
      break;
    case 'not_published':
      createAdminClientMock.mockReturnValue(buildAdminClient({ published: { data: false, error: null } }));
      break;
    case 'service_not_found':
      createAdminClientMock.mockReturnValue(buildAdminClient({ service: { data: null, error: null } }));
      break;
    case 'slot_unavailable':
      createAdminClientMock.mockReturnValue(buildAdminClient());
      loadAvailableSlotsMock.mockResolvedValue([]); // zvolený čas není v listu → 409
      break;
    case 'rpc_conflict':
      createAdminClientMock.mockReturnValue(buildAdminClient({ createReservation: rpcConflict() }));
      break;
    case 'rpc_not_published':
      createAdminClientMock.mockReturnValue(buildAdminClient({ createReservation: rpcNotPublished() }));
      break;
    case 'success':
      createAdminClientMock.mockReturnValue(buildAdminClient({ createReservation: rpcSuccess('pending') }));
      break;
  }
}

/** Bezpečná serializace zprávy + kontextu do jednoho prohledatelného řetězce. */
function serializeLogCall(call: unknown[]): string {
  return call
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    })
    .join(' ');
}

beforeEach(() => {
  vi.clearAllMocks();
  sendConfirmationMock.mockResolvedValue({ ok: true });
  sendNotificationMock.mockResolvedValue({ ok: true });
});

describe('Property 6: citlivá data klienta nejsou v lozích', () => {
  it('žádná log zpráva neobsahuje clientPhone, clientEmail ani note', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioKindArb, distinctiveContactArb(), async (kind, contact) => {
        logInfoMock.mockReset();
        logWarnMock.mockReset();
        logErrorMock.mockReset();
        createAdminClientMock.mockReset();
        loadAvailableSlotsMock.mockReset();

        configureScenario(kind);

        await createReservation(buildInput({ time: SLOT, ...contact }));

        const allCalls = [
          ...logInfoMock.mock.calls,
          ...logWarnMock.mock.calls,
          ...logErrorMock.mock.calls,
        ];

        // Alespoň jedna logovaná událost musí proběhnout (cesty jsou logované).
        expect(allCalls.length).toBeGreaterThan(0);

        for (const call of allCalls) {
          const serialized = serializeLogCall(call);
          expect(serialized).not.toContain(contact.clientPhone);
          expect(serialized).not.toContain(contact.clientEmail);
          expect(serialized).not.toContain(contact.note);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

/**
 * Feature: reservation-management, Property 8: Sensitive data not in logs.
 *
 * Pro LIBOVOLNOU mutaci dashboardu majitele (schválení, odmítnutí, zrušení,
 * úprava, smazání, ruční tvorba, docházka, upsert klienta, anonymizace, CSV
 * export) NEOBSAHUJE žádná zalogovaná zpráva ani její kontext hodnoty
 * `client_name` / `client_phone` / `client_email` / `client_note` jako
 * podřetězec. Logy nesou jen identifikátory entit, počty a kategorii události
 * (R10.5, R16.5, R17.6, R20.1, R20.2).
 *
 * Validates: Requirements 10.5, 16.5, 17.6, 20.1, 20.2
 */

const SLOT_TIME = '09:00';
const EDIT_DATE = '2025-06-16';

/** Mutace pokryté Property 8 (každá zaloguje alespoň jednu událost). */
type MutationKind =
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'edit'
  | 'delete'
  | 'manual_create'
  | 'attendance'
  | 'upsert'
  | 'anonymize'
  | 'csv_export';

const mutationKindArb = fc.constantFrom<MutationKind>(
  'approve',
  'reject',
  'cancel',
  'edit',
  'delete',
  'manual_create',
  'attendance',
  'upsert',
  'anonymize',
  'csv_export',
);

type Contact = { clientName: string; clientPhone: string; clientEmail: string; note: string };

/** Fake `@/lib/supabase/server` klient pro anonymizaci a CSV (auth + business). */
function buildOwnerServerClient(reservationRows: unknown[]): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }),
    },
    from(table: string) {
      if (table === 'reservations') {
        const q = {
          select: () => q,
          eq: () => q,
          gte: () => q,
          lte: () => q,
          in: () => q,
          order: () => q,
          range: () => q,
          returns: () => Promise.resolve({ data: reservationRows, error: null }),
        };
        return q;
      }
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: { id: 'biz-1' }, error: null }),
      };
      return b;
    },
  };
}

/** Fake admin pro anonymizaci — RPC vrací jen počet, žádné PII. */
function buildAnonymizeAdmin(): unknown {
  return {
    rpc: (fn: string) =>
      fn === 'anonymize_client'
        ? Promise.resolve({ data: [{ anonymized_count: 2 }], error: null })
        : Promise.resolve({ data: null, error: null }),
  };
}

/** Fake admin pro ruční tvorbu — services lookup + RPC + clients upsert (insert). */
function buildManualLogsAdmin(): unknown {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: () =>
          table === 'services'
            ? Promise.resolve({ data: { id: filters.id ?? 'svc-1', duration_minutes: 30 }, error: null })
            : Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ error: null }),
        then: <T1, T2>(
          onF?: ((value: { data: unknown[]; error: null }) => T1 | PromiseLike<T1>) | null,
          onR?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
        ) => Promise.resolve({ data: [] as unknown[], error: null }).then(onF, onR),
      };
      return builder;
    },
    rpc: (fn: string) =>
      fn === 'create_manual_reservation'
        ? Promise.resolve({
            data: { reservation_id: 'res-new', conflict: false, not_published: false },
            error: null,
          })
        : Promise.resolve({ data: null, error: null }),
  };
}

/** Fake `@/lib/supabase/server` klient pro ruční tvorbu (auth + business owner). */
function buildManualOwnerServerClient(): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }),
    },
    from(table: string) {
      const b = {
        select: () => b,
        eq: () => b,
        maybeSingle: () =>
          table === 'businesses'
            ? Promise.resolve({ data: { id: 'biz-1' }, error: null })
            : Promise.resolve({ data: null, error: null }),
      };
      return b;
    },
  };
}

/** Fake klient pro upsert, který na čtení selže → vynutí best-effort warn log. */
function buildUpsertFailingClient(): unknown {
  return {
    from() {
      const b = {
        select: () => b,
        eq: () => b,
        then: <T1, T2>(
          onF?: ((value: { data: null; error: { code: string; message: string } }) => T1 | PromiseLike<T1>) | null,
          onR?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
        ) =>
          Promise.resolve({ data: null, error: { code: 'PGRST500', message: 'db unavailable' } }).then(
            onF,
            onR,
          ),
      };
      return b;
    },
  };
}

/** Fake `@/lib/supabase/server` klient pro smazání (delete → eq → select). */
function buildDeleteServerClient(): unknown {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }),
    },
    from() {
      const b = {
        delete: () => b,
        eq: () => b,
        select: () => Promise.resolve({ data: [{ id: 'res-1', business_id: 'biz-1' }], error: null }),
      };
      return b;
    },
  };
}

/** Spustí danou mutaci s injektovanou výraznou PII. */
async function runMutation(kind: MutationKind, contact: Contact): Promise<void> {
  switch (kind) {
    case 'approve': {
      const state = makeState({
        status: 'pending',
        withEmbeds: true,
        client_name: contact.clientName,
        client_email: contact.clientEmail,
      });
      createServerClientMock.mockResolvedValue(buildMutationServerClient(state));
      await approveReservation(state.id);
      return;
    }
    case 'reject': {
      const state = makeState({
        status: 'pending',
        withEmbeds: true,
        client_name: contact.clientName,
        client_email: contact.clientEmail,
      });
      createServerClientMock.mockResolvedValue(buildMutationServerClient(state));
      await rejectReservation(state.id, 'duvod-odmitnuti');
      return;
    }
    case 'cancel': {
      const state = makeState({
        status: 'approved',
        withEmbeds: true,
        client_name: contact.clientName,
        client_email: contact.clientEmail,
      });
      createServerClientMock.mockResolvedValue(buildMutationServerClient(state));
      await cancelReservation(state.id, 'duvod-zruseni');
      return;
    }
    case 'edit': {
      const state = makeState({ status: 'approved', client_name: contact.clientName });
      createServerClientMock.mockResolvedValue(buildMutationServerClient(state));
      createAdminClientMock.mockReturnValue(
        buildEditorAdmin({
          rpcRow: { updated: true, conflict: false, invalid: false },
          clientEmail: contact.clientEmail,
        }),
      );
      loadAvailableSlotsMock.mockResolvedValue([SLOT_TIME]);
      await editReservation({
        reservationId: state.id,
        serviceId: 'svc-1',
        date: EDIT_DATE,
        time: SLOT_TIME,
      });
      return;
    }
    case 'delete': {
      createServerClientMock.mockResolvedValue(buildDeleteServerClient());
      await deleteReservation('res-1');
      return;
    }
    case 'attendance': {
      const state = makeState({ status: 'approved', client_name: contact.clientName });
      createServerClientMock.mockResolvedValue(buildMutationServerClient(state));
      await markAttendance(state.id, 'attended');
      return;
    }
    case 'manual_create': {
      createServerClientMock.mockResolvedValue(buildManualOwnerServerClient());
      createAdminClientMock.mockReturnValue(buildManualLogsAdmin());
      loadAvailableSlotsMock.mockResolvedValue([SLOT_TIME]);
      await createManualReservation({
        serviceId: 'svc-1',
        date: EDIT_DATE,
        time: SLOT_TIME,
        clientName: contact.clientName,
        clientPhone: contact.clientPhone,
        clientEmail: contact.clientEmail,
        note: contact.note,
      });
      return;
    }
    case 'upsert': {
      await upsertClientFromReservation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: buildUpsertFailingClient() as any,
        businessId: 'biz-1',
        clientName: contact.clientName,
        clientPhone: contact.clientPhone,
        clientEmail: contact.clientEmail,
      });
      return;
    }
    case 'anonymize': {
      createServerClientMock.mockResolvedValue(buildOwnerServerClient([]));
      createAdminClientMock.mockReturnValue(buildAnonymizeAdmin());
      await anonymizeClient('client-1');
      return;
    }
    case 'csv_export': {
      const rows = [
        {
          id: 'res-1',
          starts_at: '2025-06-16T07:00:00.000Z',
          ends_at: '2025-06-16T07:30:00.000Z',
          status: 'approved',
          attendance: null,
          client_name: contact.clientName,
          client_phone: contact.clientPhone,
          client_email: contact.clientEmail,
          note: contact.note,
          created_at: '2025-06-15T07:00:00.000Z',
          services: { name: 'Strihani' },
        },
      ];
      createServerClientMock.mockResolvedValue(buildOwnerServerClient(rows));
      await exportReservationsCsv({});
      return;
    }
  }
}

describe('Property 8: citlivá data klienta nejsou v lozích mutací', () => {
  it('žádná log zpráva neobsahuje client_name/phone/email/note pro libovolnou mutaci', async () => {
    await fc.assert(
      fc.asyncProperty(mutationKindArb, distinctiveContactArb(), async (kind, contact) => {
        logInfoMock.mockReset();
        logWarnMock.mockReset();
        logErrorMock.mockReset();
        createServerClientMock.mockReset();
        createAdminClientMock.mockReset();
        loadAvailableSlotsMock.mockReset();
        dispatchEmailMock.mockReset();
        dispatchEmailMock.mockResolvedValue({ ok: true });

        await runMutation(kind, contact);

        const allCalls = [
          ...logInfoMock.mock.calls,
          ...logWarnMock.mock.calls,
          ...logErrorMock.mock.calls,
        ];

        // Každá mutace zaloguje alespoň jednu událost.
        expect(allCalls.length).toBeGreaterThan(0);

        for (const call of allCalls) {
          const serialized = serializeLogCall(call);
          expect(serialized).not.toContain(contact.clientName);
          expect(serialized).not.toContain(contact.clientPhone);
          expect(serialized).not.toContain(contact.clientEmail);
          expect(serialized).not.toContain(contact.note);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
