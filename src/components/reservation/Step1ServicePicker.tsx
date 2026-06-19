'use client';

import { useState, type ReactNode } from 'react';

import { Button, Notice } from '@/components/ui';
import { combinedDuration, combinedPrice } from '@/lib/reservation/combine';
import {
  MAX_SERVICES_PER_RESERVATION,
  MIN_SERVICES_PER_RESERVATION,
  SERVICE_COUNT_ERROR_MESSAGES,
} from '@/lib/reservation/limits';

import { formatPriceCzk } from './format';
import type { ReservationService } from './types';

/**
 * Krok 1 — výběr služeb, multi-select (R1.1–R1.7, R3.3).
 *
 * Prezentační (controlled) komponenta: stav výběru (`Selected_Service_List`)
 * vlastní rodič (`ReservationFormController`, úkol 6.1) přes reducer
 * `toggleService`. Tato komponenta jen vykresluje stav výběru a volá
 * `onToggle(serviceId)`.
 *
 * Kontrakt props:
 * - `selectedServiceIds: string[]` — uspořádaný seznam vybraných `service_id`
 *   v pořadí výběru (zdroj pravdy pro pořadové číslo).
 * - `onToggle(serviceId)` — přepnutí výběru. Komponenta zavolá `onToggle` jen
 *   tehdy, když přepnutí neporuší horní limit (R1.6): odebrání vybrané služby
 *   je vždy povolené; přidání nové služby se zavolá jen pokud
 *   `selectedServiceIds.length < MAX_SERVICES_PER_RESERVATION`. Při pokusu
 *   přidat 11. službu se `onToggle` NEzavolá a zobrazí se hláška
 *   „Najednou lze vybrat nejvýše 10 služeb". (Rodičovský reducer drží stejný
 *   strop jako pojistku.)
 * - `onNext()` — přechod do kroku 2; tlačítko je nedostupné, dokud výběr
 *   nedosáhne `MIN_SERVICES_PER_RESERVATION` (R1.5).
 *
 * Combined_Duration / Combined_Price průběžného souhrnu se počítají lokálně
 * z vybraných služeb přes helpery `combinedDuration` / `combinedPrice`
 * (R3.3 — cena 0 Kč se nezobrazuje).
 */
type Step1ServicePickerProps = {
  services: ReservationService[];
  selectedServiceIds: string[];
  onToggle: (serviceId: string) => void;
  onNext: () => void;
  /** Volitelný obsah pod výpisem služeb (např. výběr zaměstnance). */
  afterServices?: ReactNode;
};

const NO_SERVICES_MESSAGE = 'Tento podnik zatím nemá žádné rezervovatelné služby';

export function Step1ServicePicker({
  services,
  selectedServiceIds,
  onToggle,
  onNext,
  afterServices,
}: Step1ServicePickerProps) {
  const [limitMessage, setLimitMessage] = useState<string | null>(null);

  if (services.length === 0) {
    return <Notice>{NO_SERVICES_MESSAGE}</Notice>;
  }

  const selectedServices = selectedServiceIds
    .map((id) => services.find((service) => service.id === id))
    .filter((service): service is ReservationService => service != null);

  const totalDuration = combinedDuration(selectedServices);
  const totalPrice = combinedPrice(selectedServices);
  const hasSelection = selectedServiceIds.length >= MIN_SERVICES_PER_RESERVATION;

  function handleToggle(serviceId: string) {
    const isSelected = selectedServiceIds.includes(serviceId);

    // Přidání nové služby nad horní limit odmítneme a zobrazíme hlášku (R1.6).
    if (!isSelected && selectedServiceIds.length >= MAX_SERVICES_PER_RESERVATION) {
      setLimitMessage(SERVICE_COUNT_ERROR_MESSAGES.too_many);
      return;
    }

    setLimitMessage(null);
    onToggle(serviceId);
  }

  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">Výběr služeb</h2>

      <ul className="flex flex-col gap-[8px]">
        {services.map((service) => {
          const order = selectedServiceIds.indexOf(service.id);
          const selected = order !== -1;
          const hasPrice = service.priceCzk > 0;
          return (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => handleToggle(service.id)}
                aria-pressed={selected}
                className={[
                  'flex min-h-[44px] w-full items-center justify-between gap-[16px] rounded-[var(--radius-cards)] border px-[16px] py-[12px] text-left transition-colors',
                  selected
                    ? 'border-[var(--color-action-violet)] bg-[color-mix(in_srgb,var(--color-action-violet)_8%,white)]'
                    : 'border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] hover:bg-[var(--color-cloud-mist)]',
                ].join(' ')}
              >
                <span className="flex min-w-0 items-center gap-[12px]">
                  {/* Pořadové číslo vybrané služby (pořadí ve výběru, R1.2). */}
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--color-action-violet)] text-[13px] font-semibold text-white"
                    >
                      {order + 1}
                    </span>
                  ) : null}

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

      {/* Hláška o překročení limitu (R1.6). */}
      {limitMessage ? <Notice variant="error">{limitMessage}</Notice> : null}

      {/* Průběžný souhrn Combined_Duration / Combined_Price (R3.3; 0 Kč skryto). */}
      {hasSelection ? (
        <div className="flex items-center justify-between gap-[16px] rounded-[var(--radius-cards)] bg-[var(--color-soft-gray-fill)] px-[16px] py-[12px]">
          <span className="text-[14px] font-medium text-[var(--color-slate-text)]">
            Celkem {totalDuration} min
          </span>
          {totalPrice > 0 ? (
            <span className="text-[16px] font-semibold text-[var(--color-rich-violet)]">
              {formatPriceCzk(totalPrice)}
            </span>
          ) : null}
        </div>
      ) : null}

      {afterServices}

      <div className="flex justify-end">
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={onNext} disabled={!hasSelection}>
          Pokračovat
        </Button>
      </div>
    </div>
  );
}
