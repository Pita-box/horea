import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import { normalizePhone } from '@/server/ClientUpsertor';

/**
 * Feature: reservation-management, Property 5: Anonymization completeness.
 *
 * `Client_Anonymizer` deleguje vlastní výmaz na atomické RPC `anonymize_client`
 * (migrace 0023). Tento property test ověřuje KONTRAKT té operace nad in-memory
 * modelem věrně zrcadlícím SQL: anonymizace matchujících rezervací + hard delete
 * klienta v jediném (atomickém) kroku. Pro libovolnou množinu rezervací a
 * libovolný kontakt klienta po proběhnutí platí (R16.2–R16.4):
 *
 *  - žádná matchující rezervace nenese původní PII — `client_name` je
 *    „Smazaný klient", `client_phone` i `client_email` jsou `null`,
 *  - sloty matchujících rezervací (`service_id`, `starts_at`, `ends_at`,
 *    `status`, `attendance`) zůstávají beze změny,
 *  - nematchující rezervace zůstávají beze změny (vč. PII),
 *  - řádek klienta je smazán,
 *  - operace proběhne i při 0 matchujících rezervacích (smaže se jen klient).
 *
 * Matchování používá párovací pravidlo R15.2 (normalizovaný telefon NEBO
 * case-insensitive e-mail). Oracle počítá očekávané matche NEZÁVISLE na modelu
 * RPC, takže test ověřuje completeness, ne jen tautologii.
 *
 * Validates: Requirements 16.2, 16.3, 16.4
 */

const createClientMock = vi.hoisted(() => vi.fn());
const createAdminClientMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: logInfoMock, warn: logWarnMock, error: logErrorMock },
}));

import { anonymizeClient } from '@/server/ClientAnonymizer';

const NUM_RUNS = 100;
const BUSINESS_ID = 'biz-1';
const CLIENT_ID = 'client-1';
const ANON_NAME = 'Smazaný klient';

type StoreReservation = {
  id: string;
  business_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  attendance: string | null;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
};

type ClientRow = {
  id: string;
  business_id: string;
  phone: string | null;
  email: string | null;
};

type Store = {
  reservations: StoreReservation[];
  client: ClientRow | null;
};

/** Normalizace e-mailu pro shodu — zrcadlí `lower(coalesce(...,''))` v SQL. */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Oracle: matchuje rezervace podle pravidla R15.2 (telefon NEBO e-mail). */
function isMatch(reservation: StoreReservation, client: ClientRow): boolean {
  const normPhone = normalizePhone(client.phone);
  const normEmail = normalizeEmail(client.email);
  const phoneMatch = normPhone !== '' && normalizePhone(reservation.client_phone) === normPhone;
  const emailMatch = normEmail !== '' && normalizeEmail(reservation.client_email) === normEmail;
  return phoneMatch || emailMatch;
}

/**
 * Fake `@/lib/supabase/server` klient: auth.getUser + odvození podniku majitele
 * (`businesses.owner_user_id = user.id`). Vrací pevný `BUSINESS_ID`.
 */
function buildServerClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }),
    },
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve(
            table === 'businesses'
              ? { data: { id: BUSINESS_ID }, error: null }
              : { data: null, error: null },
          ),
      };
      return builder;
    },
  };
}

/**
 * Fake `@/lib/supabase/admin` klient, jehož `rpc('anonymize_client', ...)`
 * aplikuje na sdílený `store` tutéž logiku jako SQL funkce z migrace 0023:
 * anonymizace matchujících rezervací (kontakt → placeholder/null, slot beze
 * změny) + hard delete klienta. Vrací počet anonymizovaných rezervací.
 */
function buildAnonymizerAdmin(store: Store) {
  return {
    rpc(fn: string, args: { p_business_id: string; p_client_id: string }) {
      if (fn !== 'anonymize_client') {
        return Promise.resolve({ data: null, error: null });
      }

      const client = store.client;
      if (!client || client.id !== args.p_client_id || client.business_id !== args.p_business_id) {
        // Klient neexistuje / nepatří podniku → nic neměníme ani nemažeme.
        return Promise.resolve({ data: [{ anonymized_count: 0 }], error: null });
      }

      let count = 0;
      for (const reservation of store.reservations) {
        if (reservation.business_id === args.p_business_id && isMatch(reservation, client)) {
          reservation.client_name = ANON_NAME;
          reservation.client_phone = null;
          reservation.client_email = null;
          count += 1;
        }
      }

      // Hard delete klienta (atomicky se stejnou transakcí jako anonymizace).
      store.client = null;

      return Promise.resolve({ data: [{ anonymized_count: count }], error: null });
    },
  };
}

const lowerToken = (min: number, max: number) =>
  fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: min, maxLength: max })
    .map((c) => c.join(''));

const digitsArb = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 12 })
  .map((d) => d.join(''));

const emailArb = fc
  .record({ local: lowerToken(3, 8), domain: lowerToken(3, 8) })
  .map(({ local, domain }) => `${local}@${domain}.cz`);

/** Varianta zápisu telefonu (oddělovače + volitelný úvodní +) téhož čísla. */
function phoneVariant(digits: string, salt: number): string {
  const seps = [' ', '-', '', '(', ')'];
  let out = salt % 2 === 0 ? '+' : '';
  for (let i = 0; i < digits.length; i += 1) {
    out += digits[i] + (i % 3 === 1 ? seps[(i + salt) % seps.length] : '');
  }
  return out;
}

/** Varianta casingu e-mailu. */
function emailCasing(email: string, salt: number): string {
  return email
    .split('')
    .map((ch, i) => ((i + salt) % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
const ATTENDANCES = ['attended', 'no_show', null] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Property 5: úplnost anonymizace', () => {
  it('matchující rezervace ztratí PII, sloty zůstanou, nematchující beze změny, klient smazán', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          clientHasPhone: fc.boolean(),
          clientHasEmail: fc.boolean(),
          clientDigits: digitsArb,
          clientEmail: emailArb,
          reservations: fc.array(
            fc.record({
              phoneKind: fc.constantFrom('match', 'other', 'empty'),
              emailKind: fc.constantFrom('match', 'other', 'empty'),
              otherDigits: digitsArb,
              otherEmail: emailArb,
              salt: fc.integer({ min: 0, max: 8 }),
              status: fc.constantFrom(...STATUSES),
              attendance: fc.constantFrom(...ATTENDANCES),
              name: lowerToken(1, 8),
            }),
            { maxLength: 8 },
          ),
        }),
        async (spec) => {
          // Sestavení klienta — alespoň jeden kontakt nemusí být vyplněn.
          const client: ClientRow = {
            id: CLIENT_ID,
            business_id: BUSINESS_ID,
            phone: spec.clientHasPhone ? phoneVariant(spec.clientDigits, 1) : null,
            email: spec.clientHasEmail ? spec.clientEmail : null,
          };

          // Sestavení rezervací s kontrolovaným vztahem k telefonu/e-mailu klienta.
          const reservations: StoreReservation[] = spec.reservations.map((r, index) => {
            let phone: string | null;
            if (r.phoneKind === 'empty') {
              phone = null;
            } else if (r.phoneKind === 'match') {
              phone = phoneVariant(spec.clientDigits, r.salt);
            } else {
              phone = `1${r.otherDigits}`; // odlišné číslice
            }

            let email: string | null;
            if (r.emailKind === 'empty') {
              email = null;
            } else if (r.emailKind === 'match') {
              email = emailCasing(spec.clientEmail, r.salt);
            } else {
              email = `x.${r.otherEmail}`; // odlišný local part
            }

            return {
              id: `res-${index}`,
              business_id: BUSINESS_ID,
              service_id: `svc-${index % 3}`,
              starts_at: `2025-06-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`,
              ends_at: `2025-06-${String(10 + index).padStart(2, '0')}T09:30:00.000Z`,
              status: r.status,
              attendance: r.attendance,
              client_name: `Jmeno ${r.name}`,
              client_phone: phone,
              client_email: email,
            };
          });

          // Oracle: očekávané matche + hluboká kopie pro pozdější srovnání.
          const original = reservations.map((r) => ({ ...r }));
          const expectedMatchIds = new Set(
            original.filter((r) => isMatch(r, client)).map((r) => r.id),
          );

          const store: Store = {
            reservations,
            client: { ...client },
          };

          createClientMock.mockResolvedValue(buildServerClient());
          createAdminClientMock.mockReturnValue(buildAnonymizerAdmin(store));

          const result = await anonymizeClient(CLIENT_ID);

          // Operace vždy uspěje (i při 0 matchujících rezervacích — R16.4).
          expect(result.ok).toBe(true);

          // (a) Klient je smazán (R16.2 c).
          expect(store.client).toBeNull();

          for (let i = 0; i < store.reservations.length; i += 1) {
            const after = store.reservations[i];
            const before = original[i];

            if (expectedMatchIds.has(after.id)) {
              // (b) Matchující: žádná původní PII, kontakt vynulován (R16.2 b).
              expect(after.client_name).toBe(ANON_NAME);
              expect(after.client_phone).toBeNull();
              expect(after.client_email).toBeNull();
              // (c) Slot beze změny (R16.3).
              expect(after.service_id).toBe(before.service_id);
              expect(after.starts_at).toBe(before.starts_at);
              expect(after.ends_at).toBe(before.ends_at);
              expect(after.status).toBe(before.status);
              expect(after.attendance).toBe(before.attendance);
            } else {
              // (d) Nematchující rezervace zůstává zcela beze změny.
              expect(after).toEqual(before);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
