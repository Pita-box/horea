import { NextResponse, type NextRequest } from 'next/server';

import { chargeMonthly } from '@/lib/billing/charge';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { notifyAdminCronFailure } from '@/lib/cron/admin-notify';
import { verifyCronAuthorization } from '@/lib/cron/auth';
import { serverLog } from '@/lib/log-server';
import { createGopayClient } from '@/lib/payments/gopay/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { transitionToGracePeriod } from '@/lib/subscription/transitions';

/**
 * Billing_Cron — denní strhávání splatných předplatných `/api/cron/billing`
 * (R10.1, R10.2, R10.3).
 *
 * Tenký adaptér mezi Vercel Cron triggerem a doménovou logikou. Postup
 * (design.md, sekce *Billing_Cron* a *Sekvence 2/3*):
 *
 *  1. **Ochrana cron secret** ({@link verifyCronAuthorization}, R10.6): bez
 *     správného `Authorization: Bearer <CRON_SECRET>` → 401, žádná akce.
 *  2. Načte splatná předplatná: `status = active`, `auto_renew = true` a
 *     dosažený `current_period_end` (R10.1).
 *  3. Pro každé iniciuje měsíční strhnutí přes {@link chargeMonthly}.
 *     **Continue-on-error** (R10.3, R10.6): selhání jednoho podniku se zaloguje,
 *     notifikuje adminovi a zpracování ostatních pokračuje.
 *
 * Výsledek strhnutí (paid/failed → prodloužení období / grace) doručí
 * asynchronně webhook (`/api/webhooks/gopay`) — tam se odehrává běžný přechod
 * declined → grace (Sekvence 3). Tento cron pokrývá synchronní selhání:
 *
 *  - `initiation_failed` (GoPay nedostupné, R2.5): {@link chargeMonthly} už
 *    zalogoval a notifikoval admina; předplatné ZŮSTÁVÁ `active` pro opakování
 *    v dalším běhu — grace se NEvyvolává (R2.5 je specifický k tomuto případu).
 *  - ostatní selhání (`vs_allocation_failed` / `payment_create_failed`): strhnutí
 *    se nepodařilo ani iniciovat z naší strany → přechod do `grace_period`
 *    (R10.2 / R4.1) přes {@link transitionToGracePeriod}; profil zůstává
 *    publikovaný. Selže-li i tento přechod → log + admin + pokračuj (R10.3).
 *
 * Běží výhradně se service-role klientem (mimo RLS, napříč tenanty).
 */

export const dynamic = 'force-dynamic';

type DueSubscriptionRow = {
  id: string;
  business_id: string;
  plan: SubscriptionPlan | null;
  gopay_schedule_id: string | null;
};

async function handle(request: NextRequest): Promise<Response> {
  const auth = verifyCronAuthorization(request);
  if (!auth.ok) {
    const status = auth.reason === 'not_configured' ? 500 : 401;
    if (auth.reason === 'not_configured') {
      await serverLog.error('cron_secret_missing', { job: 'billing' });
    } else {
      await serverLog.warn('cron_unauthorized', { job: 'billing' });
    }
    return NextResponse.json({ error: auth.reason }, { status });
  }

  const supabase = createAdminClient();
  const gopay = createGopayClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, business_id, plan, gopay_schedule_id')
    .eq('status', 'active')
    .eq('auto_renew', true)
    .lte('current_period_end', nowIso);

  if (error) {
    await serverLog.error('cron_billing_query_failed', { job: 'billing' });
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  const due = (data ?? []) as DueSubscriptionRow[];
  let charged = 0;
  let graced = 0;
  let kept = 0;
  let failed = 0;

  for (const sub of due) {
    try {
      // Aktivní předplatné bez tarifu / schedule nelze strhnout — per-business
      // selhání: log + admin + pokračuj (R10.6).
      if (sub.plan === null || sub.gopay_schedule_id === null) {
        failed += 1;
        await notifyAdminCronFailure({
          job: 'billing',
          stage: 'missing_plan_or_schedule',
          subscriptionId: sub.id,
          businessId: sub.business_id,
        });
        continue;
      }

      const result = await chargeMonthly(supabase, gopay, {
        subscriptionId: sub.id,
        businessId: sub.business_id,
        scheduleId: sub.gopay_schedule_id,
        plan: sub.plan,
      });

      if (result.ok) {
        // Iniciace OK — výsledek (paid/failed) doručí webhook.
        charged += 1;
        continue;
      }

      if (result.error === 'initiation_failed') {
        // R2.5: GoPay nedostupné, chargeMonthly už notifikoval admina; ponech
        // `active` pro opakování v dalším běhu.
        kept += 1;
        continue;
      }

      // Ostatní selhání iniciace → přechod do grace_period (R10.2 / R4.1).
      const transition = await transitionToGracePeriod(supabase, sub.id);
      if (!transition.ok) {
        // R10.3: přechod do grace selhal → log + admin + pokračuj (bez opakování).
        failed += 1;
        await notifyAdminCronFailure({
          job: 'billing',
          stage: 'grace_transition_failed',
          subscriptionId: sub.id,
          businessId: sub.business_id,
        });
        continue;
      }

      graced += 1;
    } catch {
      // Neočekávané selhání zpracování podniku → continue-on-error (R10.6).
      failed += 1;
      await notifyAdminCronFailure({
        job: 'billing',
        stage: 'unexpected_error',
        subscriptionId: sub.id,
        businessId: sub.business_id,
      });
    }
  }

  await serverLog.info('cron_billing_completed', {
    job: 'billing',
    processed: due.length,
    charged,
    graced,
    kept,
    failed,
  });

  return NextResponse.json(
    { processed: due.length, charged, graced, kept, failed },
    { status: 200 },
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
