'use client';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import type { AvailabilitySettings, SettingKey } from '@/lib/settings/types';
import { shouldShowParallelToggle } from '@/lib/settings/visibility';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateSetting } from './actions';

// Vysvětlení důsledku zapnutí paralelních termínů (Requirement 5.4–5.5).
// V praxi je text vždy přítomný česky; logika níže pouze ošetřuje
// teoretickou nedostupnost lokalizace (Requirement 5.6–5.7).
const PARALLEL_SLOTS_EXPLANATION =
  'Po zapnutí přestane systém kontrolovat konflikty mezi rezervacemi. Ve stejný čas tak může ' +
  'vzniknout více rezervací najednou — za dostatečnou fyzickou kapacitu (personál, místa, ' +
  'vybavení) pak odpovídáte sami.';

const AUTO_APPROVE_DESCRIPTION =
  'Nové rezervace se schválí automaticky bez vašeho ručního potvrzení. Při vypnutí každou ' +
  'rezervaci schvalujete ručně.';

type SettingsFormProps = {
  initialSettings: AvailabilitySettings;
};

type ToggleProps = {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
};

function Toggle({ checked, disabled, id, label, onToggle }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={[
        'relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]',
        'disabled:pointer-events-none disabled:opacity-50',
        checked
          ? 'border-[var(--color-action-violet)] bg-[var(--color-action-violet)]'
          : 'border-[var(--color-input-border)] bg-[var(--color-soft-gray-fill)]',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block h-[18px] w-[18px] rounded-full bg-[var(--color-canvas-white)] shadow-sm transition-transform',
          checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  );
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<AvailabilitySettings>(initialSettings);
  const [confirmingParallel, setConfirmingParallel] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const explanationAvailable = PARALLEL_SLOTS_EXPLANATION.trim().length > 0;
  const showParallelToggle = shouldShowParallelToggle(
    explanationAvailable,
    values.allowParallelSlots,
  );

  function applySetting(key: SettingKey, value: boolean) {
    setMessage(null);

    startTransition(() => {
      void updateSetting(key, value).then((result) => {
        if (result.ok) {
          setValues((current) => ({ ...current, [key]: value }));
          setConfirmingParallel(false);
          router.refresh();
          return;
        }

        setMessage(result.message);
      });
    });
  }

  function handleParallelToggle() {
    if (values.allowParallelSlots) {
      // Vypnutí nevyžaduje potvrzení.
      applySetting('allowParallelSlots', false);
      return;
    }

    // Zapnutí (false → true): nejprve zobrazit vysvětlení a vyžádat potvrzení
    // ještě před uložením (Requirement 5.5).
    setConfirmingParallel(true);
  }

  function handleAutoApproveToggle() {
    applySetting('autoApproveReservations', !values.autoApproveReservations);
  }

  return (
    <div className="space-y-[var(--spacing-24)]">
      {message ? (
        <Notice role="alert" variant="error">
          {message}
        </Notice>
      ) : null}

      <section className="space-y-[var(--spacing-12)] border-b border-[var(--color-border-vychozi)] pb-[var(--spacing-24)]">
        <div className="flex items-start justify-between gap-[var(--spacing-16)]">
          <div className="space-y-1">
            <label
              className="block text-base font-semibold text-[var(--color-rich-violet)]"
              htmlFor="setting-auto-approve"
            >
              Automatické schvalování rezervací
            </label>
            <p className="text-sm leading-6 text-[var(--color-slate-text)]">
              {AUTO_APPROVE_DESCRIPTION}
            </p>
          </div>
          <Toggle
            id="setting-auto-approve"
            label="Automatické schvalování rezervací"
            checked={values.autoApproveReservations}
            disabled={isPending}
            onToggle={handleAutoApproveToggle}
          />
        </div>
      </section>

      {showParallelToggle ? (
        <section className="space-y-[var(--spacing-12)]">
          <div className="flex items-start justify-between gap-[var(--spacing-16)]">
            <div className="space-y-1">
              <label
                className="block text-base font-semibold text-[var(--color-rich-violet)]"
                htmlFor="setting-parallel-slots"
              >
                Paralelní termíny
              </label>
              {explanationAvailable ? (
                <p className="text-sm leading-6 text-[var(--color-slate-text)]">
                  {PARALLEL_SLOTS_EXPLANATION}
                </p>
              ) : null}
            </div>
            <Toggle
              id="setting-parallel-slots"
              label="Paralelní termíny"
              checked={values.allowParallelSlots}
              disabled={isPending || confirmingParallel}
              onToggle={handleParallelToggle}
            />
          </div>

          {confirmingParallel ? (
            <div className="space-y-[var(--spacing-12)] rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-soft-gray-fill)] p-[var(--spacing-16)]">
              <p className="text-sm font-semibold text-[var(--color-rich-violet)]">
                Opravdu chcete povolit paralelní termíny?
              </p>
              <p className="text-sm leading-6 text-[var(--color-slate-text)]">
                {PARALLEL_SLOTS_EXPLANATION}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  onClick={() => applySetting('allowParallelSlots', true)}
                  disabled={isPending}
                >
                  {isPending ? 'Ukládám...' : 'Povolit paralelní termíny'}
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmingParallel(false)}
                  disabled={isPending}
                >
                  Zrušit
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
