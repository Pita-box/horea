'use server';

import { isBusinessType } from '@/lib/onboarding/business-types';
import { upsertStep } from '@/lib/onboarding/draft';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import type { TypeStepState } from './state';

const TYPE_REQUIRED_MESSAGE = 'Vyberte typ podniku.';
const SAVE_ERROR_MESSAGE = 'Typ podniku se nepodařilo uložit. Zkuste to prosím znovu.';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function submitTypeAction(formData: FormData): Promise<TypeStepState> {
  const type = getString(formData, 'type');

  if (!isBusinessType(type)) {
    return {
      message: TYPE_REQUIRED_MESSAGE,
      fieldErrors: {
        type: TYPE_REQUIRED_MESSAGE,
      },
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
    await upsertStep(user.id, 1, 'type_data', { type });
  } catch {
    return {
      message: SAVE_ERROR_MESSAGE,
      fieldErrors: {},
    };
  }

  redirect('/onboarding/2');
}
