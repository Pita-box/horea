'use client';

import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { occupancyDotColor, type MonthGrid } from '@/lib/reservations/occupancy';

export type CalendarSelection = { start: string | null; end: string | null };

/** Obsazenost dne pro tečku pod číslem (jen dny s rezervacemi). */
export type DayOccupancy = { occupancyPct: number; reservationCount: number };

type MonthCalendarProps = {
  grid: MonthGrid;
  selection: CalendarSelection;
  /** Dnešní datum (`YYYY-MM-DD`, Europe/Prague) pro zvýraznění. */
  today: string;
  /** Odkazy na předchozí/další měsíc (mění URL `anchor`). */
  prevHref: string;
  nextHref: string;
  /** Obsazenost dle data — tečka se zobrazí jen u dnů s rezervacemi. */
  occupancyByDate?: Record<string, DayOccupancy>;
  onSelectDay: (dateISO: string) => void;
};

/** Je `date` mezi `start` a `end` (včetně)? Pořadí start/end nehraje roli. */
function inRange(date: string, start: string | null, end: string | null): boolean {
  if (!start || !end) {
    return date === start;
  }
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  return date >= lo && date <= hi;
}

/**
 * Měsíční kalendář pro výběr jednoho dne nebo rozsahu (Po-first).
 *
 * Stav výběru drží rodič (`OccupancyView`); klik volá `onSelectDay`. Dny mimo
 * zobrazený měsíc jsou tlumené a neklikatelné, aby výběr nevyšel mimo načtená
 * data měsíce. Měsíc se přepíná šipkami (server reload přes URL `anchor`).
 * Barvy/typografie z design systému.
 */
export function MonthCalendar({
  grid,
  selection,
  today,
  prevHref,
  nextHref,
  occupancyByDate,
  onSelectDay,
}: MonthCalendarProps) {
  const { start, end } = selection;

  return (
    <div className="flex flex-col gap-[16px] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[24px]">
      <div className="flex items-center justify-between">
        <h3 className="font-[var(--font-polysans)] text-[20px] font-semibold capitalize text-[var(--color-rich-violet)]">
          {grid.title}
        </h3>
        <div className="flex items-center gap-1">
          <Link
            href={prevHref}
            aria-label="Předchozí měsíc"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
          >
            <IconChevronLeft size={18} stroke={2} />
          </Link>
          <Link
            href={nextHref}
            aria-label="Další měsíc"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
          >
            <IconChevronRight size={18} stroke={2} />
          </Link>
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
            return (
              <span
                key={cell.dateISO}
                aria-hidden="true"
                className="flex h-10 items-center justify-center text-[14px] text-[color-mix(in_srgb,var(--color-slate-text)_28%,white)]"
              >
                {cell.day}
              </span>
            );
          }

          const isEndpoint = cell.dateISO === start || cell.dateISO === end;
          const isWithinRange = Boolean(start && end) && inRange(cell.dateISO, start, end);
          const isToday = cell.dateISO === today;
          const occ = occupancyByDate?.[cell.dateISO];
          const showDot = Boolean(occ && occ.reservationCount > 0);

          // Plynulý pruh rozsahu bez přesahu za koncové dny: koncová buňka má
          // pozadí jen na vnitřní polovině (směrem do rozsahu), takže pruh končí
          // pod kolečkem a nevykukuje vně. Střední dny mají plné pozadí.
          const lo = start && end ? (start <= end ? start : end) : null;
          const hi = start && end ? (start <= end ? end : start) : null;
          const isLo = isWithinRange && cell.dateISO === lo;
          const isHi = isWithinRange && cell.dateISO === hi;
          const rangeColor = 'var(--color-light-violet)';
          let rangeBackground: string | undefined;
          if (isWithinRange && lo !== hi) {
            if (isLo) {
              rangeBackground = `linear-gradient(to right, transparent 50%, ${rangeColor} 50%)`;
            } else if (isHi) {
              rangeBackground = `linear-gradient(to left, transparent 50%, ${rangeColor} 50%)`;
            } else {
              rangeBackground = rangeColor;
            }
          }

          return (
            <div
              key={cell.dateISO}
              className="flex h-10 items-center justify-center"
              style={rangeBackground ? { background: rangeBackground } : undefined}
            >
              <button
                type="button"
                onClick={() => onSelectDay(cell.dateISO)}
                aria-pressed={isEndpoint}
                className={[
                  'relative flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-medium transition-colors',
                  isEndpoint
                    ? 'bg-[var(--color-action-violet)] text-white'
                    : isToday
                      ? 'text-[var(--color-action-violet)] ring-1 ring-[var(--color-action-violet)]'
                      : isWithinRange
                        ? 'text-[var(--color-rich-violet)]'
                        : 'text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {cell.day}
                {showDot && occ ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-[3px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full"
                    style={{
                      backgroundColor: isEndpoint ? '#ffffff' : occupancyDotColor(occ.occupancyPct),
                    }}
                  />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
