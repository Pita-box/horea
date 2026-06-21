// Čisté funkce rozvrhu a driftu cronů (bez I/O, deterministické).
// Tento modul je přímo pokrytý property-based testy (úkoly 11.2 a 11.3).
// Záměrně neobsahuje žádné `server-only`, DB přístup ani jiné I/O.

/**
 * Názvy registrovaných cron jobů (odpovídá `vercel.json`). Kanonickým zdrojem
 * typu bude `src/lib/cron/record-run.ts` (úkol 23); zde je definován lokálně,
 * aby modul zůstal čistý a nezávislý na server-only vrstvě.
 */
export type CronJobName = 'cleanup' | 'billing' | 'warnings' | 'email-retry';

/** Deklarovaná mapa rozvrhů odpovídající `vercel.json` (R24.3). */
export const CRON_SCHEDULE_MAP: Readonly<Record<CronJobName, string>> = {
  billing: '0 3 * * *',
  warnings: '30 3 * * *',
  cleanup: '0 4 * * *',
  'email-retry': '*/15 * * * *',
};

/**
 * Spočítá příští plánovaný běh z cron výrazu vůči `now` (UTC) (R24.2).
 * Minimalistický parser pokrývající VÝHRADNĚ vzory používané v této aplikaci:
 *   - 'M H * * *'      (denní v daný čas, např. '0 3 * * *', '30 3 * * *', '0 4 * * *')
 *   - '*'+'/N * * * *' (každých N minut, např. '*'+'/15 * * * *')
 * Vrací nejbližší čas ostře po `now`. Pro nepodporovaný výraz vyhodí chybu
 * (drift se detekuje porovnáním řetězců, ne výpočtem). Vědomě NEzavádíme cron
 * parsovací závislost — rozsah výrazů je malý a stabilní; minimální čistý helper
 * je dostatečný a plně testovatelný.
 */
export function computeNextRun(cronExpr: string, now: Date): Date {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Nepodporovaný cron výraz: '${cronExpr}'`);
  }

  const [minuteField, hourField, dom, month, dow] = fields;
  const restAreWildcards = dom === '*' && month === '*' && dow === '*';

  // Vzor 'M H * * *' — denní běh v daný čas (UTC).
  if (restAreWildcards && hourField !== '*' && /^\d+$/.test(minuteField) && /^\d+$/.test(hourField)) {
    const minute = Number(minuteField);
    const hour = Number(hourField);
    if (minute > 59 || hour > 23) {
      throw new Error(`Nepodporovaný cron výraz: '${cronExpr}'`);
    }
    const next = new Date(now.getTime());
    next.setUTCHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // Vzor '*'+'/N * * * *' — každých N minut.
  const stepMatch = /^\*\/(\d+)$/.exec(minuteField);
  if (restAreWildcards && hourField === '*' && stepMatch) {
    const step = Number(stepMatch[1]);
    if (step < 1 || step > 59) {
      throw new Error(`Nepodporovaný cron výraz: '${cronExpr}'`);
    }
    const next = new Date(now.getTime());
    next.setUTCSeconds(0, 0);
    // Posun na nejbližší minutu ostře po `now`.
    if (next.getTime() <= now.getTime()) {
      next.setUTCMinutes(next.getUTCMinutes() + 1);
    }
    // Najdi nejbližší minutu dělitelnou N (cron krok v rámci hodiny, reset na 0).
    while (next.getUTCMinutes() % step !== 0) {
      next.setUTCMinutes(next.getUTCMinutes() + 1);
    }
    return next;
  }

  throw new Error(`Nepodporovaný cron výraz: '${cronExpr}'`);
}

export type ScheduleDrift = {
  /** Joby v `vercel.json`, které funkce nemonitoruje. */
  missing: CronJobName[];
  /** Joby monitorované funkcí, které nejsou v `vercel.json`. */
  extra: CronJobName[];
  /** Joby v obou, ale s neodpovídajícím rozvrhem. */
  mismatched: { job: CronJobName; configured: string; monitored: string }[];
};

/**
 * Detekuje drift mezi rozvrhy z `vercel.json` (`configured`) a monitorovanou mapou
 * (`monitored`): `missing` = v configured \ monitored, `extra` = monitored \
 * configured, `mismatched` = průnik s různým výrazem (R24.4). Prázdné všechny tři
 * → žádný drift. Bez I/O.
 */
export function detectScheduleDrift(
  configured: Record<string, string>,
  monitored: Record<string, string>,
): ScheduleDrift {
  const missing: CronJobName[] = [];
  const extra: CronJobName[] = [];
  const mismatched: ScheduleDrift['mismatched'] = [];

  for (const job of Object.keys(configured)) {
    if (!(job in monitored)) {
      missing.push(job as CronJobName);
    } else if (configured[job] !== monitored[job]) {
      mismatched.push({
        job: job as CronJobName,
        configured: configured[job],
        monitored: monitored[job],
      });
    }
  }

  for (const job of Object.keys(monitored)) {
    if (!(job in configured)) {
      extra.push(job as CronJobName);
    }
  }

  return { missing, extra, mismatched };
}
