'use client';

import { Button, Input, Notice } from '@/components/ui';

import type { SlotsState } from './types';

/**
 * Krok 2 — výběr data + načtení dostupných termínů (R5.1–R5.5).
 *
 * Datum se vybírá nativním `<input type="date">` s `min` = dnešní datum v
 * Europe/Prague, takže minulé dny nelze v kalendáři zvolit (R5.1, R5.2).
 * Samotné volání `getAvailableSlots` a stav načítání drží controller — sem
 * přichází jen `slotsState` a případná chybová hláška. Přechod do kroku 3 je
 * možný jen při `slotsState === 'loaded'` (R5.4, R5.5).
 */
type Step2DatePickerProps = {
  date: string;
  /** Dnešní datum v Europe/Prague (`YYYY-MM-DD`) jako spodní mez výběru. */
  today: string;
  slotsState: SlotsState;
  errorMessage: string | null;
  onDateChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
};

const EMPTY_MESSAGE = 'V tento den nejsou dostupné žádné termíny. Zkuste jiný termín.';

export function Step2DatePicker({
  date,
  today,
  slotsState,
  errorMessage,
  onDateChange,
  onNext,
  onBack,
}: Step2DatePickerProps) {
  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">Výběr data</h2>

      <div className="flex flex-col gap-[8px]">
        <label className="text-[14px] font-medium text-[var(--color-slate-text)]" htmlFor="date">
          Datum
        </label>
        <Input
          id="date"
          type="date"
          min={today}
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className="min-h-[44px]"
        />
      </div>

      {slotsState === 'loading' ? (
        <Notice aria-live="polite">Načítám dostupné termíny…</Notice>
      ) : null}

      {slotsState === 'empty' ? (
        <Notice role="status" aria-live="polite">
          {EMPTY_MESSAGE}
        </Notice>
      ) : null}

      {slotsState === 'error' && errorMessage ? (
        <Notice role="alert" variant="error">
          {errorMessage}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-[8px] sm:flex-row sm:justify-between">
        <Button variant="ghost" className="min-h-[44px] w-full sm:w-auto" onClick={onBack}>
          Zpět
        </Button>
        <Button
          className="min-h-[44px] w-full sm:w-auto"
          onClick={onNext}
          disabled={slotsState !== 'loaded'}
        >
          Pokračovat
        </Button>
      </div>
    </div>
  );
}
