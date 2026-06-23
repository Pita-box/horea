'use client';

import { Button, Notice } from '@/components/ui';

import { DatePickerCalendar } from './DatePickerCalendar';
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
  /** Combined_Duration vybraných služeb (min) — pro hlášku o příliš dlouhém bloku. */
  combinedDurationMinutes: number;
  /** Počet vybraných služeb — hláška o odebrání dává smysl jen při více službách. */
  serviceCount: number;
  onDateChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  /** Návrat na krok 1 (výběr služeb) z hlášky „blok se nevejde". */
  onAdjustServices: () => void;
};

const EMPTY_MESSAGE = 'V tento den nejsou dostupné žádné termíny. Zkuste jiný termín.';

export function Step2DatePicker({
  date,
  today,
  slotsState,
  errorMessage,
  combinedDurationMinutes,
  serviceCount,
  onDateChange,
  onNext,
  onBack,
  onAdjustServices,
}: Step2DatePickerProps) {
  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">Výběr data</h2>

      <DatePickerCalendar value={date} min={today} onChange={onDateChange} />

      {slotsState === 'loading' ? (
        <Notice aria-live="polite">Načítám dostupné termíny…</Notice>
      ) : null}

      {slotsState === 'empty' ? (
        <Notice role="status" aria-live="polite">
          {EMPTY_MESSAGE}
        </Notice>
      ) : null}

      {slotsState === 'locked' ? (
        <Notice role="status" aria-live="polite" variant="warning">
          Online rezervace nejsou u tohoto podniku aktuálně k dispozici.
        </Notice>
      ) : null}

      {slotsState === 'too_long' ? (
        <Notice role="status" aria-live="polite" variant="warning">
          <span className="block">
            Vybrané služby (celkem {combinedDurationMinutes} min) se do tohoto dne nevejdou.
            {serviceCount > 1
              ? ' Odeberte prosím některé služby, nebo zvolte jiný termín.'
              : ' Zvolte prosím jiný termín.'}
          </span>
          {serviceCount > 1 ? (
            <button
              type="button"
              onClick={onAdjustServices}
              className="mt-[8px] text-[14px] font-medium text-[var(--color-action-violet)] underline-offset-2 hover:underline"
            >
              Upravit výběr služeb
            </button>
          ) : null}
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
