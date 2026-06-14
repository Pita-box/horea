/**
 * Integrační test (VOLITELNÝ) — anon RLS izolace `reservations` a `users`
 * (R9.5, R15.3, R15.4).
 *
 * Ověřuje defense-in-depth z migrací 0014 (deny anon na reservations) a 0007
 * (tenant policies na users): anon klíč NESMÍ číst rezervace ani uživatele a
 * NESMÍ do rezervací zapisovat. Zápis rezervací probíhá výhradně server-side přes
 * service-role klíč (R15.4) — což zde pro kontrolu ověříme jako protiklad
 * (service-role tytéž operace zvládne).
 *
 * Anon klíč vyžaduje `hasRlsIntegrationEnv`; bez nakonfigurovaného prostředí se
 * blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 9.5, 15.3, 15.4_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAnonClient,
  getServiceRoleClient,
  hasRlsIntegrationEnv,
} from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

describe.skipIf(!hasRlsIntegrationEnv)('Anon RLS izolace reservations a users', () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let userId: string;
  let businessId: string;
  let serviceId: string;
  let reservationId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    anon = createAnonClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `anonrls-${unique}@example.test`;

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
        slug: `anonrls-${unique}`,
        name: 'Podnik RLS',
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
        name: 'Služba RLS',
        duration_minutes: 30,
        price_czk: 250,
      })
      .select('id')
      .single<{ id: string }>();

    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    serviceId = service.id;

    const { data: reservation, error: reservationError } = await admin
      .from('reservations')
      .insert({
        business_id: businessId,
        service_id: serviceId,
        client_name: 'Tajný klient',
        client_email: 'tajny@example.test',
        starts_at: '2099-06-15T08:00:00Z',
        ends_at: '2099-06-15T09:00:00Z',
        status: 'approved',
      })
      .select('id')
      .single<{ id: string }>();

    if (reservationError || !reservation) {
      throw new Error('Nepodařilo se vytvořit rezervaci.');
    }

    reservationId = reservation.id;
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

  it('anon SELECT na reservations nevrátí žádný řádek', async () => {
    const { data } = await anon.from('reservations').select('id').eq('business_id', businessId);

    // Restriktivní policy (using false) + odebraný grant → žádná rezervace neunikne.
    expect(data ?? []).toHaveLength(0);
  });

  it('anon INSERT do reservations selže', async () => {
    const { error } = await anon.from('reservations').insert({
      business_id: businessId,
      service_id: serviceId,
      client_name: 'Útočník',
      client_email: 'utocnik@example.test',
      starts_at: '2099-06-16T08:00:00Z',
      ends_at: '2099-06-16T09:00:00Z',
      status: 'pending',
    });

    // Zápis pod anon klíčem je zakázán (with check false / chybějící grant).
    expect(error).not.toBeNull();

    // Pojistka přes service-role: žádná rezervace útočníka v DB nevznikla.
    const { count } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('starts_at', '2099-06-16T08:00:00Z');
    expect(count).toBe(0);
  });

  it('anon SELECT na users nevrátí žádný řádek', async () => {
    const { data } = await anon.from('users').select('id').eq('id', userId);

    expect(data ?? []).toHaveLength(0);
  });

  it('service-role tytéž operace zvládne (kontrola, že izolace není rozbitá obecně)', async () => {
    // SELECT rezervací přes service-role obchází RLS a vidí seedovanou rezervaci.
    const { data: reservations, error: reservationsError } = await admin
      .from('reservations')
      .select('id')
      .eq('business_id', businessId);
    expect(reservationsError).toBeNull();
    expect((reservations ?? []).map((row) => row.id)).toContain(reservationId);

    // SELECT uživatele přes service-role vidí seedovaného uživatele.
    const { data: users, error: usersError } = await admin
      .from('users')
      .select('id')
      .eq('id', userId);
    expect(usersError).toBeNull();
    expect((users ?? []).map((row) => row.id)).toContain(userId);

    // INSERT rezervace přes service-role projde; vzápětí ho uklidíme.
    const { data: inserted, error: insertError } = await admin
      .from('reservations')
      .insert({
        business_id: businessId,
        service_id: serviceId,
        client_name: 'Server klient',
        client_email: 'server@example.test',
        starts_at: '2099-06-17T08:00:00Z',
        ends_at: '2099-06-17T09:00:00Z',
        status: 'pending',
      })
      .select('id')
      .single<{ id: string }>();

    expect(insertError).toBeNull();
    expect(inserted?.id).toBeDefined();

    if (inserted?.id) {
      await admin.from('reservations').delete().eq('id', inserted.id);
    }
  });
});
