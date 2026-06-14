/**
 * Integrační test (VOLITELNÝ) — časování upsertu klienta po commitu rezervace
 * (R15.1, R15.5).
 *
 * Ověřuje proti REÁLNÉMU Postgresu, že `Client_Upsertor` (`upsertClientFromReservation`)
 * běží PO COMMITU rezervace a je BEST-EFFORT: po commitnuté rezervaci upsert vytvoří
 * / spáruje klienta, a pokud upsert selže (vyvolaná DB chyba), původní rezervace
 * zůstane zachována — selhání upsertu NIKDY nezpůsobí rollback rezervace.
 *
 * Voláme přímo reálnou funkci `upsertClientFromReservation` se service-role test
 * klientem (funkce přijímá Supabase klienta jako parametr) — žádný mock, skutečný
 * zápis do `clients`. Selhání vyvoláme předáním `businessId`, který v DB neexistuje:
 * INSERT do `clients` poruší FK na `businesses` a funkce ho (best-effort) jen
 * zaloguje, místo aby vyhodila výjimku.
 *
 * Běží čistě přes service-role klienta. Bez nakonfigurovaného testovacího Supabase
 * se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 15.1, 15.5_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { upsertClientFromReservation } from '@/server/ClientUpsertor';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

describe.skipIf(!hasIntegrationEnv)('Časování upsertu klienta po commitu rezervace', () => {
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let serviceId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `upsert-${unique}@example.test`;

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
        slug: `upsert-${unique}`,
        name: 'Podnik upsert',
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    businessId = business.id;

    const { data: service, error: serviceError } = await admin
      .from('services')
      .insert({
        business_id: businessId,
        name: 'Služba upsert',
        duration_minutes: 30,
        price_czk: 250,
      })
      .select('id')
      .single<{ id: string }>();

    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    serviceId = service.id;
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

  it('po commitu rezervace upsert založí nového klienta (R15.1)', async () => {
    // (1) Rezervace je nejdřív commitnutá v DB.
    const { data: reservation, error: reservationError } = await admin
      .from('reservations')
      .insert({
        business_id: businessId,
        service_id: serviceId,
        client_name: 'Nový Klient',
        client_phone: '+420777111222',
        client_email: 'novy@example.test',
        starts_at: '2099-08-01T08:00:00Z',
        ends_at: '2099-08-01T08:30:00Z',
        status: 'approved',
      })
      .select('id')
      .single<{ id: string }>();

    expect(reservationError).toBeNull();
    expect(reservation?.id).toBeDefined();

    // (2) Upsert klienta probíhá AŽ PO commitu rezervace.
    await upsertClientFromReservation({
      supabase: admin,
      businessId,
      clientName: 'Nový Klient',
      clientPhone: '+420777111222',
      clientEmail: 'novy@example.test',
    });

    // (3) V `clients` vznikl řádek napárovaný na téhož klienta v rámci business_id.
    const { data: clients } = await admin
      .from('clients')
      .select('id,name,phone,email')
      .eq('business_id', businessId)
      .eq('email', 'novy@example.test');

    expect(clients ?? []).toHaveLength(1);
    expect(clients?.[0]?.name).toBe('Nový Klient');
    expect(clients?.[0]?.phone).toBe('+420777111222');
  });

  it('vyvolané selhání upsertu nezruší již commitnutou rezervaci (R15.5)', async () => {
    // (1) Rezervace je commitnutá pro REÁLNÝ podnik.
    const { data: reservation, error: reservationError } = await admin
      .from('reservations')
      .insert({
        business_id: businessId,
        service_id: serviceId,
        client_name: 'Odolný Klient',
        client_phone: '+420777333444',
        client_email: 'odolny@example.test',
        starts_at: '2099-08-02T08:00:00Z',
        ends_at: '2099-08-02T08:30:00Z',
        status: 'approved',
      })
      .select('id')
      .single<{ id: string }>();

    expect(reservationError).toBeNull();
    const reservationId = reservation?.id;
    expect(reservationId).toBeDefined();

    // (2) Upsert s NEEXISTUJÍCÍM business_id → INSERT do clients poruší FK na
    //     businesses. Funkce je best-effort: chybu jen zaloguje, NEvyhodí výjimku.
    const ghostBusinessId = crypto.randomUUID();
    await expect(
      upsertClientFromReservation({
        supabase: admin,
        businessId: ghostBusinessId,
        clientName: 'Odolný Klient',
        clientPhone: '+420777333444',
        clientEmail: 'odolny@example.test',
      }),
    ).resolves.toBeUndefined();

    // (3) Žádný klient pro ghost business nevznikl (upsert selhal).
    const { count: ghostClients } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ghostBusinessId);
    expect(ghostClients ?? 0).toBe(0);

    // (4) Klíčové: původní rezervace zůstala v DB beze změny (žádný rollback).
    const { data: stillThere } = await admin
      .from('reservations')
      .select('id,status')
      .eq('id', reservationId as string)
      .single<{ id: string; status: string }>();

    expect(stillThere?.id).toBe(reservationId);
    expect(stillThere?.status).toBe('approved');
  });
});
