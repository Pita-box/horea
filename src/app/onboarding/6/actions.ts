'use server';

import { commitOnboarding } from '@/lib/onboarding/commit';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import type { CommitStepState } from './state';

export async function commitAction(): Promise<CommitStepState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const result = await commitOnboarding(user.id);

  if (result.ok) {
    redirect('/dashboard');
  }

  if (result.error === 'slug_taken') {
    redirect('/onboarding/2?error=slug_taken');
  }

  return {
    message: 'Podnik se nepodařilo vytvořit. Zkontrolujte údaje a zkuste to prosím znovu.',
  };
}
