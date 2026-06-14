/**
 * Integrační test (VOLITELNÝ) — ruční spárování platby vyvolá efekt prodloužení
 * (R8.3), feature `admin-dashboard`, task 19.3.
 *
 * Ověřuje proti reálné DB, že spárování čekající platby přes `matchPayment`
 * (TS wrapper nad RPC `admin_match_payment`, migrace 0039):
 *   1. nastaví `payment.status = paid`,
 *   2. vyvolá efekt definovaný ve `subscription-payments` — přechod předplatného
 *      do `active` a posun `current_period_end` o Jeden_Mesic (2 592 000 s),
 *   3. zapíše auditní záznam `payment_match`.
 *
 * Korektnost samotného výpočtu prodloužení vlastní spec `subscription-payments`;
 * zde ověřujeme jen to, že admin akce efekt skutečně SPUSTÍ.
 *
 * Vyžaduje připojení k testovacímu Supabase se service-role klíčem. Bez
 * nakonfigurovaného prostředí se celý blok přeskočí (`describe.skipIf`).
 *
 * _Requirements: 8.3_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { matchPayment } from '@/lib/admin/payment-matcher';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

const JEDEN_MESIC_SECONDS = 2_592_000;
const INITIAL_PERIOD_END = '2099-01-01T00:00:00.000Z';

describe.skipIf(!hasIntegrationEnv)('Spárování platby → efekt prodloužení (admin_match_payment)', () => {
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
    const adminEmail = `paymatch-admin-${unique}@example.test`;
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

    // Majitel + podnik.
    const ownerEmail = `paymatch-owner-${unique}@example.test`;
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
        slug: `paymatch-${unique}`,
        name: 'Podnik k platbě',
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();
    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }
    businessId = business.id;
    createdBusinessIds.push(businessId);

    // Předplatné v grace_period s pevným koncem období — po spárování se posune.
    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .insert({
        business_id: businessId,
        plan: 'start',
        status: 'grace_period',
        current_period_end: INITIAL_PERIOD_END,
      })
      .select('id')
      .single<{ id: string }>();
    if (subscriptionError || !subscription) {
      throw new Error('Nepodařilo se vytvořit předplatné.');
    }
    subscriptionId = subscription.id;

    // Čekající ruční platba (Cekajici_Platba).
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        business_id: businessId,
        subscription_id: subscriptionId,
        amount_czk: 290,
        variable_symbol: `8${Date.now().toString().slice(-9)}`,
        method: 'qr_manual',
        status: 'pending',
      })
      .select('id')
      .single<{ id: string }>();
    if (paymentError || !payment) {
      throw new Error('Nepodařilo se vytvořit čekající platbu.');
    }
    paymentId = payment.id;
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

  it('matchPayment nastaví paid, aktivuje předplatné a posune období o Jeden_Mesic', async () => {
    const result = await matchPayment(admin, { actorUserId, paymentId });

    expect(result.ok).toBe(true);

    // (1) Platba je paid.
    const { data: payment } = await admin
      .from('payments')
      .select('status')
      .eq('id', paymentId)
      .single<{ status: string }>();
    expect(payment?.status).toBe('paid');

    // (2) Efekt: předplatné je active a období se posunulo o Jeden_Mesic.
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('id', subscriptionId)
      .single<{ status: string; current_period_end: string }>();
    expect(subscription?.status).toBe('active');

    const expectedEnd = new Date(
      new Date(INITIAL_PERIOD_END).getTime() + JEDEN_MESIC_SECONDS * 1000,
    ).getTime();
    expect(new Date(subscription!.current_period_end).getTime()).toBe(expectedEnd);
  });

  it('spárování zanechá auditní záznam payment_match s before/after', async () => {
    const { data, error } = await admin
      .from('audit_log')
      .select('action_type, target_type, target_id, before, after, actor_user_id')
      .eq('target_id', paymentId)
      .eq('action_type', 'payment_match')
      .order('created_at', { ascending: false });

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);

    const record = (data ?? [])[0] as {
      action_type: string;
      target_type: string;
      target_id: string;
      before: { status: string } | null;
      after: { status: string } | null;
      actor_user_id: string | null;
    };
    expect(record.target_type).toBe('payment');
    expect(record.target_id).toBe(paymentId);
    expect(record.actor_user_id).toBe(actorUserId);
    expect(record.before?.status).toBe('pending');
    expect(record.after?.status).toBe('paid');
  });
});
