// Feature: multi-service-reservations, Property 4: Pro libovolnou uspořádanou
// množinu služeb platí, že po zápisu rezervace a následném načtení
// Reservation_Service_Set seřazeného dle position je pořadí služeb shodné
// s pořadím výběru a pozice tvoří souvislou řadu 0..n-1.
//
/**
 * Integrační property test (VOLITELNÝ) — zachování pořadí služeb (round-trip)
 * přes RPC `create_reservation_multi` z migrace `0049`, feature
 * `multi-service-reservations`, task 4.8 (Property 4, R1.2, R4.1, R4.2, R4.3,
 * R12.1, R13.1, R15.1).
 *
 * Ověřuje invariantu pořadí napříč zápisem a čtením:
 *
 *   Pro libovolnou uspořádanou množinu služeb `orderedIds` (bez duplicit, počet
 *   v rozsahu [1, 10]) platí, že po atomickém zápisu rezervace přes RPC
 *   `create_reservation_multi(p_service_ids = orderedIds)` a následném načtení
 *   `reservation_services` seřazeného dle `position`:
 *     (a) posloupnost `service_id` je SHODNÁ s `orderedIds` (pořadí výběru),
 *     (b) pozice tvoří souvislou řadu `0, 1, ..., n-1`.
 *
 * Pořadí se v RPC materializuje přes `unnest(p_service_ids) with ordinality`
 * (`position = ord - 1`), takže round-trip testuje právě tuto materializaci.
 *
 * Podnik je nasazen jako Published_Business (is_published = true + subscription
 * status 'active'), protože `create_reservation_multi` ověřuje publikovanost
 * uvnitř zámku. `allow_parallel_slots = true` cíleně vypíná overlap re-check —
 * tato vlastnost testuje výhradně pořadí, ne řešení konfliktů, takže každý zápis
 * uspěje nezávisle na vygenerovaném čase.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `backfill-single-service.spec.ts`, `services-cascade.test.ts`).
 *
 * _Requirements: 1.2, 4.1, 4.2, 4.3, 12.1, 13.1, 15.1_
 * _Properties: 4_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (RPC insert → select → cleanup), takže držíme
// minimum z návrhu (≥100), shodně s backfill-single-service.spec.ts — test je navíc
// přeskočen v defaultním `pnpm test:run` bez integračního prostředí.
const NUM_RUNS = 100;

/** Pevné základní datum (Europe/Prague pondělí) pro generované počáteční časy. */
const BASE_DATE_MS = Date.UTC(2025, 5, 16, 8, 0, 0); // 2025-06-16T08:00:00Z

/** Počet nasazených služeb — umožní generovat uspořádané podmnožiny délky 1..8. */
const SERVICE_COUNT = 8;

describe.skipIf(!hasIntegrationEnv)(
  'Pořadí služeb round-trip (create_reservation_multi, Property 4)',
  () => {
    // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
    // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
    let admin: SupabaseClient;
    let userId: string;
    let businessId: string;
    let serviceIds: string[];

    beforeAll(async () => {
      admin = getServiceRoleClient();
      const unique = crypto.randomUUID().slice(0, 8);
      const email = `order-${unique}@example.test`;

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

      // Published_Business: is_published = true + allow_parallel_slots = true (vypíná
      // overlap re-check, takže round-trip zápisy nikdy nekolidují).
      const { data: business, error: businessError } = await admin
        .from('businesses')
        .insert({
          owner_user_id: userId,
          slug: `order-${unique}`,
          name: 'Podnik pořadí',
          type: 'kadernik',
          is_published: true,
          auto_approve_reservations: true,
          allow_parallel_slots: true,
        })
        .select('id')
        .single<{ id: string }>();
      if (businessError || !business) {
        throw new Error('Nepodařilo se vytvořit podnik.');
      }
      businessId = business.id;

      // Aktivní subscription je nutná, aby is_business_published(businessId) = true.
      const { error: subscriptionError } = await admin.from('subscriptions').insert({
        business_id: businessId,
        plan: 'start',
        status: 'active',
      });
      if (subscriptionError) {
        throw new Error('Nepodařilo se vytvořit subscription.');
      }

      // SERVICE_COUNT služeb s navzájem různou délkou i cenou (včetně ceny 0 Kč).
      const serviceSpecs = Array.from({ length: SERVICE_COUNT }, (_, index) => ({
        business_id: businessId,
        name: `Služba ${index + 1}`,
        duration_minutes: 15 + index * 5,
        price_czk: index === 0 ? 0 : index * 100,
      }));

      const { data: inserted, error: serviceError } = await admin
        .from('services')
        .insert(serviceSpecs)
        .select('id');
      if (serviceError || !inserted || inserted.length !== SERVICE_COUNT) {
        throw new Error('Nepodařilo se vytvořit služby.');
      }
      serviceIds = inserted.map((row) => (row as { id: string }).id);
    });

    afterAll(async () => {
      // Idempotentní úklid — cascade z businesses smaže služby, subscription, rezervace
      // i reservation_services.
      if (businessId) {
        await admin.from('businesses').delete().eq('id', businessId);
      }
      if (userId) {
        await admin.from('users').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    });

    it('po zápisu přes RPC odpovídá pořadí dle position pořadí výběru (pozice 0..n-1)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Uspořádaná podmnožina indexů služeb bez duplicit (pořadí = pořadí výběru).
            // RPC odmítá duplicity i prázdné pole → generujeme 1..SERVICE_COUNT unikátů.
            order: fc.uniqueArray(fc.integer({ min: 0, max: SERVICE_COUNT - 1 }), {
              minLength: 1,
              maxLength: SERVICE_COUNT,
            }),
            dayOffset: fc.integer({ min: 0, max: 120 }),
          }),
          async ({ order, dayOffset }) => {
            const orderedIds = order.map((index) => serviceIds[index]);
            const startsAtMs = BASE_DATE_MS + dayOffset * 24 * 60 * 60 * 1000;
            const startsAt = new Date(startsAtMs).toISOString();

            const { data: rpcRows, error: rpcError } = await admin.rpc('create_reservation_multi', {
              p_business_id: businessId,
              p_service_ids: orderedIds,
              p_starts_at: startsAt,
              p_client_name: 'Klient Pořadí',
              p_client_phone: '+420700000000',
              p_client_email: 'klient@example.test',
              p_note: null,
            });
            if (rpcError) {
              throw new Error('RPC create_reservation_multi selhalo.');
            }

            const result = (rpcRows ?? [])[0] as {
              reservation_id: string | null;
              conflict: boolean;
              not_published: boolean;
              invalid: boolean;
            };
            // Round-trip vyžaduje úspěšný zápis: žádný conflict/not_published/invalid.
            expect(result?.conflict).toBe(false);
            expect(result?.not_published).toBe(false);
            expect(result?.invalid).toBe(false);
            expect(result?.reservation_id).toBeTruthy();

            const reservationId = result.reservation_id as string;

            try {
              const { data: linked, error: selectError } = await admin
                .from('reservation_services')
                .select('service_id, position')
                .eq('reservation_id', reservationId)
                .order('position', { ascending: true });
              if (selectError) {
                throw new Error('Načtení reservation_services selhalo.');
              }

              const rows = (linked ?? []) as { service_id: string; position: number }[];

              // (a) pořadí service_id dle position = pořadí výběru.
              expect(rows.map((row) => row.service_id)).toEqual(orderedIds);
              // (b) pozice tvoří souvislou řadu 0..n-1.
              expect(rows.map((row) => row.position)).toEqual(
                orderedIds.map((_, position) => position),
              );
            } finally {
              // Úklid per běh — cascade z reservations smaže i reservation_services.
              await admin.from('reservations').delete().eq('id', reservationId);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  },
);
