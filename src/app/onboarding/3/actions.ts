'use server';

import { validateProfile, type ProfileDraft } from '@/lib/onboarding/data';
import { upsertStep } from '@/lib/onboarding/draft';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import type { ProfileStepState } from './state';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function submitProfileAction(formData: FormData): Promise<ProfileStepState> {
  const input: ProfileDraft = {
    name: getString(formData, 'name'),
    description: getString(formData, 'description'),
    phone: getString(formData, 'phone'),
    email: getString(formData, 'email'),
    address: getString(formData, 'address'),
  };
  const result = validateProfile(input);

  if (!result.ok) {
    return {
      message: result.message,
      fieldErrors: result.fieldErrors ?? {},
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  try {
    await upsertStep(user.id, 3, 'profile_data', result.data);
  } catch {
    return {
      message: 'Profil se nepodařilo uložit. Zkuste to prosím znovu.',
      fieldErrors: {},
    };
  }

  redirect('/onboarding/4');
}
