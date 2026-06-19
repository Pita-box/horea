'use client';

import { useMemo, useState } from 'react';

import { pragueDateOf } from '@/lib/reservations/calendar';
import type { MonthGrid, OccupancyPoint } from '@/lib/reservations/occupancy';
import type { ReservationListItem } from '@/lib/reservations/types';

import { MonthCalendar, type CalendarSelection } from './MonthCalendar';
import { OccupancyChart } from './OccupancyChart';
import { TableView } from './TableView';

type OccupancyViewProps = {
  grid: MonthGrid;
  points: OccupancyPoint[];
  /** Všechny rezervace zobrazeného měsíce (libovolný stav). */
  reservations: ReservationListItem[];
  today: string;
  /** Odkazy na sousední měsíce (zachovávají filtry a pohled). */
  prevHref: string;
  nextHref: string;
};

/** Seřadí dva dny vzestupně; `end` může chybět (jednodenní výběr). */
function selectionBounds(selection: CalendarSelection): { lo: string; hi: string } | null {
  if (!selection.start) {
    return null;
  }
  const end = selection.end ?? selection.start;
  return selection.start <= end
    ? { lo: selection.start, hi: end }
    : { lo: end, hi: selection.start };
}

function formatRange(bounds: { lo: string; hi: string }): string {
  const cs = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${Number(d)}. ${Number(m)}. ${y}`;
  };
  return bounds.lo === bounds.hi ? cs(bounds.lo) : `${cs(bounds.lo)} – ${cs(bounds.hi)}`;
}

/**
 * Pohled „Obsazenost": vlevo měsíční kalendář (výběr dne / rozsahu) a seznam
 * rezervací filtrovaný dle výběru, vpravo graf denní obsazenosti v %. Výběr drží
 * tento klientský komponent nad daty měsíce načtenými serverem; přepínání měsíce
 * je přes odkazy v kalendáři (URL `anchor`).
 */
export function OccupancyView({
  grid,
  points,
  reservations,
  today,
  prevHref,
  nextHref,
}: OccupancyViewProps) {
  const [selection, setSelection] = useState<CalendarSelection>({ start: null, end: null });

  function handleSelectDay(dateISO: string) {
    setSelection((current) => {
      // Nový výběr: žádný začátek, nebo už hotový rozsah → začni znovu.
      if (!current.start || current.end) {
        return { start: dateISO, end: null };
      }
      // Druhý klik dokončí rozsah (seřazeno); stejný den = jednodenní výběr.
      return dateISO < current.start
        ? { start: dateISO, end: current.start }
        : { start: current.start, end: dateISO };
    });
  }

  const bounds = selectionBounds(selection);

  // Mapa obsazenosti dle data pro tečky pod dny v kalendáři.
  const occupancyByDate = useMemo(() => {
    const map: Record<string, { occupancyPct: number; reservationCount: number }> = {};
    for (const point of points) {
      map[point.dateISO] = {
        occupancyPct: point.occupancyPct,
        reservationCount: point.reservationCount,
      };
    }
    return map;
  }, [points]);

  const filteredReservations = useMemo(() => {
    if (!bounds) {
      return reservations;
    }
    return reservations.filter((reservation) => {
      const date = pragueDateOf(reservation.startsAt);
      return date >= bounds.lo && date <= bounds.hi;
    });
  }, [reservations, bounds]);

  // Průměrná obsazenost vybraného období (nebo celého měsíce bez výběru).
  const averageOccupancy = useMemo(() => {
    const relevant = bounds
      ? points.filter((point) => point.dateISO >= bounds.lo && point.dateISO <= bounds.hi)
      : points;
    if (relevant.length === 0) {
      return 0;
    }
    const sum = relevant.reduce((total, point) => total + point.occupancyPct, 0);
    return Math.round(sum / relevant.length);
  }, [points, bounds]);

  return (
    <div className="flex flex-col gap-6">
      {/* Horní řada — kalendář a graf jako dvě stejně vysoké karty. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
        <MonthCalendar
          grid={grid}
          selection={selection}
          today={today}
          prevHref={prevHref}
          nextHref={nextHref}
          occupancyByDate={occupancyByDate}
          onSelectDay={handleSelectDay}
        />

        <div className="flex flex-col gap-4 rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[24px]">
          <div className="flex items-center justify-between">
            <h3 className="font-[var(--font-polysans)] text-[20px] font-semibold text-[var(--color-rich-violet)]">
              Obsazenost
            </h3>
            <span className="rounded-[var(--radius-badges)] bg-[color-mix(in_srgb,var(--color-action-violet)_12%,white)] px-3 py-1 text-sm font-semibold text-[var(--color-action-violet)]">
              ⌀ {averageOccupancy} %
            </span>
          </div>
          <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
            Denní obsazenost = rezervovaný čas ku otevírací době (%).
          </p>
          {/* Graf vyplní zbytek výšky karty a vertikálně se vycentruje. */}
          <div className="flex flex-1 items-center">
            <OccupancyChart points={points} selection={selection} />
          </div>
        </div>
      </div>

      {/* Filtrovaný seznam rezervací pod kartami (plná šířka). */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-[var(--color-slate-text)]">
            {bounds ? formatRange(bounds) : 'Celý měsíc'}
            <span className="ml-2 text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
              ({filteredReservations.length})
            </span>
          </p>
          {bounds ? (
            <button
              type="button"
              onClick={() => setSelection({ start: null, end: null })}
              className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
            >
              Zrušit výběr
            </button>
          ) : null}
        </div>

        <TableView reservations={filteredReservations} />
      </div>
    </div>
  );
}
