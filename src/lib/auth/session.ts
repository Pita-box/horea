import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

type AuthClient = Pick<SupabaseClient, 'auth'>;

export async function logoutCurrent(supabase: AuthClient): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function logoutAllSessions(
  accessToken: string,
  adminClient = createAdminClient(),
): Promise<void> {
  const { error } = await adminClient.auth.admin.signOut(accessToken, 'global');

  if (error) {
    throw error;
  }
}
