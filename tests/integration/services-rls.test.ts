/**
 * Integrační test (VOLITELNÝ) — RLS izolace tabulky `services`.
 *
 * Ověřuje multi-tenancy izolaci na úrovni Postgres Row Level Security:
 *  - Uživatel A přes svůj RLS kontext nevidí službu uživatele B.
 *  - Pokus uživatele A upravit cizí službu neovlivní žádný řádek (RLS odmítnutí).
 *
 * Vyžaduje připojení k testovacímu Supabase vč. anon klíče (kvůli přihlášení uživatelů).
 * Bez nakonfigurovaného prostředí se celý blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 11.1, 11.4, 11.5, 11.6_
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
  slug: string;
};

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

describe.skipIf(!hasRlsIntegrationEnv)('RLS izolace služeb', () => {
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];

  // Klienta vytváříme až v beforeAll — tělo describe se při skipu sice vyhodnotí
  // (kvůli sběru testů), ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let ownerA: SeededOwner;
  let ownerB: SeededOwner;
  let clientA: SupabaseClient;

  async function seedOwner(label: string): Promise<SeededOwner> {
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `rls-${label}-${unique}@example.test`;

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
        slug: `rls-${label}-${unique}`,
        name: `Podnik ${label}`,
        type: 'kadernik',
      })
      .select('id,slug')
      .single<{ id: string; slug: string }>();

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

    return {
      userId,
      email,
      password: TEST_PASSWORD,
      businessId: business.id,
      serviceId: service.id,
      slug: business.slug,
    };
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();
    ownerA = await seedOwner('a');
    ownerB = await seedOwner('b');
    clientA = await signInAsUser(ownerA.email, ownerA.password);
  });

  afterAll(async () => {
    // Úklid: smazání podniků kaskádně odstraní služby; pak profily a auth uživatele.
    for (const businessId of createdBusinessIds) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    for (const userId of createdUserIds) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('uživatel A přes svůj RLS kontext nevidí službu uživatele B', async () => {
    const { data, error } = await clientA.from('services').select('id,business_id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(ownerA.serviceId);
    expect(ids).not.toContain(ownerB.serviceId);

    // Pojistka: každý viditelný řádek patří výhradně podniku uživatele A.
    for (const row of data ?? []) {
      expect(row.business_id).toBe(ownerA.businessId);
    }
  });

  it('uživatel A nemůže přímým dotazem načíst cizí službu podle id', async () => {
    const { data, error } = await clientA
      .from('services')
      .select('id')
      .eq('id', ownerB.serviceId);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('UPDATE cizí služby neovlivní žádný řádek (RLS odmítnutí)', async () => {
    const { data, error } = await clientA
      .from('services')
      .update({ name: 'Pokus o přepis' })
      .eq('id', ownerB.serviceId)
      .select('id');

    // RLS odfiltruje cizí řádek: žádná chyba, ale ani žádný ovlivněný řádek.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Ověření přes service-role, že služba uživatele B zůstala nezměněná.
    const { data: untouched } = await admin
      .from('services')
      .select('name')
      .eq('id', ownerB.serviceId)
      .single<{ name: string }>();

    expect(untouched?.name).toBe('Služba b');
  });
});
