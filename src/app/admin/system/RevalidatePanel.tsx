'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Notice } from '@/components/ui/notice';
import {
  ALLOWED_PATHS,
  ALLOWED_TAGS,
  type RevalidateTarget,
} from '@/lib/system/cache-targets';

import { revalidateTarget, type RevalidateTargetResult } from './actions';

/**
 * Cache_Revalidator UI (feature `admin-system-tools`, R10.3, R14.1–R14.3, R15.2).
 *
 * Client komponenta „Revalidace cache": umožní vybrat cíl **výhradně z allowlistu**
 * ({@link ALLOWED_PATHS} jako `path`, {@link ALLOWED_TAGS} jako `tag`) — žádný volný
 * text (R10.5). Po výběru proběhne **dvoufázové explicitní potvrzení** (R15.2) a teprve
 * pak se volá server action {@link revalidateTarget}. Výsledek se oznamuje přes
 * `aria-live="polite"` region (R14.3) textovým labelem v {@link Notice} (úspěch/chyba,
 * ne jen barva — R14.1). Výběr i tlačítka jsou nativní prvky, takže jsou plně
 * ovladatelné klávesnicí (R14.2).
 */

/** Jedna položka výběru: stabilní `key` pro `<option>` plus samotný cíl revalidace. */
type TargetOption = { key: string; label: string; target: RevalidateTarget };

/** Sestaví položky výběru výhradně z allowlistu (R10.5) — cesty i tagy. */
function buildOptions(): TargetOption[] {
  const paths: TargetOption[] = ALLOWED_PATHS.map((value) => ({
    key: `path:${value}`,
    label: `Cesta: ${value}`,
    target: { kind: 'path', value },
  }));
  const tags: TargetOption[] = ALLOWED_TAGS.map((value) => ({
    key: `tag:${value}`,
    label: `Tag: ${value}`,
    target: { kind: 'tag', value },
  }));
  return [...paths, ...tags];
}

/** Český label cíle pro hlášku ve výsledku (R10.4, R15.3). */
function targetLabel(target: RevalidateTarget): string {
  return target.kind === 'path' ? `cestu ${target.value}` : `tag ${target.value}`;
}

export function RevalidatePanel() {
  const options = useMemo(buildOptions, []);
  const [selectedKey, setSelectedKey] = useState<string>(options[0]?.key ?? '');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RevalidateTargetResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = options.find((option) => option.key === selectedKey) ?? null;

  function handleRequest() {
    setResult(null);
    setConfirming(true);
  }

  function handleCancel() {
    setConfirming(false);
  }

  function handleConfirm() {
    if (!selected) {
      return;
    }
    setConfirming(false);
    const target = selected.target;
    startTransition(() => {
      void revalidateTarget(target).then(setResult);
    });
  }

  return (
    <Card as="section" className="flex flex-col gap-[var(--spacing-16)] p-[var(--card-padding)]">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
            Revalidace cache
          </h2>
          <InfoTooltip text="Ručně zneplatní cache pro vybranou stránku, aby se hned promítly změny. Vybírat lze jen z povolených cílů." />
        </div>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Cíleně zneplatní cache pro vybraný povolený cíl. Vybírat lze pouze
          z předem schválených cest a tagů.
        </p>
      </div>

      {options.length === 0 ? (
        <Notice variant="warning" role="status">
          Žádné cíle revalidace nejsou aktuálně k dispozici.
        </Notice>
      ) : (
        <>
          <div className="flex flex-col gap-[var(--spacing-4)]">
            <label
              htmlFor="revalidate-target"
              className="text-sm font-medium text-[var(--color-slate-text)]"
            >
              Cíl revalidace
            </label>
            <select
              id="revalidate-target"
              value={selectedKey}
              onChange={(event) => {
                setSelectedKey(event.target.value);
                setConfirming(false);
                setResult(null);
              }}
              disabled={isPending}
              className="rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-sm text-[var(--color-slate-text)]"
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {confirming && selected ? (
            <div className="flex flex-col gap-[var(--spacing-12)]">
              <p className="text-sm font-medium">
                Opravdu revalidovat {targetLabel(selected.target)}?
              </p>
              <div className="flex flex-wrap gap-[var(--spacing-8)]">
                <Button onClick={handleConfirm} disabled={isPending}>
                  Potvrdit revalidaci
                </Button>
                <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
                  Zrušit
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button onClick={handleRequest} disabled={isPending || !selected}>
                {isPending ? 'Revaliduji…' : 'Revalidovat cache'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* aria-live region: výsledek revalidace textovým labelem (R10.4, R14.1, R14.3). */}
      <div aria-live="polite">
        {result ? (
          <Notice role={result.ok ? 'status' : 'alert'} variant={result.ok ? 'neutral' : 'error'}>
            {result.ok
              ? `Cache pro ${targetLabel(result.target)} byla úspěšně revalidována.`
              : result.message}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}
