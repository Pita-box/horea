import 'server-only';

import { fromPragueInput } from '@/lib/datetime';
import { todayPragueDate } from '@/lib/reservations/calendar';
import type { AttendanceStatus, ReservationStatus } from '@/lib/reservations/labels';
import { matchClient, type ClientCandidate } from '@/server/ClientUpsertor';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  historyWindowStart,
  parsePeriodKey,
  resolvePeriod,
  type AnalyticsReservation,
  type ResolvedPeriod,
} from '@/lib/analytics/analytics';

const FETCH_BATCH_SIZE = 1000;

type EmbeddedName = { name: string } | { name: string }[] | null;

type ReservationServiceRow = {
  service_id: string;
  price_czk_snapshot: number | string;
  services: EmbeddedName;
};

type ReservationRow = {
  id: string;
  starts_at: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  employee_id: string | null;
  reservation_services: ReservationServiceRow[] | null;
  reservation_employees: { employee_id: string }[] | null;
};

export type AnalyticsData = {
  period: ResolvedPeriod;
  today: string;
  /** ID podniku majitele — pro entitlement gating widgetů. */
  businessId: string;
  /** Rezervace v aktuálním období. */
  current: AnalyticsReservation[];
  /** Rezervace v předchozím (srovnávacím) období. */
  previous: AnalyticsReservation[];
  /** Rezervace PŘED začátkem období (historické okno) pro detekci vracejících se klientů. */
  historyBefore: AnalyticsReservation[];
  /** Mapa id → jméno zaměstnance. */
  employeeNames: Record<string, string>;
};

export type AnalyticsResult = { ok: true; data: AnalyticsData } | { ok: false; message: string };

const LOAD_ERROR = 'Analytiku se nepodařilo načíst. Zkuste to prosím znovu.';

function embeddedName(value: EmbeddedName): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0]?.name ?? null) : value.name;
}

/**
 * Identita klienta přes PÁROVACÍ PRAVIDLO proti tabulce `clients` (shodně se
 * stránkou Klienti): rezervace se přiřadí klientovi dle telefonu/e-mailu.
 * Rezervace bez odpovídajícího klienta (anonymní/walk-in bez kontaktu, nebo
 * jen jméno) dostane prázdný klíč a do klientské analytiky se nezapočítá —
 * proto se v „TOP klienti" neobjeví jména, která nejsou skutečnými klienty.
 */
function mapRow(row: ReservationRow, candidates: ClientCandidate[]): AnalyticsReservation {
  const services = (row.reservation_services ?? []).map((service) => ({
    serviceId: service.service_id,
    name: embeddedName(service.services) ?? '—',
    priceCzk: Number(service.price_czk_snapshot),
  }));
  const revenue = services.reduce((sum, service) => sum + service.priceCzk, 0);

  const employeeIds = new Set<string>();
  for (const link of row.reservation_employees ?? []) {
    employeeIds.add(link.employee_id);
  }
  if (employeeIds.size === 0 && row.employee_id) {
    employeeIds.add(row.employee_id);
  }

  const matched = matchClient(candidates, row.client_phone ?? '', row.client_email ?? '');

  return {
    id: row.id,
    startsAt: row.starts_at,
    status: row.status,
    attendance: row.attendance,
    clientKey: matched ? matched.id : '',
    clientName: matched?.name ?? row.client_name,
    employeeIds: [...employeeIds],
    services,
    revenue,
  };
}

/** Načte analytická data pro podnik majitele a zvolené období (`?period=`). */
export async function loadAnalytics(periodKeyRaw: string | undefined): Promise<AnalyticsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: 'Přihlaste se prosím znovu.' };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: LOAD_ERROR };
  }

  const today = todayPragueDate();
  const period = resolvePeriod(parsePeriodKey(periodKeyRaw), today);
  const windowStart = historyWindowStart(period);
  const fromIso = fromPragueInput(`${windowStart}T00:00:00`).toISOString();
  const toIso = fromPragueInput(`${period.to}T23:59:59`).toISOString();

  const admin = createAdminClient();

  const { data: employeeRows, error: employeesError } = await admin
    .from('employees')
    .select('id,name')
    .eq('business_id', business.id)
    .returns<{ id: string; name: string }[]>();

  if (employeesError) {
    return { ok: false, message: LOAD_ERROR };
  }

  const employeeNames: Record<string, string> = {};
  for (const employee of employeeRows ?? []) {
    employeeNames[employee.id] = employee.name;
  }

  // Klienti podniku pro párování identity rezervací (shodně se stránkou Klienti).
  const { data: clientRows, error: clientsError } = await admin
    .from('clients')
    .select('id,name,phone,email')
    .eq('business_id', business.id)
    .returns<ClientCandidate[]>();

  if (clientsError) {
    return { ok: false, message: LOAD_ERROR };
  }

  const candidates: ClientCandidate[] = clientRows ?? [];

  // Rezervace okna [windowStart, period.to] po dávkách (Supabase limit 1000/req).
  const rows: ReservationRow[] = [];
  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    const { data, error } = await admin
      .from('reservations')
      .select(
        'id,starts_at,status,attendance,client_name,client_phone,client_email,employee_id,reservation_services(service_id,price_czk_snapshot,services(name)),reservation_employees(employee_id)',
      )
      .eq('business_id', business.id)
      .gte('starts_at', fromIso)
      .lte('starts_at', toIso)
      .order('starts_at', { ascending: true })
      .range(offset, offset + FETCH_BATCH_SIZE - 1)
      .returns<ReservationRow[]>();

    if (error) {
      return { ok: false, message: LOAD_ERROR };
    }

    rows.push(...data);
    if (data.length < FETCH_BATCH_SIZE) {
      break;
    }
  }

  const all = rows.map((row) => mapRow(row, candidates));
  const inRange = (r: AnalyticsReservation, from: string, to: string): boolean => {
    const date = r.startsAt;
    // Porovnáváme přes UTC ISO meze odpovídající pražským dnům.
    return (
      date >= fromPragueInput(`${from}T00:00:00`).toISOString() &&
      date <= fromPragueInput(`${to}T23:59:59`).toISOString()
    );
  };

  const current = all.filter((r) => inRange(r, period.from, period.to));
  const previous = all.filter((r) => inRange(r, period.prevFrom, period.prevTo));
  const periodStartIso = fromPragueInput(`${period.from}T00:00:00`).toISOString();
  const historyBefore = all.filter((r) => r.startsAt < periodStartIso);

  return {
    ok: true,
    data: { period, today, businessId: business.id, current, previous, historyBefore, employeeNames },
  };
}
