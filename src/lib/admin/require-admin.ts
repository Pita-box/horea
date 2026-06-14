import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Sdílené ověření admin oprávnění pro server actions admin dashboardu (feature
 * `admin-dashboard`, R1.5).
 *
 * Každá citlivá server action MUSÍ před provedením akce ověřit, že požadavek
 * pochází od přihlášeného administrátora (`users.is_admin = true`). Access_Guard
 * middleware chrání vykreslení stránek, ale server actions je nutné chránit
 * **nezávisle** — proto se kontrola provádí i zde.
 *
 * Vrací identitu actora (admin user id z auth kontextu) pro auditní stopu a
 * service-role klienta pro cross-tenant zápis (obchází RLS, výhradně server-side).
 */

/** Výsledek ověření admin oprávnění. */
export type RequireAdminResult =
  | { ok: true; actorUserId: string; admin: SupabaseClient }
  | { ok: false; message: string };

/** Česká hláška při chybějícím admin oprávnění. */
const NOT_AUTHORIZED_MESSAGE = 'Nemáte oprávnění k provedení této akce.';

/**
 * Ověří, že volající je přihlášený administrátor. Při úspěchu vrací actor user id
 * (z auth kontextu) a service-role klienta pro zápis; jinak českou hlášku.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: NOT_AUTHORIZED_MESSAGE };
  }

  // Roli čteme service-role klientem (stejný vzor jako login/actions),
  // nezávisle na RLS a na rozhodnutí middlewaru.
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle<{ is_admin: boolean }>();

  if (profileError || !profile || profile.is_admin !== true) {
    return { ok: false, message: NOT_AUTHORIZED_MESSAGE };
  }

  return { ok: true, actorUserId: user.id, admin };
}
