import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { Card } from '@/components/ui/card';
import { FilterBar } from '@/components/reservations/FilterBar';
import {
  addDays,
  buildReservationsHref,
  pragueDateOf,
  pragueTimeOf,
  todayPragueDate,
  type CalendarDay,
  type CalendarMode,
} from '@/lib/reservations/calendar';
import { buildMonthGrid, WEEKDAY_LABELS } from '@/lib/reservations/occupancy';
import type { ReservationFilters } from '@/lib/reservations/filters';
import type { ReservationListItem, ServiceOption } from '@/lib/reservations/types';

type CalendarViewProps = {
  reservations: ReservationListItem[];
  mode: CalendarMode;
  anchor: string;
  days: CalendarDay[];
  filters: ReservationFilters;
  services: ServiceOption[];
};

/** Neaktivní stavy (R4.5) — vizuálně ztlumené a přeškrtnuté. */
const INACTIVE_STATUSES = new Set(['rejected', 'cancelled']);

/** Výška jedné hodiny v mřížce (px) — výchozí; jednotlivá hodina může narůst. */
const HOUR_PX = 64;
/** Minimální výška bloku rezervace, aby se vešel obsah (název + čas). */
const REQUIRED_EVENT_PX = 46;
/** Strop výšky jedné hodiny (px) — pojistka proti extrémně krátkým rezervacím. */
const MAX_ROW_PX = 200;
/** Výchozí rozsah hodin, když rezervace nediktují širší okno. */
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

/** Pastelové pozadí bloku rezervace (dekorativní tokeny design systému). */
const EVENT_PALETTE = [
  'bg-[var(--color-air-blue)]',
  'bg-[var(--color-lush-green)]',
  'bg-[var(--color-light-violet)]',
  'bg-[color-mix(in_srgb,var(--color-sunset-pink)_60%,white)]',
] as const;

function eventColorClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return EVENT_PALETTE[hash % EVENT_PALETTE.length];
}

/** „HH:mm" (Europe/Prague) → minuty od půlnoci. */
function minutesOf(iso: string): number {
  const [h, m] = pragueTimeOf(iso).split(':').map(Number);
  return h * 60 + m;
}

type PositionedEvent = {
  reservation: ReservationListItem;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
};

/**
 * Rozmístí události dne do mřížky: svislá pozice/výška přes `pxForMinute`
 * (proměnná výška hodin), vodorovné rozdělení do „lanes" při překryvu (greedy;
 * šířka = 1 / počet drah daného dne).
 */
function layoutDay(
  events: ReservationListItem[],
  pxForMinute: (absMinute: number) => number,
): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const laneEnds: number[] = [];
  const laneById = new Map<string, number>();

  for (const event of sorted) {
    const start = minutesOf(event.startsAt);
    const end = Math.max(start + 15, minutesOf(event.endsAt));
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    laneById.set(event.id, lane);
  }

  const lanes = Math.max(1, laneEnds.length);
  return sorted.map((event) => {
    const start = minutesOf(event.startsAt);
    const end = Math.max(start + 15, minutesOf(event.endsAt));
    const lane = laneById.get(event.id) ?? 0;
    const top = pxForMinute(start);
    return {
      reservation: event,
      top,
      height: Math.max(26, pxForMinute(end) - top),
      leftPct: (lane / lanes) * 100,
      widthPct: 100 / lanes,
    };
  });
}

/** Levý sloupec: mini měsíční kalendář s navigací na týden. */
function MiniMonth({
  anchor,
  days,
  mode,
  filters,
  today,
}: {
  anchor: string;
  days: CalendarDay[];
  mode: CalendarMode;
  filters: ReservationFilters;
  today: string;
}) {
  const grid = buildMonthGrid(anchor);
  const activeDays = new Set(days.map((day) => day.date));

  return (
    <Card className="border border-[var(--color-border-vychozi)] p-[var(--spacing-20)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-[var(--font-polysans)] text-base font-semibold capitalize text-[var(--color-rich-violet)]">
          {grid.title}
        </span>
        <div className="flex items-center gap-1">
          <Link
            href={buildReservationsHref(filters, { view: 'calendar', mode, anchor: grid.prevAnchor })}
            aria-label="Předchozí měsíc"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
          >
            <IconChevronLeft size={16} stroke={2} />
          </Link>
          <Link
            href={buildReservationsHref(filters, { view: 'calendar', mode, anchor: grid.nextAnchor })}
            aria-label="Další měsíc"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
          >
            <IconChevronRight size={16} stroke={2} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
        {grid.weeks.flat().map((cell) => {
          if (!cell.inMonth) {
            return (
              <span
                key={cell.dateISO}
                aria-hidden="true"
                className="py-1 text-[color-mix(in_srgb,var(--color-slate-text)_28%,white)]"
              >
                {cell.day}
              </span>
            );
          }
          const isActive = activeDays.has(cell.dateISO);
          const isToday = cell.dateISO === today;
          return (
            <Link
              key={cell.dateISO}
              href={buildReservationsHref(filters, {
                view: 'calendar',
                mode,
                anchor: cell.dateISO,
              })}
              className={[
                'mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                isToday
                  ? 'bg-[var(--color-action-violet)] font-semibold text-white'
                  : isActive
                    ? 'bg-[var(--color-light-violet)] font-medium text-[var(--color-rich-violet)]'
                    : 'text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
              ].join(' ')}
            >
              {cell.day}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/** Zvýrazněná karta nejbližší nadcházející rezervace. */
function NextEventCard({ reservations }: { reservations: ReservationListItem[] }) {
  const nowIso = new Date().toISOString();
  const active = reservations
    .filter((reservation) => !INACTIVE_STATUSES.has(reservation.status))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const next = active.find((reservation) => reservation.startsAt >= nowIso) ?? active[0] ?? null;

  if (!next) {
    return null;
  }

  const [datePart] = pragueDateOf(next.startsAt).split('T');
  const [y, m, d] = datePart.split('-');

  return (
    <Card className="bg-[var(--color-action-violet)] p-[var(--spacing-20)] text-white">
      <p className="text-xs font-medium text-[color-mix(in_srgb,white_80%,var(--color-action-violet))]">
        Nejbližší rezervace
      </p>
      <p className="mt-1 font-[var(--font-polysans)] text-lg font-semibold leading-tight">
        {next.serviceName ?? 'Rezervace'}
      </p>
      <p className="mt-2 text-sm text-[color-mix(in_srgb,white_88%,var(--color-action-violet))]">
        {Number(d)}. {Number(m)}. {y} · {pragueTimeOf(next.startsAt)}–{pragueTimeOf(next.endsAt)}
      </p>
      <p className="text-sm text-[color-mix(in_srgb,white_80%,var(--color-action-violet))]">
        {next.clientName}
      </p>
      <Link
        href={`/dashboard/reservations/${next.id}`}
        className="mt-3 inline-flex h-9 items-center rounded-[var(--radius-buttons)] bg-white px-4 text-sm font-semibold text-[var(--color-action-violet)] transition-opacity hover:opacity-90"
      >
        Otevřít detail
      </Link>
    </Card>
  );
}

/**
 * Kalendářní pohled na rezervace (R4) — layout se dvěma sloupci: vlevo mini
 * měsíční kalendář, karta nejbližší rezervace a filtry; vpravo časová mřížka
 * (hodiny × dny) s bloky rezervací umístěnými dle `starts_at`–`ends_at`
 * v Europe/Prague. Navigace i přepínání režimu mění jen parametry pohledu v URL
 * (`view`, `mode`, `anchor`), takže filtry zůstávají zachované (R4.6). Bloky
 * odkazují na detail (R4.3); `rejected`/`cancelled` jsou odlišené (R4.5).
 */
export function CalendarView({
  reservations,
  mode,
  anchor,
  days,
  filters,
  services,
}: CalendarViewProps) {
  const today = todayPragueDate();

  // Rezervace rozdělené do dní podle pražského data počátku.
  const byDay = new Map<string, ReservationListItem[]>();
  for (const day of days) {
    byDay.set(day.date, []);
  }
  for (const reservation of reservations) {
    byDay.get(pragueDateOf(reservation.startsAt))?.push(reservation);
  }

  // Rozsah hodin mřížky podle rezervací (rozšířený o výchozí okno).
  let minMinutes = Infinity;
  let maxMinutes = -Infinity;
  for (const reservation of reservations) {
    minMinutes = Math.min(minMinutes, minutesOf(reservation.startsAt));
    maxMinutes = Math.max(maxMinutes, minutesOf(reservation.endsAt));
  }
  const startHour = Number.isFinite(minMinutes)
    ? Math.min(DEFAULT_START_HOUR, Math.floor(minMinutes / 60))
    : DEFAULT_START_HOUR;
  const endHour = Number.isFinite(maxMinutes)
    ? Math.max(DEFAULT_END_HOUR, Math.ceil(maxMinutes / 60))
    : DEFAULT_END_HOUR;
  const spans = endHour - startHour;

  // Výška každé hodiny (řádku). Krátká rezervace (< 60 min) v rámci jedné hodiny
  // řádek zvýší, aby se její obsah (název + čas) vešel — strop MAX_ROW_PX.
  const rowHeights = Array.from({ length: spans }, () => HOUR_PX);
  for (const reservation of reservations) {
    const start = minutesOf(reservation.startsAt);
    const end = Math.max(start + 15, minutesOf(reservation.endsAt));
    const relative = start - startHour * 60;
    const span = Math.floor(relative / 60);
    if (span < 0 || span >= spans) {
      continue;
    }
    const duration = end - start;
    const withinSingleHour = end <= startHour * 60 + (span + 1) * 60;
    if (withinSingleHour && duration < 60) {
      const needed = Math.min(MAX_ROW_PX, Math.ceil((REQUIRED_EVENT_PX * 60) / duration));
      rowHeights[span] = Math.max(rowHeights[span], needed);
    }
  }

  const rowTops: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < spans; i += 1) {
    rowTops.push(accumulated);
    accumulated += rowHeights[i];
  }
  const gridHeight = accumulated;

  /** Pražská minuta od půlnoci → svislá pozice v px (proměnná výška hodin). */
  function pxForMinute(absMinute: number): number {
    const relative = absMinute - startHour * 60;
    if (relative <= 0) {
      return 0;
    }
    const span = Math.floor(relative / 60);
    if (span >= spans) {
      return gridHeight;
    }
    const within = relative - span * 60;
    return rowTops[span] + (within / 60) * rowHeights[span];
  }

  // Hodinové popisky + jejich svislá pozice (začátek řádku; poslední = konec mřížky).
  const hourMarks = Array.from({ length: spans + 1 }, (_, index) => ({
    hour: startHour + index,
    top: index < spans ? rowTops[index] : gridHeight,
  }));

  const step = mode === 'week' ? 7 : 1;
  const prevHref = buildReservationsHref(filters, {
    view: 'calendar',
    mode,
    anchor: addDays(anchor, -step),
  });
  const nextHref = buildReservationsHref(filters, {
    view: 'calendar',
    mode,
    anchor: addDays(anchor, step),
  });
  const todayHref = buildReservationsHref(filters, { view: 'calendar', mode, anchor: today });

  const navIconClass =
    'flex h-9 w-9 items-center justify-center rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-soft-gray-fill)]';

  function modeLinkClass(active: boolean): string {
    return [
      'inline-flex h-9 items-center justify-center rounded-[var(--radius-buttons)] px-4 text-sm font-medium transition-colors',
      active
        ? 'bg-[var(--color-action-violet)] text-white'
        : 'text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
    ].join(' ');
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
      {/* Levý sloup: mini kalendář, nejbližší rezervace, filtry. */}
      <div className="flex flex-col gap-6">
        <MiniMonth anchor={anchor} days={days} mode={mode} filters={filters} today={today} />
        <NextEventCard reservations={reservations} />
        <FilterBar filters={filters} services={services} />
      </div>

      {/* Pravý sloup: hlavička + časová mřížka. */}
      <Card className="border border-[var(--color-border-vychozi)] p-[var(--spacing-20)]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Link href={prevHref} className={navIconClass} aria-label="Předchozí období">
              <IconChevronLeft size={18} stroke={2} />
            </Link>
            <Link
              href={todayHref}
              className="inline-flex h-9 items-center rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] px-4 text-sm font-medium text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-soft-gray-fill)]"
            >
              {mode === 'week' ? 'Tento týden' : 'Dnes'}
            </Link>
            <Link href={nextHref} className={navIconClass} aria-label="Následující období">
              <IconChevronRight size={18} stroke={2} />
            </Link>
          </div>
          <div className="flex items-center gap-1 rounded-[var(--radius-buttons)] bg-[var(--color-cloud-mist)] p-1">
            <Link
              href={buildReservationsHref(filters, { view: 'calendar', mode: 'day', anchor })}
              className={modeLinkClass(mode === 'day')}
              aria-current={mode === 'day' ? 'true' : undefined}
            >
              Den
            </Link>
            <Link
              href={buildReservationsHref(filters, { view: 'calendar', mode: 'week', anchor })}
              className={modeLinkClass(mode === 'week')}
              aria-current={mode === 'week' ? 'true' : undefined}
            >
              Týden
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-hidden">
          <div className={mode === 'week' ? 'min-w-[44rem]' : ''}>
            {/* Hlavička dní (zarovnaná s mřížkou, vlevo mezera pro osu hodin). */}
            <div className="flex border-b border-[var(--color-border-vychozi)]">
              <div className="w-14 shrink-0" aria-hidden="true" />
              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
              >
                {days.map((day) => {
                  const isToday = day.date === today;
                  return (
                    <div key={day.date} className="px-2 py-3 text-center">
                      <p className="text-xs uppercase tracking-wide text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                        {day.weekday}
                      </p>
                      <p
                        className={[
                          'mt-1 text-lg font-semibold',
                          isToday
                            ? 'text-[var(--color-action-violet)]'
                            : 'text-[var(--color-rich-violet)]',
                        ].join(' ')}
                      >
                        {day.label.replace(/\.$/, '').split('.')[0]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mřížka: osa hodin + sloupce dní s bloky. */}
            <div className="flex pt-3">
              <div className="relative w-14 shrink-0" style={{ height: gridHeight }}>
                {hourMarks.map(({ hour, top }) => (
                  <span
                    key={hour}
                    style={{ top }}
                    className="absolute right-2 -translate-y-1/2 text-xs text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]"
                  >
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                ))}
              </div>

              <div
                className="grid flex-1"
                style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
              >
                {days.map((day) => {
                  const positioned = layoutDay(byDay.get(day.date) ?? [], pxForMinute);
                  return (
                    <div
                      key={day.date}
                      className="relative border-l border-[var(--color-border-vychozi)]"
                      style={{ height: gridHeight }}
                    >
                      {/* Vodorovné linky hodin (na začátku každé hodiny kromě první). */}
                      {hourMarks.slice(1, -1).map(({ hour, top }) => (
                        <div
                          key={hour}
                          aria-hidden="true"
                          className="absolute inset-x-0 border-t border-[color-mix(in_srgb,var(--color-border-vychozi)_70%,white)]"
                          style={{ top }}
                        />
                      ))}

                      {positioned.map(({ reservation, top, height, leftPct, widthPct }) => {
                        const inactive = INACTIVE_STATUSES.has(reservation.status);
                        return (
                          <Link
                            key={reservation.id}
                            href={`/dashboard/reservations/${reservation.id}`}
                            style={{
                              top,
                              height,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                            }}
                            className={[
                              'absolute cursor-pointer overflow-hidden rounded-[var(--radius-lg)] px-2 py-1 text-left shadow-sm transition-all hover:z-10 hover:shadow-md hover:ring-2 hover:ring-inset hover:ring-[var(--color-action-violet)]',
                              inactive
                                ? 'bg-[var(--color-soft-gray-fill)] text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] line-through opacity-60'
                                : `${eventColorClass(reservation.id)} text-[var(--color-rich-violet)]`,
                            ].join(' ')}
                          >
                            <span className="block truncate text-xs font-semibold">
                              {reservation.serviceName ?? 'Rezervace'}
                            </span>
                            <span className="block truncate text-[11px] opacity-80">
                              {pragueTimeOf(reservation.startsAt)}–{pragueTimeOf(reservation.endsAt)}
                            </span>
                            {height >= 56 ? (
                              <span className="block truncate text-[11px] opacity-80">
                                {reservation.clientName}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
