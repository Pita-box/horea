'use server';

import { recordAcceptance } from '@/lib/dpa/manager';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

async function getReturnPath(): Promise<string> {
  const headerStore = await headers();
  const referer = headerStore.get('referer');

  if (!referer) {
    return '/dashboard';
  }

  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return '/dashboard';
  }
}

export async function acceptDpaAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  try {
    await recordAcceptance(user.id);
  } catch (acceptError) {
    await serverLog.error('dpa_acceptance_failed', { error: acceptError, userId: user.id });
    redirect('/error');
  }

  redirect(await getReturnPath());
}
