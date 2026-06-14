import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type OnboardingJson =
  | null
  | boolean
  | number
  | string
  | OnboardingJson[]
  | { [key: string]: OnboardingJson };

export type OnboardingDraftDataKey =
  | 'type_data'
  | 'slug_data'
  | 'profile_data'
  | 'services_data'
  | 'hours_data';

export type OnboardingDraft = {
  user_id: string;
  current_step: number;
  type_data: OnboardingJson;
  slug_data: OnboardingJson;
  profile_data: OnboardingJson;
  services_data: OnboardingJson;
  hours_data: OnboardingJson;
  updated_at: string;
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;

function assertCurrentStep(step: number): void {
  if (!Number.isInteger(step) || step < 0 || step > 5) {
    throw new Error('Onboarding draft step must be between 0 and 5.');
  }
}

async function selectDraft(
  supabase: ServerClient,
  userId: string,
): Promise<OnboardingDraft | null> {
  const { data, error } = await supabase
    .from('onboarding_drafts')
    .select(
      'user_id,current_step,type_data,slug_data,profile_data,services_data,hours_data,updated_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as OnboardingDraft | null;
}

export async function getDraft(userId: string): Promise<OnboardingDraft | null> {
  const supabase = await createClient();
  return selectDraft(supabase, userId);
}

export async function upsertStep(
  userId: string,
  step: number,
  dataKey: OnboardingDraftDataKey,
  jsonData: OnboardingJson,
): Promise<void> {
  assertCurrentStep(step);

  const supabase = await createClient();
  const existing = await selectDraft(supabase, userId);
  const currentStep = Math.max(existing?.current_step ?? 0, step);
  const payload: Record<string, OnboardingJson | number | string> = {
    user_id: userId,
    current_step: currentStep,
    [dataKey]: jsonData,
  };

  const { error } = await supabase
    .from('onboarding_drafts')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
}

export async function deleteDraft(userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('onboarding_drafts').delete().eq('user_id', userId);

  if (error) {
    throw error;
  }
}
