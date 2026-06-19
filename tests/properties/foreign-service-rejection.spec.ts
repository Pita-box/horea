// Feature: multi-service-reservations, Property 7: Pro libovolnou množinu služeb,
// která obsahuje alespoň jednu službu nepatřící podniku (nebo neexistující),
// vrátí create_reservation_multi invalid = true a NEZAPÍŠE žádný řádek
// reservations ani reservation_services.
//
/**
 * Integrační property test (VOLITELNÝ) — cizí služba způsobí odmítnutí
 * (R7.1, R9.4, Property 7), feature `multi-service-reservations`, task 4.9.
 *
 * Ověřuje invariantu příslušnosti služeb z RPC `create_reservation_multi`
 * (migrace `0049`): RPC ověřuje, že VŠECHNY služby v předaném poli existují a
 * patří danému podniku (`count(*) ... where business_id = p_business_id`). Pokud
 * pole obsahuje alespoň jednu službu cizího podniku nebo zcela neexistující UUID,
 * `v_owned_count <> v_count` → funkce vrátí `invalid = true` BEZ jakéhokoli zápisu
 * (žádný insert do `reservations`, žádný insert do `reservation_services`).
 *
 * Generujeme množinu, jejíž jediným důvodem k odmítnutí je cizí/neexistující
 * služba: počet držíme v rozsahu [1,10] a bez duplicit, aby odmítnutí NEbylo
 * způsobeno rozsahem ani duplicitou. Do množiny vždy vložíme právě jednu cizí
 * položku (služba podniku B, nebo náhodné UUID) na náhodnou pozici a doplníme ji
 * 0–3 vlastními službami podniku A.
 *
 * Pro úplnost ověřujeme i `edit_reservation_multi` se stejnou cizí množinou nad
 * předem nasazenou validní rezervací podniku A — musí vrátit `invalid = true`,
 * ponechat původní množinu služeb beze změny a nezapsat žádnou cizí službu.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `backfill-single-service.spec.ts`).
 *
 * _Requirements: 7.1, 9.4_
 * _Properties: 7_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (RPC call + ověření počtu řádků + cleanup),
// takže držíme minimum z návrhu (≥100), shodně s ostatními DB property testy.
const NUM_RUNS = 100;

/** Pevné základní datum (Europe/Prague pondělí) pro generované počáteční časy. */
const BASE_DATE_MS = Date.UTC(2025, 5, 16, 8, 0, 0); // 2025-06-16T08:00:00Z

type CreateMultiRow = {
  reservation_id: string | null;
  status: string | null;
  conflict: boolean;
  not_published: boolean;
  invalid: boolean;
};

type EditMultiRow = {
  updated: boolean;
  conflict: boolean;
  invalid: boolean;
};

describe.skipIf(!hasIntegrationEnv)('Cizí služba způsobí odmítnutí (RPC *_reservation_multi, Property 7)', () => {
  // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
  // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let userId: string;
  // Podnik A (vlastní) a jeho služby.
  let businessAId: string;
  let serviceAIds: string[];
  // Cizí podnik B a jeho služba (existuje, ale NEpatří podniku A).
  let businessBId: string;
  let foreignServiceId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `foreign-svc-${unique}@example.test`;

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

    // Oba podniky vlastní týž uživatel — pro tento test je podstatná jen příslušnost
    // SLUŽEB k podniku, ne vlastnictví podniku. Publikujeme A (publish gate v RPC).
    const { data: businessA, error: businessAError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `foreign-svc-a-${unique}`,
        name: 'Podnik A',
        type: 'kadernik',
        published: true,
        auto_approve_reservations: true,
        allow_parallel_slots: false,
      })
      .select('id')
      .single<{ id: string }>();
    if (businessAError || !businessA) {
      throw new Error('Nepodařilo se vytvořit podnik A.');
    }
    businessAId = businessA.id;

    const { data: businessB, error: businessBError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `foreign-svc-b-${unique}`,
        name: 'Podnik B',
        type: 'kadernik',
        published: true,
      })
      .select('id')
      .single<{ id: string }>();
    if (businessBError || !businessB) {
      throw new Error('Nepodařilo se vytvořit podnik B.');
    }
    businessBId = businessB.id;

    // Tři vlastní služby podniku A.
    const { data: insertedA, error: serviceAError } = await admin
      .from('services')
      .insert([
        { business_id: businessAId, name: 'Střih', duration_minutes: 30, price_czk: 300 },
        { business_id: businessAId, name: 'Mytí', duration_minutes: 15, price_czk: 0 },
        { business_id: businessAId, name: 'Barvení', duration_minutes: 90, price_czk: 1200 },
      ])
      .select('id');
    if (serviceAError || !insertedA || insertedA.length !== 3) {
      throw new Error('Nepodařilo se vytvořit služby podniku A.');
    }
    serviceAIds = insertedA.map((row) => (row as { id: string }).id);

    // Jedna cizí služba podniku B.
    const { data: insertedB, error: serviceBError } = await admin
      .from('services')
      .insert({ business_id: businessBId, name: 'Cizí služba', duration_minutes: 60, price_czk: 600 })
      .select('id')
      .single<{ id: string }>();
    if (serviceBError || !insertedB) {
      throw new Error('Nepodařilo se vytvořit cizí službu podniku B.');
    }
    foreignServiceId = insertedB.id;
  });

  afterAll(async () => {
    // Idempotentní úklid — cascade z businesses smaže služby, rezervace i reservation_services.
    if (businessAId) {
      await admin.from('businesses').delete().eq('id', businessAId);
    }
    if (businessBId) {
      await admin.from('businesses').delete().eq('id', businessBId);
    }
    if (userId) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  /**
   * Generátor množiny služeb pro podnik A, která vždy obsahuje právě jednu cizí
   * položku (služba podniku B nebo náhodné UUID) doplněnou o 0–3 vlastní služby A.
   * Počet je v [1,4] ⊂ [1,10] a bez duplicit → jediným důvodem k `invalid` je cizí
   * služba, ne rozsah ani duplicita.
   */
  const foreignSetArb = fc
    .record({
      ownCount: fc.integer({ min: 0, max: 3 }),
      foreignKind: fc.constantFrom<'businessB' | 'randomUuid'>('businessB', 'randomUuid'),
      randomUuid: fc.uuid(),
      insertAt: fc.nat(),
      dayOffset: fc.integer({ min: 0, max: 120 }),
    })
    .map(({ ownCount, foreignKind, randomUuid, insertAt, dayOffset }) => {
      const own = serviceAIds.slice(0, ownCount);
      const foreign = foreignKind === 'businessB' ? foreignServiceId : randomUuid;
      const pos = own.length === 0 ? 0 : insertAt % (own.length + 1);
      const serviceIds = [...own.slice(0, pos), foreign, ...own.slice(pos)];
      return { serviceIds, dayOffset };
    });

  function startsAtFor(dayOffset: number): string {
    return new Date(BASE_DATE_MS + dayOffset * 24 * 60 * 60 * 1000).toISOString();
  }

  it('create_reservation_multi vrátí invalid a nezapíše žádný řádek', async () => {
    await fc.assert(
      fc.asyncProperty(foreignSetArb, async ({ serviceIds, dayOffset }) => {
        const { count: reservationsBefore } = await admin
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessAId);

        const { data, error } = await admin.rpc('create_reservation_multi', {
          p_business_id: businessAId,
          p_service_ids: serviceIds,
          p_starts_at: startsAtFor(dayOffset),
          p_client_name: 'Klient Cizí',
          p_client_phone: '+420700000000',
          p_client_email: 'klient@example.test',
          p_note: null,
        });
        if (error) {
          throw new Error(`RPC create_reservation_multi selhalo: ${error.message}`);
        }

        const row = (data as CreateMultiRow[] | null)?.[0];
        expect(row).toBeDefined();
        // Cizí/neexistující služba → invalid, žádný conflict ani not_published, žádné id.
        expect(row?.invalid).toBe(true);
        expect(row?.reservation_id).toBeNull();
        expect(row?.conflict).toBe(false);
        expect(row?.not_published).toBe(false);

        // Žádný zápis: počet rezervací podniku A se nezměnil.
        const { count: reservationsAfter } = await admin
          .from('reservations')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessAId);
        expect(reservationsAfter).toBe(reservationsBefore ?? 0);

        // Žádný řádek reservation_services neodkazuje na cizí službu v rámci podniku A.
        const { count: foreignLinks } = await admin
          .from('reservation_services')
          .select('reservation_id', { count: 'exact', head: true })
          .in('service_id', serviceIds);
        expect(foreignLinks).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('edit_reservation_multi s cizí službou vrátí invalid a ponechá původní množinu', async () => {
    // Nasadíme validní jednoslužbovou rezervaci podniku A přes RPC (čistá výchozí množina).
    const { data: seedData, error: seedError } = await admin.rpc('create_reservation_multi', {
      p_business_id: businessAId,
      p_service_ids: [serviceAIds[0]],
      p_starts_at: startsAtFor(200),
      p_client_name: 'Klient Edit',
      p_client_phone: '+420700000001',
      p_client_email: 'edit@example.test',
      p_note: null,
    });
    if (seedError) {
      throw new Error(`Seed create_reservation_multi selhalo: ${seedError.message}`);
    }
    const seedRow = (seedData as CreateMultiRow[] | null)?.[0];
    if (!seedRow?.reservation_id) {
      throw new Error('Seed rezervace se nevytvořila.');
    }
    const reservationId = seedRow.reservation_id;

    try {
      await fc.assert(
        fc.asyncProperty(foreignSetArb, async ({ serviceIds, dayOffset }) => {
          const { data, error } = await admin.rpc('edit_reservation_multi', {
            p_reservation_id: reservationId,
            p_business_id: businessAId,
            p_service_ids: serviceIds,
            p_starts_at: startsAtFor(dayOffset),
          });
          if (error) {
            throw new Error(`RPC edit_reservation_multi selhalo: ${error.message}`);
          }

          const row = (data as EditMultiRow[] | null)?.[0];
          expect(row).toBeDefined();
          expect(row?.invalid).toBe(true);
          expect(row?.updated).toBe(false);
          expect(row?.conflict).toBe(false);

          // Původní množina zůstává beze změny: přesně jeden řádek s původní službou A.
          const { data: linked, error: selectError } = await admin
            .from('reservation_services')
            .select('service_id, position')
            .eq('reservation_id', reservationId);
          if (selectError) {
            throw new Error('Načtení reservation_services selhalo.');
          }
          expect(linked ?? []).toHaveLength(1);
          const link = (linked ?? [])[0] as { service_id: string; position: number };
          expect(link.position).toBe(0);
          expect(link.service_id).toBe(serviceAIds[0]);
        }),
        { numRuns: NUM_RUNS },
      );
    } finally {
      await admin.from('reservations').delete().eq('id', reservationId);
    }
  });
});
