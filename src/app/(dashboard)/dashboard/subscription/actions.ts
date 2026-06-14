'use server';

import { revalidatePath } from 'next/cache';

import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { validateCouponByCode } from '@/lib/coupons/validate';
import { serverLog } from '@/lib/log-server';
import { cancelAutoRenew, enableAutoRenew } from '@/lib/subscription/auto-renew';
import { cancelPlanChange, requestPlanChange } from '@/lib/subscription/plan-change';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server actions stránky `/dashboard/subscription` (R8.1, R8.4, R11.1, R11.4, R9.1).
 *
 * Tenké wrappery nad doménovými funkcemi `plan-change` a `auto-renew` a nad
 * validací kupónu. Každá akce nejprve ověří **přihlášení + vlastnictví podniku**
 * (přes uživatelský klient pod RLS s explicitním filtrem `owner_user_id`),
 * teprve poté předá doménové funkci **service-role** klienta — odpovídá konvenci
 * „service-role jen server-side po ověření vlastnictví" (viz checkout route).
 *
 * Výběr tarifu / checkout a aplikaci kupónu při platbě řeší POST `/api/checkout`
 * (klient stránky na něj postuje); zde je pouze samostatná *validace* kupónu pro
 * okamžitou zpětnou vazbu s českou hláškou (R9.1, R9.2).
 */

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';
const AUTH_ERROR = 'Přihlaste se prosím znovu.';
const BUSINESS_MISSING_ERROR = 'Nejdřív dokončete onboarding podniku.';
const SUBSCRIPTION_MISSING_ERROR = 'Předplatné podniku nebylo nalezeno.';
const NOT_ACTIVE_ERROR = 'Tuto akci lze provést jen u aktivního předplatného.';
const COUPON_EMPTY_ERROR = 'Zadejte prosím kód kupónu.';

const SUBSCRIPTION_PATH = '/dashboard/subscription';

export type SubscriptionActionResult = { ok: true } | { ok: false; message: string };

export type CouponCheckResult = { ok: true; message: string } | { ok: false; message: string };

type SubscriptionContext = {
  subscriptionId: string;
  admin: SupabaseClient;
};

type LibResult = { ok: true } | { ok: false; error: 'not_active' | 'write_failed' };

async function logSubscriptionAction(
  message: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await serverLog.error(message, context);
  } catch {
    // Logging is best-effort and must not block the main operation.
  }
}

/**
 * Ověří přihlášení + vlastnictví podniku a vrátí kontext pro doménovou operaci.
 *
 * Podnik se dohledá pod uživatelským kontextem (RLS) s explicitním filtrem na
 * `owner_user_id`, takže žádný cizí ani neautentizovaný podnik není dosažitelný.
 * Předplatné se najde podle `business_id`. Doménové zápisy se provádějí
 * service-role klientem (po tomto ověření).
 */
async function getSubscriptionContext(): Promise<
  { ok: true; context: SubscriptionContext } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: AUTH_ERROR };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError) {
    await logSubscriptionAction('subscription_business_lookup_failed', { userId: user.id });
    return { ok: false, message: GENERIC_ERROR };
  }

  if (!business) {
    return { ok: false, message: BUSINESS_MISSING_ERROR };
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('business_id', business.id)
    .maybeSingle<{ id: string }>();

  if (subscriptionError) {
    await logSubscriptionAction('subscription_lookup_failed', { businessId: business.id });
    return { ok: false, message: GENERIC_ERROR };
  }

  if (!subscription) {
    return { ok: false, message: SUBSCRIPTION_MISSING_ERROR };
  }

  return {
    ok: true,
    context: { subscriptionId: subscription.id, admin: createAdminClient() },
  };
}

function mapLibResult(result: LibResult): SubscriptionActionResult {
  if (result.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    message: result.error === 'not_active' ? NOT_ACTIVE_ERROR : GENERIC_ERROR,
  };
}

/**
 * Zruší automatickou obnovu předplatného (R11.1).
 */
export async function cancelAutoRenewAction(): Promise<SubscriptionActionResult> {
  const ctx = await getSubscriptionContext();
  if (!ctx.ok) {
    return ctx;
  }

  const result = await cancelAutoRenew(ctx.context.admin, ctx.context.subscriptionId);
  if (result.ok) {
    revalidatePath(SUBSCRIPTION_PATH);
  }

  return mapLibResult(result);
}

/**
 * Znovu zapne automatickou obnovu předplatného (R11.4).
 */
export async function enableAutoRenewAction(): Promise<SubscriptionActionResult> {
  const ctx = await getSubscriptionContext();
  if (!ctx.ok) {
    return ctx;
  }

  const result = await enableAutoRenew(ctx.context.admin, ctx.context.subscriptionId);
  if (result.ok) {
    revalidatePath(SUBSCRIPTION_PATH);
  }

  return mapLibResult(result);
}

/**
 * Zaznamená žádost o změnu tarifu jako nevyřízenou změnu (R8.1, R8.3).
 */
export async function requestPlanChangeAction(
  targetPlan: SubscriptionPlan,
): Promise<SubscriptionActionResult> {
  const ctx = await getSubscriptionContext();
  if (!ctx.ok) {
    return ctx;
  }

  const result = await requestPlanChange(ctx.context.admin, ctx.context.subscriptionId, targetPlan);
  if (result.ok) {
    revalidatePath(SUBSCRIPTION_PATH);
  }

  return mapLibResult(result);
}

/**
 * Zruší nevyřízenou změnu tarifu před koncem období (R8.4).
 */
export async function cancelPlanChangeAction(): Promise<SubscriptionActionResult> {
  const ctx = await getSubscriptionContext();
  if (!ctx.ok) {
    return ctx;
  }

  const result = await cancelPlanChange(ctx.context.admin, ctx.context.subscriptionId);
  if (result.ok) {
    revalidatePath(SUBSCRIPTION_PATH);
  }

  return mapLibResult(result);
}

/**
 * Ověří platnost kódu kupónu pro okamžitou zpětnou vazbu (R9.1, R9.2).
 *
 * Samotná aplikace kupónu (sleva / aktivace) proběhne až při checkoutu na
 * `/api/checkout`. Zde se kupón pouze validuje (existence, platnost, počet
 * použití) a vrací se česká hláška.
 */
export async function validateCouponAction(code: string): Promise<CouponCheckResult> {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: COUPON_EMPTY_ERROR };
  }

  const ctx = await getSubscriptionContext();
  if (!ctx.ok) {
    return { ok: false, message: ctx.message };
  }

  const validation = await validateCouponByCode(ctx.context.admin, trimmed, new Date());
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  return { ok: true, message: 'Kupón je platný a uplatní se při platbě.' };
}
