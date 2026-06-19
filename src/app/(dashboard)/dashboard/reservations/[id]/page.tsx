import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { toPragueDisplay } from '@/lib/datetime';
import {
  attendanceLabel,
  reservationStatusLabel,
  type AttendanceStatus,
  type ReservationStatus,
} from '@/lib/reservations/labels';
import { combinedDuration, combinedPrice } from '@/lib/reservation/combine';
import type { ReservationDetail, ServiceOption } from '@/lib/reservations/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { AssignEmployee, type AssignEmployeeOption } from './AssignEmployee';
import { AttendanceActions } from './AttendanceActions';
import { ReservationActions } from './ReservationActions';

const NOT_FOUND = 'Rezervace nebyla nalezena';

/** Cena v Kč v českém formátu (oddělovač tisíců, desetinná místa jen když jsou). */
const priceFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

function formatPriceCzk(value: number): string {
  return `${priceFormatter.format(value)} Kč`;
}

// V Next 15 jsou `params` Promise.
type ReservationDetailPageProps = {
  params: Promise<{ id: string }>;
};

type DetailRow = {
  id: string;
  business_id: string;
  service_id: string | null;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  note: string | null;
  status_reason: string | null;
  employee_id: string | null;
  services: { name: string } | { name: string }[] | null;
};

/** Řádek `reservation_services` se snapshotem délky/ceny a názvem služby. */
type ServiceSetRow = {
  position: number;
  service_id: string;
  duration_minutes_snapshot: number;
  price_czk_snapshot: number | string;
  services: { name: string } | { name: string }[] | null;
};

/** Položka uspořádané množiny služeb rezervace (`Reservation_Service_Set`, R13.1). */
type ReservationServiceItem = {
  position: number;
  serviceId: string;
  name: string;
  durationMinutes: number;
  priceCzk: number;
};

/** Detail rezervace + kontext potřebný pro editaci (služby podniku, `service_id`). */
type LoadedReservation = {
  reservation: ReservationDetail;
  serviceId: string | null;
  /** Uspořádaná množina služeb rezervace dle `position` (R13.1). */
  serviceSet: ReservationServiceItem[];
  services: ServiceOption[];
  employees: AssignEmployeeOption[];
  /** Aktuálně přiřazení zaměstnanci (množina); fallback na denormalizovaný primary. */
  currentEmployeeIds: string[];
};

function serviceName(services: DetailRow['services']): string | null {
  if (!services) {
    return null;
  }
  return Array.isArray(services) ? (services[0]?.name ?? null) : services.name;
}

/**
 * Načte rezervaci pod uživatelským JWT majitele. RLS zajistí, že cizí ani
 * neexistující `id` nevrátí žádný řádek → `null` (R5.4). Spolu s rezervací
 * načte i služby podniku pro editační formulář (R9.1).
 */
async function loadReservation(id: string): Promise<LoadedReservation | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id,business_id,service_id,starts_at,ends_at,status,attendance,client_name,client_phone,client_email,note,status_reason,employee_id,services(name)',
    )
    .eq('id', id)
    .maybeSingle<DetailRow>();

  if (error || !data) {
    return null;
  }

  // Uspořádaná množina služeb rezervace se snapshoty (R13.1, R13.2). RLS politika
  // `reservation_services_owner_read` izoluje řádky na podnik majitele. Pořadí
  // držíme dle `position`; pro jistotu seřadíme i v JS, kdyby embed přišel jinak.
  const { data: serviceSetRows } = await supabase
    .from('reservation_services')
    .select('position,service_id,duration_minutes_snapshot,price_czk_snapshot,services(name)')
    .eq('reservation_id', id)
    .order('position', { ascending: true })
    .returns<ServiceSetRow[]>();

  const serviceSet: ReservationServiceItem[] = (serviceSetRows ?? [])
    .map((row) => ({
      position: row.position,
      serviceId: row.service_id,
      name: serviceName(row.services) ?? '—',
      durationMinutes: row.duration_minutes_snapshot,
      priceCzk: Number(row.price_czk_snapshot),
    }))
    .sort((a, b) => a.position - b.position);

  // Služby podniku pro výběr při úpravě (R9.1) — izolováno RLS na podnik majitele.
  const { data: serviceRows } = await supabase
    .from('services')
    .select('id,name')
    .eq('business_id', data.business_id)
    .order('name', { ascending: true })
    .returns<ServiceOption[]>();

  // Zaměstnanci podniku (employees nemá owner-select RLS → service-role čtení;
  // vlastnictví je už ověřeno RLS-scoped načtením rezervace výše).
  const { data: employeeRows } = await createAdminClient()
    .from('employees')
    .select('id,name')
    .eq('business_id', data.business_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<AssignEmployeeOption[]>();

  // Množina přiřazených zaměstnanců (reservation_employees) pod uživatelským JWT
  // (RLS `reservation_employees_owner_read`). Fallback na denormalizovaný primary
  // `employee_id` u rezervací bez řádků v join tabulce (např. starší booking).
  const { data: assignedRows } = await supabase
    .from('reservation_employees')
    .select('employee_id')
    .eq('reservation_id', id)
    .returns<{ employee_id: string }[]>();

  let currentEmployeeIds = (assignedRows ?? []).map((row) => row.employee_id);
  if (currentEmployeeIds.length === 0 && data.employee_id) {
    currentEmployeeIds = [data.employee_id];
  }

  return {
    reservation: {
      id: data.id,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      status: data.status,
      attendance: data.attendance,
      serviceName: serviceName(data.services),
      clientName: data.client_name,
      clientPhone: data.client_phone,
      clientEmail: data.client_email,
      note: data.note,
      statusReason: data.status_reason,
    },
    serviceId: data.service_id,
    serviceSet,
    services: serviceRows ?? [],
    employees: employeeRows ?? [],
    currentEmployeeIds,
  };
}

function DetailRowItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-[var(--color-rich-violet)]">{label}</dt>
      <dd className="text-sm text-[var(--color-slate-text)]">{value}</dd>
    </div>
  );
}

export default async function ReservationDetailPage({ params }: ReservationDetailPageProps) {
  const { id } = await params;
  const loaded = await loadReservation(id);

  return (
    <div className="flex flex-col gap-6">
      <Link
        className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
        href="/dashboard/reservations"
      >
        ← Zpět na seznam
      </Link>

      {loaded === null ? (
        <Notice role="alert" variant="error">
          {NOT_FOUND}
        </Notice>
      ) : (
        <ReservationDetailContent loaded={loaded} />
      )}
    </div>
  );
}

function ReservationDetailContent({ loaded }: { loaded: LoadedReservation }) {
  const { reservation, serviceId, serviceSet, services, employees, currentEmployeeIds } = loaded;
  // Časová brána docházky se vyhodnocuje serverově (R5.3, R11.3, R11.4).
  const attendanceAvailable = Date.now() > new Date(reservation.startsAt).getTime();
  const hasTeam = employees.length >= 1;
  // Jména přiřazených zaměstnanců v pořadí seznamu podniku.
  const assignedNames = employees
    .filter((e) => currentEmployeeIds.includes(e.id))
    .map((e) => e.name);

  // Combined_Duration / Combined_Price ze snapshotů množiny služeb (R13.2).
  const hasServiceSet = serviceSet.length > 0;
  const totalDuration = combinedDuration(serviceSet);
  const totalPrice = combinedPrice(serviceSet);

  return (
    <>
      <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <dl className="divide-y divide-[var(--color-cloud-mist)]">
          {hasServiceSet ? (
            <>
              <DetailRowItem
                label={serviceSet.length > 1 ? 'Služby' : 'Služba'}
                value={
                  <ul className="flex flex-col gap-1">
                    {serviceSet.map((item) => (
                      <li key={item.position} className="flex justify-between gap-4">
                        <span>
                          {serviceSet.length > 1 ? `${item.position + 1}. ` : ''}
                          {item.name}
                        </span>
                        <span className="shrink-0 text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                          {item.durationMinutes} min
                        </span>
                      </li>
                    ))}
                  </ul>
                }
              />
              <DetailRowItem label="Celková délka" value={`${totalDuration} min`} />
              {totalPrice > 0 ? (
                <DetailRowItem label="Celková cena" value={formatPriceCzk(totalPrice)} />
              ) : null}
            </>
          ) : (
            <DetailRowItem label="Služba" value={reservation.serviceName ?? '—'} />
          )}
          <DetailRowItem
            label="Čas"
            value={`${toPragueDisplay(reservation.startsAt)} – ${toPragueDisplay(reservation.endsAt)}`}
          />
          <DetailRowItem label="Stav" value={reservationStatusLabel(reservation.status)} />
          <DetailRowItem label="Docházka" value={attendanceLabel(reservation.attendance)} />
          {hasTeam ? (
            <DetailRowItem
              label={assignedNames.length > 1 ? 'Zaměstnanci' : 'Zaměstnanec'}
              value={assignedNames.length > 0 ? assignedNames.join(', ') : 'Nepřiřazeno'}
            />
          ) : null}
          <DetailRowItem label="Jméno klienta" value={reservation.clientName} />
          <DetailRowItem label="Telefon" value={reservation.clientPhone ?? '—'} />
          <DetailRowItem label="E-mail" value={reservation.clientEmail ?? '—'} />
          {reservation.note ? <DetailRowItem label="Poznámka" value={reservation.note} /> : null}
          {reservation.statusReason ? (
            <DetailRowItem label="Důvod" value={reservation.statusReason} />
          ) : null}
        </dl>
      </Card>

      <Card className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
          Akce
        </h2>
        <ReservationActions
          reservationId={reservation.id}
          status={reservation.status}
          services={services}
          currentServiceIds={
            serviceSet.length > 0
              ? serviceSet.map((item) => item.serviceId)
              : serviceId
                ? [serviceId]
                : []
          }
          startsAt={reservation.startsAt}
        />

        {hasTeam ? (
          <AssignEmployee
            reservationId={reservation.id}
            employees={employees}
            currentEmployeeIds={currentEmployeeIds}
          />
        ) : null}

        <div className="space-y-2 border-t border-[var(--color-border-vychozi)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--color-rich-violet)]">Docházka</h3>
          {attendanceAvailable ? (
            <AttendanceActions
              reservationId={reservation.id}
              attendance={reservation.attendance}
            />
          ) : (
            <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
              Docházku bude možné zaznamenat až po začátku rezervace.
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
