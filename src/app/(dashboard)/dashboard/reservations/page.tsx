import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Notice } from '@/components/ui/notice';
import { CalendarView } from '@/components/reservations/CalendarView';
import { FilterBar } from '@/components/reservations/FilterBar';
import { TableView } from '@/components/reservations/TableView';
import { fromPragueInput } from '@/lib/datetime';
import {
  buildReservationsHref,
  parseCalendarParams,
  periodBoundsUtc,
  periodDays,
  type CalendarDay,
} from '@/lib/reservations/calendar';
import {
  buildReservationQuery,
  parseReservationFilters,
  RESERVATIONS_PAGE_SIZE,
  type ReservationFilters,
} from '@/lib/reservations/filters';
import type { ReservationListItem, ServiceOption } from '@/lib/reservations/types';
import type { AttendanceStatus, ReservationStatus } from '@/lib/reservations/labels';
import { createClient } from '@/lib/supabase/server';

import { CreateReservationDialog } from './CreateReservationDialog';

const LOAD_ERROR = 'Rezervace se nepodařilo načíst. Zkuste to prosím znovu.';

// V Next 15 jsou `searchParams` Promise.
type ReservationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReservationRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  client_name: string;
  client_phone: string | null;
  services: { name: string } | { name: string }[] | null;
};

function serviceName(services: ReservationRow['services']): string | null {
  if (!services) {
    return null;
  }
  return Array.isArray(services) ? (services[0]?.name ?? null) : services.name;
}

function mapRow(row: ReservationRow): ReservationListItem {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    attendance: row.attendance,
    serviceName: serviceName(row.services),
    clientName: row.client_name,
    clientPhone: row.client_phone,
  };
}

type LoadResult =
  | { ok: true; reservations: ReservationListItem[]; services: ServiceOption[]; hasNextPage: boolean }
  | { ok: false; message: string };

async function loadReservations(filters: ReservationFilters): Promise<LoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Podnik přihlášeného majitele — RLS (`tenant_isolation`) navíc izoluje řádky.
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: LOAD_ERROR };
  }

  // Služby pro filtr (R3.4).
  const { data: serviceRows, error: servicesError } = await supabase
    .from('services')
    .select('id,name')
    .eq('business_id', business.id)
    .order('name', { ascending: true })
    .returns<ServiceOption[]>();

  if (servicesError) {
    return { ok: false, message: LOAD_ERROR };
  }

  const offset = (filters.page - 1) * RESERVATIONS_PAGE_SIZE;

  let query = supabase
    .from('reservations')
    .select(
      'id,starts_at,ends_at,status,attendance,client_name,client_phone,services(name)',
      { count: 'exact' },
    )
    .eq('business_id', business.id);

  // Konjunktivní kombinace filtrů (R3.5).
  if (filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }
  if (filters.serviceIds.length > 0) {
    query = query.in('service_id', filters.serviceIds);
  }

  if (filters.from || filters.to) {
    // Zvolený rozsah přepisuje výchozí „pouze budoucí" (R3.3); meze jsou
    // inkluzivní a interpretované v Europe/Prague (R3.2).
    if (filters.from) {
      query = query.gte('starts_at', fromPragueInput(`${filters.from}T00:00:00`).toISOString());
    }
    if (filters.to) {
      query = query.lte('starts_at', fromPragueInput(`${filters.to}T23:59:59`).toISOString());
    }
  } else {
    // Výchozí stav: pouze budoucí rezervace (R2.1).
    query = query.gte('starts_at', new Date().toISOString());
  }

  const { data, error, count } = await query
    .order('starts_at', { ascending: true })
    .range(offset, offset + RESERVATIONS_PAGE_SIZE - 1)
    .returns<ReservationRow[]>();

  if (error) {
    return { ok: false, message: LOAD_ERROR };
  }

  const total = count ?? 0;

  return {
    ok: true,
    reservations: data.map(mapRow),
    services: serviceRows,
    hasNextPage: offset + RESERVATIONS_PAGE_SIZE < total,
  };
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
    .select('id,starts_at,ends_at,status,attendance,client_name,client_phone,services(name)')
    .eq('business_id', business.id)
    .gte('starts_at', bounds.fromIso)
    .lte('starts_at', bounds.toIso);

  // Konjunktivní filtry statusu a služby (R4.6); časový rozsah určuje období.
  if (filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }
  if (filters.serviceIds.length > 0) {
    query = query.in('service_id', filters.serviceIds);
  }

  const { data, error } = await query
    .order('starts_at', { ascending: true })
    .returns<ReservationRow[]>();

  if (error) {
    return { ok: false, message: LOAD_ERROR };
  }

  return { ok: true, reservations: data.map(mapRow), services: serviceRows };
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
        tableHref={buildReservationsHref(filters, { view: 'table' })}
        calendarHref={buildReservationsHref(filters, {
          view: 'calendar',
          mode: calendar.mode,
          anchor: calendar.anchor,
        })}
        activeView="calendar"
        services={calendarResult.ok ? calendarResult.services : []}
        exportHref={`/dashboard/reservations/export${buildReservationQuery(filters)}`}
      >
        {calendarResult.ok ? (
          <>
            <FilterBar filters={filters} services={calendarResult.services} />
            <CalendarView
              reservations={calendarResult.reservations}
              mode={calendar.mode}
              anchor={calendar.anchor}
              days={days}
              filters={filters}
            />
          </>
        ) : (
          <Notice role="alert" variant="error">
            {calendarResult.message}
          </Notice>
        )}
      </ReservationsShell>
    );
  }

  const result = await loadReservations(filters);

  return (
    <ReservationsShell
      tableHref={buildReservationsHref(filters, { view: 'table' })}
      calendarHref={buildReservationsHref(filters, {
        view: 'calendar',
        mode: calendar.mode,
        anchor: calendar.anchor,
      })}
      activeView="table"
      services={result.ok ? result.services : []}
      exportHref={`/dashboard/reservations/export${buildReservationQuery(filters)}`}
    >
      {result.ok ? (
        <>
          <FilterBar filters={filters} services={result.services} />
          <TableView reservations={result.reservations} />

          {(filters.page > 1 || result.hasNextPage) && result.reservations.length > 0 ? (
            <nav className="flex items-center justify-between" aria-label="Stránkování rezervací">
              {filters.page > 1 ? (
                <Link
                  className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
                  href={`/dashboard/reservations${buildReservationQuery({ ...filters, page: filters.page - 1 })}`}
                >
                  ← Předchozí
                </Link>
              ) : (
                <span />
              )}

              <span className="text-sm text-[var(--color-slate-text)]">Strana {filters.page}</span>

              {result.hasNextPage ? (
                <Link
                  className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
                  href={`/dashboard/reservations${buildReservationQuery({ ...filters, page: filters.page + 1 })}`}
                >
                  Další →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      ) : (
        <Notice role="alert" variant="error">
          {result.message}
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
      : 'border border-[var(--color-border-vychozi)] text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
  ].join(' ');
}

type ReservationsShellProps = {
  tableHref: string;
  calendarHref: string;
  activeView: 'table' | 'calendar';
  services: ServiceOption[];
  exportHref: string;
  children: ReactNode;
};

/**
 * Společný rám stránky se záhlavím, akcemi a přepínačem pohledu
 * tabulka ↔ kalendář. Přepínač mění pouze parametr `view` a zachovává filtry
 * statusu a služby (R4.6) — odkazy už nesou předpočítané `href`.
 */
function ReservationsShell({
  tableHref,
  calendarHref,
  activeView,
  services,
  exportHref,
  children,
}: ReservationsShellProps) {
  return (
    <div className="flex flex-col gap-6">
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
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-transparent px-5 text-sm font-normal leading-none text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-soft-gray-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cloud-mist)]"
          >
            Exportovat do CSV
          </a>
        </div>
      </div>

      <nav className="flex items-center gap-2" aria-label="Přepínač pohledu">
        <Link
          href={tableHref}
          className={viewToggleClass(activeView === 'table')}
          aria-current={activeView === 'table' ? 'page' : undefined}
        >
          Tabulka
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
