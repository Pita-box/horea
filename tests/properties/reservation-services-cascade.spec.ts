// Feature: multi-service-reservations, Property 12: Pro libovolnou rezervaci platí,
// že po jejím hard delete neexistují žádné navázané řádky Reservation_Service_Set.
//
/**
 * Integrační property test (VOLITELNÝ) — cascade delete množiny služeb při hard
 * delete rezervace (R10.3, Property 12), feature `multi-service-reservations`,
 * task 4.13.
 *
 * Ověřuje proti REÁLNÉMU Postgresu invariantu kaskádového smazání z migrace `0049`:
 *
 *   `reservation_services.reservation_id` má FK na `reservations(id)`
 *   s `ON DELETE CASCADE`. Pro libovolnou rezervaci platí, že po jejím hard delete
 *   (`delete from reservations where id = …`) NEEXISTUJÍ žádné navázané řádky
 *   `reservation_services` odkazující na zaniklé `reservation_id`.
 *
 * Přístup: v každém běhu fast-check vytvoříme rezervaci přes RPC
 * `create_reservation_multi` s vygenerovanou (neprázdnou, bezduplicitní) sadou
 * služeb. Potvrdíme, že vzniklo PŘESNĚ |service set| řádků `reservation_services`,
 * pak rezervaci hard-delete (`admin.from('reservations').delete().eq('id', …)`)
 * a ověříme, že pro dané `reservation_id` nezůstal ŽÁDNÝ řádek `reservation_services`.
 *
 * Voláme přímo RPC `create_reservation_multi` přes service-role klienta — vznik
 * množiny řádků i jejich FK na rezervaci žijí v DB, takže nejvěrnější ověření
 * kaskády je skutečný insert přes RPC + reálný delete proti DB.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `create-atomicity-multi.spec.ts`, `backfill-single-service.spec.ts`).
 *
 * _Requirements: 10.3_
 * _Properties: 12_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (RPC create → select → hard delete → select),
// takže držíme minimum z návrhu (≥100) — test je navíc přeskočen v defaultním
// `pnpm test:run` bez integračního prostředí.
const NUM_RUNS = 100;

/** Pevné budoucí základní datum (vyhýbáme se reálným/minulým datům). */
const BASE_DATE_MS = Date.UTC(2099, 5, 15, 8, 0, 0); // 2099-06-15T08:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

type SeededService = {
  id: string;
  durationMinutes: number;
};

describe.skipIf(!hasIntegrationEnv)('Hard delete kaskáduje na množinu služeb (Property 12)', () => {
  // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
  // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let services: SeededService[];

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `cascade-del-${unique}@example.test`;

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

    // Publikovaný podnik s auto-approve → create_reservation_multi projde celým flow.
    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `cascade-del-${unique}`,
        name: 'Podnik cascade delete',
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

  it('po hard delete rezervace nezůstane žádný řádek reservation_services', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Uspořádaná bezduplicitní podmnožina služeb (1..4) → Reservation_Service_Set.
          serviceIndices: fc.uniqueArray(fc.integer({ min: 0, max: 3 }), {
            minLength: 1,
            maxLength: 4,
          }),
          // Den posunu → každý běh má vlastní (nepřekrývající se) budoucí slot.
          dayOffset: fc.integer({ min: 0, max: 365 }),
        }),
        async ({ serviceIndices, dayOffset }) => {
          const serviceIds = serviceIndices.map((i) => services[i].id);
          const startsAt = new Date(BASE_DATE_MS + dayOffset * DAY_MS).toISOString();

          const { data, error } = await admin.rpc('create_reservation_multi', {
            p_business_id: businessId,
            p_service_ids: serviceIds,
            p_starts_at: startsAt,
            p_client_name: 'Klient Cascade',
            p_client_phone: '+420704344177',
            p_client_email: 'cascade@example.test',
            p_note: null,
          });
          if (error) {
            throw new Error(`RPC create_reservation_multi selhalo: ${error.message}`);
          }

          const row = (Array.isArray(data) ? data[0] : data) as {
            reservation_id: string | null;
            conflict: boolean;
            not_published: boolean;
            invalid: boolean;
          };
          expect(row).toBeDefined();
          // Vstup je vždy validní, publikovaný a sloty se mezi běhy nepřekrývají.
          expect(row.not_published).toBe(false);
          expect(row.invalid).toBe(false);
          expect(row.conflict).toBe(false);
          expect(row.reservation_id).not.toBeNull();

          const reservationId = row.reservation_id as string;

          try {
            // Pre-condition: vznikla PŘESNĚ |service set| řádků reservation_services.
            const { count: beforeCount, error: beforeError } = await admin
              .from('reservation_services')
              .select('reservation_id', { count: 'exact', head: true })
              .eq('reservation_id', reservationId);
            if (beforeError) {
              throw new Error('Načtení reservation_services před delete selhalo.');
            }
            expect(beforeCount).toBe(serviceIds.length);

            // Hard delete řádku rezervace.
            const { error: deleteError } = await admin
              .from('reservations')
              .delete()
              .eq('id', reservationId);
            expect(deleteError).toBeNull();

            // Post-condition: kaskáda odstranila VŠECHNY navázané řádky.
            const { count: afterCount, error: afterError } = await admin
              .from('reservation_services')
              .select('reservation_id', { count: 'exact', head: true })
              .eq('reservation_id', reservationId);
            if (afterError) {
              throw new Error('Načtení reservation_services po delete selhalo.');
            }
            expect(afterCount).toBe(0);
          } finally {
            // Úklid per běh — pro jistotu (kdyby delete výše neproběhl celý).
            await admin.from('reservations').delete().eq('id', reservationId);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
