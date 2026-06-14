import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type CommitOnboardingResult =
  | { ok: true }
  | { ok: false; error: 'slug_taken' | 'transaction_failed' };

function isSlugTakenError(error: { code?: string; message?: string; details?: string }): boolean {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  return error.code === '23505' || text.includes('slug_taken') || text.includes('businesses_slug');
}

export async function commitOnboarding(userId: string): Promise<CommitOnboardingResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('commit_onboarding', { uid: userId });

  if (!error) {
    return { ok: true };
  }

  if (isSlugTakenError(error)) {
    return { ok: false, error: 'slug_taken' };
  }

  return { ok: false, error: 'transaction_failed' };
}
