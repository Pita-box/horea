'use server';

import { validateServices, type ServiceDraft } from '@/lib/onboarding/data';
import { upsertStep } from '@/lib/onboarding/draft';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import type { ServicesStepState } from './state';

function readFormValues(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => (typeof value === 'string' ? value : ''));
}

function parseDuration(value: string): number {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function parsePrice(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export async function submitServicesAction(formData: FormData): Promise<ServicesStepState> {
  const names = readFormValues(formData, 'serviceName');
  const durations = readFormValues(formData, 'serviceDuration');
  const prices = readFormValues(formData, 'servicePrice');
  const rowCount = Math.max(names.length, durations.length, prices.length);
  const input: ServiceDraft[] = Array.from({ length: rowCount }, (_, index) => ({
    name: names[index] ?? '',
    durationMinutes: parseDuration(durations[index] ?? ''),
    priceCzk: parsePrice(prices[index] ?? ''),
  }));
  const result = validateServices(input);

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
    await upsertStep(user.id, 4, 'services_data', result.data);
  } catch {
    return { message: 'Služby se nepodařilo uložit. Zkuste to prosím znovu.' };
  }

  redirect('/onboarding/5');
}
