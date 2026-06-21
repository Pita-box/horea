import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { CronJobName } from '@/lib/system/cron-schedule';

// Čtení posledních běhů cron jobů z tabulky `cron_runs` (R11.1, R11.2, R11.3).
// Modul je `server-only` (přístup přes service-role klienta) a NIKDY nečte PII —
// vrací jen ne-PII pole (job, časy, status, trigger, číselné metriky v `detail`).
// Při nedostupnosti zdroje vrací `null` (konzistentní s `getOutboxStatus`), aby
// UI zobrazilo „stav cronů je momentálně nedostupný" místo pádu stránky (R13.4).

/** Ne-PII záznam jednoho běhu cronu (řádek `cron_runs`) (R11, R12). */
export type CronRunRecord = {
  id: string;
  job: CronJobName;
  startedAt: string; // ISO
  finishedAt: string | null; // ISO; null u dosud neukončeného běhu
  status: 'ok' | 'error';
  trigger: 'scheduled' | 'manual';
  detail: Record<string, number> | null; // jen číselné metriky, BEZ Secret_Value (R15.4)
};

/** Stav jednoho jobu: poslední běh, nebo `null` (bez zaznamenaného běhu) (R11.3). */
export type CronJobStatus =
  | { job: CronJobName; lastRun: CronRunRecord }
  | { job: CronJobName; lastRun: null };

/** Čtyři monitorované cron joby (odpovídá `vercel.json` a `CRON_SCHEDULE_MAP`). */
const CRON_JOBS: readonly CronJobName[] = ['cleanup', 'billing', 'warnings', 'email-retry'];

/** Tvar ne-PII řádku načteného z `cron_runs`. */
type CronRunRow = {
  id: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  detail: Record<string, number> | null;
};

/** Mapuje DB řádek na ne-PII `CronRunRecord`. */
function toCronRunRecord(row: CronRunRow): CronRunRecord {
  return {
    id: row.id,
    job: row.job as CronJobName,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status === 'error' ? 'error' : 'ok',
    trigger: row.trigger === 'manual' ? 'manual' : 'scheduled',
    detail: row.detail,
  };
}

/**
 * Načte poslední běh pro každý ze 4 cron jobů (R11.1, R11.2): pro každý job
 * vybere nejnovější řádek `cron_runs` (`order by started_at desc limit 1`).
 * Pokud job nemá žádný záznam → `lastRun: null` (R11.3). Vrací `null`, pokud je
 * zdroj nedostupný (chybějící service-role env, síťová/DB chyba) — volající pak
 * zobrazí „stav cronů je momentálně nedostupný" (R13.4, konzistentně s outboxem).
 */
export async function getCronStatuses(): Promise<CronJobStatus[] | null> {
  try {
    const supabase = createAdminClient();

    // Záměrně jen ne-PII sloupce — žádné identifikující údaje (R15.4).
    const results = await Promise.all(
      CRON_JOBS.map((job) =>
        supabase
          .from('cron_runs')
          .select('id, job, started_at, finished_at, status, trigger, detail')
          .eq('job', job)
          .order('started_at', { ascending: false })
          .limit(1),
      ),
    );

    const statuses: CronJobStatus[] = [];

    for (let i = 0; i < CRON_JOBS.length; i += 1) {
      const job = CRON_JOBS[i];
      const { data, error } = results[i];

      // Jakákoli chyba zdroje → celá sekce je nedostupná (R13.4).
      if (error) {
        return null;
      }

      const row = (data as CronRunRow[] | null)?.[0] ?? null;
      statuses.push(row ? { job, lastRun: toCronRunRecord(row) } : { job, lastRun: null });
    }

    return statuses;
  } catch {
    // Např. chybějící service-role env nebo síťová chyba → nedostupné (R13.4).
    return null;
  }
}
