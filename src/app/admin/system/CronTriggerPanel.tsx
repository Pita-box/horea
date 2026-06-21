'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { CRON_SCHEDULE_MAP, type CronJobName } from '@/lib/system/cron-schedule';

import { triggerCron, type TriggerCronResult } from './actions';

/**
 * Cron_Trigger_Panel — klientské UI pro ruční spuštění registrovaných cron jobů
 * (R12, R14, R15).
 *
 * Vlastnosti:
 *  - **Explicitní potvrzení per job** (R12.2, R15.2): kliknutím na „Spustit" se
 *    u daného jobu odhalí krok potvrzení (potvrdit / zrušit); samotné volání
 *    proběhne až po potvrzení.
 *  - **Jen registrované joby** (defense in depth): spouští výhradně 4 joby z
 *    {@link CRON_SCHEDULE_MAP}; název jobu se předává server action {@link triggerCron}.
 *  - **`aria-live="polite"` region** (R12.3, R14.3): výsledek (HTTP status/ok nebo
 *    chybová zpráva) se oznamuje asistivním technologiím textovým labelem (R14.1).
 *  - **Klávesová ovladatelnost** (R14.2): používá nativní `<button>` prvky.
 *  - **Bez tajemství** (R12.5): zobrazuje pouze data vrácená akcí; `CRON_SECRET`
 *    zůstává server-side.
 */

/** České labely jobů (textový label, ne jen identifikátor) — pořadí pro zobrazení. */
const JOB_LABELS: Record<CronJobName, string> = {
  cleanup: 'Úklid (cleanup)',
  billing: 'Fakturace (billing)',
  warnings: 'Upozornění (warnings)',
  'email-retry': 'Opakované odeslání e-mailů (email-retry)',
};

/** Stabilní pořadí jobů odpovídající rozvrhu. */
const JOBS = Object.keys(JOB_LABELS) as CronJobName[];

export function CronTriggerPanel() {
  // Job, u kterého aktuálně probíhá krok potvrzení (nebo null).
  const [confirming, setConfirming] = useState<CronJobName | null>(null);
  // Poslední výsledek a job, kterého se týká (kvůli textovému labelu).
  const [result, setResult] = useState<{ job: CronJobName; value: TriggerCronResult } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRequest(job: CronJobName) {
    setResult(null);
    setConfirming(job);
  }

  function handleCancel() {
    setConfirming(null);
  }

  function handleConfirm(job: CronJobName) {
    setConfirming(null);
    startTransition(() => {
      void triggerCron(job).then((value) => setResult({ job, value }));
    });
  }

  return (
    <Card as="section" className="flex flex-col gap-[var(--spacing-16)] p-[var(--card-padding)]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Ruční spuštění cronu
        </h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Spustí vybranou cron úlohu mimo plánovaný čas pro ověření funkčnosti.
        </p>
      </div>

      <ul className="flex flex-col gap-[var(--spacing-12)]">
        {JOBS.map((job) => (
          <li
            key={job}
            className="flex flex-wrap items-center justify-between gap-[var(--spacing-8)]"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                {JOB_LABELS[job]}
              </span>
              <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                Rozvrh: {CRON_SCHEDULE_MAP[job]}
              </span>
            </div>

            {confirming === job ? (
              <div className="flex flex-wrap items-center gap-[var(--spacing-8)]">
                <span className="text-sm font-medium">Opravdu spustit?</span>
                <Button onClick={() => handleConfirm(job)} disabled={isPending}>
                  Potvrdit
                </Button>
                <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
                  Zrušit
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={() => handleRequest(job)}
                disabled={isPending || confirming !== null}
              >
                Spustit
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/* aria-live region: po doběhnutí oznámí výsledek běhu (R12.3, R14.3). */}
      <div aria-live="polite">
        {result ? (
          <Notice
            role={result.value.ok && result.value.httpOk ? 'status' : 'alert'}
            variant={resultVariant(result.value)}
          >
            {resultMessage(result.job, result.value)}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}

/** Notice varianta podle výsledku: úspěšný HTTP běh → neutral, jinak error. */
function resultVariant(result: TriggerCronResult): 'neutral' | 'error' {
  return result.ok && result.httpOk ? 'neutral' : 'error';
}

/** Textový label výsledku (R14.1, R12.3) — bez tajemství; jen data z akce. */
function resultMessage(job: CronJobName, result: TriggerCronResult): string {
  const label = JOB_LABELS[job];
  if (!result.ok) {
    return `${label}: ${result.message}`;
  }
  const stav = result.httpOk ? 'úspěch' : 'chyba';
  return `${label}: ${stav} (HTTP ${result.httpStatus}).`;
}
