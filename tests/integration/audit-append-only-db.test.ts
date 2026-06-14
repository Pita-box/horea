/**
 * Integrační test (VOLITELNÝ) — append-only auditní stopa na úrovni databáze
 * (R9.5, Property 3), feature `admin-dashboard`, task 19.2.
 *
 * Ověřuje, že granty z migrace 0034 drží i pro service role (která RLS obchází):
 * `INSERT` a `SELECT` nad `public.audit_log` fungují, ale `UPDATE` a `DELETE` jsou
 * odmítnuty i service-role klientem (table-level REVOKE). Jednou zapsaný auditní
 * záznam tedy nelze žádnou aplikační cestou změnit ani odstranit.
 *
 * Vyžaduje připojení k testovacímu Supabase se service-role klíčem. Bez
 * nakonfigurovaného prostředí se celý blok přeskočí (`describe.skipIf`).
 *
 * Pozn.: testem vytvořené auditní záznamy nelze uklidit (`DELETE` je zakázán —
 * to je právě testovaná vlastnost); v testovací DB tedy zůstanou. Je to záměrné.
 *
 * _Requirements: 9.5_
 * _Properties: 3_
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getServiceRoleClient, hasIntegrationEnv } from './supabase-test-client';

describe.skipIf(!hasIntegrationEnv)('Append-only audit_log na úrovni DB (i pro service role)', () => {
  const createdUserIds: string[] = [];

  let admin: SupabaseClient;
  let actorUserId: string;
  let insertedId: string;

  beforeAll(async () => {
    admin = getServiceRoleClient();

    const unique = crypto.randomUUID().slice(0, 8);
    const email = `auditappend-${unique}@example.test`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: 'Integration-Test-Heslo-123',
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw new Error('Nepodařilo se vytvořit testovacího uživatele (actor).');
    }
    actorUserId = created.user.id;
    createdUserIds.push(actorUserId);

    const { error: usersError } = await admin
      .from('users')
      .insert({ id: actorUserId, email, is_admin: true });
    if (usersError) {
      throw new Error('Nepodařilo se vytvořit profil admina (actor).');
    }
  });

  afterAll(async () => {
    // audit_log řádky nelze smazat (append-only) — odstraníme jen uživatele;
    // FK actor_user_id má on delete set null, takže záznam zůstane bez actora.
    for (const userId of createdUserIds) {
      await admin.from('users').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('INSERT nového auditního záznamu service rolí funguje', async () => {
    const { data, error } = await admin
      .from('audit_log')
      .insert({
        actor_user_id: actorUserId,
        action_type: 'subscription_override',
        target_type: 'subscription',
        target_id: null,
        before: { status: 'free' },
        after: { status: 'active' },
      })
      .select('id')
      .single<{ id: string }>();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    insertedId = data!.id;
  });

  it('SELECT vloženého záznamu service rolí funguje', async () => {
    const { data, error } = await admin
      .from('audit_log')
      .select('id, action_type, after')
      .eq('id', insertedId)
      .single<{ id: string; action_type: string; after: { status: string } | null }>();

    expect(error).toBeNull();
    expect(data?.id).toBe(insertedId);
    expect(data?.action_type).toBe('subscription_override');
    expect(data?.after?.status).toBe('active');
  });

  it('UPDATE existujícího auditního záznamu je odmítnut i service rolí', async () => {
    const { error } = await admin
      .from('audit_log')
      .update({ action_type: 'tampered' })
      .eq('id', insertedId);

    // Table-level REVOKE UPDATE (migrace 0034) → permission denied i pro service role.
    expect(error).not.toBeNull();

    // Pojistka: záznam zůstal nezměněn.
    const { data: untouched } = await admin
      .from('audit_log')
      .select('action_type')
      .eq('id', insertedId)
      .single<{ action_type: string }>();
    expect(untouched?.action_type).toBe('subscription_override');
  });

  it('DELETE existujícího auditního záznamu je odmítnut i service rolí', async () => {
    const { error } = await admin.from('audit_log').delete().eq('id', insertedId);

    // Table-level REVOKE DELETE (migrace 0034) → permission denied i pro service role.
    expect(error).not.toBeNull();

    // Pojistka: záznam stále existuje.
    const { data: stillThere } = await admin
      .from('audit_log')
      .select('id')
      .eq('id', insertedId)
      .single<{ id: string }>();
    expect(stillThere?.id).toBe(insertedId);
  });
});
