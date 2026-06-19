// Feature: multi-service-reservations, Property 9: Atomicita editace s vyloučením
// sebe sama — pro libovolnou upravovanou rezervaci a libovolnou sadu OSTATNÍCH
// aktivních rezervací při allow_parallel_slots = false platí: (a) overlap re-check
// VYLUČUJE původní interval upravované rezervace (editace na stejný / se sebou
// překrývající se čas NEhlásí konflikt), (b) úspěšná editace nezpůsobí překryv
// s žádnou JINOU aktivní rezervací, (c) po editaci obsahuje Reservation_Service_Set
// PŘESNĚ novou množinu služeb (pozice 0..n-1, nové service_id) bez zbytků po
// předchozí množině.
//
/**
 * Integrační property test (VOLITELNÝ) — atomicita editace multi-service rezervace
 * přes RPC `edit_reservation_multi` z migrace `0049`
 * (R9.3, R9.5, Property 9), feature `multi-service-reservations`, task 4.11.
 *
 * Ověřuje proti REÁLNÉMU Postgresu invariantu editace s vyloučením sebe sama:
 *
 *   Pro libovolnou upravovanou rezervaci (nasazenou přes create_reservation_multi)
 *   a libovolnou sadu OSTATNÍCH aktivních rezervací (status v {pending, approved})
 *   při allow_parallel_slots = false platí:
 *     (a) overlap re-check vylučuje VLASTNÍ interval upravované rezervace
 *         (`r.id != p_reservation_id`, R9.5) — editace na stejný čas (kde se nový
 *         interval překrývá s původním intervalem TÉŽE rezervace) NEhlásí konflikt,
 *         pokud nekoliduje s žádnou JINOU aktivní rezervací;
 *     (b) jestliže editace uspěje ⇒ nový interval [starts_at, starts_at +
 *         Combined_Duration) se NEPŘEKRÝVÁ s žádnou JINOU aktivní rezervací;
 *     (c) po úspěšné editaci obsahuje reservation_services PŘESNĚ novou množinu
 *         služeb v pořadí (pozice 0..n-1, service_id = p_service_ids) — žádné
 *         zbytky po předchozí množině.
 *     (konflikt ⇒ updated = false a stará množina i čas zůstávají beze změny.)
 *
 * Očekávaný výsledek (conflict vs. úspěch) počítáme v TS DETERMINISTICKY pouze nad
 * OSTATNÍMI aktivními rezervacemi (nikdy nad upravovanou rezervací samotnou), čímž
 * přímo testujeme vyloučení sebe sama: i když se nový interval překrývá s vlastním
 * původním intervalem rezervace, výsledek závisí jen na OSTATNÍCH rezervacích.
 *
 * Voláme přímo RPC `edit_reservation_multi` přes service-role klienta — advisory
 * lock i overlap re-check žijí v DB funkci, takže nejvěrnější ověření atomicity je
 * skutečné RPC volání proti DB pod zámkem.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `create-atomicity-multi.spec.ts`, `backfill-single-service.spec.ts`).
 *
 * _Requirements: 9.3, 9.5_
 * _Properties: 9_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (create RPC → seed → edit RPC → select → cleanup),
// takže držíme minimum z návrhu (≥100) — test je navíc přeskočen v defaultním
// `pnpm test:run` bez integračního prostředí.
const NUM_RUNS = 100;

/** Pevné budoucí základní datum bloku (vyhýbáme se reálným/minulým datům). */
const BASE_DATE_MS = Date.UTC(2099, 5, 15, 8, 0, 0); // 2099-06-15T08:00:00Z
const MINUTE_MS = 60 * 1000;

/** Stavy ostatních rezervací — aktivní {pending,approved} blokují, ostatní ne. */
const ALL_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
const ACTIVE_STATUSES = new Set(['pending', 'approved']);

type SeededService = {
  id: string;
  durationMinutes: number;
};

describe.skipIf(!hasIntegrationEnv)(
  'Atomicita editace s vyloučením sebe sama (edit_reservation_multi, Property 9)',
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
      const email = `edit-atomicity-${unique}@example.test`;

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
          slug: `edit-atomicity-${unique}`,
          name: 'Podnik editace atomicita',
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

    function combinedDuration(indices: number[]): number {
      return indices.reduce((sum, i) => sum + services[i].durationMinutes, 0);
    }

    it('vyloučení vlastního intervalu; úspěch ⇒ bez překryvu a množina nahrazena bez zbytků', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Počáteční (původní) množina služeb a čas upravované rezervace.
            initialIndices: fc.uniqueArray(fc.integer({ min: 0, max: 3 }), {
              minLength: 1,
              maxLength: 4,
            }),
            initialStartMin: fc.integer({ min: 0, max: 32 }).map((q) => q * 15), // 0..480 min, krok 15
            // Nová množina služeb po editaci (uspořádaná, bez duplicit).
            newIndices: fc.uniqueArray(fc.integer({ min: 0, max: 3 }), {
              minLength: 1,
              maxLength: 4,
            }),
            // Nový počátek; sameTime = editace ponechá původní čas (překryv se sebou samou).
            sameTime: fc.boolean(),
            newStartMin: fc.integer({ min: 0, max: 32 }).map((q) => q * 15),
            // Ostatní rezervace (i neaktivní — ty nový interval neblokují).
            others: fc.array(
              fc.record({
                startMin: fc.integer({ min: 0, max: 32 }).map((q) => q * 15),
                lengthMin: fc.integer({ min: 1, max: 6 }).map((q) => q * 15), // 15..90 min
                status: fc.constantFrom(...ALL_STATUSES),
              }),
              { minLength: 0, maxLength: 4 },
            ),
          }),
          async ({ initialIndices, initialStartMin, newIndices, sameTime, newStartMin, others }) => {
            const initialServiceIds = initialIndices.map((i) => services[i].id);
            const initialStart = initialStartMin;
            const initialEnd = initialStartMin + combinedDuration(initialIndices);

            const newServiceIds = newIndices.map((i) => services[i].id);
            const effectiveNewStart = sameTime ? initialStartMin : newStartMin;
            const newCombined = combinedDuration(newIndices);
            const newStart = effectiveNewStart;
            const newEnd = effectiveNewStart + newCombined;

            // Deterministické očekávání: konflikt ⇔ nový interval se překrývá s některou
            // OSTATNÍ AKTIVNÍ rezervací. Vlastní (původní) interval upravované rezervace
            // se DO výpočtu nezahrnuje → tím testujeme vyloučení sebe sama (R9.5).
            const expectConflict = others.some(
              (r) =>
                ACTIVE_STATUSES.has(r.status) &&
                overlaps(newStart, newEnd, r.startMin, r.startMin + r.lengthMin),
            );

            // (1) Nasadíme upravovanou rezervaci přes create_reservation_multi. V tomto
            // okamžiku ještě neexistují žádné ostatní rezervace → create vždy uspěje.
            const { data: createData, error: createError } = await admin.rpc(
              'create_reservation_multi',
              {
                p_business_id: businessId,
                p_service_ids: initialServiceIds,
                p_starts_at: new Date(BASE_DATE_MS + initialStart * MINUTE_MS).toISOString(),
                p_client_name: 'Upravovaný klient',
                p_client_phone: '+420704344177',
                p_client_email: 'edited@example.test',
                p_note: null,
              },
            );
            if (createError) {
              throw new Error(`RPC create_reservation_multi selhalo: ${createError.message}`);
            }
            const createRow = (Array.isArray(createData) ? createData[0] : createData) as {
              reservation_id: string | null;
              conflict: boolean;
              not_published: boolean;
              invalid: boolean;
            };
            expect(createRow.conflict).toBe(false);
            expect(createRow.not_published).toBe(false);
            expect(createRow.invalid).toBe(false);
            expect(createRow.reservation_id).not.toBeNull();
            const reservationId = createRow.reservation_id as string;

            try {
              // (2) Seed OSTATNÍCH rezervací přímo do reservations (re-check je nečte
              // přes reservation_services). Smí se překrývat i s původním intervalem
              // upravované rezervace — re-check je rozliší podle id.
              let othersCount = 0;
              if (others.length > 0) {
                const rows = others.map((r) => ({
                  business_id: businessId,
                  service_id: services[0].id,
                  client_name: 'Ostatní klient',
                  client_phone: '+420700000000',
                  client_email: 'other@example.test',
                  starts_at: new Date(BASE_DATE_MS + r.startMin * MINUTE_MS).toISOString(),
                  ends_at: new Date(BASE_DATE_MS + (r.startMin + r.lengthMin) * MINUTE_MS).toISOString(),
                  status: r.status,
                }));
                const { error: seedError } = await admin.from('reservations').insert(rows);
                if (seedError) {
                  throw new Error('Nepodařilo se naseedovat ostatní rezervace.');
                }
                othersCount = rows.length;
              }

              // (3) Editace upravované rezervace na novou množinu + nový čas.
              const { data: editData, error: editError } = await admin.rpc('edit_reservation_multi', {
                p_reservation_id: reservationId,
                p_business_id: businessId,
                p_service_ids: newServiceIds,
                p_starts_at: new Date(BASE_DATE_MS + newStart * MINUTE_MS).toISOString(),
              });
              if (editError) {
                throw new Error(`RPC edit_reservation_multi selhalo: ${editError.message}`);
              }

              const editRow = (Array.isArray(editData) ? editData[0] : editData) as {
                updated: boolean;
                conflict: boolean;
                invalid: boolean;
              };
              expect(editRow).toBeDefined();

              // Vstup je vždy validní (rezervace existuje, množina v rozsahu, vlastní služby).
              expect(editRow.invalid).toBe(false);
              // Výsledek odpovídá deterministickému očekávání nad OSTATNÍMI rezervacemi.
              expect(editRow.conflict).toBe(expectConflict);
              expect(editRow.updated).toBe(!expectConflict);

              // (a) Vyloučení sebe sama: pokud se nový interval překrývá s VLASTNÍM
              // původním intervalem rezervace, ale s žádnou jinou aktivní, editace
              // NESMÍ hlásit konflikt — overlap se sebou samou není kolize (R9.5).
              if (overlaps(newStart, newEnd, initialStart, initialEnd) && !expectConflict) {
                expect(editRow.updated).toBe(true);
                expect(editRow.conflict).toBe(false);
              }

              const { data: linked, error: selectError } = await admin
                .from('reservation_services')
                .select('service_id, position')
                .eq('reservation_id', reservationId)
                .order('position', { ascending: true });
              if (selectError) {
                throw new Error('Načtení reservation_services selhalo.');
              }
              const linkedRows = (linked ?? []) as { service_id: string; position: number }[];

              if (expectConflict) {
                // Konflikt: stará množina i čas zůstávají beze změny (žádný částečný zápis).
                expect(linkedRows).toHaveLength(initialServiceIds.length);
                expect(linkedRows.map((row) => row.position)).toEqual(
                  initialServiceIds.map((_, idx) => idx),
                );
                expect(linkedRows.map((row) => row.service_id)).toEqual(initialServiceIds);
              } else {
                // (b) Úspěch: nový interval se nepřekrývá s žádnou JINOU aktivní rezervací.
                const stillOverlaps = others.some(
                  (r) =>
                    ACTIVE_STATUSES.has(r.status) &&
                    overlaps(newStart, newEnd, r.startMin, r.startMin + r.lengthMin),
                );
                expect(stillOverlaps).toBe(false);

                // (c) Množina nahrazena PŘESNĚ novou množinou bez zbytků: pozice 0..n-1
                // a service_id přesně v pořadí newServiceIds.
                expect(linkedRows).toHaveLength(newServiceIds.length);
                expect(linkedRows.map((row) => row.position)).toEqual(
                  newServiceIds.map((_, idx) => idx),
                );
                expect(linkedRows.map((row) => row.service_id)).toEqual(newServiceIds);

                // Nový čas a ends_at = starts_at + Combined_Duration nové množiny.
                const { data: reservationRow, error: reservationError } = await admin
                  .from('reservations')
                  .select('service_id, starts_at, ends_at')
                  .eq('id', reservationId)
                  .single<{ service_id: string; starts_at: string; ends_at: string }>();
                if (reservationError || !reservationRow) {
                  throw new Error('Načtení upravené rezervace selhalo.');
                }
                expect(reservationRow.service_id).toBe(newServiceIds[0]);
                expect(new Date(reservationRow.starts_at).getTime()).toBe(
                  BASE_DATE_MS + newStart * MINUTE_MS,
                );
                expect(new Date(reservationRow.ends_at).getTime()).toBe(
                  BASE_DATE_MS + newEnd * MINUTE_MS,
                );
              }

              // othersCount je jen sanity guard, že seed proběhl podle očekávání.
              expect(othersCount).toBe(others.length);
            } finally {
              // Úklid per běh — smazání rezervací podniku cascade odstraní i
              // navázané reservation_services (upravovaná i ostatní rezervace).
              await admin.from('reservations').delete().eq('business_id', businessId);
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    });
  },
);
