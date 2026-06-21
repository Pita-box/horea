'use server';

import { commitOnboarding } from '@/lib/onboarding/commit';
import { createClient } from '@/lib/supabase/server';
import { notifyBusinessCreated } from '@/lib/telegram/notifications';
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
    // Best-effort Telegram notifikace o vzniku podniku (R3.1). Dedup je odvozen
    // z unikátnosti slugu — sem se dostaneme jen po `{ ok: true }` (R6.2).
    // Název podniku není ve `result`, proto ho minimálně dohledáme přes owner_user_id.
    try {
      const { data: business } = await supabase
        .from('businesses')
        .select('name')
        .eq('owner_user_id', user.id)
        .single();

      if (business) {
        await notifyBusinessCreated({ businessName: business.name, createdAt: new Date() });
      }
    } catch {
      // best-effort: notifikace nesmí ovlivnit dokončení onboardingu ani redirect (R5.1)
    }

    redirect('/dashboard'); // redirect je AŽ po try/catch, mimo něj
  }

  if (result.error === 'slug_taken') {
    redirect('/onboarding/2?error=slug_taken');
  }

  return {
    message: 'Podnik se nepodařilo vytvořit. Zkontrolujte údaje a zkuste to prosím znovu.',
  };
}
