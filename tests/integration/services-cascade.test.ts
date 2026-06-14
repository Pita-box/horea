/**
 * Integrační test (VOLITELNÝ) — kaskádové smazání služby.
 *
 * Ověřuje, že FK `reservations.service_id` má `ON DELETE CASCADE` (migrace 0004):
 * po smazání služby zmizí z DB jak služba, tak všechny rezervace, které na ni odkazovaly.
 *
 * Běží čistě přes service-role klienta (RLS zde nezkoumáme). Bez nakonfigurovaného
 * testovacího Supabase se blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 3.4, 3.6_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const RESERVATION_COUNT = 3;

describe.skipIf(!hasIntegrationEnv)('Kaskádové smazání služby', () => {
  // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
  // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let userId: string;
  let businessId: string;
  let serviceId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `cascade-${unique}@example.test`;

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
        slug: `cascade-${unique}`,
        name: 'Podnik kaskáda',
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
        name: 'Mazaná služba',
        duration_minutes: 60,
        price_czk: 500,
      })
      .select('id')
      .single<{ id: string }>();

    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    serviceId = service.id;

    // N rezervací odkazujících na danou službu.
    const reservations = Array.from({ length: RESERVATION_COUNT }, (_, index) => {
      const startHour = 9 + index;
      return {
        business_id: businessId,
        service_id: serviceId,
        client_name: `Klient ${index + 1}`,
        client_email: `klient-${index + 1}@example.test`,
        starts_at: `2025-01-06T${String(startHour).padStart(2, '0')}:00:00Z`,
        ends_at: `2025-01-06T${String(startHour + 1).padStart(2, '0')}:00:00Z`,
        status: 'approved' as const,
      };
    });

    const { error: reservationsError } = await admin.from('reservations').insert(reservations);
    if (reservationsError) {
      throw new Error('Nepodařilo se vytvořit rezervace.');
    }
  });

  afterAll(async () => {
    // Idempotentní úklid pro případ, že by samotný test neproběhl celý.
    if (businessId) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    if (userId) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('před smazáním existuje služba i její rezervace', async () => {
    const { count } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId);

    expect(count).toBe(RESERVATION_COUNT);
  });

  it('smazání služby kaskádně odstraní službu i všechny její rezervace', async () => {
    const { error: deleteError } = await admin.from('services').delete().eq('id', serviceId);
    expect(deleteError).toBeNull();

    const { data: services } = await admin.from('services').select('id').eq('id', serviceId);
    expect(services ?? []).toHaveLength(0);

    const { count: reservationCount } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId);
    expect(reservationCount).toBe(0);
  });
});
