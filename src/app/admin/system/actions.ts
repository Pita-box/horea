'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { requireAdmin } from '@/lib/admin/require-admin';
import { sendEmail } from '@/lib/email/client';
import { serverLog } from '@/lib/log-server';
import { isAllowedTarget, type RevalidateTarget } from '@/lib/system/cache-targets';
import { CRON_SCHEDULE_MAP, type CronJobName } from '@/lib/system/cron-schedule';
import { computeCooldownState, TEST_EMAIL_COOLDOWN_SECONDS } from '@/lib/system/email-cooldown';
import { runHealthChecks, type HealthReport } from '@/lib/system/health';
import { computePruneCutoff, DEFAULT_CRON_RETENTION_DAYS } from '@/lib/system/prune-cutoff';

/**
 * Server actions stránky Správa systému `/admin/system` (feature
 * `admin-system-tools`).
 *
 * Defense in depth (R2.4): Access_Guard middleware chrání vykreslení `/admin/*`,
 * ale každá akce zde **nezávisle znovu ověří** admin roli server-side přes
 * existující {@link requireAdmin} — nespoléhá se jen na middleware.
 *
 * Soubor sdružuje všechny server actions stránky: `revalidateTarget` (cache),
 * `triggerCron` (ruční spuštění cronu), `pruneCronRuns` (retence `cron_runs`),
 * `recheckHealth` (opětovná kontrola služeb) a `sendTestEmail` (testovací e-mail).
 * Secret_Value (`CRON_SECRET`) i Personal_Data se používají výhradně server-side
 * a nikdy se nelogují ani nevracejí klientovi (R6, R15.4).
 */

// ---------------------------------------------------------------------------
// Cache_Revalidator (R10, R15)
// ---------------------------------------------------------------------------

/** Výsledek cílené revalidace cache pro client komponentu (R10.4, R15.3). */
export type RevalidateTargetResult =
  | { ok: true; target: RevalidateTarget }
  | { ok: false; message: string };

/** Česká hláška při cíli mimo allowlist (R10.6). */
const NOT_ALLOWED_MESSAGE = 'Tento cíl revalidace není povolen.';

/**
 * Cíleně reviduje cache pro povolený cíl (R10.1, R10.2, R10.5, R10.6, R15.1, R15.3).
 *
 * Tok:
 * 1. Nezávislé ověření admin oprávnění ({@link requireAdmin}, R2.4, R15.1).
 *    Bez oprávnění se cache **nedotkne** a vrátí se česká hláška.
 * 2. Vynucení allowlistu ({@link isAllowedTarget}, R10.5). Cíl mimo allowlist →
 *    `{ ok: false }` **bez** dotčení cache (R10.6).
 * 3. Vlastní revalidace: `path` → {@link revalidatePath}, `tag` → {@link revalidateTag}.
 *    Výsledek obsahuje název cíle pro zobrazení v UI (R10.4, R15.3).
 */
export async function revalidateTarget(target: RevalidateTarget): Promise<RevalidateTargetResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  // Mimo allowlist → odmítnutí bez jakéhokoli dotčení cache (R10.6).
  if (!isAllowedTarget(target)) {
    return { ok: false, message: NOT_ALLOWED_MESSAGE };
  }

  if (target.kind === 'path') {
    revalidatePath(target.value);
  } else {
    revalidateTag(target.value);
  }

  return { ok: true, target };
}

// ---------------------------------------------------------------------------
// Cron_Trigger (R12, R15) — ruční spuštění cronu
// ---------------------------------------------------------------------------

/** Výsledek ručního spuštění cron úlohy pro client komponentu (R12.3, R15.3). */
export type TriggerCronResult =
  | { ok: true; job: CronJobName; httpStatus: number; httpOk: boolean }
  | { ok: false; message: string };

/**
 * Sestaví základ absolutní URL pro server-side volání interního cron endpointu.
 * Preferuje `NEXT_PUBLIC_SITE_URL` (stejně jako ostatní server-side odkazy),
 * jinak `VERCEL_URL` (běhové prostředí Vercelu), jinak lokální fallback.
 * Neobsahuje žádné tajemství.
 */
function resolveCronBaseUrl(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    return siteUrl;
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }
  return 'http://localhost:3000';
}

/**
 * Ručně spustí registrovaný cron job (R12.1–R12.5, R15.1, R15.3, R15.4).
 *
 * Tok:
 * 1. Nezávislé ověření admin oprávnění ({@link requireAdmin}, R2.4, R15.1).
 * 2. Defense in depth: spustit lze jen job z {@link CRON_SCHEDULE_MAP} — jinak se
 *    žádný `fetch` neprovede (zabrání volání libovolné cesty).
 * 3. Chybějící `CRON_SECRET` → odmítnutí bez jakéhokoli `fetch` (R12.4).
 * 4. Server-side `fetch` cron endpointu `/api/cron/<job>?trigger=manual` s hlavičkou
 *    `Authorization: Bearer <CRON_SECRET>` (R12.1). Vrátí se HTTP status/ok běhu (R12.3).
 *
 * `CRON_SECRET` se používá výhradně v `Authorization` hlavičce server-side — nikdy
 * se neodešle klientovi ani nezaloguje (R12.5, R15.4).
 */
export async function triggerCron(job: CronJobName): Promise<TriggerCronResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  // Spustit lze pouze registrovaný job — žádná libovolná cesta (defense in depth).
  if (!(job in CRON_SCHEDULE_MAP)) {
    return { ok: false, message: 'Neznámá cron úloha.' };
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Bez tajemství se žádný fetch neprovede a secret se nikam neodesílá (R12.4).
    return { ok: false, message: 'cron tajemství není nastaveno' };
  }

  const url = new URL(`/api/cron/${job}`, resolveCronBaseUrl());
  url.searchParams.set('trigger', 'manual');

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    return { ok: true, job, httpStatus: response.status, httpOk: response.ok };
  } catch {
    // Logujeme jen název jobu — nikdy tajemství ani URL s tajemstvím (R12.5, R15.4).
    await serverLog.error('admin_trigger_cron_failed', { job });
    return { ok: false, message: 'Spuštění cron úlohy se nezdařilo.' };
  }
}

// ---------------------------------------------------------------------------
// Cron_Run_Pruner (R19, R15) — retence běhů cronů
// ---------------------------------------------------------------------------

/** Výsledek prune běhů cronů pro client komponentu (R19.4, R15.3). */
export type PruneCronRunsResult =
  | { ok: true; deleted: number }
  | { ok: false; message: string };

/**
 * Smaže staré běhy cronů nad rámec retenční hranice (R19.1–R19.6, R15.1, R15.3).
 *
 * Tok:
 * 1. Nezávislé ověření admin oprávnění ({@link requireAdmin}, R2.4, R19.6). Non_Admin_User
 *    → `{ ok: false }` a **žádné** smazání.
 * 2. Bez zadaného počtu dní se použije {@link DEFAULT_CRON_RETENTION_DAYS} (R19.2).
 * 3. Přes service-role klienta smaže `cron_runs` se `started_at` ostře starším než
 *    {@link computePruneCutoff} a vrátí počet smazaných řádků (R19.4).
 *
 * Maže **výhradně** tabulku `cron_runs` (provozní telemetrie); nikdy se nedotýká
 * append-only `Audit_Log` (R19.5, hranice R9).
 */
export async function pruneCronRuns(days?: number): Promise<PruneCronRunsResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const retentionDays = days ?? DEFAULT_CRON_RETENTION_DAYS;
  const cutoff = computePruneCutoff(new Date(), retentionDays);

  // Maže VÝHRADNĚ cron_runs; audit_log se nikdy nedotýká (R19.5).
  const { data, error } = await auth.admin
    .from('cron_runs')
    .delete()
    .lt('started_at', cutoff)
    .select('id');

  if (error) {
    await serverLog.error('admin_prune_cron_runs_failed', {});
    return { ok: false, message: 'Smazání starých běhů cronů se nezdařilo.' };
  }

  return { ok: true, deleted: data?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// Health_Recheck_Action (R21, R15) — opětovná kontrola služeb
// ---------------------------------------------------------------------------

/** Výsledek opětovné kontroly služeb pro client komponentu (R21.1, R21.2). */
export type RecheckHealthResult =
  | { ok: true; report: HealthReport }
  | { ok: false; message: string };

/**
 * On-demand opětovné spuštění health checků (R21.1, R21.2, R21.4, R15.1).
 *
 * Tok:
 * 1. Nezávislé ověření admin oprávnění ({@link requireAdmin}, R2.4, R21.4). Non_Admin_User
 *    → `{ ok: false }` a **žádná** kontrola.
 * 2. Znovu spustí {@link runHealthChecks} a vrátí nový `HealthReport` včetně
 *    `checkedAt` (R21.1, R21.2).
 */
export async function recheckHealth(): Promise<RecheckHealthResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  try {
    const report = await runHealthChecks();
    return { ok: true, report };
  } catch {
    await serverLog.error('admin_recheck_health_failed', {});
    return { ok: false, message: 'Opětovná kontrola služeb se nezdařila.' };
  }
}

// ---------------------------------------------------------------------------
// Test_Email_Action (R22, R15) — odeslání testovacího e-mailu
// ---------------------------------------------------------------------------

/** Klíč v `system_settings` nesoucí čas posledního úspěšného odeslání testovacího e-mailu. */
const TEST_EMAIL_LAST_SENT_KEY = 'test_email_last_sent_at';

/**
 * Výsledek odeslání testovacího e-mailu (R22.6). Bez PII nad rámec
 * `Admin_Email_Address`. `reason` rozlišuje důvod odmítnutí; `cooldown` navíc
 * nese zbývající dobu do dalšího pokusu (R22.4).
 */
export type SendTestEmailResult =
  | { ok: true }
  | { ok: false; reason: 'not_authorized' | 'no_admin_email' | 'send_failed'; message: string }
  | { ok: false; reason: 'cooldown'; message: string; retryAfterSeconds: number };

/**
 * Odešle testovací e-mail výhradně na `HOREA_ADMIN_EMAIL` (R22.1–R22.7, R15.1, R15.3).
 *
 * Action **nepřijímá žádný cíl** — adresa se bere výhradně z env, nikdy od klienta (R22.5).
 *
 * Tok:
 * 1. Nezávislé ověření admin oprávnění ({@link requireAdmin}, R2.4, R22.7). Non_Admin_User
 *    → odmítnutí a **žádné** odeslání.
 * 2. Chybějící `HOREA_ADMIN_EMAIL` → „administrátorská adresa není nastavena", žádné
 *    odeslání (R22.3).
 * 3. Načte `test_email_last_sent_at` ze `system_settings` a vyhodnotí
 *    {@link computeCooldownState}; při zákazu vrátí zbývající dobu (R22.4).
 * 4. Jinak odešle testovací e-mail přes {@link sendEmail} výhradně na adresu z env
 *    (R22.1) a při úspěchu zapíše nový `last_sent_at` (upsert) do `system_settings`.
 *
 * Výsledek ani logy neobsahují PII nad rámec `Admin_Email_Address` (R22.6, R15.4).
 */
export async function sendTestEmail(): Promise<SendTestEmailResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, reason: 'not_authorized', message: auth.message };
  }

  const adminEmail = process.env.HOREA_ADMIN_EMAIL;
  if (!adminEmail) {
    return { ok: false, reason: 'no_admin_email', message: 'administrátorská adresa není nastavena' };
  }

  // Poslední úspěšné odeslání perzistujeme v DB (serverless caveat — modulová
  // proměnná by cooldown napříč instancemi neudržela).
  const { data: setting } = await auth.admin
    .from('system_settings')
    .select('value')
    .eq('key', TEST_EMAIL_LAST_SENT_KEY)
    .maybeSingle<{ value: string }>();

  const lastSentAt = setting?.value ?? null;
  const cooldown = computeCooldownState(lastSentAt, new Date(), TEST_EMAIL_COOLDOWN_SECONDS);
  if (!cooldown.allowed) {
    return {
      ok: false,
      reason: 'cooldown',
      message: `Testovací e-mail lze odeslat znovu za ${cooldown.remainingSeconds} s.`,
      retryAfterSeconds: cooldown.remainingSeconds,
    };
  }

  // Cíl je VÝHRADNĚ adresa z env (R22.1, R22.5).
  const subject = 'Horea — testovací e-mail';
  const text = [
    'Toto je testovací e-mail z administrace Horea (Správa systému).',
    'Slouží k ověření doručitelnosti e-mailů na administrátorskou adresu.',
    '',
    `Odesláno: ${new Date().toISOString()}`,
  ].join('\n');

  try {
    const response = await sendEmail({ to: adminEmail, subject, text });
    if (response.error) {
      await serverLog.error('admin_test_email_failed', {});
      return { ok: false, reason: 'send_failed', message: 'Odeslání testovacího e-mailu se nezdařilo.' };
    }
  } catch {
    await serverLog.error('admin_test_email_failed', {});
    return { ok: false, reason: 'send_failed', message: 'Odeslání testovacího e-mailu se nezdařilo.' };
  }

  // Nový čas zapíšeme až po úspěšném odeslání (R22.4). Zápis je best-effort —
  // jeho selhání nezmění fakt, že e-mail byl odeslán.
  const sentAt = new Date().toISOString();
  const { error: upsertError } = await auth.admin
    .from('system_settings')
    .upsert({ key: TEST_EMAIL_LAST_SENT_KEY, value: sentAt, updated_at: sentAt }, { onConflict: 'key' });

  if (upsertError) {
    await serverLog.warn('admin_test_email_last_sent_write_failed', {});
  }

  return { ok: true };
}
