import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Guard pro veřejné auth stránky (login, register, error): pokud je uživatel
 * přihlášený, přesměruje ho pryč (výchozí `/dashboard`). Dashboard middleware
 * (free-user-guard) případně dál přesměruje do onboardingu, pokud podnik ještě
 * nemá. Nepřihlášený uživatel projde bez efektu.
 */
export async function redirectIfAuthenticated(to = '/dashboard'): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(to);
  }
}
