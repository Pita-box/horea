'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';

import { IconCheck, IconSearch } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Notice } from '@/components/ui/notice';
import { TimePicker } from '@/components/ui/TimePicker';
import { toPragueDisplay } from '@/lib/datetime';
import type { ReservationStatus } from '@/lib/reservations/labels';
import type { ServiceOption } from '@/lib/reservations/types';
import { approveReservation } from '@/server/ReservationApprover';
import { cancelReservation } from '@/server/ReservationCanceller';
import { deleteReservation } from '@/server/ReservationDeleter';
import { editReservation } from '@/server/ReservationEditor';
import { rejectReservation } from '@/server/ReservationRejecter';

/** Maximální délka volitelného důvodu (R7.2, R8.2). */
const MAX_REASON_LENGTH = 500;

/** Horní limit počtu služeb na rezervaci (shodně s RPC edit_reservation_multi). */
const MAX_SERVICES = 10;

/** Diakritiku-tolerantní porovnání pro vyhledávání názvů služeb. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

type ReservationActionsProps = {
  reservationId: string;
  status: ReservationStatus;
  /** Služby podniku pro výběr při úpravě (R9.1). */
  services: ServiceOption[];
  /** Aktuální (uspořádaná) množina služeb rezervace — předvyplnění editace. */
  currentServiceIds: string[];
  /** `starts_at` (UTC ISO) — předvyplnění data a času v editaci. */
  startsAt: string;
};

type ActiveDialog = 'reject' | 'cancel' | 'edit' | 'delete' | null;

/** Rozdělí UTC ISO okamžik na datum (`YYYY-MM-DD`) a čas (`HH:mm`) v Praze. */
function pragueDateTimeParts(iso: string): { date: string; time: string } {
  const [datePart, timePart] = toPragueDisplay(iso).split(' ');
  const [dd, mm, yyyy] = datePart.split('.');
  return { date: `${yyyy}-${mm}-${dd}`, time: timePart };
}

/** Jednoduchý modální rám konzistentní s `DeleteClientDialog`. */
function Modal({
  titleId,
  title,
  onClose,
  children,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,22,76,0.72)] px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-[480px] flex-col gap-[var(--spacing-16)] overflow-y-auto rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] text-[var(--color-slate-text)]"
      >
        <h2
          id={titleId}
          className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function ReservationActions({
  reservationId,
  status,
  services,
  currentServiceIds,
  startsAt,
}: ReservationActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActiveDialog>(null);

  // Stav formulářů.
  const [reason, setReason] = useState('');
  const prefill = pragueDateTimeParts(startsAt);
  const fallbackServiceIds = currentServiceIds.length > 0 ? currentServiceIds : services[0] ? [services[0].id] : [];
  const [editServiceIds, setEditServiceIds] = useState<string[]>(fallbackServiceIds);
  const [serviceQuery, setServiceQuery] = useState('');
  const [editDate, setEditDate] = useState(prefill.date);
  const [editTime, setEditTime] = useState(prefill.time);
  const [editSlots, setEditSlots] = useState<string[] | null>(null);

  const filteredServices = useMemo(() => {
    const q = normalize(serviceQuery.trim());
    if (!q) {
      return services;
    }
    return services.filter((service) => normalize(service.name).includes(q));
  }, [services, serviceQuery]);

  function toggleService(serviceId: string) {
    setEditServiceIds((current) => {
      if (current.includes(serviceId)) {
        return current.filter((id) => id !== serviceId);
      }
      if (current.length >= MAX_SERVICES) {
        return current;
      }
      return [...current, serviceId];
    });
  }

  function closeDialog() {
    setDialog(null);
    setError(null);
    setReason('');
    setEditSlots(null);
    setServiceQuery('');
  }

  function handleApprove() {
    setError(null);
    startTransition(() => {
      void approveReservation(reservationId).then((result) => {
        if (result.ok) {
          router.refresh();
          return;
        }
        setError(result.message);
      });
    });
  }

  function handleReject() {
    setError(null);
    startTransition(() => {
      void rejectReservation(reservationId, reason).then((result) => {
        if (result.ok) {
          closeDialog();
          router.refresh();
          return;
        }
        setError(result.message);
      });
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(() => {
      void cancelReservation(reservationId, reason).then((result) => {
        if (result.ok) {
          closeDialog();
          router.refresh();
          return;
        }
        setError(result.message);
      });
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(() => {
      void deleteReservation(reservationId).then((result) => {
        if (result.ok) {
          router.push('/dashboard/reservations');
          router.refresh();
          return;
        }
        setError(result.message);
      });
    });
  }

  function handleEdit() {
    setError(null);
    setEditSlots(null);
    startTransition(() => {
      void editReservation({
        reservationId,
        serviceIds: editServiceIds,
        date: editDate,
        time: editTime,
      }).then((result) => {
        if (result.ok) {
          closeDialog();
          router.refresh();
          return;
        }
        setError(result.message);
        // Při konfliktu (R9.4) zobrazíme aktualizovaný seznam dostupných časů.
        if (result.code === 409 && result.slots) {
          setEditSlots(result.slots);
        }
      });
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {status === 'pending' ? (
          <Button type="button" variant="primary" onClick={handleApprove} disabled={isPending}>
            Schválit
          </Button>
        ) : null}
        {status === 'pending' ? (
          <Button type="button" variant="ghost" onClick={() => setDialog('reject')} disabled={isPending}>
            Odmítnout
          </Button>
        ) : null}
        {status === 'approved' ? (
          <Button type="button" variant="ghost" onClick={() => setDialog('cancel')} disabled={isPending}>
            Zrušit
          </Button>
        ) : null}
        {status === 'pending' || status === 'approved' ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEditServiceIds(fallbackServiceIds);
              setServiceQuery('');
              setEditDate(prefill.date);
              setEditTime(prefill.time);
              setDialog('edit');
            }}
            disabled={isPending}
          >
            Upravit
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setDialog('delete')} disabled={isPending}>
          Smazat
        </Button>
      </div>

      {/* Chyba akce bez otevřeného dialogu (např. Schválit). */}
      {error && dialog === null ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      {dialog === 'reject' ? (
        <Modal titleId="reject-title" title="Odmítnout rezervaci" onClose={closeDialog}>
          <ReasonField reason={reason} onChange={setReason} />
          {error ? (
            <Notice role="alert" variant="error">
              {error}
            </Notice>
          ) : null}
          <DialogButtons
            confirmLabel="Odmítnout"
            pendingLabel="Odmítám…"
            isPending={isPending}
            onCancel={closeDialog}
            onConfirm={handleReject}
          />
        </Modal>
      ) : null}

      {dialog === 'cancel' ? (
        <Modal titleId="cancel-title" title="Zrušit rezervaci" onClose={closeDialog}>
          <p className="text-sm leading-6">
            Zrušená rezervace zůstane v systému jako záznam, ale přestane blokovat kapacitu.
          </p>
          <ReasonField reason={reason} onChange={setReason} />
          {error ? (
            <Notice role="alert" variant="error">
              {error}
            </Notice>
          ) : null}
          <DialogButtons
            confirmLabel="Zrušit rezervaci"
            pendingLabel="Ruším…"
            isPending={isPending}
            onCancel={closeDialog}
            onConfirm={handleCancel}
          />
        </Modal>
      ) : null}

      {dialog === 'delete' ? (
        <Modal titleId="delete-title" title="Smazat rezervaci?" onClose={closeDialog}>
          <p className="text-sm leading-6">
            Tato akce je nevratná. Rezervace bude trvale odstraněna.
          </p>
          {error ? (
            <Notice role="alert" variant="error">
              {error}
            </Notice>
          ) : null}
          <DialogButtons
            confirmLabel="Smazat"
            pendingLabel="Mažu…"
            isPending={isPending}
            onCancel={closeDialog}
            onConfirm={handleDelete}
          />
        </Modal>
      ) : null}

      {dialog === 'edit' ? (
        <Modal titleId="edit-title" title="Upravit rezervaci" onClose={closeDialog}>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              Služby{' '}
              <span className="text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                ({editServiceIds.length})
              </span>
            </span>
            <div className="relative">
              <IconSearch
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]"
              />
              <input
                type="text"
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Hledat službu"
                aria-label="Hledat službu"
                className="w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] py-2 pl-9 pr-3 text-sm text-[var(--color-slate-text)] outline-none focus:border-[var(--color-action-violet)]"
              />
            </div>
            {filteredServices.length === 0 ? (
              <p className="px-1 py-2 text-sm text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                Nic neodpovídá hledání.
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                {filteredServices.map((service) => {
                  const active = editServiceIds.includes(service.id);
                  const atLimit = !active && editServiceIds.length >= MAX_SERVICES;
                  return (
                    <li key={service.id}>
                      <button
                        type="button"
                        onClick={() => toggleService(service.id)}
                        disabled={atLimit}
                        aria-pressed={active}
                        className="flex w-full items-center gap-3 rounded-[var(--radius-buttons)] px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--color-cloud-mist)] disabled:opacity-40"
                      >
                        <span
                          className={[
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border',
                            active
                              ? 'border-[var(--color-action-violet)] bg-[var(--color-action-violet)] text-white'
                              : 'border-[var(--color-input-border)] text-transparent',
                          ].join(' ')}
                        >
                          <IconCheck size={14} stroke={3} />
                        </span>
                        <span className="text-[var(--color-slate-text)]">{service.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {editServiceIds.length === 0 ? (
              <p className="text-xs text-[var(--color-red)]">Vyberte alespoň jednu službu.</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="edit-date">
              Datum
            </label>
            <DatePicker
              id="edit-date"
              value={editDate}
              onChange={setEditDate}
              aria-label="Datum rezervace"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="edit-time">
              Čas
            </label>
            <TimePicker
              id="edit-time"
              name="edit-time"
              value={editTime}
              onChange={setEditTime}
              aria-label="Čas rezervace"
            />
          </div>

          {error ? (
            <Notice role="alert" variant="error">
              {error}
            </Notice>
          ) : null}

          {editSlots && editSlots.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Dostupné časy:</p>
              <div className="nabizene-casy flex flex-wrap gap-2 rounded-[var(--radius-buttons)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] max-h-30 overflow-y-auto">
                {editSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setEditTime(slot)}
                    className="rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] px-3 py-2 text-sm hover:bg-[var(--color-soft-gray-fill)] focus:border-[var(--color-action-violet)] focus:text-[var(--color-action-violet)]"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <DialogButtons
            confirmLabel="Uložit"
            pendingLabel="Ukládám…"
            isPending={isPending || editServiceIds.length === 0}
            onCancel={closeDialog}
            onConfirm={handleEdit}
          />
        </Modal>
      ) : null}
    </>
  );
}

function ReasonField({ reason, onChange }: { reason: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor="reason">
        Důvod (volitelné)
      </label>
      <textarea
        id="reason"
        value={reason}
        maxLength={MAX_REASON_LENGTH}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none focus:border-[var(--color-action-violet)]"
      />
      <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
        {reason.length} / {MAX_REASON_LENGTH}
      </span>
    </div>
  );
}

function DialogButtons({
  confirmLabel,
  pendingLabel,
  isPending,
  onCancel,
  onConfirm,
}: {
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
      <Button
        className="w-full sm:w-auto"
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isPending}
      >
        Zavřít
      </Button>
      <Button className="w-full sm:w-auto" type="button" onClick={onConfirm} disabled={isPending}>
        {isPending ? pendingLabel : confirmLabel}
      </Button>
    </div>
  );
}
