// Feature: multi-service-reservations, Property 16: Pro libovolnou existující
// jednoslužbovou rezervaci vytvoří backfill přesně jeden řádek reservation_services
// s position = 0, jehož service_id odpovídá původnímu reservations.service_id.
//
/**
 * Integrační property test (VOLITELNÝ) — backfill jednoslužbové rezervace
 * z migrace `0049` (R11.1, Property 16), feature `multi-service-reservations`,
 * task 2.7.
 *
 * Ověřuje invariantu backfillu z migrace `0049`:
 *
 *   insert into public.reservation_services
 *     (reservation_id, service_id, position, duration_minutes_snapshot, price_czk_snapshot)
 *   select r.id, r.service_id, 0, s.duration_minutes, s.price_czk
 *   from public.reservations r
 *   join public.services s on s.id = r.service_id
 *   on conflict do nothing;
 *
 * Pro libovolnou existující jednoslužbovou rezervaci (s validním service_id)
 * vznikne PŘESNĚ JEDEN řádek `reservation_services` s `position = 0`, jehož
 * `service_id` odpovídá `reservations.service_id`.
 *
 * Zvolený přístup (varianta (a) ze zadání): migrace `0049` proběhla na sdílené DB
 * jednorázově v okamžiku migrace, takže rezervace nově nasazené přímo do tabulky
 * `reservations` (tj. simulující PŮVODNÍ jednoslužbové rezervace z doby před migrací)
 * backfill automaticky nezachytí. Proto v každém běhu fast-check nasadíme čerstvou
 * jednoslužbovou rezervaci a znovu spustíme IDEMPOTENTNÍ backfill insert.
 *
 * Poznámka k věrnosti: Supabase JS klient neumí spustit syrové `INSERT ... SELECT ...
 * JOIN ... ON CONFLICT DO NOTHING` ani nemáme generické SQL-exec RPC. Backfill proto
 * replikujeme přes JS klienta SE STEJNOU sémantikou jako migrace: čteme
 * `reservations JOIN services` (omezeno na testovací podnik) a vkládáme řádek
 * `position = 0` se snapshotem aktuální délky/ceny služby, `ignoreDuplicates: true`
 * (= `on conflict do nothing`). Replikace je idempotentní stejně jako SQL backfill.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase (`SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY`) se
 * celý blok přeskočí (`describe.skipIf`) — shodně s ostatními integračními testy
 * projektu (např. `services-cascade.test.ts`, `force-delete-completeness-db.test.ts`).
 *
 * _Requirements: 11.1_
 * _Properties: 16_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from '../integration/supabase-test-client';

// Každý běh fast-check zasahuje DB (insert rezervace → backfill → select → cleanup),
// takže držíme minimum z návrhu (≥100), ne víc — test je navíc přeskočen v defaultním
// `pnpm test:run` bez integračního prostředí.
const NUM_RUNS = 100;

/** Pevné základní datum (Europe/Prague pondělí) pro generované počáteční časy. */
const BASE_DATE_MS = Date.UTC(2025, 5, 16, 8, 0, 0); // 2025-06-16T08:00:00Z

type SeededService = {
  id: string;
  durationMinutes: number;
  priceCzk: number;
};

/** Stavy rezervace — backfill je nezávislý na statusu (žádný filtr v migraci). */
const RES_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

describe.skipIf(!hasIntegrationEnv)('Backfill jednoslužbové rezervace (migrace 0049, Property 16)', () => {
  // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
  // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let services: SeededService[];

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `backfill-${unique}@example.test`;

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

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `backfill-${unique}`,
        name: 'Podnik backfill',
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();
    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }
    businessId = business.id;

    // Paleta služeb s různou délkou i cenou (včetně ceny 0 Kč) — backfill snapshotuje
    // aktuální duration_minutes / price_czk každé z nich.
    const serviceSpecs = [
      { name: 'Střih', duration_minutes: 30, price_czk: 300 },
      { name: 'Mytí', duration_minutes: 15, price_czk: 0 },
      { name: 'Barvení', duration_minutes: 90, price_czk: 1200 },
      { name: 'Foukaná', duration_minutes: 45, price_czk: 450 },
      { name: 'Konzultace', duration_minutes: 20, price_czk: 150 },
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
    // Idempotentní úklid — cascade z businesses smaže služby, rezervace i reservation_services.
    if (businessId) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    if (userId) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  /**
   * Replikuje idempotentní backfill z migrace `0049` se stejnou sémantikou:
   * `reservations JOIN services` (omezeno na testovací podnik) → vloží position-0
   * řádek se snapshotem aktuální délky/ceny, `ignoreDuplicates` = `on conflict do nothing`.
   */
  async function runBackfill(): Promise<void> {
    const { data: rows, error } = await admin
      .from('reservations')
      .select('id, service_id, services(duration_minutes, price_czk)')
      .eq('business_id', businessId);
    if (error) {
      throw new Error('Backfill: načtení reservations JOIN services selhalo.');
    }

    const payload = (rows ?? [])
      .map((row) => {
        const r = row as {
          id: string;
          service_id: string;
          services: { duration_minutes: number; price_czk: number | string } | null;
        };
        if (!r.services) {
          return null; // join nenašel službu (R11.1: backfill se týká jen validního service_id)
        }
        return {
          reservation_id: r.id,
          service_id: r.service_id,
          position: 0,
          duration_minutes_snapshot: r.services.duration_minutes,
          price_czk_snapshot: r.services.price_czk,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    if (payload.length === 0) {
      return;
    }

    const { error: insertError } = await admin
      .from('reservation_services')
      .upsert(payload, { onConflict: 'reservation_id,position', ignoreDuplicates: true });
    if (insertError) {
      throw new Error('Backfill: insert do reservation_services selhal.');
    }
  }

  it('vytvoří přesně jeden position-0 řádek se service_id = reservations.service_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serviceIndex: fc.integer({ min: 0, max: 4 }),
          dayOffset: fc.integer({ min: 0, max: 120 }),
          status: fc.constantFrom(...RES_STATUSES),
        }),
        async ({ serviceIndex, dayOffset, status }) => {
          const service = services[serviceIndex];
          const startsAtMs = BASE_DATE_MS + dayOffset * 24 * 60 * 60 * 1000;
          const startsAt = new Date(startsAtMs).toISOString();
          const endsAt = new Date(startsAtMs + service.durationMinutes * 60 * 1000).toISOString();

          // Nasadíme PŮVODNÍ jednoslužbovou rezervaci přímo do reservations (jako by
          // existovala před migrací) — bez navázaných reservation_services řádků.
          const { data: reservation, error: insertError } = await admin
            .from('reservations')
            .insert({
              business_id: businessId,
              service_id: service.id,
              client_name: 'Klient Backfill',
              client_phone: '+420700000000',
              client_email: 'klient@example.test',
              starts_at: startsAt,
              ends_at: endsAt,
              status,
            })
            .select('id, service_id')
            .single<{ id: string; service_id: string }>();
          if (insertError || !reservation) {
            throw new Error('Nepodařilo se nasadit jednoslužbovou rezervaci.');
          }

          try {
            // Před backfillem žádné navázané řádky.
            const { count: beforeCount } = await admin
              .from('reservation_services')
              .select('reservation_id', { count: 'exact', head: true })
              .eq('reservation_id', reservation.id);
            expect(beforeCount).toBe(0);

            await runBackfill();

            // Po backfillu PŘESNĚ JEDEN řádek s position = 0 a shodným service_id.
            const { data: linked, error: selectError } = await admin
              .from('reservation_services')
              .select('service_id, position, duration_minutes_snapshot, price_czk_snapshot')
              .eq('reservation_id', reservation.id);
            if (selectError) {
              throw new Error('Načtení reservation_services selhalo.');
            }

            expect(linked ?? []).toHaveLength(1);
            const row = (linked ?? [])[0] as {
              service_id: string;
              position: number;
              duration_minutes_snapshot: number;
              price_czk_snapshot: number | string;
            };
            expect(row.position).toBe(0);
            expect(row.service_id).toBe(reservation.service_id);
            expect(row.duration_minutes_snapshot).toBe(service.durationMinutes);
            expect(Number(row.price_czk_snapshot)).toBe(service.priceCzk);
          } finally {
            // Úklid per běh — cascade z reservations smaže i reservation_services.
            await admin.from('reservations').delete().eq('id', reservation.id);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
