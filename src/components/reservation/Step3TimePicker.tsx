'use client';

import { Button, Notice } from '@/components/ui';

/**
 * Krok 3 — výběr času (R6.1–R6.3).
 *
 * Zobrazuje dostupné počáteční časy ve vzestupném pořadí (řazení zajišťuje
 * controller) v lokálním formátu „HH:MM" (Europe/Prague). Výběr právě jednoho
 * času je podmínkou přechodu do kroku 4 (R6.2). `conflictMessage` se zobrazí po
 * návratu z kroku 5 při obsazeném termínu (R9.4).
 */
type Step3TimePickerProps = {
  slots: string[];
  time: string;
  conflictMessage: string | null;
  onSelect: (time: string) => void;
  onNext: () => void;
  onBack: () => void;
};

export function Step3TimePicker({
  slots,
  time,
  conflictMessage,
  onSelect,
  onNext,
  onBack,
}: Step3TimePickerProps) {
  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">Výběr času</h2>

      {conflictMessage ? (
        <Notice role="alert" variant="error">
          {conflictMessage}
        </Notice>
      ) : null}

      <ul className="grid grid-cols-3 gap-[8px] sm:grid-cols-4">
        {slots.map((slot) => {
          const selected = slot === time;
          return (
            <li key={slot}>
              <button
                type="button"
                onClick={() => onSelect(slot)}
                aria-pressed={selected}
                className={[
                  'flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-buttons)] border px-[12px] py-[8px] text-[16px] transition-colors',
                  selected
                    ? 'border-[var(--color-action-violet)] bg-[var(--color-action-violet)] text-[var(--color-canvas-white)]'
                    : 'border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
                ].join(' ')}
              >
                {slot}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-[8px] sm:flex-row sm:justify-between">
        <Button variant="ghost" className="min-h-[44px] w-full sm:w-auto" onClick={onBack}>
          Zpět
        </Button>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={onNext} disabled={!time}>
          Pokračovat
        </Button>
      </div>
    </div>
  );
}
