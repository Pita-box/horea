/**
 * Sdílené runtime utility pro property testy MUTACÍ feature `reservation-management`
 * (status přechody 7.5, atomicita úpravy 9.4, status ruční tvorby 9.5,
 * e-mail best-effort 9.6).
 *
 * Tento modul NENÍ test (nemá příponu `.spec.ts`), takže ho vitest nesbírá jako
 * testovací soubor — slouží jen jako generátory `fast-check` a stavitelé fake
 * Supabase klientů. Drží se stejného stylu jako `reservation-harness.ts`:
 * fake klienty řídí předaný scénář a nezávisí na ničem, co se v testech mockuje.
 */
import fc from 'fast-check';

/** Stav rezervace — hodnoty DB enumu `public.reservation_status`. */
export type ResStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const RES_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export const statusArb = fc.constantFrom<ResStatus>(...RES_STATUSES);

/** Docházka — hodnoty DB enumu `public.attendance_status` (+ `null`). */
export type Attendance = 'attended' | 'no_show' | null;

export const attendanceArb = fc.constantFrom<Attendance>('attended', 'no_show', null);

/** Pool počátečních časů (Europe/Prague) sdílený s `reservation-harness`. */
export const TIME_POOL = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
] as const;

/** Tvar výsledku Supabase dotazu/RPC, který fake klient vrací. */
export type SupabaseResult<T> = { data: T | null; error: unknown };

const SERVICE_EMBED = { name: 'Strihani', duration_minutes: 30, price_czk: 300 };
const BUSINESS_EMBED = { name: 'Kavarna U Lipy', slug: 'kavarna' };

/**
 * Mutovatelný stav jedné rezervace, který fake server klient čte i zapisuje.
 * Property testy po běhu akce čtou `state.status`, aby ověřily, zda (ne)došlo
 * ke změně stavu.
 */
export type MutationState = {
  id: string;
  businessId: string;
  status: ResStatus;
  status_reason: string | null;
  attendance: Attendance;
  /** ISO UTC; výchozí je v minulosti, aby prošla časová brána docházky. */
  starts_at: string;
  client_email: string | null;
  client_name: string;
  /** Když `true`, vrácený řádek nese embed služby + podniku (spustí e-mail). */
  withEmbeds: boolean;
};

export function makeState(overrides: Partial<MutationState> = {}): MutationState {
  return {
    id: 'res-1',
    businessId: 'biz-1',
    status: 'pending',
    status_reason: null,
    attendance: null,
    // Pevně v minulosti (2020) — časová brána `Attendance_Marker` propustí.
    starts_at: '2020-01-01T08:00:00.000Z',
    client_email: null,
    client_name: 'Klient Testovaci',
    withEmbeds: false,
    ...overrides,
  };
}

function rowFor(state: MutationState) {
  return {
    id: state.id,
    business_id: state.businessId,
    client_email: state.client_email,
    client_name: state.client_name,
    starts_at: state.starts_at,
    status_reason: state.status_reason,
    services: state.withEmbeds ? SERVICE_EMBED : null,
    businesses: state.withEmbeds ? BUSINESS_EMBED : null,
  };
}

export type FakeServerClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from: (table: string) => unknown;
};

/**
 * Fake `@/lib/supabase/server` klient (createClient) sdílený mutačními akcemi
 * `Reservation_Approver` / `Reservation_Rejecter` / `Reservation_Canceller`
 * (podmíněný UPDATE + select), `Attendance_Marker` (select + update bez select)
 * a serverovými lookupy `Reservation_Editor` (reservations + ownership).
 *
 * Simuluje JEDINOU rezervaci v `state`. Podmíněný UPDATE
 * (`.eq('id').eq('status', X).select()`) ovlivní řádek POUZE tehdy, je-li
 * `state.status === X` — přesně jako atomický status guard v DB. Při shodě
 * zapíše `payload` do `state` (změní status) a vrátí řádek; jinak vrátí prázdné
 * pole (žádná změna).
 */
export function buildMutationServerClient(
  state: MutationState,
  options: { user?: { id: string } | null } = {},
): FakeServerClient {
  const user = options.user === undefined ? { id: 'owner-1' } : options.user;

  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from(table: string) {
      const op = {
        table,
        type: 'select' as 'select' | 'update' | 'update_select',
        payload: null as Record<string, unknown> | null,
        filters: {} as Record<string, unknown>,
      };

      function resolveMaybeSingle(): SupabaseResult<unknown> {
        if (op.table === 'reservations') {
          if (op.filters.id !== state.id) {
            return { data: null, error: null };
          }
          return {
            data: { id: state.id, business_id: state.businessId, starts_at: state.starts_at },
            error: null,
          };
        }
        if (op.table === 'businesses') {
          // Ownership check `Reservation_Editor`: id + owner_user_id.
          if (op.filters.id === state.businessId) {
            return { data: { id: state.businessId }, error: null };
          }
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }

      function resolveThenable(): SupabaseResult<unknown> {
        if (op.type === 'update_select') {
          const idOk = op.filters.id === state.id;
          const statusOk =
            op.filters.status === undefined || state.status === op.filters.status;
          if (!idOk || !statusOk) {
            return { data: [], error: null };
          }
          Object.assign(state, op.payload);
          return { data: [rowFor(state)], error: null };
        }
        if (op.type === 'update') {
          // `Attendance_Marker` UPDATE bez select — aplikuje attendance.
          if (op.filters.id === state.id) {
            Object.assign(state, op.payload);
          }
          return { error: null, data: null };
        }
        return { data: null, error: null };
      }

      const builder = {
        select() {
          op.type = op.type === 'update' ? 'update_select' : 'select';
          return builder;
        },
        update(payload: Record<string, unknown>) {
          op.type = 'update';
          op.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          op.filters[column] = value;
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(resolveMaybeSingle());
        },
        then<TResult1 = unknown, TResult2 = never>(
          onFulfilled?: ((value: SupabaseResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(resolveThenable()).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  };
}

export type FakeEditorAdmin = {
  __rpcCalls: string[];
  __rpcArgs: Array<{ fn: string; args: unknown }>;
  from: (table: string) => unknown;
  rpc: (fn: string, args?: unknown) => Promise<SupabaseResult<unknown>>;
};

export type EditRpcRow = { updated: boolean; conflict: boolean; invalid: boolean };

/**
 * Fake `@/lib/supabase/admin` klient (createAdminClient) pro `Reservation_Editor`.
 * Podporuje právě volání, která editor dělá v server kontextu:
 *  - `from('services').select(...).in('id', ids).eq('business_id', id).returns()`
 *    → POLE řádků služeb (multi-service `edit_reservation_multi`),
 *  - `rpc('edit_reservation_multi', ...)` → výsledek pod zámkem (race simulace),
 *  - post-commit lookupy `from('businesses')` / `from('reservations')` pro e-mail
 *    (client_email = null ⇒ dispatch se přeskočí; e-mail tu netestujeme).
 */
export function buildEditorAdmin(options: {
  rpcRow?: EditRpcRow;
  serviceDurationMinutes?: number;
  serviceExists?: boolean;
  /** E-mail klienta pro post-commit dispatch (default `null` ⇒ dispatch se přeskočí). */
  clientEmail?: string | null;
}): FakeEditorAdmin {
  const rpcRow = options.rpcRow ?? { updated: true, conflict: false, invalid: false };
  const duration = options.serviceDurationMinutes ?? 30;
  const serviceExists = options.serviceExists ?? true;
  const clientEmail = options.clientEmail ?? null;
  const rpcCalls: string[] = [];
  const rpcArgs: Array<{ fn: string; args: unknown }> = [];

  return {
    __rpcCalls: rpcCalls,
    __rpcArgs: rpcArgs,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const ids: unknown[] = [];
      const builder = {
        select() {
          return builder;
        },
        in(_column: string, value: unknown[]) {
          ids.push(...value);
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        // Multi-service: služby se čtou přes `.in(...).returns()` → POLE řádků.
        returns() {
          if (table === 'services') {
            if (!serviceExists) {
              return Promise.resolve({ data: [], error: null });
            }
            const rows = ids.map((id) => ({
              id,
              name: 'Strihani',
              duration_minutes: duration,
              price_czk: 300,
            }));
            return Promise.resolve({ data: rows, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (table === 'businesses') {
            return Promise.resolve({ data: { name: 'Kavarna U Lipy', slug: 'kavarna' }, error: null });
          }
          if (table === 'reservations') {
            // client_email = null ⇒ dispatchModifiedEmail se přeskočí.
            return Promise.resolve({
              data: { client_name: 'Klient', client_email: clientEmail },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
    rpc(fn: string, args?: unknown) {
      rpcCalls.push(fn);
      rpcArgs.push({ fn, args });
      if (fn === 'edit_reservation_multi') {
        return Promise.resolve({ data: rpcRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

export type ManualRpcRow = {
  reservation_id: string | null;
  conflict: boolean;
  not_published: boolean;
  invalid: boolean;
};

/**
 * Fake `@/lib/supabase/admin` klient pro `Manual_Reservation_Creator`.
 * Podporuje `from('services').select('id').in(...).eq(...).returns()` lookup
 * (POLE řádků) a `rpc('create_manual_reservation_multi', ...)`.
 * Zaznamenává volané RPC + argumenty, aby šlo ověřit, že ruční tvorba routuje
 * na approved-only RPC a NEpředává žádný `auto_approve` parametr (Property 3).
 */
export function buildManualAdmin(options: {
  rpcRow?: ManualRpcRow;
  serviceDurationMinutes?: number;
}): FakeEditorAdmin {
  const rpcRow = options.rpcRow ?? {
    reservation_id: 'res-new',
    conflict: false,
    not_published: false,
    invalid: false,
  };
  const rpcCalls: string[] = [];
  const rpcArgs: Array<{ fn: string; args: unknown }> = [];

  return {
    __rpcCalls: rpcCalls,
    __rpcArgs: rpcArgs,
    from(table: string) {
      const ids: unknown[] = [];
      const builder = {
        select() {
          return builder;
        },
        in(_column: string, value: unknown[]) {
          ids.push(...value);
          return builder;
        },
        eq() {
          return builder;
        },
        returns() {
          if (table === 'services') {
            return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return builder;
    },
    rpc(fn: string, args?: unknown) {
      rpcCalls.push(fn);
      rpcArgs.push({ fn, args });
      if (fn === 'create_manual_reservation_multi') {
        return Promise.resolve({ data: rpcRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

/**
 * Fake `@/lib/supabase/server` klient pro `Manual_Reservation_Creator`:
 * auth.getUser + odvození podniku majitele (`businesses.owner_user_id = user.id`).
 * `auto_approve_reservations` je v řádku přítomen, ale kód ho NEČTE — což je
 * jádro Property 3 (status nezávisí na auto-approve).
 */
export function buildManualServerClient(options: {
  user?: { id: string } | null;
  businessId?: string;
  autoApprove: boolean;
}): FakeServerClient {
  const user = options.user === undefined ? { id: 'owner-1' } : options.user;
  const businessId = options.businessId ?? 'biz-1';

  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        maybeSingle() {
          if (table === 'businesses') {
            return Promise.resolve({
              data: { id: businessId, auto_approve_reservations: options.autoApprove },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
}
