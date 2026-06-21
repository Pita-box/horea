import { NextResponse, type NextRequest } from 'next/server';

import { dispatchTransactionalEmail } from '@/lib/email/dispatcher';
import { renderSubscriptionWarningEmail } from '@/lib/email/templates/subscription-warning';
import { notifyAdminCronFailure } from '@/lib/cron/admin-notify';
import { verifyCronAuthorization } from '@/lib/cron/auth';
import { recordCronRun, type CronRunResult, type CronTrigger } from '@/lib/cron/record-run';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { warningKindFor } from '@/lib/warnings/predicates';

/**
 * Warning_Cron — denní varovné e-maily před přechody stavu předplatného
 * `/api/cron/warnings` (R6.10, R6.11, R10.5, R10.6).
 *
 * Tenký adaptér mezi Vercel Cron triggerem a doménovou logikou. Postup
 * (design.md, sekce *Warning_Cron*):
 *
 *  1. **Ochrana cron secret** ({@link verifyCronAuthorization}, R10.6): bez
 *     správného `Authorization: Bearer <CRON_SECRET>` → 401, žádná akce.
 *  2. Načte předplatná v neplacené epizodě (`grace_period` / `expired` s
 *     nastavenou kotvou) včetně názvu podniku a e-mailu majitele.
 *  3. Pro každé vyhodnotí čistý predikát {@link warningKindFor}: e-mail v den 23
 *     od kotvy (před `grace_period` → `expired`, R6.10) a den 83 (před `expired`
 *     → `deleted_data`, R6.11). Odeslání deleguje na sdílený dispatcher s českou
 *     šablonou {@link renderSubscriptionWarningEmail}.
 *     **Continue-on-error** (R10.6): selhání jednoho podniku zpracování ostatních
 *     nezastaví.
 *
 * Běží výhradně se service-role klientem (mimo RLS, napříč tenanty).
 */

export const dynamic = 'force-dynamic';

type WarningCandidateRow = {
  id: string;
  business_id: string;
  first_failed_charge_at: string | null;
  business:
    | { name: string; owner_user_id: string }
    | { name: string; owner_user_id: string }[]
    | null;
};

/** Normalizuje embedded business (Supabase vrací objekt nebo pole). */
function pickBusiness(
  business: WarningCandidateRow['business'],
): { name: string; owner_user_id: string } | null {
  if (business === null) {
    return null;
  }
  return Array.isArray(business) ? (business[0] ?? null) : business;
}

function resolveRenewUrl(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return null;
  }
  return new URL('/dashboard/subscription', siteUrl).toString();
}

/**
 * Výsledek doménové části warning běhu. Rozšiřuje {@link CronRunResult} (status +
 * číselné `detail` metriky pro `cron_runs`) o samotnou HTTP `response`, kterou
 * route vrátí beze změny. Wrapper `recordCronRun` tak může zapsat metriky, aniž by
 * jakkoli ovlivnil návratovou hodnotu nebo HTTP status routy (R11.4).
 */
type WarningsRunResult = CronRunResult & { response: Response };

async function handle(request: NextRequest): Promise<Response> {
  const auth = verifyCronAuthorization(request);
  if (!auth.ok) {
    const status = auth.reason === 'not_configured' ? 500 : 401;
    if (auth.reason === 'not_configured') {
      await serverLog.error('cron_secret_missing', { job: 'warnings' });
    } else {
      await serverLog.warn('cron_unauthorized', { job: 'warnings' });
    }
    return NextResponse.json({ error: auth.reason }, { status });
  }

  // Odvození způsobu spuštění (R11.4): ruční spuštění z `Cron_Trigger` (admin UI,
  // task 26.2) volá tentýž endpoint s rozlišovacím query parametrem `?trigger=manual`;
  // plánovaný běh Vercel Cronu parametr nenese → `scheduled`. Doménová logika je na
  // triggeru nezávislá.
  const trigger: CronTrigger =
    new URL(request.url).searchParams.get('trigger') === 'manual' ? 'manual' : 'scheduled';

  // Best-effort záznam běhu do `cron_runs` (R11.4). Wrapper nemění návratovou hodnotu
  // ani HTTP status routy — doménová logika beze změny vrací svou `response`, k níž jen
  // přibalí číselné metriky pro `detail`. Selhání zápisu běhu samotný job neshodí.
  const { response } = await recordCronRun(
    'warnings',
    trigger,
    async (): Promise<WarningsRunResult> => {
      const supabase = createAdminClient();
      const now = new Date();

      const { data, error } = await supabase
        .from('subscriptions')
        .select(
          'id, business_id, first_failed_charge_at, business:businesses(name, owner_user_id)',
        )
        .not('first_failed_charge_at', 'is', null)
        .in('status', ['grace_period', 'expired']);

      if (error) {
        await serverLog.error('cron_warnings_query_failed', { job: 'warnings' });
        return {
          status: 'error',
          response: NextResponse.json({ error: 'query_failed' }, { status: 500 }),
        };
      }

      const candidates = (data ?? []) as WarningCandidateRow[];

      // Předfiltr: jen ty, kterým dnes nějaké varování připadá (čistý predikát).
      const due = candidates
        .map((sub) => ({ sub, kind: warningKindFor(sub.first_failed_charge_at, now) }))
        .filter(
          (entry): entry is { sub: WarningCandidateRow; kind: NonNullable<typeof entry.kind> } =>
            entry.kind !== null,
        );

      // Dohledání e-mailů majitelů v jednom dotazu (e-mail je v public.users).
      const ownerIds = Array.from(
        new Set(
          due
            .map((entry) => pickBusiness(entry.sub.business)?.owner_user_id)
            .filter((id): id is string => typeof id === 'string'),
        ),
      );

      const emailByUserId = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, email')
          .in('id', ownerIds);

        if (usersError) {
          await serverLog.error('cron_warnings_users_query_failed', { job: 'warnings' });
          return {
            status: 'error',
            response: NextResponse.json({ error: 'query_failed' }, { status: 500 }),
          };
        }

        for (const user of (users ?? []) as { id: string; email: string }[]) {
          emailByUserId.set(user.id, user.email);
        }
      }

      const renewUrl = resolveRenewUrl();
      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const { sub, kind } of due) {
        try {
          const business = pickBusiness(sub.business);
          const email = business ? emailByUserId.get(business.owner_user_id) : undefined;

          if (!business || !email) {
            // Chybí příjemce — nelze odeslat; per-business selhání (R10.6).
            failed += 1;
            await notifyAdminCronFailure({
              job: 'warnings',
              stage: 'missing_recipient',
              subscriptionId: sub.id,
              businessId: sub.business_id,
            });
            continue;
          }

          const rendered = renderSubscriptionWarningEmail({
            businessName: business.name,
            kind,
            renewUrl,
          });

          const result = await dispatchTransactionalEmail({
            reservationId: sub.id,
            emailType: `subscription_warning_${kind}`,
            to: email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });

          if (result.ok) {
            sent += 1;
          } else {
            skipped += 1;
          }
        } catch {
          failed += 1;
          await notifyAdminCronFailure({
            job: 'warnings',
            stage: 'unexpected_error',
            subscriptionId: sub.id,
            businessId: sub.business_id,
          });
        }
      }

      await serverLog.info('cron_warnings_completed', {
        job: 'warnings',
        processed: candidates.length,
        due: due.length,
        sent,
        skipped,
        failed,
      });

      return {
        status: 'ok',
        detail: { processed: candidates.length, due: due.length, sent, skipped, failed },
        response: NextResponse.json(
          { processed: candidates.length, due: due.length, sent, skipped, failed },
          { status: 200 },
        ),
      };
    },
  );

  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
