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
import { normalizePhone } from '@/server/ClientUpsertor';
import { createClient } from '@/lib/supabase/server';

import { DeleteClientDialog } from './DeleteClientDialog';

const NOT_FOUND = 'Klient nebyl nalezen';
const LOAD_ERROR = 'Klienta se nepodařilo načíst. Zkuste to prosím znovu.';
const EMPTY_HISTORY = 'Klient zatím nemá žádné rezervace';

// V Next 15 jsou `params` Promise.
type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
};

type ClientRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

type ReservationRow = {
  id: string;
  starts_at: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  client_phone: string | null;
  client_email: string | null;
  services: { name: string } | { name: string }[] | null;
};

type HistoryItem = {
  id: string;
  startsAt: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  serviceName: string | null;
};

type ClientDetail = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  history: HistoryItem[];
};

type LoadResult =
  | { ok: true; client: ClientDetail }
  | { ok: false; kind: 'not-found' | 'error' };

function serviceName(services: ReservationRow['services']): string | null {
  if (!services) {
    return null;
  }
  return Array.isArray(services) ? (services[0]?.name ?? null) : services.name;
}

/**
 * Načte klienta podniku majitele a jeho rezervační historii přes PÁROVACÍ
 * PRAVIDLO (R14.4): rezervace, jejichž normalizovaný telefon se shoduje s
 * telefonem klienta NEBO jejichž e-mail (case-insensitive) se shoduje s e-mailem
 * klienta. Telefon je v DB nenormalizovaný, proto filtrujeme v TS.
 */
async function loadClientDetail(id: string): Promise<LoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Podnik přihlášeného majitele — RLS navíc izoluje řádky na jeho `business_id`.
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, kind: 'error' };
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id,name,phone,email')
    .eq('id', id)
    .eq('business_id', business.id)
    .maybeSingle<ClientRow>();

  if (clientError) {
    return { ok: false, kind: 'error' };
  }

  if (!client) {
    // Neexistující nebo cizí `id` (R14 → analogie R5.4).
    return { ok: false, kind: 'not-found' };
  }

  const { data: reservationRows, error: reservationsError } = await supabase
    .from('reservations')
    .select('id,starts_at,status,attendance,client_phone,client_email,services(name)')
    .eq('business_id', business.id)
    .order('starts_at', { ascending: true })
    .returns<ReservationRow[]>();

  if (reservationsError) {
    return { ok: false, kind: 'error' };
  }

  const normClientPhone = normalizePhone(client.phone);
  const clientEmail = client.email ? client.email.trim().toLowerCase() : '';

  const history: HistoryItem[] = reservationRows
    .filter((reservation) => {
      const phoneMatch =
        normClientPhone !== '' && normalizePhone(reservation.client_phone) === normClientPhone;
      const emailMatch =
        clientEmail !== '' &&
        !!reservation.client_email &&
        reservation.client_email.trim().toLowerCase() === clientEmail;
      return phoneMatch || emailMatch;
    })
    .map((reservation) => ({
      id: reservation.id,
      startsAt: reservation.starts_at,
      status: reservation.status,
      attendance: reservation.attendance,
      serviceName: serviceName(reservation.services),
    }));

  return {
    ok: true,
    client: {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      history,
    },
  };
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-[var(--color-rich-violet)]">{label}</dt>
      <dd className="text-sm text-[var(--color-slate-text)]">{value}</dd>
    </div>
  );
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  const result = await loadClientDetail(id);

  return (
    <div className="flex flex-col gap-6">
      <Link
        className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
        href="/dashboard/clients"
      >
        ← Zpět na seznam klientů
      </Link>

      {!result.ok ? (
        <Notice role="alert" variant="error">
          {result.kind === 'not-found' ? NOT_FOUND : LOAD_ERROR}
        </Notice>
      ) : (
        <ClientDetailContent client={result.client} />
      )}
    </div>
  );
}

function ClientDetailContent({ client }: { client: ClientDetail }) {
  return (
    <>
      <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <dl className="divide-y divide-[var(--color-cloud-mist)]">
          <ContactRow label="Jméno" value={client.name ?? '—'} />
          <ContactRow label="Telefon" value={client.phone ?? '—'} />
          <ContactRow label="E-mail" value={client.email ?? '—'} />
        </dl>
      </Card>

      <Card className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
          Historie rezervací
        </h2>

        {client.history.length === 0 ? (
          <p className="text-sm text-[var(--color-slate-text)]">{EMPTY_HISTORY}</p>
        ) : (
          <ul className="divide-y divide-[var(--color-cloud-mist)]">
            {client.history.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/dashboard/reservations/${item.id}`}
                  className="flex flex-col gap-1 py-3 hover:text-[var(--color-action-violet)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm font-medium text-[var(--color-rich-violet)]">
                    {toPragueDisplay(item.startsAt)}
                  </span>
                  <span className="text-sm text-[var(--color-slate-text)]">
                    {item.serviceName ?? '—'}
                  </span>
                  <span className="text-sm text-[var(--color-slate-text)]">
                    {reservationStatusLabel(item.status)} · {attendanceLabel(item.attendance)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
        <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
          GDPR
        </h2>
        <p className="text-sm leading-6 text-[var(--color-slate-text)]">
          Smazání klienta je nevratné. Osobní údaje se odstraní, rezervace zůstanou jako
          anonymizované sloty.
        </p>
        <DeleteClientDialog clientId={client.id} clientName={client.name ?? 'klienta'} />
      </Card>
    </>
  );
}
