/**
 * Integrační test (VOLITELNÝ) — atomicita anonymizace klienta (R16.2, R16.3, R16.4).
 *
 * Ověřuje proti REÁLNÉMU Postgresu, že GDPR výmaz klienta proběhne ATOMICKY
 * v jediné DB transakci uvnitř RPC `anonymize_client` (migrace 0023):
 *  - matchující rezervace (shoda normalizovaného telefonu NEBO case-insensitive
 *    e-mailu) se anonymizují (`client_name = 'Smazaný klient'`, `client_phone` a
 *    `client_email` → NULL) a SOUČASNĚ se smaže řádek klienta (R16.2),
 *  - sloty matchujících rezervací (`service_id`, `starts_at`, `ends_at`, `status`,
 *    `attendance`) zůstávají beze změny (R16.3),
 *  - nematchující rezervace zůstanou nedotčené,
 *  - akce je povolena i při 0 matchujících rezervacích — smaže se jen klient (R16.4).
 *
 * Voláme přímo RPC `anonymize_client` přes service-role klienta (ne TS
 * `anonymizeClient`), protože server action běží pod Next.js cookies kontextem,
 * který v test runneru není; vlastní atomicita žije v DB funkci.
 *
 * Běží čistě přes service-role klienta. Bez nakonfigurovaného testovacího Supabase
 * se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 16.2, 16.3, 16.4_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

const CLIENT_PHONE = '+420777888999';
const CLIENT_EMAIL = 'anon@example.test';

type AnonymizeRpcRow = { anonymized_count: number | null };

function firstRow(data: unknown): AnonymizeRpcRow | undefined {
  return Array.isArray(data) ? data[0] : (data as AnonymizeRpcRow | undefined);
}

describe.skipIf(!hasIntegrationEnv)('Atomicita anonymizace klienta (GDPR)', () => {
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let serviceId: string;

  async function insertClient(name: string, phone: string | null, email: string | null): Promise<string> {
    const { data, error } = await admin
      .from('clients')
      .insert({ business_id: businessId, name, phone, email })
      .select('id')
      .single<{ id: string }>();
    if (error || !data) {
      throw new Error('Nepodařilo se vytvořit klienta.');
    }
    return data.id;
  }

  async function insertReservation(args: {
    name: string;
    phone: string | null;
    email: string | null;
    startsAt: string;
    endsAt: string;
    status?: 'pending' | 'approved';
    attendance?: 'attended' | 'no_show' | null;
  }): Promise<string> {
    const { data, error } = await admin
      .from('reservations')
      .insert({
        business_id: businessId,
        service_id: serviceId,
        client_name: args.name,
        client_phone: args.phone,
        client_email: args.email,
        starts_at: args.startsAt,
        ends_at: args.endsAt,
        status: args.status ?? 'approved',
        attendance: args.attendance ?? null,
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
    const email = `anonatom-${unique}@example.test`;

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
        slug: `anonatom-${unique}`,
        name: 'Podnik anonymizace',
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
        name: 'Služba anonymizace',
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

  it('anonymizuje matchující rezervace, zachová sloty a smaže klienta v jedné transakci', async () => {
    const clientId = await insertClient('Smazatelný Klient', CLIENT_PHONE, CLIENT_EMAIL);

    // Dvě matchující rezervace (telefon i e-mail) + jedna nematchující.
    const matchPhone = await insertReservation({
      name: 'Smazatelný Klient',
      phone: CLIENT_PHONE,
      email: null,
      startsAt: '2099-09-01T08:00:00Z',
      endsAt: '2099-09-01T08:30:00Z',
      status: 'approved',
      attendance: 'attended',
    });
    const matchEmail = await insertReservation({
      name: 'Smazatelný Klient',
      phone: null,
      email: CLIENT_EMAIL.toUpperCase(), // case-insensitive shoda
      startsAt: '2099-09-02T09:00:00Z',
      endsAt: '2099-09-02T09:30:00Z',
      status: 'pending',
    });
    const other = await insertReservation({
      name: 'Jiný Klient',
      phone: '+420000111222',
      email: 'jiny@example.test',
      startsAt: '2099-09-03T10:00:00Z',
      endsAt: '2099-09-03T10:30:00Z',
      status: 'approved',
    });

    const { data, error } = await admin.rpc('anonymize_client', {
      p_business_id: businessId,
      p_client_id: clientId,
    });

    expect(error).toBeNull();
    expect(firstRow(data)?.anonymized_count).toBe(2);

    // Matchující rezervace: PII anonymizováno, slot beze změny (R16.2, R16.3).
    const { data: anonRows } = await admin
      .from('reservations')
      .select('id,client_name,client_phone,client_email,service_id,starts_at,ends_at,status,attendance')
      .in('id', [matchPhone, matchEmail]);

    for (const row of anonRows ?? []) {
      expect(row.client_name).toBe('Smazaný klient');
      expect(row.client_phone).toBeNull();
      expect(row.client_email).toBeNull();
      // Slot zachován.
      expect(row.service_id).toBe(serviceId);
    }
    const phoneRow = (anonRows ?? []).find((row) => row.id === matchPhone);
    expect(phoneRow?.starts_at).toBe('2099-09-01T08:00:00+00:00');
    expect(phoneRow?.status).toBe('approved');
    expect(phoneRow?.attendance).toBe('attended');

    const emailRow = (anonRows ?? []).find((row) => row.id === matchEmail);
    expect(emailRow?.status).toBe('pending');

    // Nematchující rezervace zůstala beze změny.
    const { data: untouched } = await admin
      .from('reservations')
      .select('client_name,client_phone,client_email')
      .eq('id', other)
      .single<{ client_name: string; client_phone: string | null; client_email: string | null }>();
    expect(untouched?.client_name).toBe('Jiný Klient');
    expect(untouched?.client_phone).toBe('+420000111222');

    // Řádek klienta byl smazán (R16.2 c) — atomicky se zápisem výše.
    const { count: clientCount } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('id', clientId);
    expect(clientCount).toBe(0);
  });

  it('povolí anonymizaci klienta s 0 matchujícími rezervacemi (R16.4)', async () => {
    const clientId = await insertClient('Klient Bez Rezervací', '+420999000111', 'bezrez@example.test');

    const { data, error } = await admin.rpc('anonymize_client', {
      p_business_id: businessId,
      p_client_id: clientId,
    });

    expect(error).toBeNull();
    expect(firstRow(data)?.anonymized_count).toBe(0);

    // Klient je přesto smazán.
    const { count } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('id', clientId);
    expect(count).toBe(0);
  });
});
