'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { TimePicker } from '@/components/ui/TimePicker';
import { toggleService } from '@/lib/reservation/selection';
import type { ServiceOption } from '@/lib/reservations/types';
import { createManualReservation } from '@/server/ManualReservationCreator';

type CreateReservationDialogProps = {
  /** Služby podniku pro výběr (R12.1). */
  services: ServiceOption[];
};

const CONTACT_REQUIRED = 'Zadejte alespoň jeden kontakt — telefon nebo e-mail';
const NAME_REQUIRED = 'Zadejte prosím jméno klienta';
const SERVICE_REQUIRED = 'Vyberte alespoň jednu službu';

/**
 * Dialog ruční tvorby rezervace (R12.1). Sbírá službu, datum, čas a kontakt
 * klienta a volá `Manual_Reservation_Creator` (`createManualReservation`).
 * Validaci (jméno + alespoň jeden kontakt) provádí i server; klientská kontrola
 * jen šetří kolo navíc. Při konfliktu slotu (409) zobrazí dostupné časy (R12.6),
 * po úspěchu zavře dialog a obnoví seznam.
 */
export function CreateReservationDialog({ services }: CreateReservationDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);

  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  function reset() {
    setError(null);
    setSlots(null);
    setServiceIds([]);
    setDate('');
    setTime('');
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setNote('');
  }

  function close() {
    setIsOpen(false);
    reset();
  }

  function handleSubmit() {
    setError(null);
    setSlots(null);

    // Lehká klientská kontrola (server validuje shodně, R12.2).
    if (serviceIds.length === 0) {
      setError(SERVICE_REQUIRED);
      return;
    }
    if (clientName.trim().length === 0) {
      setError(NAME_REQUIRED);
      return;
    }
    if (clientPhone.trim().length === 0 && clientEmail.trim().length === 0) {
      setError(CONTACT_REQUIRED);
      return;
    }

    startTransition(() => {
      void createManualReservation({
        serviceIds,
        date,
        time,
        clientName,
        clientPhone,
        clientEmail,
        note: note.trim() ? note.trim() : null,
      }).then((result) => {
        if (result.ok) {
          close();
          router.refresh();
          return;
        }
        setError(result.message);
        if (result.code === 409 && result.slots) {
          setSlots(result.slots);
        }
      });
    });
  }

  const fieldClass =
    'w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none focus:border-[var(--color-action-violet)]';

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)}>
        Vytvořit rezervaci
      </Button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,22,76,0.72)] px-4 py-8"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-reservation-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-[520px] flex-col gap-[var(--spacing-16)] rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] text-[var(--color-slate-text)] lg:w-[85svw] lg:max-w-none"
          >
            <h2
              id="create-reservation-title"
              className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]"
            >
              Vytvořit rezervaci
            </h2>

            <div className="flex min-h-0 flex-1 flex-col gap-[var(--spacing-16)] overflow-y-auto lg:grid lg:grid-cols-[320px_1fr] lg:gap-6 lg:overflow-hidden">
              {/* Levý sloupec: služby (v pořadí), na desktopu s vlastním scrollem. */}
              <div className="flex min-h-0 flex-col gap-2 lg:overflow-hidden">
                <span className="text-sm font-medium">Služby (v pořadí)</span>
                {services.length === 0 ? (
                  <Notice>Žádná služba k výběru</Notice>
                ) : (
                  <ul className="flex flex-col gap-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                    {services.map((service) => {
                      const order = serviceIds.indexOf(service.id);
                      const selected = order !== -1;
                      return (
                        <li key={service.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setServiceIds((current) => toggleService(current, service.id))
                            }
                            aria-pressed={selected}
                            className={[
                              'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[var(--radius-buttons)] border px-3 py-2 text-left text-sm transition-colors',
                              selected
                                ? 'border-[var(--color-action-violet)] bg-[color-mix(in_srgb,var(--color-action-violet)_8%,white)]'
                                : 'border-[var(--color-input-border)] bg-[var(--color-canvas-white)] hover:bg-[var(--color-soft-gray-fill)]',
                            ].join(' ')}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {selected ? (
                                <span
                                  aria-hidden="true"
                                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--color-action-violet)] text-[12px] font-semibold text-white"
                                >
                                  {order + 1}
                                </span>
                              ) : null}
                              <span className="truncate text-[var(--color-slate-text)]">
                                {service.name}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={[
                                'shrink-0 text-[13px] font-medium',
                                selected
                                  ? 'text-[var(--color-action-violet)]'
                                  : 'text-[var(--color-slate-text)] opacity-70',
                              ].join(' ')}
                            >
                              {selected ? 'Vybráno' : 'Vybrat'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Pravý sloupec: zbytek formuláře (na desktopu vlastní scroll). */}
              <div className="flex min-h-0 flex-col gap-[var(--spacing-16)] lg:overflow-y-auto lg:pr-1">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="create-date">
                      Datum
                    </label>
                    <DatePicker
                      id="create-date"
                      value={date}
                      onChange={setDate}
                      aria-label="Datum rezervace"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="create-time">
                      Čas
                    </label>
                    <TimePicker
                      id="create-time"
                      name="create-time"
                      value={time}
                      onChange={setTime}
                      aria-label="Čas rezervace"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="create-name">
                    Jméno klienta
                  </label>
                  <Input
                    id="create-name"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="create-phone">
                      Telefon
                    </label>
                    <Input
                      id="create-phone"
                      type="tel"
                      value={clientPhone}
                      onChange={(event) => setClientPhone(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="create-email">
                      E-mail
                    </label>
                    <Input
                      id="create-email"
                      type="email"
                      value={clientEmail}
                      onChange={(event) => setClientEmail(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium" htmlFor="create-note">
                    Poznámka (volitelné)
                  </label>
                  <textarea
                    id="create-note"
                    value={note}
                    maxLength={500}
                    rows={2}
                    onChange={(event) => setNote(event.target.value)}
                    className={fieldClass}
                  />
                </div>

                {error ? (
                  <Notice role="alert" variant="error">
                    {error}
                  </Notice>
                ) : null}

                {slots && slots.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">Dostupné časy:</p>
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setTime(slot)}
                          className="rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] px-3 py-2 text-sm hover:bg-[var(--color-soft-gray-fill)]"
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    variant="ghost"
                    onClick={close}
                    disabled={isPending}
                  >
                    Zavřít
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending}
                  >
                    {isPending ? 'Vytvářím…' : 'Vytvořit'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
