import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { requireAdmin } from '@/lib/admin/require-admin';
import { toPragueDisplay } from '@/lib/datetime';
import { getBackupStatus } from '@/lib/system/backup-status';
import { getDeployInfo } from '@/lib/system/build-info';
import { getConfigReport } from '@/lib/system/config-report';
import { getCronStatuses, type CronJobStatus } from '@/lib/system/cron-monitor';
import {
  CRON_SCHEDULE_MAP,
  computeNextRun,
  detectScheduleDrift,
  type CronJobName,
} from '@/lib/system/cron-schedule';
import { runHealthChecks, type HealthReport } from '@/lib/system/health';
import { getOperationalMetrics } from '@/lib/system/metrics';
import { getOutboxStatus } from '@/lib/system/outbox-status';
import type { ServiceStatus } from '@/lib/system/status';
import {
  getWebhookFreshness,
  WEBHOOK_FRESHNESS_THRESHOLD_HOURS,
} from '@/lib/system/webhook-freshness';

import { CronTriggerPanel } from './CronTriggerPanel';
import { HealthRecheckButton } from './HealthRecheckButton';
import { PruneCronRunsPanel } from './PruneCronRunsPanel';
import { RevalidatePanel } from './RevalidatePanel';
import { TestEmailPanel } from './TestEmailPanel';

/**
 * Stránka „Správa systému" `/admin/system` (feature `admin-system-tools`, R13, R14, task 28.1).
 *
 * Server komponenta (SSR) v admin segmentu. Přístup chrání Access_Guard
 * middleware (`/admin/*`); stránka navíc na začátku **nezávisle znovu ověří**
 * admin roli přes {@link requireAdmin} (defense in depth, R2.4) — při neúspěchu
 * vykreslí odmítnutí a žádný provozní nástroj nenačte.
 *
 * Při načtení spustí `Health_Checker` ({@link runHealthChecks}) a sesbírá stav
 * z čistých inspektorů i I/O wrapperů (`src/lib/system`). Každá I/O sekce je
 * odolná: selhání nebo `null` zobrazí českou hlášku „… je momentálně nedostupné"
 * a zbytek stránky funguje dál (R13.4). Všechny stavy se zobrazují **textovým
 * labelem**, ne jen barvou (R14.1). Stránka nikdy nezobrazuje Secret_Value ani PII.
 *
 * Interaktivní akce (revalidace cache, ruční cron, retence `cron_runs`, re-check
 * health, test e-mail) řeší malé klientské panely s potvrzením a `aria-live`
 * regionem.
 */

export const dynamic = 'force-dynamic';

/** Textové labely stavu služby (textový label, ne jen barva — R14.1). */
const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: 'v pořádku',
  degraded: 'zhoršené',
  down: 'nedostupné',
};

/** Textové labely výsledku běhu cronu. */
const CRON_RUN_STATUS_LABEL: Record<'ok' | 'error', string> = {
  ok: 'v pořádku',
  error: 'chyba',
};

/** Textové labely způsobu spuštění cronu. */
const CRON_TRIGGER_LABEL: Record<'scheduled' | 'manual', string> = {
  scheduled: 'plánovaně',
  manual: 'ručně',
};

/** Bezpečně spustí health check; při výjimce vrátí `null` (sekce bude nedostupná, R13.4). */
async function loadHealthReport(): Promise<HealthReport | null> {
  try {
    return await runHealthChecks();
  } catch {
    return null;
  }
}

/** Společný nadpis sekce. */
function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">{title}</h2>
      {description ? (
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Jeden řádek „popisek: hodnota" v definičním seznamu. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-border-vychozi)] py-2 last:border-b-0">
      <dt className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-[var(--color-slate-text)]">{value}</dd>
    </div>
  );
}

export default async function AdminSystemPage() {
  // Defense in depth (R2.4): nezávislé ověření admin role i ve vykreslení stránky.
  const auth = await requireAdmin();
  if (!auth.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Notice variant="error" role="alert">
          {auth.message}
        </Notice>
      </div>
    );
  }

  // Health check (může být pomalý — to je v pořádku, stránka je force-dynamic).
  const healthReport = await loadHealthReport();
  // Stav Google Drive z health reportu pro odvození stavu záloh (R18.2).
  const googleStatus: ServiceStatus =
    healthReport?.services.find((service) => service.service === 'google')?.status ?? 'down';

  // I/O sekce paralelně; každá si fallback řeší sama (vrací null / db:null).
  const [outbox, webhook, metrics, cronStatuses] = await Promise.all([
    getOutboxStatus(),
    getWebhookFreshness(),
    getOperationalMetrics(),
    getCronStatuses(),
  ]);

  // Čisté inspektory (bez I/O — synchronní, bez tajemství/hodnot).
  const deployInfo = getDeployInfo();
  const configReport = getConfigReport();
  const backupStatus = getBackupStatus(googleStatus);

  // Self-check driftu rozvrhu: porovnáváme deklarovanou mapu se sebou samou
  // (jediný dostupný zdroj rozvrhu je `CRON_SCHEDULE_MAP`), takže žádný drift.
  const drift = detectScheduleDrift(CRON_SCHEDULE_MAP, CRON_SCHEDULE_MAP);
  const hasDrift =
    drift.missing.length > 0 || drift.extra.length > 0 || drift.mismatched.length > 0;

  // Poslední běhy cronů indexované podle jobu (pokud je monitor dostupný).
  const cronStatusByJob = new Map<CronJobName, CronJobStatus>();
  if (cronStatuses) {
    for (const status of cronStatuses) {
      cronStatusByJob.set(status.job, status);
    }
  }

  const cronJobs = Object.keys(CRON_SCHEDULE_MAP) as CronJobName[];
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      {/* Sekce: agregovaný stav + health tabulka + re-check (R3–R5, R21). */}
      {healthReport ? (
        <HealthRecheckButton initialReport={healthReport} />
      ) : (
        <Card
          as="section"
          className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          aria-label="Stav služeb"
        >
          <SectionHeading title="Stav služeb" />
          <Notice variant="warning" role="status">
            Stav služeb je momentálně nedostupný.
          </Notice>
        </Card>
      )}

      {/* Sekce: informace o nasazení (R16). */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Informace o nasazení"
      >
        <SectionHeading title="Informace o nasazení" />
        <dl className="flex flex-col">
          <InfoRow label="Commit (SHA)" value={deployInfo.commitSha} />
          <InfoRow label="Git větev / ref" value={deployInfo.gitRef} />
          <InfoRow label="Prostředí" value={deployInfo.environment} />
          <InfoRow label="ID nasazení" value={deployInfo.deployId} />
          <InfoRow label="Verze Node.js" value={deployInfo.nodeVersion} />
        </dl>
      </Card>

      {/* Sekce: stav e-mailové fronty (R17) — souvisí s /api/cron/email-retry. */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Stav e-mailové fronty"
      >
        <SectionHeading
          title="Stav e-mailové fronty"
          description="Fronta odchozích e-mailů (email_outbox). Opakované odeslání zajišťuje cron úloha email-retry (/api/cron/email-retry)."
        />
        {outbox ? (
          <dl className="flex flex-col">
            <InfoRow label="Čeká na odeslání (pending)" value={String(outbox.counts.pending)} />
            <InfoRow label="Odesláno (sent)" value={String(outbox.counts.sent)} />
            <InfoRow label="Neúspěšné (dead)" value={String(outbox.counts.dead)} />
            <InfoRow label="Připraveno k opakování" value={String(outbox.readyToRetry)} />
            <InfoRow
              label="Nejstarší čekající"
              value={outbox.oldestPendingAt ? toPragueDisplay(outbox.oldestPendingAt) : '—'}
            />
          </dl>
        ) : (
          <Notice variant="warning" role="status">
            Stav e-mailové fronty je momentálně nedostupný.
          </Notice>
        )}
      </Card>

      {/* Sekce: stav záloh (R18). */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Stav záloh"
      >
        <SectionHeading title="Stav záloh" />
        <dl className="flex flex-col">
          <InfoRow
            label="Konfigurace (Google)"
            value={backupStatus.configured ? 'nakonfigurováno' : 'nenakonfigurováno'}
          />
          <InfoRow
            label="Dostupnost Google Drive"
            value={SERVICE_STATUS_LABEL[backupStatus.driveStatus]}
          />
        </dl>
        <Notice variant="neutral" role="note">
          {backupStatus.info}
        </Notice>
      </Card>

      {/* Sekce: čerstvost GoPay webhooku (R20). */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Čerstvost GoPay webhooku"
      >
        <SectionHeading
          title="Čerstvost GoPay webhooku"
          description={`Hranice čerstvosti je ${WEBHOOK_FRESHNESS_THRESHOLD_HOURS} hodin.`}
        />
        {webhook === null ? (
          <Notice variant="warning" role="status">
            Čerstvost webhooku je momentálně nedostupná.
          </Notice>
        ) : webhook.hasActivity ? (
          <>
            <dl className="flex flex-col">
              <InfoRow
                label="Poslední platebně řízená aktivita"
                value={toPragueDisplay(webhook.lastActivityAt)}
              />
              <InfoRow label="Stav" value={webhook.stale ? 'zastaralé' : 'čerstvé'} />
            </dl>
            {webhook.isProxy ? (
              <Notice variant="neutral" role="note">
                Jde o odvozenou (proxy) hodnotu — nejnovější změna předplatného nebo platby, nikoli
                dedikovaný záznam přijetí webhooku.
              </Notice>
            ) : null}
          </>
        ) : (
          <Notice variant="warning" role="status">
            Bez zaznamenané platebně řízené aktivity.
          </Notice>
        )}
      </Card>

      {/* Sekce: provozní metriky (R23). */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Provozní metriky"
      >
        <SectionHeading title="Provozní metriky" />
        {metrics.db ? (
          <dl className="flex flex-col">
            <InfoRow label="Počet podniků" value={String(metrics.db.businesses)} />
            <InfoRow label="Počet rezervací" value={String(metrics.db.reservations)} />
            <InfoRow label="Počet klientů" value={String(metrics.db.clients)} />
          </dl>
        ) : (
          <Notice variant="warning" role="status">
            Metriky databáze jsou momentálně nedostupné.
          </Notice>
        )}
        <dl className="flex flex-col">
          <InfoRow
            label="Velikost úložiště"
            value={metrics.storage.available ? `${metrics.storage.bytes} B` : 'nedostupné'}
          />
        </dl>
      </Card>

      {/* Sekce: konfigurace (R6, R7, R8) — pouze přítomnost klíčů, NIKDY hodnoty. */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Konfigurace"
      >
        <SectionHeading
          title="Konfigurace"
          description="Zobrazuje pouze přítomnost proměnných prostředí, nikdy jejich hodnoty."
        />
        <dl className="flex flex-col">
          <InfoRow label="Úroveň logování" value={configReport.logLevel} />
        </dl>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
                <th className="px-5 py-3 font-semibold">Proměnná prostředí</th>
                <th className="px-5 py-3 font-semibold">Stav</th>
              </tr>
            </thead>
            <tbody>
              {configReport.env.map((entry) => (
                <tr
                  key={entry.key}
                  className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                >
                  <td className="px-5 py-3 font-mono text-xs text-[var(--color-slate-text)]">
                    {entry.key}
                  </td>
                  <td className="px-5 py-3 text-[var(--color-slate-text)]">
                    {entry.isSet ? 'nastaveno' : 'nenastaveno'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Notice variant="neutral" role="note">
          {configReport.logLocationInfo}
        </Notice>
      </Card>

      {/* Sekce: logy & hranice auditu (R9). */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Logy a auditní stopa"
      >
        <SectionHeading title="Logy a auditní stopa" />
        <p className="text-sm text-[var(--color-slate-text)]">
          Auditní stopa administrátorských akcí je <strong>append-only</strong> — záznamy nelze
          z rozhraní upravovat ani mazat. Aplikační logy nejsou perzistentní: odcházejí do výstupu
          konzole (Vercel logy / log drains) a aplikace je neukládá ani nemaže.
        </p>
        <div>
          <Link
            href="/admin/audit"
            className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
          >
            Otevřít auditní stopu (/admin/audit)
          </Link>
        </div>
      </Card>

      {/* Sekce: revalidace cache (R10). */}
      <RevalidatePanel />

      {/* Sekce: cron monitor — poslední běh + rozvrh + příští běh + drift (R11, R24). */}
      <Card
        as="section"
        className="flex flex-col gap-[var(--spacing-16)] border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Monitor cron úloh"
      >
        <SectionHeading title="Monitor cron úloh" />

        <Notice variant={hasDrift ? 'warning' : 'neutral'} role="status">
          {hasDrift
            ? 'Zjištěn drift rozvrhu cron úloh oproti konfiguraci.'
            : 'Rozvrh cron úloh odpovídá konfiguraci (žádný drift).'}
        </Notice>

        {cronStatuses === null ? (
          <Notice variant="warning" role="status">
            Stav cron úloh je momentálně nedostupný.
          </Notice>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
                <th className="px-5 py-3 font-semibold">Úloha</th>
                <th className="px-5 py-3 font-semibold">Rozvrh</th>
                <th className="px-5 py-3 font-semibold">Příští běh</th>
                <th className="px-5 py-3 font-semibold">Poslední běh</th>
                <th className="px-5 py-3 font-semibold">Stav</th>
              </tr>
            </thead>
            <tbody>
              {cronJobs.map((job) => {
                const schedule = CRON_SCHEDULE_MAP[job];
                let nextRun = '—';
                try {
                  nextRun = toPragueDisplay(computeNextRun(schedule, now).toISOString());
                } catch {
                  nextRun = 'nedostupné';
                }

                const status = cronStatusByJob.get(job);
                // Bez monitoru zobrazíme „nedostupné", bez záznamu „bez běhu".
                const lastRunText =
                  cronStatuses === null
                    ? 'nedostupné'
                    : status && status.lastRun
                      ? toPragueDisplay(status.lastRun.startedAt)
                      : 'bez zaznamenaného běhu';
                const stateText =
                  cronStatuses === null
                    ? 'nedostupné'
                    : status && status.lastRun
                      ? `${CRON_RUN_STATUS_LABEL[status.lastRun.status]} (${CRON_TRIGGER_LABEL[status.lastRun.trigger]})`
                      : '—';

                return (
                  <tr
                    key={job}
                    className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                  >
                    <td className="px-5 py-3 font-medium text-[var(--color-slate-text)]">{job}</td>
                    <td className="px-5 py-3 font-mono text-xs text-[var(--color-slate-text)]">
                      {schedule}
                    </td>
                    <td className="px-5 py-3 text-[var(--color-slate-text)]">{nextRun}</td>
                    <td className="px-5 py-3 text-[var(--color-slate-text)]">{lastRunText}</td>
                    <td className="px-5 py-3 text-[var(--color-slate-text)]">{stateText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sekce: retence běhů cronů (R19). */}
      <PruneCronRunsPanel />

      {/* Sekce: ruční spuštění cronu (R12). */}
      <CronTriggerPanel />

      {/* Sekce: testovací e-mail (R22). */}
      <TestEmailPanel />
    </div>
  );
}
