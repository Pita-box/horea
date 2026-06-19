// Feature: multi-service-reservations, Property 8: Atomicita a vyloučení překryvu
// při vytvoření — pro libovolnou sadu existujících aktivních rezervací a kandidátní
// blok [starts_at, starts_at + Combined_Duration) při allow_parallel_slots = false:
// úspěch ⇒ blok se nepřekrývá s žádnou aktivní rezervací a vloží se přesně
// |Reservation_Service_Set| řádků; konflikt ⇒ operace je odmítnuta a nevznikne
// žádný částečný zápis (rezervace ani žádný řádek množiny).
//
/**
 * Integrační property test (VOLITELNÝ) — atomicita vytvoření multi-service
 * rezervace přes RPC `create_reservation_multi` z migrace `0049`
 * (R6.3, R7.2, R7.3, R15.2, R15.5, Property 8), feature `multi-service-reservations`,
 * task 4.10.
 *
 * Ověřuje proti REÁLNÉMU Postgresu invariantu atomicity + vyloučení překryvu:
 *
 *   Pro libovolnou sadu existujících AKTIVNÍCH rezervací (status v {pending, approved})
 *   a kandidátní blok [starts_at, starts_at + Combined_Duration) při
 *   allow_parallel_slots = false platí:
 *     - jestliže create uspěje  ⇒ blok se NEPŘEKRÝVÁ s žádnou aktivní rezervací
 *                                   a vloží se PŘESNĚ |service set| řádků
 *                                   reservation_services;
 *     - jestliže blok KOLIDUJE  ⇒ operace je odmítnuta (conflict = true) a NEVZNIKNE
 *                                   žádný částečný zápis (ani řádek reservations,
 *                                   ani řádek reservation_services).
 *
 * Overlap re-check uvnitř `create_reservation_multi` bere v potaz jen rezervace ve
 * stavu {pending, approved} (tstzrange &&, half-open [)). Test proto seeduje i
 * neaktivní rezervace (rejected/cancelled), aby potvrdil, že blok neblokují — a
 * očekávaný výsledek (conflict vs. úspěch) počítá v TS jen nad aktivními.
 *
 * Voláme přímo RPC `create_reservation_multi` přes service-role klienta — advisory
 * lock i overlap re-check žijí v DB funkci, takže nejvěrnější ověření atomicity je
 * skutečné RPC volání proti DB pod zámkem.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `backfill-single-service.spec.ts`, `reservation-race.test.ts`).
 *
 * _Requirements: 6.3, 7.2, 7.3, 15.2, 15.5_
 * _Properties: 8_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (seed existujících rezervací → RPC → select →
// cleanup), takže držíme minimum z návrhu (≥100) — test je navíc přeskočen
// v defaultním `pnpm test:run` bez integračního prostředí.
const NUM_RUNS = 100;

/** Pevné budoucí základní datum bloku (vyhýbáme se reálným/minulým datům). */
const BASE_DATE_MS = Date.UTC(2099, 5, 15, 8, 0, 0); // 2099-06-15T08:00:00Z
const MINUTE_MS = 60 * 1000;

/** Stavy existujících rezervací — aktivní {pending,approved} blokují, ostatní ne. */
const ALL_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
const ACTIVE_STATUSES = new Set(['pending', 'approved']);

type SeededService = {
  id: string;
  durationMinutes: number;
};

describe.skipIf(!hasIntegrationEnv)(
  'Atomicita a vyloučení překryvu při vytvoření (create_reservation_multi, Property 8)',
  () => {
    // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
    // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
    let admin: SupabaseClient;
    let userId: string;
    let businessId: string;
    let services: SeededService[];

    beforeAll(async () => {
      admin = getServiceRoleClient();
      const unique = crypto.randomUUID().slice(0, 8);
      const email = `atomicity-${unique}@example.test`;

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: 'Integration-Test-Heslo-123',
        email_confirm: true,
      });
      if (createError || !created.user) {
        throw new Error('Nepodařilo se vytvořit testovacího uživatele.');
      }
      userId = created.user.id;

      const { error: usersError } = await admin.from('users').insert({ id: userId, email });
      if (usersError) {
        throw new Error('Nepodařilo se vytvořit profil uživatele.');
      }

      // Publikovaný podnik BEZ paralelních slotů → overlap re-check je aktivní.
      const { data: business, error: businessError } = await admin
        .from('businesses')
        .insert({
          owner_user_id: userId,
          slug: `atomicity-${unique}`,
          name: 'Podnik atomicita',
          type: 'kadernik',
          is_published: true,
          allow_parallel_slots: false,
          auto_approve_reservations: true,
        })
        .select('id')
        .single<{ id: string }>();
      if (businessError || !business) {
        throw new Error('Nepodařilo se vytvořit podnik.');
      }
      businessId = business.id;

      // Aktivní předplatné → business je Published_Business (is_business_published),
      // jinak by create_reservation_multi vrátilo not_published.
      const { error: subscriptionError } = await admin
        .from('subscriptions')
        .insert({ business_id: businessId, status: 'active' });
      if (subscriptionError) {
        throw new Error('Nepodařilo se vytvořit předplatné.');
      }

      // Paleta služeb s různou délkou — Combined_Duration = součet délek vybraných.
      const serviceSpecs = [
        { name: 'Střih', duration_minutes: 30, price_czk: 300 },
        { name: 'Mytí', duration_minutes: 15, price_czk: 150 },
        { name: 'Barvení', duration_minutes: 60, price_czk: 1200 },
        { name: 'Foukaná', duration_minutes: 45, price_czk: 450 },
      ];

      const { data: inserted, error: serviceError } = await admin
        .from('services')
        .insert(serviceSpecs.map((spec) => ({ business_id: businessId, ...spec })))
        .select('id, duration_minutes');
      if (serviceError || !inserted || inserted.length !== serviceSpecs.length) {
        throw new Error('Nepodařilo se vytvořit služby.');
      }

      services = inserted.map((row) => ({
        id: (row as { id: string }).id,
        durationMinutes: (row as { duration_minutes: number }).duration_minutes,
      }));
    });

    afterAll(async () => {
      // Idempotentní úklid — cascade z businesses smaže služby, předplatné,
      // rezervace i reservation_services.
      if (businessId) {
        await admin.from('businesses').delete().eq('id', businessId);
      }
      if (userId) {
        await admin.from('users').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    });

    /** Half-open [) překryv: [aStart,aEnd) a [bStart,bEnd) sdílí bod ⇔ aStart < bEnd ∧ bStart < aEnd. */
    function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
      return aStart < bEnd && bStart < aEnd;
    }

    it('úspěch ⇒ bez překryvu a přesně |set| řádků; konflikt ⇒ žádný částečný zápis', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Existující rezervace (i neaktivní — ty blok neblokují).
            existing: fc.array(
              fc.record({
                startMin: fc.integer({ min: 0, max: 32 }).map((q) => q * 15), // 0..480 min, krok 15
                lengthMin: fc.integer({ min: 1, max: 6 }).map((q) => q * 15), // 15..90 min
                status: fc.constantFrom(...ALL_STATUSES),
              }),
              { minLength: 0, maxLength: 4 },
            ),
            // Kandidátní blok: počátek + uspořádaná podmnožina služeb bez duplicit.
            candidateStartMin: fc.integer({ min: 0, max: 32 }).map((q) => q * 15),
            serviceIndices: fc
              .uniqueArray(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 4 }),
          }),
          async ({ existing, candidateStartMin, serviceIndices }) => {
            const candidateServiceIds = serviceIndices.map((i) => services[i].id);
            const combinedDuration = serviceIndices.reduce(
              (sum, i) => sum + services[i].durationMinutes,
              0,
            );
            const candidateStart = candidateStartMin;
            const candidateEnd = candidateStartMin + combinedDuration;

            // Deterministický očekávaný výsledek: konflikt ⇔ kandidát se překrývá
            // s některou AKTIVNÍ existující rezervací (jen pending/approved).
            const expectConflict = existing.some(
              (r) =>
                ACTIVE_STATUSES.has(r.status) &&
                overlaps(candidateStart, candidateEnd, r.startMin, r.startMin + r.lengthMin),
            );

            // Seed existujících rezervací přímo do reservations (overlap re-check je
            // nečte přes reservation_services, takže ty neseedujeme).
            let seededCount = 0;
            if (existing.length > 0) {
              const rows = existing.map((r) => ({
                business_id: businessId,
                service_id: services[0].id,
                client_name: 'Existující klient',
                client_phone: '+420700000000',
                client_email: 'existing@example.test',
                starts_at: new Date(BASE_DATE_MS + r.startMin * MINUTE_MS).toISOString(),
                ends_at: new Date(BASE_DATE_MS + (r.startMin + r.lengthMin) * MINUTE_MS).toISOString(),
                status: r.status,
              }));
              const { error: seedError } = await admin.from('reservations').insert(rows);
              if (seedError) {
                throw new Error('Nepodařilo se naseedovat existující rezervace.');
              }
              seededCount = rows.length;
            }

            try {
              const { data, error } = await admin.rpc('create_reservation_multi', {
                p_business_id: businessId,
                p_service_ids: candidateServiceIds,
                p_starts_at: new Date(BASE_DATE_MS + candidateStart * MINUTE_MS).toISOString(),
                p_client_name: 'Kandidát',
                p_client_phone: '+420704344177',
                p_client_email: 'candidate@example.test',
                p_note: null,
              });

              if (error) {
                throw new Error(`RPC create_reservation_multi selhalo: ${error.message}`);
              }

              const row = (Array.isArray(data) ? data[0] : data) as {
                reservation_id: string | null;
                status: string | null;
                conflict: boolean;
                not_published: boolean;
                invalid: boolean;
              };
              expect(row).toBeDefined();

              // Vstup je vždy validní a publikovaný → nikdy invalid ani not_published.
              expect(row.not_published).toBe(false);
              expect(row.invalid).toBe(false);
              // Výsledek odpovídá deterministickému očekávání.
              expect(row.conflict).toBe(expectConflict);

              if (expectConflict) {
                // Konflikt: žádný částečný zápis — žádné reservation_id, žádný nový
                // řádek reservations a žádný řádek reservation_services pro podnik.
                expect(row.reservation_id).toBeNull();

                const { count: reservationCount } = await admin
                  .from('reservations')
                  .select('id', { count: 'exact', head: true })
                  .eq('business_id', businessId);
                expect(reservationCount).toBe(seededCount);

                const { data: businessReservations } = await admin
                  .from('reservations')
                  .select('id')
                  .eq('business_id', businessId);
                const reservationIds = (businessReservations ?? []).map((r) => (r as { id: string }).id);
                if (reservationIds.length > 0) {
                  const { count: linkCount } = await admin
                    .from('reservation_services')
                    .select('reservation_id', { count: 'exact', head: true })
                    .in('reservation_id', reservationIds);
                  expect(linkCount).toBe(0);
                }
              } else {
                // Úspěch: vznikla rezervace a PŘESNĚ |set| řádků reservation_services.
                expect(row.reservation_id).not.toBeNull();
                const reservationId = row.reservation_id as string;

                const { data: linked, error: selectError } = await admin
                  .from('reservation_services')
                  .select('service_id, position')
                  .eq('reservation_id', reservationId);
                if (selectError) {
                  throw new Error('Načtení reservation_services selhalo.');
                }
                expect(linked ?? []).toHaveLength(candidateServiceIds.length);

                // Blok se opravdu nepřekrývá s žádnou aktivní existující rezervací.
                const stillOverlaps = existing.some(
                  (r) =>
                    ACTIVE_STATUSES.has(r.status) &&
                    overlaps(candidateStart, candidateEnd, r.startMin, r.startMin + r.lengthMin),
                );
                expect(stillOverlaps).toBe(false);
              }
            } finally {
              // Úklid per běh — smazání rezervací podniku cascade odstraní i
              // navázané reservation_services.
              await admin.from('reservations').delete().eq('business_id', businessId);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  },
);
