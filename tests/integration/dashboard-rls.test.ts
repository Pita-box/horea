/**
 * Integrační test (VOLITELNÝ) — RLS izolace dashboardu majitele pro
 * `reservations` a `clients` (R1.4, R1.5).
 *
 * Ověřuje třetí, databázovou vrstvu izolace (defense-in-depth nad aplikačním
 * guardem) z migrace 0018 / 0007: uživatel A přes svůj RLS kontext NEVIDÍ ani
 * NEUPRAVÍ rezervace a klienty uživatele B; pokus o ZÁPIS řádku s cizím
 * `business_id` skončí autorizační chybou (`with check` policy).
 *
 * Vyžaduje připojení k testovacímu Supabase vč. anon klíče (kvůli přihlášení
 * uživatelů). Bez nakonfigurovaného prostředí se celý blok přeskočí
 * (`describe.skipIf`).
 *
 * _Requirements: 1.4, 1.5_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getServiceRoleClient,
  hasRlsIntegrationEnv,
  signInAsUser,
} from './supabase-test-client';

type SeededOwner = {
  userId: string;
  email: string;
  password: string;
  businessId: string;
  serviceId: string;
  reservationId: string;
  clientId: string;
};

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

describe.skipIf(!hasRlsIntegrationEnv)('RLS izolace dashboardu majitele (reservations + clients)', () => {
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];

  // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
  // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let ownerA: SeededOwner;
  let ownerB: SeededOwner;
  let clientA: SupabaseClient;

  async function seedOwner(label: string): Promise<SeededOwner> {
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `dashrls-${label}-${unique}@example.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (createError || !created.user) {
      throw new Error('Nepodařilo se vytvořit testovacího uživatele.');
    }

    const userId = created.user.id;
    createdUserIds.push(userId);

    const { error: usersError } = await admin.from('users').insert({ id: userId, email });
    if (usersError) {
      throw new Error('Nepodařilo se vytvořit profil uživatele.');
    }

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `dashrls-${label}-${unique}`,
        name: `Podnik ${label}`,
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    createdBusinessIds.push(business.id);

    const { data: service, error: serviceError } = await admin
      .from('services')
      .insert({
        business_id: business.id,
        name: `Služba ${label}`,
        duration_minutes: 30,
        price_czk: 250,
      })
      .select('id')
      .single<{ id: string }>();

    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    const { data: reservation, error: reservationError } = await admin
      .from('reservations')
      .insert({
        business_id: business.id,
        service_id: service.id,
        client_name: `Klient ${label}`,
        client_phone: '+420777000000',
        client_email: `klient-${label}@example.test`,
        starts_at: '2099-06-15T08:00:00Z',
        ends_at: '2099-06-15T08:30:00Z',
        status: 'pending',
      })
      .select('id')
      .single<{ id: string }>();

    if (reservationError || !reservation) {
      throw new Error('Nepodařilo se vytvořit rezervaci.');
    }

    const { data: client, error: clientError } = await admin
      .from('clients')
      .insert({
        business_id: business.id,
        name: `Klient ${label}`,
        phone: '+420777000000',
        email: `klient-${label}@example.test`,
      })
      .select('id')
      .single<{ id: string }>();

    if (clientError || !client) {
      throw new Error('Nepodařilo se vytvořit klienta.');
    }

    return {
      userId,
      email,
      password: TEST_PASSWORD,
      businessId: business.id,
      serviceId: service.id,
      reservationId: reservation.id,
      clientId: client.id,
    };
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();
    ownerA = await seedOwner('a');
    ownerB = await seedOwner('b');
    clientA = await signInAsUser(ownerA.email, ownerA.password);
  });

  afterAll(async () => {
    // Smazání podniků kaskádně odstraní služby, rezervace i klienty; pak profily a auth.
    for (const businessId of createdBusinessIds) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    for (const userId of createdUserIds) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('uživatel A přes svůj RLS kontext nevidí rezervaci uživatele B', async () => {
    const { data, error } = await clientA.from('reservations').select('id,business_id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(ownerA.reservationId);
    expect(ids).not.toContain(ownerB.reservationId);

    for (const row of data ?? []) {
      expect(row.business_id).toBe(ownerA.businessId);
    }
  });

  it('uživatel A nevidí klienta uživatele B', async () => {
    const { data, error } = await clientA.from('clients').select('id,business_id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(ownerA.clientId);
    expect(ids).not.toContain(ownerB.clientId);

    for (const row of data ?? []) {
      expect(row.business_id).toBe(ownerA.businessId);
    }
  });

  it('A nemůže přímým dotazem načíst cizí rezervaci ani klienta podle id', async () => {
    const { data: foreignReservation } = await clientA
      .from('reservations')
      .select('id')
      .eq('id', ownerB.reservationId);
    expect(foreignReservation ?? []).toHaveLength(0);

    const { data: foreignClient } = await clientA
      .from('clients')
      .select('id')
      .eq('id', ownerB.clientId);
    expect(foreignClient ?? []).toHaveLength(0);
  });

  it('UPDATE cizí rezervace neovlivní žádný řádek (RLS odmítnutí)', async () => {
    const { data, error } = await clientA
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', ownerB.reservationId)
      .select('id');

    // RLS odfiltruje cizí řádek: žádná chyba, ale ani žádný ovlivněný řádek.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Pojistka přes service-role: rezervace uživatele B zůstala nezměněná.
    const { data: untouched } = await admin
      .from('reservations')
      .select('status')
      .eq('id', ownerB.reservationId)
      .single<{ status: string }>();
    expect(untouched?.status).toBe('pending');
  });

  it('UPDATE cizího klienta neovlivní žádný řádek (RLS odmítnutí)', async () => {
    const { data, error } = await clientA
      .from('clients')
      .update({ name: 'Pokus o přepis' })
      .eq('id', ownerB.clientId)
      .select('id');

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: untouched } = await admin
      .from('clients')
      .select('name')
      .eq('id', ownerB.clientId)
      .single<{ name: string }>();
    expect(untouched?.name).toBe('Klient b');
  });

  it('INSERT rezervace s cizím business_id skončí autorizační chybou (with check)', async () => {
    const { error } = await clientA.from('reservations').insert({
      business_id: ownerB.businessId,
      service_id: ownerB.serviceId,
      client_name: 'Útočník',
      client_email: 'utocnik@example.test',
      starts_at: '2099-07-01T08:00:00Z',
      ends_at: '2099-07-01T08:30:00Z',
      status: 'pending',
    });

    // `with check` policy zakáže zápis řádku s cizím business_id (R1.5).
    expect(error).not.toBeNull();

    // Pojistka: v podniku B žádná taková rezervace nevznikla.
    const { count } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ownerB.businessId)
      .eq('starts_at', '2099-07-01T08:00:00Z');
    expect(count).toBe(0);
  });

  it('INSERT klienta s cizím business_id skončí autorizační chybou (with check)', async () => {
    const { error } = await clientA.from('clients').insert({
      business_id: ownerB.businessId,
      name: 'Cizí klient',
      email: 'cizi@example.test',
    });

    expect(error).not.toBeNull();

    const { count } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ownerB.businessId)
      .eq('email', 'cizi@example.test');
    expect(count).toBe(0);
  });
});
