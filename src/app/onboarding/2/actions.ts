'use server';

import { normalizeSlug, type SlugResult } from '@/lib/slug/normalize';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { upsertStep } from '@/lib/onboarding/draft';
import { redirect } from 'next/navigation';

import type { SlugCheckResult, SlugStepState } from './state';

const BASE_URL = 'horea.cz';
const SLUG_CHECK_ERROR = 'Název podniku se nepodařilo ověřit. Zkuste to prosím znovu.';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function getPreviewUrl(slug: string): string {
  return `${BASE_URL}/${slug || 'vas-podnik'}`;
}

function getSlugMessage(result: SlugResult): string {
  if (result.kind === 'reserved') {
    return 'Tento název je vyhrazený, zvolte jiný.';
  }

  if (result.kind === 'invalid_format') {
    switch (result.reason) {
      case 'empty':
        return 'Zadejte název podniku.';
      case 'length':
        return 'Název musí po převodu do adresy mít 3 až 50 znaků.';
      case 'hyphens':
        return 'Adresa stránky nesmí začínat nebo končit pomlčkou ani obsahovat dvě pomlčky za sebou.';
      case 'charset':
        return 'Použijte písmena, číslice, mezery nebo pomlčky.';
    }
  }

  return SLUG_CHECK_ERROR;
}

async function validateSlug(rawSlug: string): Promise<SlugCheckResult> {
  const normalized = normalizeSlug(rawSlug);

  if (normalized.kind !== 'ok') {
    return {
      kind: 'error',
      slug: rawSlug.trim(),
      previewUrl: getPreviewUrl(rawSlug.trim()),
      message: getSlugMessage(normalized),
    };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('businesses')
    .select('id')
    .eq('slug', normalized.value)
    .maybeSingle();

  if (error) {
    return {
      kind: 'error',
      slug: normalized.value,
      previewUrl: getPreviewUrl(normalized.value),
      message: SLUG_CHECK_ERROR,
    };
  }

  if (data) {
    return {
      kind: 'error',
      slug: normalized.value,
      previewUrl: getPreviewUrl(normalized.value),
      message: 'Tento název je již obsazený.',
    };
  }

  return {
    kind: 'ok',
    slug: normalized.value,
    previewUrl: getPreviewUrl(normalized.value),
    message: 'Název je volný.',
  };
}

export async function checkSlugAction(rawSlug: string): Promise<SlugCheckResult> {
  if (!rawSlug.trim()) {
    return {
      kind: 'idle',
      slug: '',
      previewUrl: getPreviewUrl(''),
      message: null,
    };
  }

  return validateSlug(rawSlug);
}

export async function submitSlugAction(formData: FormData): Promise<SlugStepState> {
  const businessName = getString(formData, 'businessName');
  const result = await validateSlug(businessName);

  if (result.kind !== 'ok') {
    return {
      message: result.message ?? SLUG_CHECK_ERROR,
      fieldErrors: {
        businessName: result.message ?? SLUG_CHECK_ERROR,
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
    await upsertStep(user.id, 2, 'slug_data', {
      slug: result.slug,
      businessName: businessName.trim(),
    });
  } catch {
    return {
      message: 'Název podniku se nepodařilo uložit. Zkuste to prosím znovu.',
      fieldErrors: {},
    };
  }

  redirect('/onboarding/3');
}
