import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Notice } from '@/components/ui/notice';
import { CalendarView } from '@/components/reservations/CalendarView';
import { OccupancyView } from '@/components/reservations/OccupancyView';
import { ReservationPillFilters } from '@/components/reservations/ReservationPillFilters';
import { fromPragueInput } from '@/lib/datetime';
import {
  buildReservationsHref,
  parseCalendarParams,
  periodBoundsUtc,
  periodDays,
  todayPragueDate,
  type CalendarDay,
} from '@/lib/reservations/calendar';
import {
  buildMonthGrid,
  computeDailyOccupancy,
  openMinutesByWeekday,
  type MonthGrid,
  type OccupancyPoint,
} from '@/lib/reservations/occupancy';
import {
  buildReservationQuery,
  parseReservationFilters,
  type ReservationFilters,
} from '@/lib/reservations/filters';
import type { ReservationListItem, ServiceOption } from '@/lib/reservations/types';
import type { AttendanceStatus, ReservationStatus } from '@/lib/reservations/labels';
import {
  reservationServiceLabel,
  type EmbeddedService,
  type ReservationServiceNameRow,
} from '@/lib/reservations/serviceLabel';
import { createClient } from '@/lib/supabase/server';

import { CreateReservationDialog } from './CreateReservationDialog';

const LOAD_ERROR = 'Rezervace se nepodařilo načíst. Zkuste to prosím znovu.';

// V Next 15 jsou `searchParams` Promise.
type ReservationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReservationServiceRow = ReservationServiceNameRow;

type ReservationRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  services: EmbeddedService;
  reservation_services: ReservationServiceRow[] | null;
};

function mapRow(row: ReservationRow): ReservationListItem {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    attendance: row.attendance,
    serviceName: reservationServiceLabel(row.reservation_services, row.services),
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
  };
}

/**
 * Posbírá id rezervací podniku, jejichž `Reservation_Service_Set` má neprázdný
 * průnik s vyfiltrovanými službami (R3.5/R4.6). Filtr služby NELZE dělat přes
 * denormalizovaný sloupec `reservations.service_id` — ten u kombinovaných
 * rezervací neodráží celou množinu služeb, takže by je filtr vynechal. Čte z
 * join tabulky `reservation_services` s inner joinem na `reservations` kvůli
 * izolaci na `business_id`. Vrací `null` při chybě dotazu.
 */
async function collectServiceFilterReservationIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  serviceIds: string[],
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('reservation_services')
    .select('reservation_id,reservations!inner(business_id)')
    .eq('reservations.business_id', businessId)
    .in('service_id', serviceIds)
    .returns<{ reservation_id: string }[]>();

  if (error) {
    return null;
  }

  return Array.from(new Set(data.map((row) => row.reservation_id)));
}

type CalendarLoadResult =
  | { ok: true; reservations: ReservationListItem[]; services: ServiceOption[] }
  | { ok: false; message: string };

/**
 * Načte rezervace pro zobrazené období kalendáře (R4). Na rozdíl od tabulky
 * NEuplatňuje pravidlo „pouze budoucí" — kalendář ukazuje i minulé a
 * `rejected`/`cancelled` v daném období (R4.5). Status a služba se respektují
 * (R4.6), časový rozsah z `FilterBar` je nahrazen mezemi období.
 */
async function loadCalendarReservations(
  filters: ReservationFilters,
  bounds: { fromIso: string; toIso: string },
): Promise<CalendarLoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: LOAD_ERROR };
  }

  const { data: serviceRows, error: servicesError } = await supabase
    .from('services')
    .select('id,name')
    .eq('business_id', business.id)
    .order('name', { ascending: true })
    .returns<ServiceOption[]>();

  if (servicesError) {
    return { ok: false, message: LOAD_ERROR };
  }

  let query = supabase
    .from('reservations')
    .select('id,starts_at,ends_at,status,attendance,client_name,client_phone,client_email,services(name),reservation_services(position,services(name))')
    .eq('business_id', business.id)
    .gte('starts_at', bounds.fromIso)
    .lte('starts_at', bounds.toIso);

  // Konjunktivní filtry statusu a služby (R4.6); časový rozsah určuje období.
  if (filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }
  if (filters.serviceIds.length > 0) {
    const matchedIds = await collectServiceFilterReservationIds(
      supabase,
      business.id,
      filters.serviceIds,
    );
    if (matchedIds === null) {
      return { ok: false, message: LOAD_ERROR };
    }
    query = query.in('id', matchedIds);
  }

  const { data, error } = await query
    .order('starts_at', { ascending: true })
    .returns<ReservationRow[]>();

  if (error) {
    return { ok: false, message: LOAD_ERROR };
  }

  return { ok: true, reservations: data.map(mapRow), services: serviceRows };
}

type OccupancyLoadResult =
  | {
      ok: true;
      grid: MonthGrid;
      points: OccupancyPoint[];
      reservations: ReservationListItem[];
      services: ServiceOption[];
    }
  | { ok: false; message: string };

/**
 * Načte data pohledu „Obsazenost" pro měsíc dle `anchor`: rezervace měsíce
 * (všechny stavy — filtruje až výběr v kalendáři), otevírací dobu a z nich
 * přepočtenou denní obsazenost pro graf. Status/služba z `FilterBar` se zde
 * neuplatňují — filtrem je výběr dne/rozsahu v kalendáři.
 */
async function loadOccupancyMonth(
  anchor: string,
  filters: ReservationFilters,
): Promise<OccupancyLoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: LOAD_ERROR };
  }

  const grid = buildMonthGrid(anchor);
  const firstDay = grid.monthDates[0];
  const lastDay = grid.monthDates[grid.monthDates.length - 1];
  const fromIso = fromPragueInput(`${firstDay}T00:00:00`).toISOString();
  const toIso = fromPragueInput(`${lastDay}T23:59:59`).toISOString();

  const { data: serviceRows, error: servicesError } = await supabase
    .from('services')
    .select('id,name')
    .eq('business_id', business.id)
    .order('name', { ascending: true })
    .returns<ServiceOption[]>();

  if (servicesError) {
    return { ok: false, message: LOAD_ERROR };
  }

  const { data: hoursRows, error: hoursError } = await supabase
    .from('opening_hours')
    .select('day_of_week,opens_at,closes_at')
    .eq('business_id', business.id)
    .returns<{ day_of_week: number; opens_at: string; closes_at: string }[]>();

  if (hoursError) {
    return { ok: false, message: LOAD_ERROR };
  }

  let monthQuery = supabase
    .from('reservations')
    .select(
      'id,starts_at,ends_at,status,attendance,client_name,client_phone,client_email,services(name),reservation_services(position,services(name))',
    )
    .eq('business_id', business.id)
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso);

  // Konjunktivní filtry stav/služba (shodně s tabulkou); časový rozsah řeší výběr v kalendáři.
  if (filters.statuses.length > 0) {
    monthQuery = monthQuery.in('status', filters.statuses);
  }
  if (filters.serviceIds.length > 0) {
    const matchedIds = await collectServiceFilterReservationIds(
      supabase,
      business.id,
      filters.serviceIds,
    );
    if (matchedIds === null) {
      return { ok: false, message: LOAD_ERROR };
    }
    monthQuery = monthQuery.in('id', matchedIds);
  }

  const { data, error } = await monthQuery
    .order('starts_at', { ascending: true })
    .returns<ReservationRow[]>();

  if (error) {
    return { ok: false, message: LOAD_ERROR };
  }

  const reservations = data.map(mapRow);
  const points = computeDailyOccupancy(
    grid.monthDates,
    reservations,
    openMinutesByWeekday(hoursRows ?? []),
  );

  return { ok: true, grid, points, reservations, services: serviceRows };
}

export default async function ReservationsPage({ searchParams }: ReservationsPageProps) {
  const rawSearchParams = await searchParams;
  const filters = parseReservationFilters(rawSearchParams);
  const calendar = parseCalendarParams(rawSearchParams);

  if (calendar.view === 'calendar') {
    const days: CalendarDay[] = periodDays(calendar.mode, calendar.anchor);
    const bounds = periodBoundsUtc(days);
    const calendarResult = await loadCalendarReservations(filters, bounds);

    return (
      <ReservationsShell
        calendarHref={buildReservationsHref(filters, {
          view: 'calendar',
          mode: calendar.mode,
          anchor: calendar.anchor,
        })}
        occupancyHref={buildReservationsHref(filters, {
          view: 'occupancy',
          anchor: calendar.anchor,
        })}
        activeView="calendar"
        services={calendarResult.ok ? calendarResult.services : []}
        exportHref={`/dashboard/reservations/export${buildReservationQuery(filters)}`}
      >
        {calendarResult.ok ? (
          <CalendarView
            reservations={calendarResult.reservations}
            mode={calendar.mode}
            anchor={calendar.anchor}
            days={days}
            filters={filters}
            services={calendarResult.services}
          />
        ) : (
          <Notice role="alert" variant="error">
            {calendarResult.message}
          </Notice>
        )}
      </ReservationsShell>
    );
  }

  // Výchozí pohled: Obsazenost (pohled „Tabulka" byl zrušen).
  const occupancy = await loadOccupancyMonth(calendar.anchor, filters);
  const today = todayPragueDate();

  return (
    <ReservationsShell
      calendarHref={buildReservationsHref(filters, {
        view: 'calendar',
        mode: calendar.mode,
        anchor: calendar.anchor,
      })}
      occupancyHref={buildReservationsHref(filters, {
        view: 'occupancy',
        anchor: calendar.anchor,
      })}
      activeView="occupancy"
      services={occupancy.ok ? occupancy.services : []}
      exportHref={`/dashboard/reservations/export${buildReservationQuery(filters)}`}
    >
      {occupancy.ok ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
          <ReservationPillFilters
            filters={filters}
            services={occupancy.services}
            anchor={calendar.anchor}
          />
          <OccupancyView
            grid={occupancy.grid}
            points={occupancy.points}
            reservations={occupancy.reservations}
            today={today}
            prevHref={buildReservationsHref(filters, {
              view: 'occupancy',
              anchor: occupancy.grid.prevAnchor,
            })}
            nextHref={buildReservationsHref(filters, {
              view: 'occupancy',
              anchor: occupancy.grid.nextAnchor,
            })}
          />
        </div>
      ) : (
        <Notice role="alert" variant="error">
          {occupancy.message}
        </Notice>
      )}
    </ReservationsShell>
  );
}

/** Český label aktivního pohledu pro přepínač. */
function viewToggleClass(active: boolean): string {
  return [
    'inline-flex h-11 items-center justify-center rounded-[var(--radius-buttons)] px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]',
    active
      ? 'bg-[var(--color-action-violet)] text-[var(--color-canvas-white)]'
      : 'border border-[var(--color-border-vychozi)] text-[var(--color-slate-text)] bg-[var(--color-cloud-mist)] hover:text-[white] hover:bg-[var(--color-action-violet)]',
  ].join(' ');
}

type ReservationsShellProps = {
  calendarHref: string;
  occupancyHref: string;
  activeView: 'calendar' | 'occupancy';
  services: ServiceOption[];
  exportHref: string;
  children: ReactNode;
};

/**
 * Společný rám stránky se záhlavím, akcemi a přepínačem pohledu
 * kalendář ↔ obsazenost. Přepínač mění pouze parametry pohledu a zachovává
 * filtry statusu a služby (R4.6) — odkazy už nesou předpočítané `href`.
 */
function ReservationsShell({
  calendarHref,
  occupancyHref,
  activeView,
  services,
  exportHref,
  children,
}: ReservationsShellProps) {
  return (
    <div id="prehled-rezervaci" className="flex flex-col gap-6 scroll-mt-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
          href="/dashboard/clients"
        >
          Klienti →
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <CreateReservationDialog services={services} />
          {/* CSV_Exporter je server-only route handler; odkaz nese aktuální filtry (R17.1). */}
          <a
            href={exportHref}
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-white px-5 text-sm font-normal leading-none text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-light-violet)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cloud-mist)]"
          >
            Exportovat do CSV
          </a>
        </div>
      </div>

      <nav className="flex items-center gap-2" aria-label="Přepínač pohledu">
        <Link
          href={occupancyHref}
          className={viewToggleClass(activeView === 'occupancy')}
          aria-current={activeView === 'occupancy' ? 'page' : undefined}
        >
          Obsazenost
        </Link>
        <Link
          href={calendarHref}
          className={viewToggleClass(activeView === 'calendar')}
          aria-current={activeView === 'calendar' ? 'page' : undefined}
        >
          Kalendář
        </Link>
      </nav>

      {children}
    </div>
  );
}
