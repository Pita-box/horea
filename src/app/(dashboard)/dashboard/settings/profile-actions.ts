'use server';

import 'server-only';

import { revalidatePublicPage } from '@/lib/revalidate';
import { serverLog } from '@/lib/log-server';
import { processImageToWebp } from '@/lib/media/process-image';
import { validateProfile, type ProfileDraft } from '@/lib/onboarding/data';
import { r2DeleteObject, r2PublicUrl, r2PutObject } from '@/lib/storage/r2';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';
const BUSINESS_MISSING_ERROR = 'Nejdřív dokončete onboarding podniku.';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (vstup před konverzí)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ProfileImageKind = 'logo' | 'cover';

export type ProfileImages = {
  logoUrl: string | null;
  coverUrl: string | null;
  coverPosition: number;
};

export type SocialKey = 'facebook' | 'instagram' | 'youtube' | 'google';

export type SocialLinks = Record<SocialKey, string | null>;

export type SocialLinksResult = { ok: true; links: SocialLinks } | { ok: false; message: string };

export type SaveResult = { ok: true } | { ok: false; message: string };

export type ProfileImagesResult =
  | { ok: true; images: ProfileImages; businessName: string }
  | { ok: false; message: string };

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

const COLUMN_BY_KIND: Record<ProfileImageKind, 'logo_url' | 'cover_url'> = {
  logo: 'logo_url',
  cover: 'cover_url',
};

const SOCIAL_COLUMN: Record<SocialKey, 'facebook_url' | 'instagram_url' | 'youtube_url' | 'google_url'> = {
  facebook: 'facebook_url',
  instagram: 'instagram_url',
  youtube: 'youtube_url',
  google: 'google_url',
};

const SOCIAL_KEYS: readonly SocialKey[] = ['facebook', 'instagram', 'youtube', 'google'];

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  contact_email: string | null;
  address: string | null;
  logo_url: string | null;
  cover_url: string | null;
  cover_position: number | null;
  facebook_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  google_url: string | null;
};

async function getOwnerBusiness(): Promise<
  { ok: true; business: BusinessRow; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .select(
      'id,slug,name,description,phone,contact_email,address,logo_url,cover_url,cover_position,facebook_url,instagram_url,youtube_url,google_url',
    )
    .eq('owner_user_id', user.id)
    .maybeSingle<BusinessRow>();

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }
  if (!business) {
    return { ok: false, message: BUSINESS_MISSING_ERROR };
  }

  return { ok: true, business, userId: user.id };
}

/** R2 klíč objektu pro dané médium podniku (stabilní → přepis maže původní). */
function mediaKey(businessId: string, kind: ProfileImageKind): string {
  return `${businessId}/${kind}.webp`;
}

export async function getProfileImages(): Promise<ProfileImagesResult> {
  const result = await getOwnerBusiness();
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    businessName: result.business.name,
    images: {
      logoUrl: result.business.logo_url,
      coverUrl: result.business.cover_url,
      coverPosition: result.business.cover_position ?? 50,
    },
  };
}

export async function uploadProfileImageAction(
  kind: ProfileImageKind,
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Vyberte prosím obrázek.' };
  }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return { ok: false, message: 'Povolené formáty jsou JPG, PNG a WebP.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'Maximální velikost obrázku je 5 MB.' };
  }

  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const { business, userId } = owner;
  const key = mediaKey(business.id, kind);

  try {
    // Převod na WebP + zmenšení (avatar ≤512, cover ≤1600).
    const webp = await processImageToWebp(await file.arrayBuffer(), kind);
    // Stabilní klíč → PUT přepíše původní soubor (žádné sirotky).
    await r2PutObject(key, webp, 'image/webp');
  } catch {
    await serverLog.error('profile_image_upload_failed', { businessId: business.id, kind, userId });
    return { ok: false, message: GENERIC_ERROR };
  }

  // Cache-busting přes verzi (URL na CDN je jinak immutable).
  const url = `${r2PublicUrl(key)}?v=${Date.now()}`;

  const { error: updateError } = await createAdminClient()
    .from('businesses')
    .update({ [COLUMN_BY_KIND[kind]]: url })
    .eq('id', business.id);

  if (updateError) {
    await serverLog.error('profile_image_persist_failed', { businessId: business.id, kind, userId });
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(business.slug);
  return { ok: true, url };
}

export async function removeProfileImageAction(kind: ProfileImageKind): Promise<UploadResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const { business } = owner;

  // Úplné odstranění ze systému: objekt z R2 i hodnota v DB.
  try {
    await r2DeleteObject(mediaKey(business.id, kind));
  } catch {
    // Smazání objektu je best-effort; rozhodující je vynulování sloupce.
  }

  const { error } = await createAdminClient()
    .from('businesses')
    .update({ [COLUMN_BY_KIND[kind]]: null })
    .eq('id', business.id);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(business.slug);
  return { ok: true, url: '' };
}

export async function updateCoverPositionAction(position: number): Promise<SaveResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const clamped = Math.max(0, Math.min(100, Math.round(position)));

  const { error } = await createAdminClient()
    .from('businesses')
    .update({ cover_position: clamped })
    .eq('id', owner.business.id);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

export async function getSocialLinks(): Promise<SocialLinksResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return owner;
  }
  const { business } = owner;
  return {
    ok: true,
    links: {
      facebook: business.facebook_url,
      instagram: business.instagram_url,
      youtube: business.youtube_url,
      google: business.google_url,
    },
  };
}

/** Normalizuje odkaz: prázdné → null; jinak vyžaduje http(s):// URL. */
function normalizeUrl(raw: FormDataEntryValue | null): { ok: true; value: string | null } | { ok: false } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') {
    return { ok: true, value: null };
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false };
  }
}

export async function updateSocialLinksAction(formData: FormData): Promise<SaveResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const update: Record<string, string | null> = {};
  for (const key of SOCIAL_KEYS) {
    const normalized = normalizeUrl(formData.get(key));
    if (!normalized.ok) {
      return { ok: false, message: 'Odkazy musí být platné (začínají http:// nebo https://).' };
    }
    update[SOCIAL_COLUMN[key]] = normalized.value;
  }

  const { error } = await createAdminClient()
    .from('businesses')
    .update(update)
    .eq('id', owner.business.id);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}

export type ProfileInfo = {
  name: string;
  description: string;
  phone: string;
  contactEmail: string;
  address: string;
};

export type ProfileInfoResult = { ok: true; info: ProfileInfo } | { ok: false; message: string };

export type SaveProfileInfoResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function getProfileInfo(): Promise<ProfileInfoResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return owner;
  }
  const { business } = owner;
  return {
    ok: true,
    info: {
      name: business.name,
      description: business.description ?? '',
      phone: business.phone ?? '',
      contactEmail: business.contact_email ?? '',
      address: business.address ?? '',
    },
  };
}

/** Úprava „O nás" + kontaktních údajů po onboardingu (sdílí validateProfile). */
export async function updateProfileInfoAction(formData: FormData): Promise<SaveProfileInfoResult> {
  const owner = await getOwnerBusiness();
  if (!owner.ok) {
    return { ok: false, message: owner.message };
  }

  const draft: ProfileDraft = {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    address: String(formData.get('address') ?? ''),
  };

  const validation = validateProfile(draft);
  if (!validation.ok) {
    return { ok: false, message: validation.message, fieldErrors: validation.fieldErrors };
  }

  const { data } = validation;
  const { error } = await createAdminClient()
    .from('businesses')
    .update({
      name: data.name,
      description: data.description,
      phone: data.phone,
      contact_email: data.email,
      address: data.address || null,
    })
    .eq('id', owner.business.id);

  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidatePublicPage(owner.business.slug);
  return { ok: true };
}
