/**
 * Integrační test (VOLITELNÝ) — úplnost vynuceného smazání podniku proti reálné
 * DB (R6.2, R6.3, Property 7), feature `admin-dashboard`, task 19.4.
 *
 * Ověřuje, že `forceDeleteBusiness` (TS wrapper nad RPC
 * `admin_force_delete_business`, migrace 0038, znovupoužívající
 * `delete_business_tenant_data` z migrace 0030):
 *   1. smaže veškerá tenant data podniku (služby, otevírací doby, rezervace,
 *      klienty) a vyprázdní profil,
 *   2. ZACHOVÁ účetní historii `subscriptions` (status `deleted_data`) a
 *      `payments`,
 *   3. zapíše auditní záznam `force_delete_business`.
 *
 * Vyžaduje připojení k testovacímu Supabase se service-role klíčem. Bez
 * nakonfigurovaného prostředí se celý blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 6.2, 6.3_
 * _Properties: 7_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { forceDeleteBusiness } from '@/lib/admin/force-delete';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

describe.skipIf(!hasIntegrationEnv)('Úplnost vynuceného smazání podniku (admin_force_delete_business)', () => {
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];

  let admin: SupabaseClient;
  let actorUserId: string;
  let businessId: string;
  let subscriptionId: string;
  let paymentId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();

    const unique = crypto.randomUUID().slice(0, 8);

    // Actor (admin) pro FK auditního záznamu.
    const adminEmail = `forcedel-admin-${unique}@example.test`;
    const { data: adminCreated, error: adminError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: 'Integration-Test-Heslo-123',
      email_confirm: true,
    });
    if (adminError || !adminCreated.user) {
      throw new Error('Nepodařilo se vytvořit admina (actor).');
    }
    actorUserId = adminCreated.user.id;
    createdUserIds.push(actorUserId);
    await admin.from('users').insert({ id: actorUserId, email: adminEmail, is_admin: true });

    // Majitel + podnik s bohatým datasetem tenant dat.
    const ownerEmail = `forcedel-owner-${unique}@example.test`;
    const { data: ownerCreated, error: ownerError } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: 'Integration-Test-Heslo-123',
      email_confirm: true,
    });
    if (ownerError || !ownerCreated.user) {
      throw new Error('Nepodařilo se vytvořit majitele.');
    }
    const ownerUserId = ownerCreated.user.id;
    createdUserIds.push(ownerUserId);
    await admin.from('users').insert({ id: ownerUserId, email: ownerEmail });

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: ownerUserId,
        slug: `forcedel-${unique}`,
        name: 'Podnik ke smazání',
        type: 'kadernik',
        is_published: true,
      })
      .select('id')
      .single<{ id: string }>();
    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }
    businessId = business.id;
    createdBusinessIds.push(businessId);

    // Předplatné (historie musí zůstat zachována).
    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .insert({
        business_id: businessId,
        plan: 'start',
        status: 'active',
        current_period_end: '2099-01-01T00:00:00Z',
      })
      .select('id')
      .single<{ id: string }>();
    if (subscriptionError || !subscription) {
      throw new Error('Nepodařilo se vytvořit předplatné.');
    }
    subscriptionId = subscription.id;

    // Platba (historie musí zůstat zachována).
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        business_id: businessId,
        subscription_id: subscriptionId,
        amount_czk: 290,
        variable_symbol: `7${Date.now().toString().slice(-9)}`,
        method: 'qr_manual',
        status: 'paid',
      })
      .select('id')
      .single<{ id: string }>();
    if (paymentError || !payment) {
      throw new Error('Nepodařilo se vytvořit platbu.');
    }
    paymentId = payment.id;

    // Tenant data: služba, otevírací doba, rezervace, klient.
    const { data: service, error: serviceError } = await admin
      .from('services')
      .insert({
        business_id: businessId,
        name: 'Střih',
        duration_minutes: 30,
        price_czk: 250,
      })
      .select('id')
      .single<{ id: string }>();
    if (serviceError || !service) {
      throw new Error('Nepodařilo se vytvořit službu.');
    }

    const { error: hoursError } = await admin.from('opening_hours').insert({
      business_id: businessId,
      day_of_week: 1,
      opens_at: '08:00',
      closes_at: '16:00',
    });
    if (hoursError) {
      throw new Error('Nepodařilo se vytvořit otevírací dobu.');
    }

    const { error: reservationError } = await admin.from('reservations').insert({
      business_id: businessId,
      service_id: service.id,
      client_name: 'Klient',
      client_phone: '+420777000000',
      client_email: 'klient@example.test',
      starts_at: '2099-06-15T08:00:00Z',
      ends_at: '2099-06-15T08:30:00Z',
      status: 'pending',
    });
    if (reservationError) {
      throw new Error('Nepodařilo se vytvořit rezervaci.');
    }

    const { error: clientError } = await admin.from('clients').insert({
      business_id: businessId,
      name: 'Klient',
      phone: '+420777000000',
      email: 'klient@example.test',
    });
    if (clientError) {
      throw new Error('Nepodařilo se vytvořit klienta.');
    }
  });

  afterAll(async () => {
    for (const id of createdBusinessIds) {
      await admin.from('businesses').delete().eq('id', id);
    }
    for (const userId of createdUserIds) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('vynucené smazání odstraní tenant data a zachová historii subscriptions/payments', async () => {
    const result = await forceDeleteBusiness(admin, {
      actorUserId,
      businessId,
      confirmed: true,
    });

    expect(result.ok).toBe(true);

    // (1) Tenant data jsou pryč.
    for (const table of ['services', 'opening_hours', 'reservations', 'clients'] as const) {
      const { count } = await admin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId);
      expect(count).toBe(0);
    }

    // Profil podniku vyprázdněn a skryt.
    const { data: business } = await admin
      .from('businesses')
      .select('name, is_published')
      .eq('id', businessId)
      .single<{ name: string; is_published: boolean }>();
    expect(business?.name).toBe('');
    expect(business?.is_published).toBe(false);

    // (2) Historie zůstává: subscription (deleted_data) + payment beze změny.
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('id, status')
      .eq('id', subscriptionId)
      .single<{ id: string; status: string }>();
    expect(subscription?.id).toBe(subscriptionId);
    expect(subscription?.status).toBe('deleted_data');

    const { data: payment } = await admin
      .from('payments')
      .select('id, status, amount_czk')
      .eq('id', paymentId)
      .single<{ id: string; status: string; amount_czk: number | string }>();
    expect(payment?.id).toBe(paymentId);
    expect(payment?.status).toBe('paid');
  });

  it('vynucené smazání zanechá auditní záznam force_delete_business', async () => {
    const { data, error } = await admin
      .from('audit_log')
      .select('action_type, target_type, target_id, actor_user_id, after')
      .eq('target_id', businessId)
      .eq('action_type', 'force_delete_business')
      .order('created_at', { ascending: false });

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);

    const record = (data ?? [])[0] as {
      action_type: string;
      target_type: string;
      target_id: string;
      actor_user_id: string | null;
      after: { tenant_data_deleted?: boolean } | null;
    };
    expect(record.target_type).toBe('business');
    expect(record.target_id).toBe(businessId);
    expect(record.actor_user_id).toBe(actorUserId);
    expect(record.after?.tenant_data_deleted).toBe(true);
  });
});
