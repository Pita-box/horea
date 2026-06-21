import { NextResponse, type NextRequest } from 'next/server';

import { verifyCronAuthorization } from '@/lib/cron/auth';
import { recordCronRun, type CronTrigger } from '@/lib/cron/record-run';
import { drainEmailOutbox, purgeOldOutbox } from '@/lib/email/outbox';
import { serverLog } from '@/lib/log-server';

/**
 * Email_Retry_Cron — dožene best-effort e-maily, které selhaly přechodnou chybou
 * (quota/429, 5xx, síť) a čekají ve frontě `email_outbox`.
 *
 *  1. Ochrana cron secret ({@link verifyCronAuthorization}) — bez `Bearer
 *     <CRON_SECRET>` → 401.
 *  2. Zpracuje dávku splatných řádků ({@link drainEmailOutbox}) — odešle na
 *     stejném poskytovateli, úspěch → `sent`, přechodná chyba → backoff,
 *     permanentní/vyčerpané pokusy → `dead`.
 *  3. Promaže staré vyřízené řádky ({@link purgeOldOutbox}) kvůli PII hygieně.
 *
 * Dávkový limit drží odeslání pod kontrolou vůči limitům poskytovatele.
 */

export const dynamic = 'force-dynamic';

/** Maximální počet e-mailů zpracovaných v jednom běhu (rate-aware drain). */
const BATCH_LIMIT = 50;

async function handle(request: NextRequest): Promise<Response> {
  const auth = verifyCronAuthorization(request);
  if (!auth.ok) {
    const status = auth.reason === 'not_configured' ? 500 : 401;
    if (auth.reason === 'not_configured') {
      await serverLog.error('cron_secret_missing', { job: 'email-retry' });
    } else {
      await serverLog.warn('cron_unauthorized', { job: 'email-retry' });
    }
    return NextResponse.json({ error: auth.reason }, { status });
  }

  // Ruční spuštění z Cron_Trigger přidá `?trigger=manual`; jinak plánovaný běh.
  const trigger: CronTrigger =
    new URL(request.url).searchParams.get('trigger') === 'manual' ? 'manual' : 'scheduled';

  // Doménová logika je beze změny; jen ji obalíme záznamem běhu do `cron_runs`.
  // Záznam je best-effort a NEMĚNÍ návratovou hodnotu ani HTTP status (R11.4).
  const run = await recordCronRun('email-retry', trigger, async () => {
    const result = await drainEmailOutbox(BATCH_LIMIT);
    const purged = await purgeOldOutbox(7);

    await serverLog.info('cron_email_retry_completed', {
      job: 'email-retry',
      processed: result.processed,
      sent: result.sent,
      requeued: result.requeued,
      dead: result.dead,
      purged,
    });

    return {
      status: 'ok' as const,
      // detail nese pouze číselné metriky běhu (BEZ Secret_Value ani PII).
      detail: {
        processed: result.processed,
        sent: result.sent,
        requeued: result.requeued,
        dead: result.dead,
        purged,
      },
      // Payload pro nezměněnou HTTP odpověď.
      result,
      purged,
    };
  });

  return NextResponse.json({ ...run.result, purged: run.purged }, { status: 200 });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
