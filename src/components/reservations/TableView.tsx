import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { toPragueDisplay } from '@/lib/datetime';
import { reservationStatusLabel } from '@/lib/reservations/labels';
import type { ReservationListItem } from '@/lib/reservations/types';

type TableViewProps = {
  reservations: ReservationListItem[];
};

const HEADER = ['Datum a čas', 'Služba', 'Klient', 'Stav'];

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
          const isPending = reservation.status === 'pending';

          return (
            <li key={reservation.id}>
              <Link
                href={`/dashboard/reservations/${reservation.id}`}
                className={[
                  'grid grid-cols-1 gap-1 px-6 py-4 transition-colors hover:bg-[var(--color-cloud-mist)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-action-violet)] md:grid-cols-[1.2fr_1.2fr_1.4fr_1fr] md:items-center md:gap-4',
                  isPending
                    ? 'border-l-4 border-l-[var(--color-action-violet)] bg-[color-mix(in_srgb,var(--color-action-violet)_6%,white)]'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="font-medium text-[var(--color-slate-text)]">
                  {toPragueDisplay(reservation.startsAt)}
                </span>
                <span className="text-sm text-[var(--color-slate-text)]">
                  {reservation.serviceName ?? '—'}
                </span>
                <span className="text-sm text-[var(--color-slate-text)]">
                  {reservation.clientName}
                  {reservation.clientPhone ? (
                    <span className="block text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                      {reservation.clientPhone}
                    </span>
                  ) : null}
                </span>
                <span
                  className={[
                    'text-sm font-semibold',
                    isPending
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
