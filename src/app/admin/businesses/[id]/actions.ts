'use server';

import { revalidatePath } from 'next/cache';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  forceDeleteBusiness,
} from '@/lib/admin/force-delete';
import { grantComp, grantFreeTrial } from '@/lib/admin/grants';
import { resendLatestInvoice } from '@/lib/admin/invoice-resender';
import { requireAdmin } from '@/lib/admin/require-admin';
import {
  overrideSubscription,
  suspendBusiness,
} from '@/lib/admin/subscription-override';
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/admin/business-manager';

/**
 * Server actions admin akcí v detailu podniku `/admin/businesses/[id]` (feature
 * `admin-dashboard`, Requirement 5/6/11, task 17.1).
 *
 * Každá akce nejprve ověří přihlášeného administrátora ({@link requireAdmin},
 * R1.5) — bez admin oprávnění se mutace neprovede — a teprve poté volá příslušnou
 * lib funkci (override / free trial / comp / pozastavení / vynucené smazání /
 * opětovné odeslání faktury) se service-role klientem a actorem (admin user id z
 * auth kontextu). Atomicita „akce + auditní záznam" i validace žijí v lib / DB
 * vrstvě; tato vrstva pouze parsuje vstup, překládá výsledek na českou hlášku a
 * revaliduje detail podniku.
 *
 * Akce nad předplatným (override, free trial, comp) potřebují `subscriptionId`;
 * ten se zde **resolvuje server-side** z `businessId`, aby stránka zůstala tenká
 * a nemusela ho protahovat skrze read-only detail.
 */

/** Výsledek akce pro client komponentu. */
export type BusinessActionResult = { ok: true } | { ok: false; message: string };

/** Formulářový (řetězcový) vstup pro override předplatného (R5.1, R5.2). */
export type OverrideFormInput = {
  /** Cílový tarif; prázdné = bez tarifu (free). */
  plan: '' | SubscriptionPlan;
  /** Cílový stav předplatného. */
  status: SubscriptionStatus;
  /** Cílový konec období (`YYYY-MM-DD`); prázdné = bez období. */
  currentPeriodEnd: string;
};

const NO_SUBSCRIPTION_MESSAGE = 'Podnik nemá předplatné, akci nelze provést.';
const NOT_FOUND_MESSAGE = 'Předplatné nebylo nalezeno.';
const OVERRIDE_FAILED_MESSAGE = 'Úpravu předplatného se nepodařilo provést.';
const GRANT_FAILED_MESSAGE = 'Akci se nepodařilo dokončit, žádná změna nebyla provedena.';
const SUSPEND_FAILED_MESSAGE = 'Pozastavení podniku se nepodařilo provést.';
const BUSINESS_NOT_FOUND_MESSAGE = 'Podnik nebyl nalezen.';
const FORCE_DELETE_FAILED_MESSAGE = 'Smazání podniku se nepodařilo provést.';

/** Najde předplatné podniku; vrací jeho id nebo `null`, pokud podnik žádné nemá. */
async function resolveSubscriptionId(
  admin: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

/** Override předplatného — nastaví `plan`, `status` a `current_period_end` (R5.1, R5.2). */
export async function overrideSubscriptionAction(
  businessId: string,
  form: OverrideFormInput,
): Promise<BusinessActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const subscriptionId = await resolveSubscriptionId(auth.admin, businessId);
  if (!subscriptionId) {
    return { ok: false, message: NO_SUBSCRIPTION_MESSAGE };
  }

  const result = await overrideSubscription(auth.admin, {
    actorUserId: auth.actorUserId,
    subscriptionId,
    plan: form.plan === '' ? null : form.plan,
    status: form.status,
    currentPeriodEnd: form.currentPeriodEnd.trim() === '' ? null : form.currentPeriodEnd,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error === 'not_found' ? NOT_FOUND_MESSAGE : OVERRIDE_FAILED_MESSAGE,
    };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

/** Udělení Free_Trial — `active` + publikace + konec zkušebního období (R5.3). */
export async function grantFreeTrialAction(
  businessId: string,
  trialEnd: string,
): Promise<BusinessActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  if (trialEnd.trim() === '') {
    return { ok: false, message: 'Zadejte konec zkušebního období.' };
  }

  const subscriptionId = await resolveSubscriptionId(auth.admin, businessId);
  if (!subscriptionId) {
    return { ok: false, message: NO_SUBSCRIPTION_MESSAGE };
  }

  const result = await grantFreeTrial(auth.admin, {
    actorUserId: auth.actorUserId,
    subscriptionId,
    trialEnd,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error === 'not_found' ? NOT_FOUND_MESSAGE : GRANT_FAILED_MESSAGE,
    };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

/** Udělení Comp_Ucet — trvale `active` + publikace, bez platby (R5.4). */
export async function grantCompAction(businessId: string): Promise<BusinessActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const subscriptionId = await resolveSubscriptionId(auth.admin, businessId);
  if (!subscriptionId) {
    return { ok: false, message: NO_SUBSCRIPTION_MESSAGE };
  }

  const result = await grantComp(auth.admin, {
    actorUserId: auth.actorUserId,
    subscriptionId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error === 'not_found' ? NOT_FOUND_MESSAGE : GRANT_FAILED_MESSAGE,
    };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

/** Pozastavení podniku — `business.is_published = false` (R5.5). */
export async function suspendBusinessAction(businessId: string): Promise<BusinessActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await suspendBusiness(auth.admin, {
    actorUserId: auth.actorUserId,
    businessId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error === 'not_found' ? BUSINESS_NOT_FOUND_MESSAGE : SUSPEND_FAILED_MESSAGE,
    };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

/**
 * Vynucené smazání podniku (R6.1) — `confirmed: true` se předává teprve po
 * explicitním potvrzení v dialogu (client komponenta); server-side guard v lib
 * funkci brání nechtěnému nevratnému smazání i mimo UI.
 */
export async function forceDeleteBusinessAction(
  businessId: string,
): Promise<BusinessActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await forceDeleteBusiness(auth.admin, {
    actorUserId: auth.actorUserId,
    businessId,
    confirmed: true,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error === 'not_found' ? BUSINESS_NOT_FOUND_MESSAGE : FORCE_DELETE_FAILED_MESSAGE,
    };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true };
}

/** Opětovné odeslání poslední faktury na e-mail vlastníka (R11.1). */
export async function resendInvoiceAction(businessId: string): Promise<BusinessActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const result = await resendLatestInvoice(auth.admin, businessId);
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return { ok: true };
}
