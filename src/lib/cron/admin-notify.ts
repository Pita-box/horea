import 'server-only';

import { sendBestEffort } from '@/lib/email/outbox';
import { serverLog } from '@/lib/log-server';

/**
 * Best-effort notifikace administrátora o selhání zpracování jednoho podniku
 * v cron úloze (R10.6 — continue-on-error: log + upozornit admina + pokračovat).
 *
 * Adresa administrátora se čte z env `HOREA_ADMIN_EMAIL`; bez ní se notifikace
 * přeskočí (zaloguje se jen upozornění). E-mail i log obsahují POUZE
 * neidentifikující ID předplatného/podniku a název úlohy — žádné PII. Funkce
 * NIKDY nevyhodí výjimku do volajícího, aby selhání notifikace nezastavilo
 * zbytek dávky.
 */
export async function notifyAdminCronFailure(context: {
  /** Název cron úlohy (např. `billing`, `cleanup`, `warnings`). */
  job: string;
  /** Fáze/krok, kde selhání nastalo (pro orientaci v logu). */
  stage: string;
  /** ID předplatného (neidentifikující). */
  subscriptionId?: string;
  /** ID podniku (neidentifikující). */
  businessId?: string;
}): Promise<void> {
  await serverLog.error('cron_business_processing_failed', {
    job: context.job,
    stage: context.stage,
    subscriptionId: context.subscriptionId,
    businessId: context.businessId,
  });

  const adminEmail = process.env.HOREA_ADMIN_EMAIL;
  if (!adminEmail) {
    return;
  }

  const subject = `Horea — selhalo zpracování podniku v úloze ${context.job}`;
  const text = [
    `Cron úloha "${context.job}" nedokázala zpracovat jeden podnik (fáze: ${context.stage}).`,
    'Zpracování ostatních podniků pokračuje.',
    '',
    `Předplatné: ${context.subscriptionId ?? '—'}`,
    `Podnik: ${context.businessId ?? '—'}`,
  ].join('\n');

  try {
    await sendBestEffort({ category: 'admin', to: adminEmail, subject, text, logLabel: 'cron_admin_notification' });
  } catch {
    await serverLog.warn('cron_admin_notification_failed', { job: context.job });
  }
}
