'use server';

import { validateHours, WEEK_DAYS, type HoursDraft } from '@/lib/onboarding/data';
import { upsertStep } from '@/lib/onboarding/draft';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import type { HoursStepState } from './state';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function submitHoursAction(formData: FormData): Promise<HoursStepState> {
  const openDays = new Set(
    formData.getAll('openDay').map((value) => (typeof value === 'string' ? value : '')),
  );
  const input: HoursDraft[] = WEEK_DAYS.map(({ dayOfWeek }) => ({
    dayOfWeek,
    isOpen: openDays.has(String(dayOfWeek)),
    opensAt: getString(formData, `opensAt-${dayOfWeek}`),
    closesAt: getString(formData, `closesAt-${dayOfWeek}`),
  }));
  const result = validateHours(input);

  if (!result.ok) {
    return { message: result.message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  try {
    await upsertStep(user.id, 5, 'hours_data', result.data);
  } catch {
    return { message: 'Otevírací dobu se nepodařilo uložit. Zkuste to prosím znovu.' };
  }

  redirect('/onboarding/6');
}
