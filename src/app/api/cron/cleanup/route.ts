import { NextResponse, type NextRequest } from 'next/server';

import { notifyAdminCronFailure } from '@/lib/cron/admin-notify';
import { verifyCronAuthorization } from '@/lib/cron/auth';
import { serverLog } from '@/lib/log-server';
import { DELETED_DATA_SECONDS } from '@/lib/subscription/state-machine';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cleanup_Cron — denní mazání tenant dat po vypršení lhůty `/api/cron/cleanup`
 * (R6.7, R6.8, R10.4, R10.6).
 *
 * Tenký adaptér mezi Vercel Cron triggerem a doménovou logikou. Postup
 * (design.md, sekce *Cleanup_Cron*):
 *
 *  1. **Ochrana cron secret** ({@link verifyCronAuthorization}, R10.6): bez
 *     správného `Authorization: Bearer <CRON_SECRET>` → 401, žádná akce.
 *  2. Načte podniky, u kterých od kotvy `first_failed_charge_at` uplynulo ≥ 90
 *     dní bez úspěšné platby a které ještě nejsou ve stavu `deleted_data` (R10.4).
 *  3. Pro každý zavolá atomickou RPC `delete_business_tenant_data` (migrace 0030),
 *     která v JEDNÉ transakci smaže tenant data (profil, služby, otevírací doby,
 *     rezervace, klienty), zachová `users` + historii `subscriptions`/`payments`
 *     (R6.8) a nastaví `subscription.status = deleted_data` (R6.7).
 *     **Continue-on-error** (R10.6): selhání jednoho podniku se zaloguje,
 *     notifikuje adminovi a zpracování ostatních pokračuje.
 *
 * Idempotence: filtr `status != deleted_data` zajistí, že opakovaný běh už
 * smazaný podnik znovu nezpracuje. Běží výhradně se service-role klientem.
 */

export const dynamic = 'force-dynamic';

type ExpiredSubscriptionRow = {
  id: string;
  business_id: string;
};

async function handle(request: NextRequest): Promise<Response> {
  const auth = verifyCronAuthorization(request);
  if (!auth.ok) {
    const status = auth.reason === 'not_configured' ? 500 : 401;
    if (auth.reason === 'not_configured') {
      await serverLog.error('cron_secret_missing', { job: 'cleanup' });
    } else {
      await serverLog.warn('cron_unauthorized', { job: 'cleanup' });
    }
    return NextResponse.json({ error: auth.reason }, { status });
  }

  const supabase = createAdminClient();
  const cutoffIso = new Date(Date.now() - DELETED_DATA_SECONDS * 1000).toISOString();

  // Kandidáti: kotva ≥ 90 dní v minulosti a předplatné ještě není smazané.
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, business_id')
    .not('first_failed_charge_at', 'is', null)
    .lte('first_failed_charge_at', cutoffIso)
    .neq('status', 'deleted_data');

  if (error) {
    await serverLog.error('cron_cleanup_query_failed', { job: 'cleanup' });
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  const candidates = (data ?? []) as ExpiredSubscriptionRow[];
  let deleted = 0;
  let failed = 0;

  for (const sub of candidates) {
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('delete_business_tenant_data', {
        p_business_id: sub.business_id,
      });

      const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
        | { business_id: string; subscription_id: string }
        | undefined;

      if (rpcError || !row) {
        failed += 1;
        await notifyAdminCronFailure({
          job: 'cleanup',
          stage: rpcError ? 'delete_rpc_failed' : 'subscription_not_found',
          subscriptionId: sub.id,
          businessId: sub.business_id,
        });
        continue;
      }

      deleted += 1;
    } catch {
      failed += 1;
      await notifyAdminCronFailure({
        job: 'cleanup',
        stage: 'unexpected_error',
        subscriptionId: sub.id,
        businessId: sub.business_id,
      });
    }
  }

  await serverLog.info('cron_cleanup_completed', {
    job: 'cleanup',
    processed: candidates.length,
    deleted,
    failed,
  });

  return NextResponse.json({ processed: candidates.length, deleted, failed }, { status: 200 });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
