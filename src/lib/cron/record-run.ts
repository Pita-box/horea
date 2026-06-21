import 'server-only';

import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Pojmenování cron jobů zapisovaných do `cron_runs`. Drží se výčtu z migrace
 * `0052_create_cron_runs.sql` (sloupec `job`).
 */
export type CronJobName = 'cleanup' | 'billing' | 'warnings' | 'email-retry';

/**
 * Způsob spuštění běhu: plánovaně Vercel Cronem, nebo ručně z `Cron_Trigger`
 * (admin UI). Mapuje se na sloupec `trigger` v `cron_runs`.
 */
export type CronTrigger = 'scheduled' | 'manual';

/**
 * Výsledek handleru cron jobu. `detail` nese pouze číselné metriky běhu
 * (např. `processed`, `failed`) — NIKDY Secret_Value ani PII (R15.4).
 */
export type CronRunResult = {
  status: 'ok' | 'error';
  detail?: Record<string, number>;
};

// Přechodný status start řádku, než se po doběhnutí doplní finální 'ok' | 'error'.
const RUNNING_STATUS = 'running';

/**
 * Ponechá v `detail` výhradně konečné číselné hodnoty. Pojistka proti tomu, aby
 * se do `cron_runs.detail` omylem dostalo cokoli jiného než metriky
 * (žádný Secret_Value, žádné PII, žádné NaN/Infinity).
 */
function sanitizeDetail(detail: Record<string, number> | undefined): Record<string, number> | null {
  if (!detail) {
    return null;
  }

  const safe: Record<string, number> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
    }
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

/**
 * Obalí tělo cron jobu: zapíše start (`cron_runs`), spustí `run()`, po doběhnutí
 * doplní `finished_at` + `status` + `detail`. Zápis běhu je best-effort — jeho
 * selhání NESMÍ shodit samotný job, jen se zaloguje. Zápis jde výhradně přes
 * service-role klienta (obchází RLS). Detail obsahuje jen číselné metriky,
 * NIKDY Secret_Value (R11.4, R15.4).
 */
export async function recordCronRun<T extends CronRunResult>(
  job: CronJobName,
  trigger: CronTrigger,
  run: () => Promise<T>,
): Promise<T> {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  // Start řádek zapíšeme best-effort. Když se nepovede, běh stejně proběhne
  // a finální update prostě přeskočíme (nemáme `id`).
  let runId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('cron_runs')
      .insert({ job, started_at: startedAt, status: RUNNING_STATUS, trigger })
      .select('id')
      .single();

    if (error) {
      await serverLog.warn('cron_run_record_start_failed', { job, trigger });
    } else {
      runId = (data as { id: string } | null)?.id ?? null;
    }
  } catch {
    await serverLog.warn('cron_run_record_start_failed', { job, trigger });
  }

  // Doplní finished_at + finální status + detail. Best-effort, bez vlivu na job.
  async function finish(status: 'ok' | 'error', detail: Record<string, number> | undefined): Promise<void> {
    if (!runId) {
      return;
    }

    try {
      const { error } = await supabase
        .from('cron_runs')
        .update({ finished_at: new Date().toISOString(), status, detail: sanitizeDetail(detail) })
        .eq('id', runId);

      if (error) {
        await serverLog.warn('cron_run_record_finish_failed', { job, trigger });
      }
    } catch {
      await serverLog.warn('cron_run_record_finish_failed', { job, trigger });
    }
  }

  try {
    const result = await run();
    await finish(result.status, result.detail);
    return result;
  } catch (err) {
    // Chybu jen zaznamenáme (status='error', bez detailu) a re-throw —
    // chování routy se tím nemění.
    await finish('error', undefined);
    throw err;
  }
}
