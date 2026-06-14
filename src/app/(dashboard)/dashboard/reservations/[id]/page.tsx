import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { toPragueDisplay } from '@/lib/datetime';
import {
  attendanceLabel,
  reservationStatusLabel,
  type AttendanceStatus,
  type ReservationStatus,
} from '@/lib/reservations/labels';
import type { ReservationDetail, ServiceOption } from '@/lib/reservations/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { AssignEmployee, type AssignEmployeeOption } from './AssignEmployee';
import { AttendanceActions } from './AttendanceActions';
import { ReservationActions } from './ReservationActions';

const NOT_FOUND = 'Rezervace nebyla nalezena';

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

/** Detail rezervace + kontext potřebný pro editaci (služby podniku, `service_id`). */
type LoadedReservation = {
  reservation: ReservationDetail;
  serviceId: string | null;
  services: ServiceOption[];
  employees: AssignEmployeeOption[];
  currentEmployeeId: string | null;
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
    services: serviceRows ?? [],
    employees: employeeRows ?? [],
    currentEmployeeId: data.employee_id,
  };
}

function DetailRowItem({ label, value }: { label: string; value: string }) {
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
  const { reservation, serviceId, services, employees, currentEmployeeId } = loaded;
  // Časová brána docházky se vyhodnocuje serverově (R5.3, R11.3, R11.4).
  const attendanceAvailable = Date.now() > new Date(reservation.startsAt).getTime();
  const hasTeam = employees.length >= 1;
  const assignedName = currentEmployeeId
    ? (employees.find((e) => e.id === currentEmployeeId)?.name ?? null)
    : null;

  return (
    <>
      <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <dl className="divide-y divide-[var(--color-cloud-mist)]">
          <DetailRowItem label="Služba" value={reservation.serviceName ?? '—'} />
          <DetailRowItem
            label="Čas"
            value={`${toPragueDisplay(reservation.startsAt)} – ${toPragueDisplay(reservation.endsAt)}`}
          />
          <DetailRowItem label="Stav" value={reservationStatusLabel(reservation.status)} />
          <DetailRowItem label="Docházka" value={attendanceLabel(reservation.attendance)} />
          {hasTeam ? <DetailRowItem label="Zaměstnanec" value={assignedName ?? 'Nepřiřazeno'} /> : null}
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
          currentServiceId={serviceId}
          startsAt={reservation.startsAt}
        />

        {hasTeam ? (
          <AssignEmployee
            reservationId={reservation.id}
            employees={employees}
            currentEmployeeId={currentEmployeeId}
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
