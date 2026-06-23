import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { buttonClassName } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { toPragueDisplay } from '@/lib/datetime';
import { matchClient, type ClientCandidate } from '@/server/ClientUpsertor';
import { createClient } from '@/lib/supabase/server';

const LOAD_ERROR = 'Klienty se nepodařilo načíst. Zkuste to prosím znovu.';

/** Maximální počet klientů načtených na jeden request (R13.4). */
const CLIENTS_PAGE_SIZE = 100;

type ClientRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

type ReservationPairRow = {
  client_phone: string | null;
  client_email: string | null;
  starts_at: string;
};

/** Řádek seznamu klientů s odvozenými agregacemi přes párovací pravidlo (R13.2). */
type RosterItem = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  reservationCount: number;
  lastReservationAt: string | null;
};

type LoadResult = { ok: true; clients: RosterItem[] } | { ok: false; message: string };

/**
 * Načte klienty podniku majitele (max 100, R13.1/R13.4) a odvodí počet rezervací
 * a datum poslední rezervace přes PÁROVACÍ PRAVIDLO (R13.2).
 *
 * Strategie (1–2 dotazy, žádné N+1): načteme klienty a — jedním dotazem — rezervace
 * podniku s poli potřebnými k párování. Každou rezervaci přiřadíme deterministicky
 * právě jednomu klientovi přes `matchClient` (telefon má prioritu před e-mailem,
 * shodně s `Client_Upsertor`) a agregujeme v TS, protože telefon je v DB v
 * nenormalizovaném tvaru.
 */
async function loadClients(): Promise<LoadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Podnik přihlášeného majitele — RLS (`tenant_isolation`) navíc izoluje řádky (R13.3).
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle<{ id: string }>();

  if (businessError || !business) {
    return { ok: false, message: LOAD_ERROR };
  }

  const { data: clientRows, error: clientsError } = await supabase
    .from('clients')
    .select('id,name,phone,email')
    .eq('business_id', business.id)
    .order('name', { ascending: true })
    .range(0, CLIENTS_PAGE_SIZE - 1)
    .returns<ClientRow[]>();

  if (clientsError) {
    return { ok: false, message: LOAD_ERROR };
  }

  const { data: reservationRows, error: reservationsError } = await supabase
    .from('reservations')
    .select('client_phone,client_email,starts_at')
    .eq('business_id', business.id)
    .returns<ReservationPairRow[]>();

  if (reservationsError) {
    return { ok: false, message: LOAD_ERROR };
  }

  const candidates: ClientCandidate[] = clientRows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
  }));

  const counts = new Map<string, number>();
  const lastAt = new Map<string, string>();

  for (const reservation of reservationRows) {
    const match = matchClient(
      candidates,
      reservation.client_phone ?? '',
      reservation.client_email ?? '',
    );
    if (!match) {
      continue;
    }

    counts.set(match.id, (counts.get(match.id) ?? 0) + 1);

    const current = lastAt.get(match.id);
    if (!current || reservation.starts_at > current) {
      lastAt.set(match.id, reservation.starts_at);
    }
  }

  const clients: RosterItem[] = clientRows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    reservationCount: counts.get(row.id) ?? 0,
    lastReservationAt: lastAt.get(row.id) ?? null,
  }));

  return { ok: true, clients };
}

/** Zobrazí pouze datum (bez času) z UTC okamžiku v pásmu Europe/Prague. */
function pragueDateOnly(iso: string): string {
  return toPragueDisplay(iso).split(' ')[0];
}

export default async function ClientsPage() {
  const result = await loadClients();

  return (
    <div id="seznam-klientu" className="flex flex-col gap-6 scroll-mt-20">
      <div className="flex justify-end">
        <Link
          className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
          href="/dashboard/reservations"
        >
          Rezervace →
        </Link>
      </div>

      {!result.ok ? (
          <Notice role="alert" variant="error">
            {result.message}
          </Notice>
        ) : result.clients.length === 0 ? (
          <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
            <p className="text-sm text-[var(--color-slate-text)]">
              Zatím nemáte žádné klienty. Klienti se evidují automaticky po vytvoření rezervace.
            </p>
          </Card>
        ) : (
          <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
            <div className="overflow-x-auto">
              <table data-no-row-hover className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
                    <th className="py-3 pr-4 font-semibold">Jméno</th>
                    <th className="py-3 pr-4 font-semibold">Telefon</th>
                    <th className="py-3 pr-4 font-semibold">E-mail</th>
                    <th className="py-3 pr-4 font-semibold">Počet rezervací</th>
                    <th className="py-3 pr-4 font-semibold">Poslední rezervace</th>
                    <th className="py-3 font-semibold">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {result.clients.map((client) => (
                    <tr
                      key={client.id}
                      className="border-b border-[var(--color-border-vychozi)] align-top last:border-b-0"
                    >
                      <td className="py-3 pr-4 font-medium text-[var(--color-slate-text)]">
                        {client.name ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                        {client.phone ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                        {client.email ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                        {client.reservationCount}
                      </td>
                      <td className="py-3 pr-4 text-[var(--color-slate-text)]">
                        {client.lastReservationAt ? pragueDateOnly(client.lastReservationAt) : '—'}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/dashboard/clients/${client.id}`}
                          className={buttonClassName('outline')}
                        >
                          Zobrazit detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </div>
  );
}
