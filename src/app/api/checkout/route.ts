import { NextResponse, type NextRequest } from 'next/server';

import { checkout, type CheckoutContext, type CheckoutInput } from '@/lib/checkout/checkout';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { serverLog } from '@/lib/log-server';
import { createGopayClient } from '@/lib/payments/gopay/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Route handler POST `/api/checkout` (R1.1, R1.2, R1.6, R9.5, R9.6).
 *
 * Tenký adaptér mezi HTTP a doménovou logikou ({@link checkout}). Odpovědnost
 * route handleru:
 *
 *  1. **Autentizace + autorizace** — ověří přihlášeného uživatele a vlastnictví
 *     podniku. Bez přihlášení → 401; bez podniku / předplatného → 403/409.
 *     Žádný neautentizovaný přístup k zahájení platby.
 *  2. Sestaví URL návratu/notifikace z originu požadavku.
 *  3. Doménové DB zápisy předá {@link checkout} se **service-role** klientem
 *     (po ověření vlastnictví) — odpovídá konvenci „service-role jen server-side".
 *
 * Vrací JSON: `{ outcome: 'redirect', redirectUrl }` (přesměrování na GoPay
 * provede klient), nebo `{ outcome: 'activated' }` u aktivačních kupónů, nebo
 * `{ error, message }` s českou hláškou při chybě.
 */

const VALID_PLANS: ReadonlySet<string> = new Set(['start', 'pokrocily', 'max']);

type CheckoutRequestBody = {
  plan?: unknown;
  couponCode?: unknown;
};

function resolveOrigin(request: NextRequest): string {
  return (
    request.headers.get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    new URL(request.url).origin
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  // (1) Autentizace — přihlášený uživatel.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'unauthorized', message: 'Přihlaste se prosím.' }, { status: 401 });
  }

  // (2) Autorizace — vlastnictví podniku (RLS + explicitní filtr na owner_user_id).
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (businessError) {
    await serverLog.error('checkout_business_lookup_failed', { userId: user.id });
    return NextResponse.json(
      { error: 'server_error', message: 'Něco se pokazilo. Zkuste to prosím znovu.' },
      { status: 500 },
    );
  }

  if (!business) {
    return NextResponse.json(
      { error: 'forbidden', message: 'K tomuto účtu není přiřazen žádný podnik.' },
      { status: 403 },
    );
  }

  const businessRow = business as { id: string; name: string };

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('business_id', businessRow.id)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    await serverLog.error('checkout_subscription_lookup_failed', { businessId: businessRow.id });
    return NextResponse.json(
      { error: 'server_error', message: 'Předplatné podniku nebylo nalezeno.' },
      { status: 409 },
    );
  }

  // (3) Parsování a validace vstupu.
  let body: CheckoutRequestBody;
  try {
    body = (await request.json()) as CheckoutRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Neplatný požadavek.' },
      { status: 400 },
    );
  }

  if (typeof body.plan !== 'string' || !VALID_PLANS.has(body.plan)) {
    return NextResponse.json(
      { error: 'invalid_plan', message: 'Neplatný tarif předplatného.' },
      { status: 400 },
    );
  }

  const couponCode = typeof body.couponCode === 'string' ? body.couponCode : null;
  const origin = resolveOrigin(request);

  const context: CheckoutContext = {
    businessId: businessRow.id,
    subscriptionId: (subscription as { id: string }).id,
    businessName: businessRow.name,
    payerEmail: user.email ?? undefined,
  };

  const input: CheckoutInput = {
    plan: body.plan as SubscriptionPlan,
    couponCode,
    returnUrl: new URL('/dashboard/subscription', origin).toString(),
    notificationUrl: new URL('/api/webhooks/gopay', origin).toString(),
  };

  // (4) Doménová logika se service-role klientem (po ověření vlastnictví).
  const result = await checkout(createAdminClient(), createGopayClient(), context, input);

  if (!result.ok) {
    const status = result.error === 'coupon_invalid' ? 400 : 502;
    return NextResponse.json({ error: result.error, message: result.message }, { status });
  }

  if (result.outcome === 'activated') {
    return NextResponse.json({ outcome: 'activated', reason: result.reason }, { status: 200 });
  }

  return NextResponse.json(
    { outcome: 'redirect', redirectUrl: result.redirectUrl },
    { status: 200 },
  );
}
