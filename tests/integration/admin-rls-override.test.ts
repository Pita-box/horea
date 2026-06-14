/**
 * Integrační test (VOLITELNÝ) — RLS admin override pro tenant-scoped data napříč
 * podniky (R1.4, R1.5), feature `admin-dashboard`, task 19.1.
 *
 * Ověřuje databázovou vrstvu privilegovaného přístupu: přihlášený administrátor
 * (`users.is_admin = true`) ČTE přes svůj RLS kontext řádky VÍCE podniků v
 * tabulkách `businesses`, `subscriptions` a `payments` (admin override z migrací
 * 0007/0033), zatímco běžný majitel (ne-admin) cizí řádky NEVIDÍ — vidí pouze
 * data svého podniku.
 *
 * Cross-tenant ZÁPISY (R1.5) běží výhradně server-side přes service role, který
 * RLS obchází; na úrovni policy se proto neřeší a zde se netestují (pokryto jinde).
 *
 * Vyžaduje připojení k testovacímu Supabase vč. anon klíče (kvůli přihlášení
 * uživatelů a získání jejich RLS kontextu). Bez nakonfigurovaného prostředí se
 * celý blok přeskočí (`describe.skipIf`).
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

type SeededTenant = {
  userId: string;
  email: string;
  password: string;
  businessId: string;
  subscriptionId: string;
  paymentId: string;
};

const TEST_PASSWORD = 'Integration-Test-Heslo-123';

describe.skipIf(!hasRlsIntegrationEnv)('RLS admin override napříč podniky (businesses + subscriptions + payments)', () => {
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];

  // Klienta vytváříme až v beforeAll — tělo describe se při skipu vyhodnotí kvůli
  // sběru testů, ale getServiceRoleClient by bez env vyhodil výjimku.
  let admin: SupabaseClient;
  let tenantA: SeededTenant;
  let tenantB: SeededTenant;
  let adminUserId: string;
  let adminEmail: string;
  let adminClient: SupabaseClient;
  let ownerAClient: SupabaseClient;

  /** Seeduje uživatele s profilem; volitelně admin (`is_admin = true`). */
  async function seedUser(label: string, isAdmin: boolean): Promise<string> {
    const unique = crypto.randomUUID().slice(0, 8);
    const email = `adminrls-${label}-${unique}@example.test`;

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

    const { error: usersError } = await admin
      .from('users')
      .insert({ id: userId, email, is_admin: isAdmin });
    if (usersError) {
      throw new Error('Nepodařilo se vytvořit profil uživatele.');
    }

    return userId;
  }

  /** Seeduje běžného majitele s podnikem, předplatným a jednou platbou. */
  async function seedTenant(label: string): Promise<SeededTenant> {
    const userId = await seedUser(label, false);
    const unique = crypto.randomUUID().slice(0, 8);

    const { data: business, error: businessError } = await admin
      .from('businesses')
      .insert({
        owner_user_id: userId,
        slug: `adminrls-${label}-${unique}`,
        name: `Podnik ${label}`,
        type: 'kadernik',
      })
      .select('id')
      .single<{ id: string }>();

    if (businessError || !business) {
      throw new Error('Nepodařilo se vytvořit podnik.');
    }
    createdBusinessIds.push(business.id);

    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .insert({
        business_id: business.id,
        plan: 'start',
        status: 'active',
        current_period_end: '2099-01-01T00:00:00Z',
      })
      .select('id')
      .single<{ id: string }>();

    if (subscriptionError || !subscription) {
      throw new Error('Nepodařilo se vytvořit předplatné.');
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        business_id: business.id,
        subscription_id: subscription.id,
        amount_czk: 290,
        variable_symbol: `9${Date.now().toString().slice(-8)}${label === 'a' ? '1' : '2'}`,
        method: 'qr_manual',
        status: 'paid',
      })
      .select('id')
      .single<{ id: string }>();

    if (paymentError || !payment) {
      throw new Error('Nepodařilo se vytvořit platbu.');
    }

    return {
      userId,
      email: `seeded-${label}`,
      password: TEST_PASSWORD,
      businessId: business.id,
      subscriptionId: subscription.id,
      paymentId: payment.id,
    };
  }

  beforeAll(async () => {
    admin = getServiceRoleClient();

    tenantA = await seedTenant('a');
    tenantB = await seedTenant('b');

    // Skutečný e-mail majitele A pro přihlášení odvodíme z profilu (seedUser ho
    // generuje s náhodnou částí); načteme ho přes service role.
    const { data: ownerARow } = await admin
      .from('users')
      .select('email')
      .eq('id', tenantA.userId)
      .single<{ email: string }>();
    if (!ownerARow) {
      throw new Error('Profil majitele A nenalezen.');
    }

    adminUserId = await seedUser('admin', true);
    const { data: adminRow } = await admin
      .from('users')
      .select('email')
      .eq('id', adminUserId)
      .single<{ email: string }>();
    if (!adminRow) {
      throw new Error('Profil admina nenalezen.');
    }
    adminEmail = adminRow.email;

    adminClient = await signInAsUser(adminEmail, TEST_PASSWORD);
    ownerAClient = await signInAsUser(ownerARow.email, TEST_PASSWORD);
  });

  afterAll(async () => {
    for (const businessId of createdBusinessIds) {
      await admin.from('businesses').delete().eq('id', businessId);
    }
    for (const userId of createdUserIds) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('admin přes RLS override čte podniky více majitelů (A i B)', async () => {
    const { data, error } = await adminClient.from('businesses').select('id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(tenantA.businessId);
    expect(ids).toContain(tenantB.businessId);
  });

  it('admin přes RLS override čte předplatná více podniků', async () => {
    const { data, error } = await adminClient.from('subscriptions').select('id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(tenantA.subscriptionId);
    expect(ids).toContain(tenantB.subscriptionId);
  });

  it('admin přes RLS override čte platby více podniků', async () => {
    const { data, error } = await adminClient.from('payments').select('id');

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(tenantA.paymentId);
    expect(ids).toContain(tenantB.paymentId);
  });

  it('běžný majitel (ne-admin) nevidí podnik, předplatné ani platbu cizího podniku', async () => {
    const { data: businesses, error: bizError } = await ownerAClient
      .from('businesses')
      .select('id');
    expect(bizError).toBeNull();
    const bizIds = (businesses ?? []).map((row) => row.id);
    expect(bizIds).toContain(tenantA.businessId);
    expect(bizIds).not.toContain(tenantB.businessId);

    const { data: subscriptions, error: subError } = await ownerAClient
      .from('subscriptions')
      .select('id');
    expect(subError).toBeNull();
    const subIds = (subscriptions ?? []).map((row) => row.id);
    expect(subIds).toContain(tenantA.subscriptionId);
    expect(subIds).not.toContain(tenantB.subscriptionId);

    const { data: payments, error: payError } = await ownerAClient
      .from('payments')
      .select('id');
    expect(payError).toBeNull();
    const payIds = (payments ?? []).map((row) => row.id);
    expect(payIds).toContain(tenantA.paymentId);
    expect(payIds).not.toContain(tenantB.paymentId);
  });

  it('běžný majitel nenačte cizí řádky ani přímým dotazem podle id', async () => {
    const { data: foreignBiz } = await ownerAClient
      .from('businesses')
      .select('id')
      .eq('id', tenantB.businessId);
    expect(foreignBiz ?? []).toHaveLength(0);

    const { data: foreignSub } = await ownerAClient
      .from('subscriptions')
      .select('id')
      .eq('id', tenantB.subscriptionId);
    expect(foreignSub ?? []).toHaveLength(0);

    const { data: foreignPay } = await ownerAClient
      .from('payments')
      .select('id')
      .eq('id', tenantB.paymentId);
    expect(foreignPay ?? []).toHaveLength(0);
  });
});
