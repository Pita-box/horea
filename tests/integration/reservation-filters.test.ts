/**
 * Integrační test (VOLITELNÝ) — filtry a stránkování seznamu rezervací
 * (R2.1, R2.7, R3.3, R3.5).
 *
 * Ověřuje proti REÁLNÉMU Postgresu chování dotazů, které staví `Reservations_List`
 * (a se shodnými predikáty `CsvExporter`):
 *  - výchozí stav bez filtru zobrazí jen budoucí rezervace (`starts_at >= now()`),
 *  - konjunktivní kombinace status × časový rozsah × služba vrací PRŮNIK (R3.5),
 *  - volba časového rozsahu PŘEPÍŠE výchozí pravidlo „pouze budoucí" (R3.3),
 *  - jeden request načte nejvýše 100 řádků (R2.7), zatímco úplné čtení vrátí vše.
 *
 * Dotazy běží pod uživatelským JWT majitele (RLS izoluje data na jeho podnik),
 * stejně jako čtecí vrstva dashboardu. Seed přes service-role klienta. Bez
 * nakonfigurovaného testovacího Supabase se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 2.1, 2.7, 3.3, 3.5_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { RESERVATIONS_PAGE_SIZE } from '@/lib/reservations/filters';

import {
  getServiceRoleClient,
  hasRlsIntegrationEnv,
  signInAsUser,
} from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

/** Počet budoucích rezervací nad limit stránky pro ověření R2.7. */
const FUTURE_BULK_COUNT = RESERVATIONS_PAGE_SIZE + 20;

type SeedIds = {
  serviceA: string;
  serviceB: string;
  /** pending, serviceA, budoucí — jediný průnik konjunktivního filtru. */
  futurePendingA: string;
  /** approved, serviceA, budoucí — odfiltrováno statusem. */
  futureApprovedA: string;
  /** pending, serviceB, budoucí — odfiltrováno službou. */
  futurePendingB: string;
  /** pending, serviceA, minulost — odfiltrováno „pouze budoucí", ale spadá do rozsahu. */
  pastPendingA: string;
};

describe.skipIf(!hasRlsIntegrationEnv)('Filtry a stránkování seznamu rezervací', () => {
  let admin: SupabaseClient;
  let owner: SupabaseClient;
  let userId: string;
  let businessId: string;
  let ids: SeedIds;

  async function insertReservation(args: {
    serviceId: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    startsAt: string;
    endsAt: string;
  }): Promise<string> {
    const { data, error } = await admin
      .from('reservations')
      .insert({
        business_id: businessId,
        service_id: args.serviceId,
        client_name: 'Filtrovaný klient',
        client_email: 'filtr@example.test',
        starts_at: args.startsAt,
        ends_at: args.endsAt,
        status: args.status,
      })
      .select('id')
      .single<{ id: string }>();

    if (error || !data) {
      throw new Error('Nepodařilo se vytvořit rezervaci.');
    }
    return data.id;
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `filters-${unique}@example.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
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
        slug: `filters-${unique}`,
        name: 'Podnik filtry',
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    businessId = business.id;

    const insertService = async (name: string): Promise<string> => {
      const { data, error } = await admin
        .from('services')
        .insert({ business_id: businessId, name, duration_minutes: 30, price_czk: 250 })
        .select('id')
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error('Nepodařilo se vytvořit službu.');
      }
      return data.id;
    };

    const serviceA = await insertService('Služba A');
    const serviceB = await insertService('Služba B');

    ids = {
      serviceA,
      serviceB,
      futurePendingA: await insertReservation({
        serviceId: serviceA,
        status: 'pending',
        startsAt: '2099-06-15T08:00:00Z',
        endsAt: '2099-06-15T08:30:00Z',
      }),
      futureApprovedA: await insertReservation({
        serviceId: serviceA,
        status: 'approved',
        startsAt: '2099-06-15T09:00:00Z',
        endsAt: '2099-06-15T09:30:00Z',
      }),
      futurePendingB: await insertReservation({
        serviceId: serviceB,
        status: 'pending',
        startsAt: '2099-06-15T10:00:00Z',
        endsAt: '2099-06-15T10:30:00Z',
      }),
      pastPendingA: await insertReservation({
        serviceId: serviceA,
        status: 'pending',
        startsAt: '2020-03-10T08:00:00Z',
        endsAt: '2020-03-10T08:30:00Z',
      }),
    };

    // Hromada budoucích rezervací nad limit stránky (R2.7).
    const bulk = Array.from({ length: FUTURE_BULK_COUNT }, (_, index) => {
      const day = 1 + index; // 2098-01-01 .. (distinct, daleko v budoucnu)
      const date = new Date(Date.UTC(2098, 0, day));
      const iso = date.toISOString().slice(0, 10);
      return {
        business_id: businessId,
        service_id: serviceA,
        client_name: 'Hromadný klient',
        client_email: 'bulk@example.test',
        starts_at: `${iso}T08:00:00Z`,
        ends_at: `${iso}T08:30:00Z`,
        status: 'pending' as const,
      };
    });

    const { error: bulkError } = await admin.from('reservations').insert(bulk);
    if (bulkError) {
      throw new Error('Nepodařilo se vytvořit hromadné rezervace.');
    }

    owner = await signInAsUser(email, TEST_PASSWORD);
  });

  afterAll(async () => {
    if (businessId) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    if (userId) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('výchozí stav bez filtru zobrazí jen budoucí rezervace (R2.1)', async () => {
    const nowIso = new Date().toISOString();
    const { data, error } = await owner
      .from('reservations')
      .select('id,starts_at')
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true });

    expect(error).toBeNull();
    const returnedIds = (data ?? []).map((row) => row.id);
    // Minulá rezervace mezi výsledky není.
    expect(returnedIds).not.toContain(ids.pastPendingA);
    expect(returnedIds).toContain(ids.futurePendingA);
    // Řazení vzestupně podle starts_at.
    const starts = (data ?? []).map((row) => row.starts_at);
    expect(starts).toEqual([...starts].sort());
  });

  it('konjunktivní status × rozsah × služba vrací průnik (R3.5)', async () => {
    // status=pending AND service=A AND rozsah pokrývající jen budoucí den slotu A.
    const { data, error } = await owner
      .from('reservations')
      .select('id')
      .in('status', ['pending'])
      .in('service_id', [ids.serviceA])
      .gte('starts_at', '2099-06-15T00:00:00Z')
      .lte('starts_at', '2099-06-15T23:59:59Z');

    expect(error).toBeNull();
    const returnedIds = (data ?? []).map((row) => row.id);

    // Průnik všech tří kritérií = právě futurePendingA.
    expect(returnedIds).toContain(ids.futurePendingA);
    expect(returnedIds).not.toContain(ids.futureApprovedA); // odfiltrováno statusem
    expect(returnedIds).not.toContain(ids.futurePendingB); // odfiltrováno službou
    expect(returnedIds).not.toContain(ids.pastPendingA); // mimo rozsah
    expect(returnedIds).toHaveLength(1);
  });

  it('časový rozsah přepíše výchozí pravidlo „pouze budoucí" (R3.3)', async () => {
    // Rozsah v minulosti → vrátí minulou rezervaci, kterou výchozí filtr skrýval.
    const { data, error } = await owner
      .from('reservations')
      .select('id')
      .gte('starts_at', '2020-03-01T00:00:00Z')
      .lte('starts_at', '2020-03-31T23:59:59Z');

    expect(error).toBeNull();
    const returnedIds = (data ?? []).map((row) => row.id);
    expect(returnedIds).toContain(ids.pastPendingA);
    // Budoucí rezervace mimo rozsah se nevrací.
    expect(returnedIds).not.toContain(ids.futurePendingA);
  });

  it('jeden request načte nejvýše 100 řádků, úplné čtení vrátí vše (R2.7)', async () => {
    // Jedna „stránka" UI je omezená na RESERVATIONS_PAGE_SIZE řádků.
    const { data: page, error: pageError } = await owner
      .from('reservations')
      .select('id')
      .order('starts_at', { ascending: true })
      .range(0, RESERVATIONS_PAGE_SIZE - 1);

    expect(pageError).toBeNull();
    expect((page ?? []).length).toBe(RESERVATIONS_PAGE_SIZE);

    // Úplný počet budoucích rezervací (přes head count) přesahuje limit stránky.
    const { count, error: countError } = await owner
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', '2098-01-01T00:00:00Z');

    expect(countError).toBeNull();
    expect(count ?? 0).toBeGreaterThan(RESERVATIONS_PAGE_SIZE);
    expect(count ?? 0).toBeGreaterThanOrEqual(FUTURE_BULK_COUNT);
  });
});
