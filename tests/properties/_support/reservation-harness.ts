/**
 * Sdílené runtime utility pro property testy `ReservationCreator` (7.4–7.6, 7.8).
 *
 * Tento modul NENÍ test (nemá příponu `.spec.ts`), takže ho vitest nesbírá jako
 * testovací soubor — slouží jen jako generátory `fast-check` a stavitel fake
 * Supabase klienta. Modul je čistý: neimportuje nic, co by se v testech mockovalo,
 * proto ho lze importovat běžně vedle `vi.mock` továren.
 */
import fc from 'fast-check';

import type { CreateReservationInput } from '@/server/ReservationCreator';

/** Pevné datum (Europe/Prague) použité ve scénářích — pondělí 16. 6. 2025. */
export const DATE = '2025-06-16';

/** Pool počátečních časů, ze kterého se skládají pre-lock slot listy. */
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

/** Řádek vracený RPC `create_reservation` (zrcadlí `CreateReservationRpcRow`). */
export type CreateReservationRpcRow = {
  reservation_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
  conflict: boolean;
  not_published: boolean;
};

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
  contact_email: string | null;
  auto_approve_reservations: boolean;
  owner_user_id: string;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price_czk: number | string;
};

/** Konfigurace všech návratů, které fake admin klient poskytuje. */
export type AdminScenario = {
  business: SupabaseResult<BusinessRow>;
  published: SupabaseResult<boolean>;
  service: SupabaseResult<ServiceRow>;
  users: SupabaseResult<{ email: string }>;
  createReservation: SupabaseResult<CreateReservationRpcRow>;
};

export type FakeAdminClient = {
  /** Pořadí volaných RPC funkcí — pro ověření, že `create_reservation` (ne)proběhlo. */
  __rpcCalls: string[];
  from: (table: string) => {
    select: () => unknown;
    eq: () => unknown;
    maybeSingle: () => Promise<SupabaseResult<unknown>>;
  };
  rpc: (fn: string, args?: unknown) => Promise<SupabaseResult<unknown>>;
};

/** Publikovaný business s validní vazbou na službu (výchozí „happy" kontext). */
export function publishedBusiness(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: 'biz-1',
    slug: 'kavarna',
    name: 'Kavarna U Lipy',
    phone: null,
    contact_email: null,
    auto_approve_reservations: false,
    owner_user_id: 'owner-1',
    ...overrides,
  };
}

export function validService(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: 'svc-1',
    name: 'Strihani',
    duration_minutes: 30,
    price_czk: 300,
    ...overrides,
  };
}

export function rpcSuccess(
  status: 'approved' | 'pending' = 'pending',
): SupabaseResult<CreateReservationRpcRow> {
  return {
    data: { reservation_id: 'res-1', status, conflict: false, not_published: false },
    error: null,
  };
}

export function rpcConflict(): SupabaseResult<CreateReservationRpcRow> {
  return {
    data: { reservation_id: null, status: null, conflict: true, not_published: false },
    error: null,
  };
}

export function rpcNotPublished(): SupabaseResult<CreateReservationRpcRow> {
  return {
    data: { reservation_id: null, status: null, conflict: false, not_published: true },
    error: null,
  };
}

/**
 * Sestaví fake Supabase admin klienta, jehož chování řídí předaný scénář.
 * Podporuje právě ty volání, která `ReservationCreator` dělá:
 *  - `from('businesses'|'services'|'users').select(...).eq(...).maybeSingle()`,
 *  - `rpc('is_business_published' | 'create_reservation', ...)`.
 * (Načtení slotů jde přes `loadAvailableSlots`, který se v testech mockuje zvlášť.)
 */
export function buildAdminClient(scenario: Partial<AdminScenario> = {}): FakeAdminClient {
  const resolved: AdminScenario = {
    business: scenario.business ?? { data: publishedBusiness(), error: null },
    published: scenario.published ?? { data: true, error: null },
    service: scenario.service ?? { data: validService(), error: null },
    users: scenario.users ?? { data: { email: 'owner@example.cz' }, error: null },
    createReservation: scenario.createReservation ?? rpcSuccess('pending'),
  };

  const rpcCalls: string[] = [];

  function resultForTable(table: string): SupabaseResult<unknown> {
    switch (table) {
      case 'businesses':
        return resolved.business;
      case 'services':
        return resolved.service;
      case 'users':
        return resolved.users;
      default:
        return { data: null, error: null };
    }
  }

  return {
    __rpcCalls: rpcCalls,
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(resultForTable(table)),
      };
      return builder;
    },
    rpc(fn: string) {
      rpcCalls.push(fn);
      if (fn === 'is_business_published') {
        return Promise.resolve(resolved.published);
      }
      if (fn === 'create_reservation') {
        return Promise.resolve(resolved.createReservation);
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const LOWER_ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** Alfanumerický token bez whitespace a `@` — stavební kámen e-mailů/poznámek. */
function alnumToken(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...LOWER_ALPHA), { minLength, maxLength })
    .map((chars) => chars.join(''));
}

/** Validní kontaktní pole (R7.2–R7.6) — obsah nehraje roli, jen musí projít. */
export function validContactArb(): fc.Arbitrary<{
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  note: string | null;
}> {
  return fc
    .record({
      nameToken: alnumToken(1, 20),
      phoneDigits: fc
        .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 15 })
        .map((digits) => digits.join('')),
      local: alnumToken(3, 8),
      domain: alnumToken(3, 8),
    })
    .map(({ nameToken, phoneDigits, local, domain }) => ({
      clientName: `Jan ${nameToken}`.slice(0, 100),
      clientPhone: phoneDigits,
      clientEmail: `${local}@${domain}.cz`,
      note: null,
    }));
}

/**
 * Validní kontaktní pole s VÝRAZNĚ odlišitelnými hodnotami telefonu, e-mailu a
 * poznámky — aby případný únik do logu šel spolehlivě zachytit jako podřetězec
 * (Property 6). Hodnoty jsou prefixované a alfanumerické, takže nekolidují
 * s pevnými identifikátory (`biz-1`, `svc-1`, `res-1`, `owner-1`).
 */
export function distinctiveContactArb(): fc.Arbitrary<{
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  note: string;
}> {
  return fc
    .record({
      nameToken: alnumToken(4, 10),
      phoneDigits: fc
        .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 11 })
        .map((digits) => digits.join('')),
      local: alnumToken(4, 10),
      domain: alnumToken(4, 10),
      noteToken: alnumToken(4, 12),
    })
    .map(({ nameToken, phoneDigits, local, domain, noteToken }) => ({
      clientName: `Jmeno ${nameToken}`,
      // `+420` + 9–11 číslic ⇒ 12–14 číslic celkem (v rozsahu 9–15 dle R7.4).
      clientPhone: `+420${phoneDigits}`,
      clientEmail: `${local}@${domain}.example`,
      note: `Pozn-${noteToken}`,
    }));
}

/** Sestaví vstup pro `createReservation` s rozumnými výchozími hodnotami. */
export function buildInput(overrides: Partial<CreateReservationInput> = {}): CreateReservationInput {
  return {
    slug: 'kavarna',
    serviceId: 'svc-1',
    date: DATE,
    time: '09:00',
    clientName: 'Jan Novak',
    clientPhone: '+420704344177',
    clientEmail: 'jan@example.cz',
    note: null,
    ...overrides,
  };
}
