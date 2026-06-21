'use client';

import { useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { DEFAULT_CRON_RETENTION_DAYS } from '@/lib/system/prune-cutoff';

import { pruneCronRuns, type PruneCronRunsResult } from './actions';

/**
 * Cron_Run_Pruner UI — klientský panel retence běhů `cron_runs` (R19, R14, R15).
 *
 * Vlastnosti:
 *  - **Destruktivní akce s explicitním dvoufázovým potvrzením** (R15.2): první
 *    tlačítko „Smazat staré běhy" odhalí krok potvrzení („Opravdu smazat?") se
 *    dvěma akcemi (potvrdit / zrušit); samotné smazání proběhne až po potvrzení.
 *    Krok potvrzení používá `Notice variant="warning"` (upozornění, ne chyba).
 *  - **Volitelná retence** (R19.2): textové pole pro počet dní; prázdná hodnota
 *    znamená výchozí {@link DEFAULT_CRON_RETENTION_DAYS} dní (akce dostane `undefined`).
 *  - **`aria-live="polite"` region** (R14.3): počet smazaných řádků nebo chyba se
 *    oznamuje asistivním technologiím textovým labelem, nikoli jen barvou (R14.1).
 *  - **Klávesová ovladatelnost** (R14.2): nativní `<button>` a `<input>` prvky.
 */
export function PruneCronRunsPanel() {
  const daysInputId = useId();
  const [days, setDays] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PruneCronRunsResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRequest() {
    setResult(null);
    setConfirming(true);
  }

  function handleCancel() {
    setConfirming(false);
  }

  function handleConfirm() {
    setConfirming(false);
    // Prázdné pole → výchozí retence server-side (R19.2).
    const trimmed = days.trim();
    const parsed = trimmed === '' ? undefined : Number(trimmed);
    startTransition(() => {
      void pruneCronRuns(parsed).then(setResult);
    });
  }

  return (
    <Card as="section" className="flex flex-col gap-[var(--spacing-16)] p-[var(--card-padding)]">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
            Retence běhů cronů
          </h2>
          <InfoTooltip text="Nevratně smaže staré záznamy běhů cronů starší než zadaný počet dní. Týká se jen historie běhů, ne auditní stopy." />
        </div>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Nevratně smaže staré záznamy běhů cronů starší než zadaný počet dní. Bez zadání se použije
          výchozí retence {DEFAULT_CRON_RETENTION_DAYS} dní.
        </p>
      </div>

      <div className="flex flex-col gap-[var(--spacing-4)]">
        <label htmlFor={daysInputId} className="text-sm font-medium text-[var(--color-slate-text)]">
          Retence (dní)
        </label>
        <Input
          id={daysInputId}
          type="number"
          min={1}
          inputMode="numeric"
          value={days}
          onChange={(event) => setDays(event.target.value)}
          placeholder={String(DEFAULT_CRON_RETENTION_DAYS)}
          disabled={isPending || confirming}
          className="max-w-[12rem]"
        />
      </div>

      {confirming ? (
        <div className="flex flex-col gap-[var(--spacing-12)]">
          <Notice variant="warning" role="alert">
            Opravdu smazat staré běhy cronů? Tuto akci nelze vrátit zpět.
          </Notice>
          <div className="flex flex-wrap gap-[var(--spacing-8)]">
            <Button onClick={handleConfirm} disabled={isPending}>
              Opravdu smazat
            </Button>
            <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
              Zrušit
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button onClick={handleRequest} disabled={isPending}>
            {isPending ? 'Mažu…' : 'Smazat staré běhy'}
          </Button>
        </div>
      )}

      <div aria-live="polite">
        {result ? (
          <Notice role={result.ok ? 'status' : 'alert'} variant={result.ok ? 'neutral' : 'error'}>
            {resultMessage(result)}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}

/** Textový label výsledku (R14.1, R19.4) — počet smazaných řádků nebo česká chyba. */
function resultMessage(result: PruneCronRunsResult): string {
  if (result.ok) {
    return `Smazáno starých běhů cronů: ${result.deleted}.`;
  }
  return result.message;
}
