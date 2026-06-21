'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import type { ServiceStatus } from '@/lib/system/status';
import type { HealthReport } from '@/lib/system/health';

import { recheckHealth } from './actions';

/**
 * Health_Recheck_Action UI (feature `admin-system-tools`, R21.1–R21.3, R14.2, R14.3).
 *
 * Client komponenta „Zkontrolovat znovu": vykresluje agregovaný stav a tabulku
 * služeb z `initialReport` (server render) a tlačítkem volá server action
 * {@link recheckHealth}. Po úspěchu aktualizuje zobrazené stavy služeb i
 * `checkedAt` (R21.1, R21.2). Stavy se zobrazují **textovým labelem** (ne jen
 * barvou, R14.2) a změna se oznamuje přes `aria-live="polite"` region (R21.3,
 * R14.3). Tlačítko je nativní `<button>`, takže je plně ovladatelné klávesnicí.
 */

/** České labely per-service i agregovaného stavu (textový label, ne jen barva — R14.2). */
const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok: 'v pořádku',
  degraded: 'zhoršené',
  down: 'nedostupné',
};

function formatCheckedAt(iso: string): string {
  // Pevné pásmo Europe/Prague → deterministický výstup na serveru i klientovi.
  return new Date(iso).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

export function HealthRecheckButton({ initialReport }: { initialReport: HealthReport }) {
  const [report, setReport] = useState<HealthReport>(initialReport);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRecheck() {
    setError(null);
    startTransition(async () => {
      const result = await recheckHealth();
      if (result.ok) {
        setReport(result.report);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card
      as="section"
      className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
      aria-label="Stav služeb"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
          Stav služeb
        </h2>
        <Button onClick={handleRecheck} disabled={isPending}>
          {isPending ? 'Kontroluji…' : 'Zkontrolovat znovu'}
        </Button>
      </div>

      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}

      {/* aria-live region: po re-checku oznámí novou agregaci a čas kontroly (R21.3, R14.3). */}
      <div aria-live="polite" className="space-y-1">
        <p className="text-sm font-medium text-[var(--color-slate-text)]">
          Celkový stav: <span className="font-semibold">{STATUS_LABEL[report.aggregate]}</span>
        </p>
        <p className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
          Zkontrolováno: {formatCheckedAt(report.checkedAt)}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
              <th className="px-5 py-4 font-semibold">Služba</th>
              <th className="px-5 py-4 font-semibold">Stav</th>
              <th className="px-5 py-4 font-semibold">Latence</th>
            </tr>
          </thead>
          <tbody>
            {report.services.map((service) => (
              <tr
                key={service.service}
                className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
              >
                <td className="px-5 py-3 font-medium text-[var(--color-slate-text)]">
                  {service.label}
                </td>
                <td className="px-5 py-3 text-[var(--color-slate-text)]">
                  {STATUS_LABEL[service.status]}
                </td>
                <td className="px-5 py-3 text-[var(--color-slate-text)]">
                  {service.latencyMs === null ? '—' : `${service.latencyMs} ms`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
