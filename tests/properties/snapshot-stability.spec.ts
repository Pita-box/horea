// Feature: multi-service-reservations, Property 10: Stabilita snapshotu délky a ceny
// — pro libovolnou množinu služeb platí, že duration_minutes_snapshot a
// price_czk_snapshot uložené v Reservation_Service_Set se rovnají hodnotám služby
// v okamžiku zápisu a NEZMĚNÍ se pozdější úpravou ceníku služby.
//
/**
 * Integrační property test (VOLITELNÝ) — stabilita snapshotu délky a ceny v
 * `reservation_services` z migrace `0049` (R7.5, Property 10), feature
 * `multi-service-reservations`, task 4.12.
 *
 * Ověřuje proti REÁLNÉMU Postgresu invariantu stability snapshotu:
 *
 *   Pro libovolnou uspořádanou množinu služeb platí, že hodnoty
 *   `duration_minutes_snapshot` a `price_czk_snapshot` zapsané do
 *   `reservation_services` v okamžiku vytvoření rezervace se rovnají tehdejším
 *   `services.duration_minutes` / `services.price_czk` a ZŮSTANOU NEZMĚNĚNÉ i poté,
 *   co se ceník (délka i cena) podkladových služeb později změní.
 *
 * Přístup per běh fast-check:
 *   1. vytvoř rezervaci přes RPC `create_reservation_multi` s vygenerovanou
 *      uspořádanou podmnožinou služeb (bez duplicit),
 *   2. načti zapsané snapshoty z `reservation_services` (= write-time hodnoty),
 *   3. UPDATE podkladových `services` (duration_minutes / price_czk) na JINÉ hodnoty,
 *   4. znovu načti `reservation_services` téže rezervace,
 *   5. ověř, že snapshoty jsou NEZMĚNĚNÉ (rovny write-time hodnotám z kroku 2),
 *      a že se podkladová služba opravdu změnila (sanity check, že update zabral).
 *
 * Podnik má `allow_parallel_slots = true`, takže overlap re-check je vypnutý a
 * generované bloky se nikdy nevyhodnotí jako konflikt (vyhneme se šumu). Každý běh
 * navíc používá vlastní budoucí `starts_at` (dayOffset), aby se rezervace nekřížily.
 *
 * Voláme přímo RPC `create_reservation_multi` přes service-role klienta — snapshot
 * se materializuje v DB funkci pod advisory lockem, takže nejvěrnější ověření je
 * skutečné RPC volání proti DB.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `create-atomicity-multi.spec.ts`, `backfill-single-service.spec.ts`).
 *
 * _Requirements: 7.5_
 * _Properties: 10_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (create RPC → select → update služeb → select →
// restore → cleanup), takže držíme minimum z návrhu (≥100) — test je navíc přeskočen
// v defaultním `pnpm test:run` bez integračního prostředí.
const NUM_RUNS = 100;

/** Pevné budoucí základní datum bloku (vyhýbáme se reálným/minulým datům). */
const BASE_DATE_MS = Date.UTC(2099, 5, 15, 8, 0, 0); // 2099-06-15T08:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

type SeededService = {
  id: string;
  durationMinutes: number;
  priceCzk: number;
};

describe.skipIf(!hasIntegrationEnv)(
  'Stabilita snapshotu délky a ceny (create_reservation_multi, Property 10)',
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
      const email = `snapshot-${unique}@example.test`;

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

      // Publikovaný podnik S paralelními sloty → overlap re-check je vypnutý
      // (žádný šum z kolizí). auto_approve → status approved bez čekání.
      const { data: business, error: businessError } = await admin
        .from('businesses')
        .insert({
          owner_user_id: userId,
          slug: `snapshot-${unique}`,
          name: 'Podnik snapshot',
          type: 'kadernik',
          is_published: true,
          allow_parallel_slots: true,
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

      // Paleta služeb s různou délkou i cenou (včetně ceny 0 Kč) — snapshot ukládá
      // aktuální duration_minutes / price_czk každé z nich v okamžiku zápisu.
      const serviceSpecs = [
        { name: 'Střih', duration_minutes: 30, price_czk: 300 },
        { name: 'Mytí', duration_minutes: 15, price_czk: 0 },
        { name: 'Barvení', duration_minutes: 60, price_czk: 1200 },
        { name: 'Foukaná', duration_minutes: 45, price_czk: 450 },
      ];

      const { data: inserted, error: serviceError } = await admin
        .from('services')
        .insert(serviceSpecs.map((spec) => ({ business_id: businessId, ...spec })))
        .select('id, duration_minutes, price_czk');
      if (serviceError || !inserted || inserted.length !== serviceSpecs.length) {
        throw new Error('Nepodařilo se vytvořit služby.');
      }

      services = inserted.map((row) => ({
        id: (row as { id: string }).id,
        durationMinutes: (row as { duration_minutes: number }).duration_minutes,
        priceCzk: Number((row as { price_czk: number | string }).price_czk),
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

    it('snapshoty délky a ceny zůstávají nezměněné po pozdější změně ceníku služby', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Uspořádaná podmnožina služeb bez duplicit (pořadí = position).
            serviceIndices: fc.uniqueArray(fc.integer({ min: 0, max: 3 }), {
              minLength: 1,
              maxLength: 4,
            }),
            // Vlastní budoucí den pro každý běh → rezervace se nekříží.
            dayOffset: fc.integer({ min: 0, max: 300 }),
          }),
          async ({ serviceIndices, dayOffset }) => {
            const candidateServiceIds = serviceIndices.map((i) => services[i].id);
            const startsAt = new Date(BASE_DATE_MS + dayOffset * DAY_MS).toISOString();

            const { data, error } = await admin.rpc('create_reservation_multi', {
              p_business_id: businessId,
              p_service_ids: candidateServiceIds,
              p_starts_at: startsAt,
              p_client_name: 'Kandidát snapshot',
              p_client_phone: '+420704344177',
              p_client_email: 'snapshot-candidate@example.test',
              p_note: null,
            });
            if (error) {
              throw new Error(`RPC create_reservation_multi selhalo: ${error.message}`);
            }

            const resultRow = (Array.isArray(data) ? data[0] : data) as {
              reservation_id: string | null;
              status: string | null;
              conflict: boolean;
              not_published: boolean;
              invalid: boolean;
            };
            expect(resultRow).toBeDefined();
            // Vstup je vždy validní a publikovaný, paralelní sloty → nikdy konflikt.
            expect(resultRow.not_published).toBe(false);
            expect(resultRow.invalid).toBe(false);
            expect(resultRow.conflict).toBe(false);
            expect(resultRow.reservation_id).not.toBeNull();
            const reservationId = resultRow.reservation_id as string;

            const touchedServiceIds = new Set(candidateServiceIds);

            try {
              // 1) Write-time snapshoty z reservation_services (pořadí dle position).
              const { data: writeTime, error: writeError } = await admin
                .from('reservation_services')
                .select('service_id, position, duration_minutes_snapshot, price_czk_snapshot')
                .eq('reservation_id', reservationId)
                .order('position', { ascending: true });
              if (writeError) {
                throw new Error('Načtení write-time snapshotů selhalo.');
              }
              const writeRows = (writeTime ?? []) as Array<{
                service_id: string;
                position: number;
                duration_minutes_snapshot: number;
                price_czk_snapshot: number | string;
              }>;

              // Snapshot odpovídá počtu vybraných služeb a write-time hodnotám služby.
              expect(writeRows).toHaveLength(candidateServiceIds.length);
              for (const row of writeRows) {
                const original = services.find((s) => s.id === row.service_id);
                expect(original).toBeDefined();
                expect(row.duration_minutes_snapshot).toBe(original!.durationMinutes);
                expect(Number(row.price_czk_snapshot)).toBe(original!.priceCzk);
              }

              // 2) Změna ceníku PODKLADOVÝCH služeb na JINÉ hodnoty (délka i cena).
              //    duration > 0 (check), price >= 0 (check) — posuneme o pevné delty.
              for (const id of touchedServiceIds) {
                const original = services.find((s) => s.id === id)!;
                const { error: updateError } = await admin
                  .from('services')
                  .update({
                    duration_minutes: original.durationMinutes + 5,
                    price_czk: original.priceCzk + 111,
                  })
                  .eq('id', id);
                if (updateError) {
                  throw new Error('Změna ceníku služby selhala.');
                }
              }

              // 3) Re-read reservation_services — snapshoty MUSÍ zůstat nezměněné.
              const { data: afterUpdate, error: afterError } = await admin
                .from('reservation_services')
                .select('service_id, position, duration_minutes_snapshot, price_czk_snapshot')
                .eq('reservation_id', reservationId)
                .order('position', { ascending: true });
              if (afterError) {
                throw new Error('Načtení snapshotů po změně ceníku selhalo.');
              }
              const afterRows = (afterUpdate ?? []) as Array<{
                service_id: string;
                position: number;
                duration_minutes_snapshot: number;
                price_czk_snapshot: number | string;
              }>;

              // Snapshoty (po position) jsou totožné s write-time hodnotami z kroku 1.
              expect(afterRows).toHaveLength(writeRows.length);
              for (let i = 0; i < writeRows.length; i += 1) {
                expect(afterRows[i].service_id).toBe(writeRows[i].service_id);
                expect(afterRows[i].position).toBe(writeRows[i].position);
                expect(afterRows[i].duration_minutes_snapshot).toBe(
                  writeRows[i].duration_minutes_snapshot,
                );
                expect(Number(afterRows[i].price_czk_snapshot)).toBe(
                  Number(writeRows[i].price_czk_snapshot),
                );
              }

              // Sanity: podkladová služba se OPRAVDU změnila (update zabral), takže
              // stabilita snapshotu není falešně potvrzena beze změny ceníku.
              const { data: changedServices, error: changedError } = await admin
                .from('services')
                .select('id, duration_minutes, price_czk')
                .in('id', [...touchedServiceIds]);
              if (changedError) {
                throw new Error('Načtení změněných služeb selhalo.');
              }
              for (const svc of changedServices ?? []) {
                const row = svc as { id: string; duration_minutes: number; price_czk: number | string };
                const original = services.find((s) => s.id === row.id)!;
                expect(row.duration_minutes).toBe(original.durationMinutes + 5);
                expect(Number(row.price_czk)).toBe(original.priceCzk + 111);
              }
            } finally {
              // Úklid per běh — obnovíme ceník služeb a smažeme rezervaci (cascade
              // odstraní i navázané reservation_services).
              for (const id of touchedServiceIds) {
                const original = services.find((s) => s.id === id)!;
                await admin
                  .from('services')
                  .update({
                    duration_minutes: original.durationMinutes,
                    price_czk: original.priceCzk,
                  })
                  .eq('id', id);
              }
              await admin.from('reservations').delete().eq('id', reservationId);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  },
);
