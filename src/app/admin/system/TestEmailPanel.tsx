'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Notice } from '@/components/ui/notice';

import { sendTestEmail, type SendTestEmailResult } from './actions';

/**
 * Test_Email_Panel — klientské UI pro odeslání testovacího e-mailu (R22, R14, R15).
 *
 * Vlastnosti:
 *  - **Explicitní potvrzení** (R22.2, R15.2): první tlačítko odhalí krok potvrzení
 *    se dvěma akcemi (potvrdit / zrušit); samotné odeslání proběhne až po potvrzení.
 *  - **Bez cíle od klienta** (R22.5): volá `sendTestEmail()` zcela bez parametru —
 *    adresa se bere výhradně server-side z `HOREA_ADMIN_EMAIL`.
 *  - **`aria-live="polite"` region** (R14.3): výsledek se oznamuje asistivním
 *    technologiím textovým labelem, nikoli jen barvou (R14.1).
 *  - **Klávesová ovladatelnost** (R14.2): používá nativní `<button>` prvky.
 *  - **Bez PII** (R22.6): zobrazuje pouze text vrácený akcí (žádná adresa od klienta).
 */
export function TestEmailPanel() {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SendTestEmailResult | null>(null);
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
    startTransition(() => {
      // Žádný cíl od klienta — adresa je výhradně server-side (R22.5).
      void sendTestEmail().then(setResult);
    });
  }

  return (
    <Card as="section" className="flex flex-col gap-[var(--spacing-16)] p-[var(--card-padding)]">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
            Testovací e-mail
          </h2>
          <InfoTooltip text="Odešle zkušební e-mail na administrátorskou adresu pro ověření, že odesílání e-mailů funguje. Má krátký cooldown." />
        </div>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Odešle testovací e-mail na administrátorskou adresu pro ověření doručitelnosti.
        </p>
      </div>

      {confirming ? (
        <div className="flex flex-col gap-[var(--spacing-12)]">
          <p className="text-sm font-medium">
            Opravdu odeslat testovací e-mail na administrátorskou adresu?
          </p>
          <div className="flex flex-wrap gap-[var(--spacing-8)]">
            <Button onClick={handleConfirm} disabled={isPending}>
              Potvrdit odeslání
            </Button>
            <Button variant="ghost" onClick={handleCancel} disabled={isPending}>
              Zrušit
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button onClick={handleRequest} disabled={isPending}>
            {isPending ? 'Odesílám…' : 'Odeslat testovací e-mail'}
          </Button>
        </div>
      )}

      <div aria-live="polite">
        {result ? (
          <Notice
            role={result.ok ? 'status' : 'alert'}
            variant={resultVariant(result)}
          >
            {resultMessage(result)}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}

/** Notice varianta podle výsledku: úspěch → neutral, cooldown → warning, jinak error. */
function resultVariant(result: SendTestEmailResult): 'neutral' | 'warning' | 'error' {
  if (result.ok) {
    return 'neutral';
  }
  return result.reason === 'cooldown' ? 'warning' : 'error';
}

/** Textový label výsledku (R14.1, R22.6) — bez PII nad rámec toho, co vrací akce. */
function resultMessage(result: SendTestEmailResult): string {
  if (result.ok) {
    return 'Testovací e-mail byl odeslán na administrátorskou adresu.';
  }
  // Všechny chybové stavy (not_authorized, no_admin_email, cooldown, send_failed)
  // nesou hotový český text bez PII přímo z akce.
  return result.message;
}
