import 'server-only';

import { getDraft, type OnboardingDraft } from '@/lib/onboarding/draft';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

const STEP_COUNT = 6;

export type OnboardingContext = {
  user: User;
  draft: OnboardingDraft | null;
};

function getAllowedStep(currentStep: number | null | undefined): number {
  if (typeof currentStep !== 'number') {
    return 1;
  }

  return Math.min(currentStep + 1, STEP_COUNT);
}

export async function requireOnboardingStep(step: number): Promise<OnboardingContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const draft = await getDraft(user.id);
  const allowedStep = getAllowedStep(draft?.current_step);

  if (step > allowedStep) {
    redirect(`/onboarding/${allowedStep}`);
  }

  return { user, draft };
}
