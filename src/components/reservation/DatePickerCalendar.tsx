'use client';

import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { addMonths, buildMonthGrid } from '@/lib/reservations/occupancy';

type DatePickerCalendarProps = {
  /** Vybrané datum `YYYY-MM-DD`, nebo prázdné. */
  value: string;
  /** Nejdřívější volitelné datum `YYYY-MM-DD` (dnešek) — minulé dny jsou nedostupné. */
  min: string;
  onChange: (dateISO: string) => void;
};

/** `YYYY-MM` část kotvy pro porovnání měsíců. */
function monthKey(anchor: string): string {
  return anchor.slice(0, 7);
}

/**
 * Měsíční kalendář pro výběr JEDNOHO data v rezervačním formuláři (krok 2).
 *
 * Nahrazuje nativní `<input type="date">`. Stav měsíce drží lokálně (klient),
 * minulé dny i dny mimo zobrazený měsíc jsou nedostupné, výběr jednoho dne volá
 * `onChange`. Sdílí čistou logiku mřížky s pohledem „Obsazenost"
 * (`buildMonthGrid`). Barvy/typografie z design systému.
 */
export function DatePickerCalendar({ value, min, onChange }: DatePickerCalendarProps) {
  const [anchor, setAnchor] = useState(() => `${(value || min).slice(0, 7)}-01`);
  const grid = buildMonthGrid(anchor);

  // Do měsíců, které celé předcházejí dnešku, navigaci nepovolíme.
  const prevDisabled = monthKey(grid.anchor) <= monthKey(min);

  return (
    <div className="flex flex-col gap-[16px] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[20px]">
      <div className="flex items-center justify-between">
        <h3 className="font-[var(--font-polysans)] text-[18px] font-semibold capitalize text-[var(--color-rich-violet)]">
          {grid.title}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchor((current) => addMonths(current, -1))}
            disabled={prevDisabled}
            aria-label="Předchozí měsíc"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors enabled:hover:bg-[var(--color-soft-gray-fill)] disabled:opacity-40"
          >
            <IconChevronLeft size={18} stroke={2} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor((current) => addMonths(current, 1))}
            aria-label="Další měsíc"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
          >
            <IconChevronRight size={18} stroke={2} />
          </button>
        </div>
      </div>

      <div
        className="grid grid-cols-7 gap-y-1 text-center text-[13px] font-medium text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]"
        aria-hidden="true"
      >
        {grid.weekdayLabels.map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {grid.weeks.flat().map((cell) => {
          if (!cell.inMonth) {
            return <span key={cell.dateISO} aria-hidden="true" className="h-10" />;
          }

          const isPast = cell.dateISO < min;
          const isSelected = cell.dateISO === value;
          const isToday = cell.dateISO === min;

          return (
            <div key={cell.dateISO} className="flex h-10 items-center justify-center">
              <button
                type="button"
                data-date={cell.dateISO}
                disabled={isPast}
                onClick={() => onChange(cell.dateISO)}
                aria-pressed={isSelected}
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-medium transition-colors',
                  isSelected
                    ? 'bg-[var(--color-action-violet)] text-white'
                    : isPast
                      ? 'cursor-not-allowed text-[color-mix(in_srgb,var(--color-slate-text)_28%,white)]'
                      : isToday
                        ? 'text-[var(--color-action-violet)] ring-1 ring-[var(--color-action-violet)]'
                        : 'text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
