import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { toPragueDisplay } from '@/lib/datetime';
import { reservationStatusLabel, type ReservationStatus } from '@/lib/reservations/labels';
import type { ReservationListItem } from '@/lib/reservations/types';

type TableViewProps = {
  reservations: ReservationListItem[];
};

const HEADER = ['Datum a čas', 'Služba', 'Klient', 'Stav'];

/**
 * Barevný levý okraj řádku dle stavu rezervace (R2.4):
 * - `pending` (čeká) — Action Violet,
 * - `approved` (schváleno) — Electric Green,
 * - `cancelled` (zrušeno) — Red.
 * `rejected` zůstává bez akcentu.
 */
function statusAccentClass(status: ReservationStatus): string {
  switch (status) {
    case 'pending':
      return 'border-l-4 border-l-[var(--color-action-violet)]';
    case 'approved':
      return 'border-l-4 border-l-[var(--color-electric-green)]';
    case 'cancelled':
      return 'border-l-4 border-l-[var(--color-red)]';
    default:
      return '';
  }
}

/**
 * Tabulkový pohled na rezervace (R2.2–R2.6).
 *
 * Prezentační server komponenta: každý řádek je `<Link>` na detail (R2.6),
 * stav je v češtině (R2.3) a rezervace ve stavu `pending` jsou vizuálně
 * zvýrazněné (R2.4). Layout je mobile-first — na úzkých displejích se sloupce
 * skládají pod sebe, na širších se zarovnají do mřížky.
 */
export function TableView({ reservations }: TableViewProps) {
  if (reservations.length === 0) {
    return (
      <Card className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)] text-center">
        <p className="text-base font-semibold text-[var(--color-slate-text)]">
          Žádné rezervace neodpovídají zvoleným filtrům.
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-slate-text)]">
          Upravte filtry, nebo počkejte na první rezervaci.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border border-[var(--color-border-vychozi)]">
      {/* Hlavička viditelná až od md — na mobilu se data skládají do karet. */}
      <div
        className="hidden grid-cols-[1.2fr_1.2fr_1.4fr_1fr] gap-4 border-b border-[var(--color-border-vychozi)] px-6 py-3 text-sm font-semibold text-[var(--color-rich-violet)] md:grid"
        aria-hidden="true"
      >
        {HEADER.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <ul className="divide-y divide-[var(--color-cloud-mist)]">
        {reservations.map((reservation) => {
          // „DD.MM.YYYY HH:mm" → datum a čas zvlášť kvůli odlišenému stylu času.
          const [datePart, timePart] = toPragueDisplay(reservation.startsAt).split(' ');

          return (
            <li key={reservation.id}>
              <Link
                href={`/dashboard/reservations/${reservation.id}`}
                className={[
                  'grid grid-cols-1 gap-1 px-6 py-4 transition-colors hover:bg-[var(--color-light-violet)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-action-violet)] md:grid-cols-[1.2fr_1.2fr_1.4fr_1fr] md:items-center md:gap-4',
                  statusAccentClass(reservation.status),
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="font-medium text-[var(--color-slate-text)]">
                  {datePart}, <span className="opacity-50">{timePart}</span>
                </span>
                <span className="text-sm text-[var(--color-slate-text)]">
                  {reservation.serviceName ?? '—'}
                </span>
                <span className="text-sm text-[var(--color-slate-text)]">
                  {reservation.clientName}
                  {reservation.clientPhone || reservation.clientEmail ? (
                    <span className="block text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                      {[reservation.clientPhone, reservation.clientEmail]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  ) : null}
                </span>
                <span
                  className={[
                    'text-sm font-semibold',
                    reservation.status === 'pending'
                      ? 'text-[var(--color-action-violet)]'
                      : 'text-[var(--color-slate-text)]',
                  ].join(' ')}
                >
                  {reservationStatusLabel(reservation.status)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
