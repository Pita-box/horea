'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { reservationStatusLabel } from '@/lib/reservations/labels';
import {
  buildReservationQuery,
  RESERVATION_STATUSES,
  type ReservationFilters,
} from '@/lib/reservations/filters';
import type { ServiceOption } from '@/lib/reservations/types';

type FilterBarProps = {
  filters: ReservationFilters;
  services: ServiceOption[];
  /** Zobrazit filtr časového rozsahu (od–do). V kalendáři se vypíná. */
  showDateRange?: boolean;
};

/**
 * Filtrační lišta nad seznamem rezervací (R3).
 *
 * Klientská komponenta: každá změna filtru přepíše URL searchParams
 * (`router.push`), čímž server komponenta `Reservations_List` znovu načte
 * data s novou sadou kritérií (R3.6). Filtry se kombinují konjunktivně —
 * o průnik se stará dotaz na serveru (R3.5). Změna jakéhokoli filtru vrací
 * stránkování na první stránku.
 */
export function FilterBar({ filters, services, showDateRange = true }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const selectedStatuses = useMemo(() => new Set(filters.statuses), [filters.statuses]);
  const selectedServices = useMemo(() => new Set(filters.serviceIds), [filters.serviceIds]);

  /** Sestaví nové filtry, vynuluje stránku a aktualizuje URL. */
  function apply(next: Partial<ReservationFilters>): void {
    const merged: ReservationFilters = { ...filters, ...next, page: 1 };
    router.push(`${pathname}${buildReservationQuery(merged)}`);
  }

  function toggleStatus(value: (typeof RESERVATION_STATUSES)[number]): void {
    const next = new Set(selectedStatuses);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    apply({ statuses: RESERVATION_STATUSES.filter((status) => next.has(status)) });
  }

  function toggleService(id: string): void {
    const next = new Set(selectedServices);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    apply({ serviceIds: Array.from(next) });
  }

  function hasActiveFilters(): boolean {
    return (
      filters.statuses.length > 0 ||
      filters.serviceIds.length > 0 ||
      filters.from !== null ||
      filters.to !== null
    );
  }

  return (
    <Card className="space-y-5 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[var(--color-rich-violet)]">Stav</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {RESERVATION_STATUSES.map((status) => (
            <label
              key={status}
              className="flex cursor-pointer items-start gap-2 text-sm text-[var(--color-slate-text)]"
            >
              <Checkbox
                checked={selectedStatuses.has(status)}
                onChange={() => toggleStatus(status)}
              />
              <span>{reservationStatusLabel(status)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {services.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-[var(--color-rich-violet)]">Služba</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {services.map((service) => (
              <label
                key={service.id}
                className="flex cursor-pointer items-start gap-2 text-sm text-[var(--color-slate-text)]"
              >
                <Checkbox
                  checked={selectedServices.has(service.id)}
                  onChange={() => toggleService(service.id)}
                />
                <span>{service.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {showDateRange ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-[var(--color-rich-violet)]">
            Časový rozsah
          </legend>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--color-slate-text)]">
              <span>Od</span>
              <Input
                type="date"
                value={filters.from ?? ''}
                max={filters.to ?? undefined}
                onChange={(event) => apply({ from: event.target.value || null })}
                className="w-auto"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--color-slate-text)]">
              <span>Do</span>
              <Input
                type="date"
                value={filters.to ?? ''}
                min={filters.from ?? undefined}
                onChange={(event) => apply({ to: event.target.value || null })}
                className="w-auto"
              />
            </label>
          </div>
          <p className="text-xs leading-5 text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
            Zvolený rozsah přepíše výchozí zobrazení pouze budoucích rezervací.
          </p>
        </fieldset>
      ) : null}

      {hasActiveFilters() ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => router.push(pathname)}
        >
          Zrušit filtry
        </Button>
      ) : null}
    </Card>
  );
}
