'use client';

import type { ReactNode } from 'react';

import { Button, Notice } from '@/components/ui';

import { formatPriceCzk } from './format';
import type { ReservationService } from './types';

/**
 * Krok 1 — výběr služby (R4.1–R4.5).
 *
 * Služby přicházejí už seřazené dle `created_at` vzestupně z routy. Zobrazujeme
 * je včetně služeb s cenou 0 Kč (R4.3). Výběr právě jedné služby je podmínkou
 * přechodu do kroku 2 (R4.2). Při prázdném seznamu krok nezpřístupníme a
 * zobrazíme defenzivní hlášku (R4.4, R4.5).
 */
type Step1ServicePickerProps = {
  services: ReservationService[];
  selectedServiceId: string | null;
  onSelect: (serviceId: string) => void;
  onNext: () => void;
  /** Volitelný obsah pod výpisem služeb (např. výběr zaměstnance). */
  afterServices?: ReactNode;
};

const NO_SERVICES_MESSAGE = 'Tento podnik zatím nemá žádné rezervovatelné služby';

export function Step1ServicePicker({
  services,
  selectedServiceId,
  onSelect,
  onNext,
  afterServices,
}: Step1ServicePickerProps) {
  if (services.length === 0) {
    return <Notice>{NO_SERVICES_MESSAGE}</Notice>;
  }

  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">Výběr služby</h2>

      <ul className="flex flex-col gap-[8px]">
        {services.map((service) => {
          const selected = service.id === selectedServiceId;
          const hasPrice = service.priceCzk > 0;
          return (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => onSelect(service.id)}
                aria-pressed={selected}
                className={[
                  'flex min-h-[44px] w-full items-center justify-between gap-[16px] rounded-[var(--radius-cards)] border px-[16px] py-[12px] text-left transition-colors',
                  selected
                    ? 'border-[var(--color-action-violet)] bg-[color-mix(in_srgb,var(--color-action-violet)_8%,white)]'
                    : 'border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] hover:bg-[var(--color-soft-gray-fill)]',
                ].join(' ')}
              >
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="text-[16px] font-medium text-[var(--color-slate-text)]">
                    {service.name}
                  </span>
                  <span className="text-[14px] text-[var(--color-slate-text)] opacity-70">
                    {service.description
                      ? `${service.description} (${service.durationMinutes} min)`
                      : `${service.durationMinutes} min`}
                  </span>
                  {hasPrice ? (
                    <span className="text-[14px] font-medium text-[var(--color-rich-violet)]">
                      {formatPriceCzk(service.priceCzk)}
                    </span>
                  ) : null}
                </span>

                {/* Vizuální cue „Vybrat" (není samostatné tlačítko — klikatelná je celá položka). */}
                <span
                  aria-hidden="true"
                  className={[
                    'shrink-0 rounded-[var(--radius-buttons)] px-[16px] py-[8px] text-[14px] font-medium transition-colors',
                    selected
                      ? 'bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)] text-[var(--color-action-violet)]'
                      : 'bg-[var(--color-action-violet)] text-white',
                  ].join(' ')}
                >
                  {selected ? 'Vybráno' : 'Vybrat'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {afterServices}

      <div className="flex justify-end">
        <Button
          className="min-h-[44px] w-full sm:w-auto"
          onClick={onNext}
          disabled={!selectedServiceId}
        >
          Pokračovat
        </Button>
      </div>
    </div>
  );
}
