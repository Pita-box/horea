import 'server-only';

import { sendEmail } from '@/lib/email/client';
import { describeResendError, isRetryableStatus } from '@/lib/email/errors';
import { isSmtp2goConfigured, sendViaSmtp2go } from '@/lib/email/smtp-client';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Transakční outbox pro best-effort e-maily (kromě auth). Rychlá cesta posílá
 * inline; jen při PŘECHODNÉ chybě (quota/429, 5xx, síť) se e-mail uloží do
 * tabulky `email_outbox` a cron `/api/cron/email-retry` ho později dožene
 * s exponenciálním backoffem. Permanentní chyby (4xx validace) se uloží jako
 * `dead` (neretryují se). Auth e-maily (verify/reset) tudy NEcházejí.
 *
 * Routing poskytovatelů: notifikace rezervací → SMTP2GO (je-li nakonfigurováno),
 * jinak Resend; faktury a admin notifikace → Resend. Retry běží na STEJNÉM
 * poskytovateli (zachování izolace limitů).
 */

export type EmailCategory = 'reservation_notification' | 'invoice' | 'admin';
export type EmailProvider = 'smtp2go' | 'resend';

export type BestEffortEmail = {
  category: EmailCategory;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** Volitelný odkaz (reservationId/paymentId) pouze pro diagnostiku — ne do e-mailu. */
  refId?: string;
  /** Volitelný štítek do logu (jinak se použije kategorie). */
  logLabel?: string;
};

const MAX_ATTEMPTS = 6;
/** Backoff dle počtu už proběhlých pokusů (s): 2 min, 10 min, 1 h, 6 h, 24 h, 24 h. */
const BACKOFF_SECONDS = [120, 600, 3600, 21600, 86400, 86400];

type AttemptResult = { ok: true } | { ok: false; retryable: boolean; code: string };

type OutboxRow = {
  id: string;
  category: EmailCategory;
  provider: EmailProvider;
  to_email: string;
  reply_to: string | null;
  subject: string;
  html_body: string | null;
  text_body: string;
  attempts: number;
  max_attempts: number;
};

function providerForCategory(category: EmailCategory): EmailProvider {
  if (category === 'reservation_notification' && isSmtp2goConfigured()) {
    return 'smtp2go';
  }
  return 'resend';
}

function nextAttemptIso(attempts: number): string {
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_SECONDS.length - 1);
  return new Date(Date.now() + BACKOFF_SECONDS[idx] * 1000).toISOString();
}

function isRetryableSmtpError(error: { code: string; statusCode?: number }): boolean {
  if (error.code === 'smtp2go_not_configured') return false;
  if (error.code === 'network_error') return true;
  if (typeof error.statusCode === 'number') return isRetryableStatus(error.statusCode);
  // API error_code bez HTTP statusu (např. dočasné odmítnutí) → zkusit znovu (capováno max_attempts).
  return true;
}

async function attemptSend(
  provider: EmailProvider,
  email: Pick<BestEffortEmail, 'to' | 'subject' | 'text' | 'html' | 'replyTo'>,
): Promise<AttemptResult> {
  if (provider === 'smtp2go') {
    const result = await sendViaSmtp2go({
      to: email.to,
      subject: email.subject,
      html: email.html ?? '',
      text: email.text,
    });
    if (result.ok) return { ok: true };
    return { ok: false, retryable: isRetryableSmtpError(result.error), code: result.error.code };
  }

  const response = email.html
    ? await sendEmail({
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
      })
    : await sendEmail({
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
      });

  if (!response.error) return { ok: true };
  const desc = describeResendError(response.error);
  return { ok: false, retryable: isRetryableStatus(desc.statusCode), code: desc.code };
}

async function enqueueFailed(
  email: BestEffortEmail,
  provider: EmailProvider,
  retryable: boolean,
  code: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const attempts = 1; // jeden (inline) pokus už proběhl
    const status = retryable ? 'pending' : 'dead';
    await supabase.from('email_outbox').insert({
      category: email.category,
      provider,
      to_email: email.to,
      reply_to: email.replyTo ?? null,
      subject: email.subject,
      html_body: email.html ?? null,
      text_body: email.text,
      status,
      attempts,
      max_attempts: MAX_ATTEMPTS,
      next_attempt_at: status === 'pending' ? nextAttemptIso(attempts) : new Date().toISOString(),
      last_error_code: code,
      ref_id: email.refId ?? null,
    });
  } catch {
    await serverLog.error('email_outbox_enqueue_failed', { category: email.category, code });
  }
}

/**
 * Pošle best-effort e-mail: inline odeslání, a při přechodné chybě uloží do
 * outboxu k pozdějšímu retry. NIKDY nevyhazuje výjimku. Vrací `{ ok }` podle
 * inline odeslání (i když byl e-mail zařazen do fronty, vrací `false`).
 */
export async function sendBestEffort(email: BestEffortEmail): Promise<{ ok: boolean }> {
  const provider = providerForCategory(email.category);

  let result: AttemptResult;
  try {
    result = await attemptSend(provider, email);
  } catch (error) {
    result = { ok: false, retryable: true, code: describeResendError(error).code };
  }

  if (result.ok) return { ok: true };

  await enqueueFailed(email, provider, result.retryable, result.code);
  await serverLog.warn(`${email.logLabel ?? email.category}_email_failed`, {
    category: email.category,
    provider,
    retryable: result.retryable,
    emailError: { code: result.code },
    refId: email.refId,
  });
  return { ok: false };
}

/**
 * Zpracuje dávku splatných řádků outboxu (cron). Úspěch → `sent`; přechodná
 * chyba → `pending` s posunutým `next_attempt_at`; permanentní chyba nebo
 * vyčerpané pokusy → `dead`.
 */
export async function drainEmailOutbox(
  limit = 25,
): Promise<{ processed: number; sent: number; requeued: number; dead: number }> {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('email_outbox')
    .select('id, category, provider, to_email, reply_to, subject, html_body, text_body, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', nowIso)
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) {
    await serverLog.error('email_outbox_drain_query_failed', {});
    return { processed: 0, sent: 0, requeued: 0, dead: 0 };
  }

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  let requeued = 0;
  let dead = 0;

  for (const row of rows) {
    const email = {
      to: row.to_email,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body ?? undefined,
      replyTo: row.reply_to ?? undefined,
    };

    let result: AttemptResult;
    try {
      result = await attemptSend(row.provider, email);
    } catch (sendError) {
      result = { ok: false, retryable: true, code: describeResendError(sendError).code };
    }

    if (result.ok) {
      await supabase
        .from('email_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id);
      sent += 1;
      continue;
    }

    const attempts = row.attempts + 1;
    if (!result.retryable || attempts >= row.max_attempts) {
      await supabase
        .from('email_outbox')
        .update({ status: 'dead', attempts, last_error_code: result.code })
        .eq('id', row.id);
      dead += 1;
    } else {
      await supabase
        .from('email_outbox')
        .update({
          status: 'pending',
          attempts,
          next_attempt_at: nextAttemptIso(attempts),
          last_error_code: result.code,
        })
        .eq('id', row.id);
      requeued += 1;
    }
  }

  return { processed: rows.length, sent, requeued, dead };
}

/** Smaže staré vyřízené (`sent`/`dead`) řádky outboxu (PII hygiena). Vrací počet. */
export async function purgeOldOutbox(olderThanDays = 7): Promise<number> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanDays * 86400 * 1000).toISOString();

  const { data, error } = await supabase
    .from('email_outbox')
    .delete()
    .in('status', ['sent', 'dead'])
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    await serverLog.warn('email_outbox_purge_failed', {});
    return 0;
  }
  return data?.length ?? 0;
}
