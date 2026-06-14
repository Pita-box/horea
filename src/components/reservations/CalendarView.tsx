import Link from 'next/link';

import { Card } from '@/components/ui/card';
import {
  addDays,
  buildReservationsHref,
  pragueDateOf,
  pragueTimeOf,
  todayPragueDate,
  type CalendarDay,
  type CalendarMode,
} from '@/lib/reservations/calendar';
import type { ReservationFilters } from '@/lib/reservations/filters';
import type { ReservationListItem } from '@/lib/reservations/types';

type CalendarViewProps = {
  reservations: ReservationListItem[];
  mode: CalendarMode;
  anchor: string;
  days: CalendarDay[];
  filters: ReservationFilters;
};

/** Neaktivní stavy (R4.5) — vizuálně ztlumené a přeškrtnuté. */
const INACTIVE_STATUSES = new Set(['rejected', 'cancelled']);

/**
 * Kalendářní pohled na rezervace (R4).
 *
 * Server komponenta: navigace i přepínání režimu jsou `<Link>` měnící pouze
 * parametry pohledu v URL (`view`, `mode`, `anchor`), takže filtry statusu a
 * služby zůstávají zachované (R4.6). Každá rezervace je blok `starts_at`–`ends_at`
 * v Europe/Prague s názvem služby a jménem klienta (R4.1, R4.2), odkazující na
 * detail (R4.3). Stavy `rejected`/`cancelled` jsou vizuálně odlišené (R4.5).
 *
 * Mobile-first: v denním režimu jeden sloupec, v týdenním vodorovně
 * scrollovatelná mřížka sedmi dní. Odkazy mají dotykové cíle ≥ 44 px.
 */
export function CalendarView({ reservations, mode, anchor, days, filters }: CalendarViewProps) {
  const today = todayPragueDate();

  // Rezervace rozdělené do dní podle pražského data počátku.
  const byDay = new Map<string, ReservationListItem[]>();
  for (const day of days) {
    byDay.set(day.date, []);
  }
  for (const reservation of reservations) {
    const dayKey = pragueDateOf(reservation.startsAt);
    byDay.get(dayKey)?.push(reservation);
  }

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

  const navLinkClass =
    'inline-flex h-11 min-w-11 items-center justify-center rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] px-4 text-sm font-medium text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]';

  function modeLinkClass(active: boolean): string {
    return [
      'inline-flex h-11 items-center justify-center rounded-[var(--radius-buttons)] px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]',
      active
        ? 'bg-[var(--color-action-violet)] text-[var(--color-canvas-white)]'
        : 'border border-[var(--color-border-vychozi)] text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
    ].join(' ');
  }

  return (
    <Card className="space-y-5 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Link href={prevHref} className={navLinkClass} aria-label="Předchozí období">
            ←
          </Link>
          <Link href={todayHref} className={navLinkClass}>
            {mode === 'week' ? 'Tento týden' : 'Dnes'}
          </Link>
          <Link href={nextHref} className={navLinkClass} aria-label="Následující období">
            →
          </Link>
        </div>

        <div className="flex items-center gap-2">
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

      <div className={mode === 'week' ? 'overflow-x-auto' : ''}>
        <div
          className={
            mode === 'week'
              ? 'grid min-w-[44rem] grid-cols-7 gap-3'
              : 'grid grid-cols-1 gap-3'
          }
        >
          {days.map((day) => {
            const dayReservations = (byDay.get(day.date) ?? []).slice().sort((a, b) =>
              a.startsAt.localeCompare(b.startsAt),
            );
            const isToday = day.date === today;

            return (
              <section
                key={day.date}
                className="flex flex-col gap-2 rounded-[var(--radius-buttons)] bg-[var(--color-soft-gray-fill)] p-3"
              >
                <header
                  className={[
                    'text-sm font-semibold',
                    isToday
                      ? 'text-[var(--color-action-violet)]'
                      : 'text-[var(--color-rich-violet)]',
                  ].join(' ')}
                >
                  <span className="capitalize">{day.weekday}</span> {day.label}
                </header>

                {dayReservations.length === 0 ? (
                  <p className="py-2 text-xs text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                    Žádné rezervace
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {dayReservations.map((reservation) => {
                      const inactive = INACTIVE_STATUSES.has(reservation.status);
                      return (
                        <li key={reservation.id}>
                          <Link
                            href={`/dashboard/reservations/${reservation.id}`}
                            className={[
                              'flex min-h-11 flex-col justify-center gap-0.5 rounded-[var(--radius-lg)] border-l-4 bg-[var(--color-canvas-white)] px-3 py-2 transition-colors hover:bg-[var(--color-cloud-mist)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-action-violet)]',
                              inactive
                                ? 'border-l-[color-mix(in_srgb,var(--color-slate-text)_30%,white)] opacity-60 line-through'
                                : 'border-l-[var(--color-action-violet)]',
                            ].join(' ')}
                          >
                            <span className="text-xs font-semibold text-[var(--color-rich-violet)]">
                              {pragueTimeOf(reservation.startsAt)}–{pragueTimeOf(reservation.endsAt)}
                            </span>
                            <span className="text-sm font-medium text-[var(--color-slate-text)]">
                              {reservation.serviceName ?? '—'}
                            </span>
                            <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                              {reservation.clientName}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
