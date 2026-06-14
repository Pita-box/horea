/**
 * Integrační test (VOLITELNÝ) — čerstvost zdroje dat pro veřejnou stránku
 * (R1.6, R15.2).
 *
 * Bez běžícího Next serveru nelze testovat skutečnou ISR HTTP cache (revalidaci
 * `/[slug]` přes `revalidatePath`) — tu ověřuje E2E / běžící server. Tento test
 * ověřuje vrstvu POD ISR: že ZDROJ DAT, který veřejná stránka při (re)renderu
 * čte, je po zápisu majitele AKTUÁLNÍ a přes anon klíč čitelný jen pro
 * Published_Business.
 *
 * Čteme stejnými dotazy jako `loadPublishedProfile` / `get_public_business_state`
 * v `app/[slug]/page.tsx`: RPC `get_public_business_state` (stav + bezpečná pole)
 * a `from('services')` filtrované přes anon RLS (povoleno jen pro Published_Business).
 *
 * Anon klíč vyžaduje `hasRlsIntegrationEnv`; bez nakonfigurovaného prostředí se
 * blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 1.6, 15.2_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAnonClient,
  getServiceRoleClient,
  hasRlsIntegrationEnv,
} from './supabase-test-client';

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

type BusinessState = {
  id: string;
  slug: string;
  name: string;
  is_published: boolean;
  published: boolean;
};

describe.skipIf(!hasRlsIntegrationEnv)('Čerstvost zdroje dat veřejné stránky', () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let userId: string;
  let businessId: string;
  let slug: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    anon = createAnonClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `fresh-${unique}@example.test`;
    slug = `fresh-${unique}`;

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
        slug,
        name: 'Původní název',
        type: 'kadernik',
        is_published: true,
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }

    businessId = business.id;

    // Aktivní předplatné → Published_Business (anon RLS povolí čtení).
    const { error: subscriptionError } = await admin
      .from('subscriptions')
      .insert({ business_id: businessId, status: 'active' });

    if (subscriptionError) {
      throw new Error('Nepodařilo se vytvořit předplatné.');
    }

    const { error: serviceError } = await admin.from('services').insert({
      business_id: businessId,
      name: 'Původní služba',
      duration_minutes: 30,
      price_czk: 250,
    });

    if (serviceError) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }
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

  it('anon čtení stavu profilu reflektuje úpravu názvu podniku', async () => {
    // Výchozí stav: publikovaný profil s původním názvem.
    const { data: before, error: beforeError } = await anon
      .rpc('get_public_business_state', { p_slug: slug })
      .maybeSingle<BusinessState>();

    expect(beforeError).toBeNull();
    expect(before?.published).toBe(true);
    expect(before?.name).toBe('Původní název');

    // Majitel změní název přes service-role klienta.
    const { error: updateError } = await admin
      .from('businesses')
      .update({ name: 'Nový název' })
      .eq('id', businessId);
    expect(updateError).toBeNull();

    // Následné anon čtení vrací ČERSTVÁ data (žádná stale vrstva na úrovni dat).
    const { data: after, error: afterError } = await anon
      .rpc('get_public_business_state', { p_slug: slug })
      .maybeSingle<BusinessState>();

    expect(afterError).toBeNull();
    expect(after?.name).toBe('Nový název');
  });

  it('anon čtení služeb reflektuje nově vloženou službu', async () => {
    // Výchozí počet služeb viditelných anon klíčem (jen Published_Business).
    const { data: before, error: beforeError } = await anon
      .from('services')
      .select('id,name')
      .eq('business_id', businessId);

    expect(beforeError).toBeNull();
    expect(before ?? []).toHaveLength(1);

    // Majitel přidá novou službu přes service-role klienta.
    const { data: inserted, error: insertError } = await admin
      .from('services')
      .insert({
        business_id: businessId,
        name: 'Nová služba',
        duration_minutes: 45,
        price_czk: 400,
      })
      .select('id')
      .single<{ id: string }>();

    expect(insertError).toBeNull();

    // Následné anon čtení obsahuje novou službu (čerstvý zdroj pro ISR render).
    const { data: after, error: afterError } = await anon
      .from('services')
      .select('id,name')
      .eq('business_id', businessId);

    expect(afterError).toBeNull();
    const ids = (after ?? []).map((row) => row.id);
    expect(ids).toContain(inserted?.id);
    expect(after ?? []).toHaveLength(2);
  });
});
