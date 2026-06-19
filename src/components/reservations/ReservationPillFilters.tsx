'use client';

import { useRouter } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { buildReservationsHref } from '@/lib/reservations/calendar';
import { RESERVATION_STATUSES, type ReservationFilters } from '@/lib/reservations/filters';
import { reservationStatusLabel } from '@/lib/reservations/labels';
import type { ServiceOption } from '@/lib/reservations/types';

type ReservationPillFiltersProps = {
  filters: ReservationFilters;
  services: ServiceOption[];
  /** Kotva měsíce, aby filtr zachoval pohled „Obsazenost" i zobrazený měsíc. */
  anchor: string;
};

/**
 * Barevné varianty pro AKTIVNÍ pilulku — náhodně (deterministicky dle klíče)
 * vybíraný pastelový token. Stabilní per klíč, aby barva neproblikávala při
 * re-renderu a nezpůsobila hydration mismatch. Tmavý text (rich-violet) kvůli
 * kontrastu na světlém pastelu. Literály (ne dynamické názvy) kvůli Tailwind JIT.
 */
const ACTIVE_PILL_COLORS = [
  'border-transparent bg-[var(--color-air-blue)] text-[var(--color-rich-violet)]',
  'border-transparent bg-[var(--color-lush-green)] text-[var(--color-rich-violet)]',
  'border-transparent bg-[var(--color-sunset-pink)] text-[var(--color-rich-violet)]',
  'border-transparent bg-[var(--color-light-violet)] text-[var(--color-rich-violet)]',
] as const;

/** Stabilní index barvy z klíče (jednoduchý hash → modulo počtu barev). */
function pillColorIndex(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % ACTIVE_PILL_COLORS.length;
}

function pillClass(active: boolean, key: string): string {
  return [
    'inline-flex h-9 items-center rounded-[var(--radius-badges)] border px-4 text-sm font-medium transition-colors',
    active
      ? ACTIVE_PILL_COLORS[pillColorIndex(key)]
      : 'border-[var(--color-border-vychozi)] text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
  ].join(' ');
}

/**
 * Fancy (pill / chip) filtry pro pohled „Obsazenost" — bez checkboxů. Stav a
 * služba jako přepínací pilulky; výběr přepíše URL `searchParams` se zachováním
 * pohledu `occupancy` a zobrazeného měsíce (`anchor`), takže se přepočítá graf
 * i seznam. Konjunktivní kombinace (průnik) řeší server.
 */
export function ReservationPillFilters({ filters, services, anchor }: ReservationPillFiltersProps) {
  const router = useRouter();
  const selectedStatuses = new Set(filters.statuses);
  const selectedServices = new Set(filters.serviceIds);

  function navigate(next: Partial<ReservationFilters>): void {
    const merged: ReservationFilters = { ...filters, ...next, page: 1 };
    router.push(buildReservationsHref(merged, { view: 'occupancy', anchor }));
  }

  function toggleStatus(value: (typeof RESERVATION_STATUSES)[number]): void {
    const next = new Set(selectedStatuses);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    navigate({ statuses: RESERVATION_STATUSES.filter((status) => next.has(status)) });
  }

  function toggleService(id: string): void {
    const next = new Set(selectedServices);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    navigate({ serviceIds: Array.from(next) });
  }

  const hasActive = filters.statuses.length > 0 || filters.serviceIds.length > 0;

  return (
    <Card className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--color-rich-violet)]">Stav</p>
        <div className="flex flex-wrap gap-2">
          {RESERVATION_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={selectedStatuses.has(status)}
              className={pillClass(selectedStatuses.has(status), status)}
            >
              {reservationStatusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      {services.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--color-rich-violet)]">Služba</p>
          <div className="flex flex-wrap gap-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => toggleService(service.id)}
                aria-pressed={selectedServices.has(service.id)}
                className={pillClass(selectedServices.has(service.id), service.id)}
              >
                {service.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hasActive ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate({ statuses: [], serviceIds: [], from: null, to: null })}
            className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
          >
            Zrušit filtry
          </button>
        </div>
      ) : null}
    </Card>
  );
}
