'use client';

import { Button, Notice } from '@/components/ui';
import { combinedDuration, combinedPrice } from '@/lib/reservation/combine';

import { formatDateCs, formatPriceCzk } from './format';
import type { ContactValues, ReservationService, SubmitState } from './types';

/**
 * Krok 5 — souhrn a odeslání (R8.1–R8.5, R9.4, R9.9, R12.1–R12.4).
 *
 * Zobrazuje souhrn všech polí česky a tlačítko „Odeslat rezervaci". Souhrn
 * vypíše všechny vybrané služby v uloženém pořadí (název + délka, R12.1),
 * `Combined_Duration` jako celkovou délku (R12.2), `Combined_Price` jen když
 * je > 0 Kč (R12.3) a jeden časový blok v Europe/Prague (R12.4). Synchronní
 * znepřístupnění tlačítka před odesláním (R8.4) i jeho držení po dobu zpracování
 * (R8.5) řeší controller přes ref guard + `submitState`; tady jen reflektujeme
 * `submitState` v `disabled`. Při úspěchu zobrazíme děkovnou hlášku podle statusu.
 */
type Step5SummaryProps = {
  /** Vybrané služby v uloženém pořadí (pořadí výběru = position). */
  services: ReservationService[];
  date: string;
  time: string;
  contact: ContactValues;
  submitState: SubmitState;
  submitError: string | null;
  reservationStatus: 'pending' | 'approved' | null;
  onEditStep: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
};

const SUCCESS_MESSAGES = {
  approved: 'Rezervace je potvrzena.',
  pending: 'Rezervace byla odeslána a čeká na schválení podnikem.',
} as const;

type SummaryRow = { label: string; value: string; step: number };

export function Step5Summary({
  services,
  date,
  time,
  contact,
  submitState,
  submitError,
  reservationStatus,
  onEditStep,
  onBack,
  onSubmit,
}: Step5SummaryProps) {
  // Úspěšně odesláno — místo souhrnu zobrazíme děkovnou hlášku (R9.9).
  if (submitState === 'success' && reservationStatus) {
    return (
      <div className="flex w-full flex-col gap-[16px]">
        <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">
          Děkujeme za rezervaci
        </h2>
        <Notice role="status" aria-live="polite">
          {SUCCESS_MESSAGES[reservationStatus]}
        </Notice>
      </div>
    );
  }

  const rows: SummaryRow[] = [];

  // Seznam všech služeb v uloženém pořadí — název + délka (R12.1). Při více
  // službách se prefixuje pořadovým číslem konzistentně se Step1ServicePicker.
  const multiple = services.length > 1;
  services.forEach((service, index) => {
    const prefix = multiple ? `${index + 1}. ` : '';
    rows.push({
      label: 'Služba',
      value: `${prefix}${service.name} (${service.durationMinutes} min)`,
      step: 1,
    });
  });

  // Combined_Duration jako celková délka rezervace (R12.2).
  rows.push({ label: 'Trvání celkem', value: `${combinedDuration(services)} min`, step: 1 });

  // Combined_Price jen když je > 0 Kč (R12.3).
  const totalPrice = combinedPrice(services);
  if (totalPrice > 0) {
    rows.push({ label: 'Cena celkem', value: formatPriceCzk(totalPrice), step: 1 });
  }

  rows.push(
    { label: 'Datum', value: formatDateCs(date), step: 2 },
    { label: 'Čas', value: time, step: 3 },
    { label: 'Jméno', value: contact.clientName, step: 4 },
    { label: 'Telefon', value: contact.clientPhone, step: 4 },
    { label: 'E-mail', value: contact.clientEmail, step: 4 },
  );

  if (contact.note.trim()) {
    rows.push({ label: 'Poznámka', value: contact.note.trim(), step: 4 });
  }

  const submitting = submitState === 'pending';

  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">
        Souhrn a potvrzení
      </h2>

      {submitState === 'error' && submitError ? (
        <Notice role="alert" variant="error">
          {submitError}
        </Notice>
      ) : null}

      <dl className="flex flex-col gap-[8px]">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="flex items-start justify-between gap-[16px] border-b border-[var(--color-border-vychozi)] pb-[8px] last:border-b-0 last:pb-0"
          >
            <dt className="text-[14px] text-[var(--color-slate-text)] opacity-70">{row.label}</dt>
            <dd className="flex items-center gap-[8px] text-right text-[16px] text-[var(--color-slate-text)]">
              <span className="whitespace-pre-line">{row.value}</span>
              <button
                type="button"
                onClick={() => onEditStep(row.step)}
                disabled={submitting}
                className="shrink-0 text-[14px] font-medium text-[var(--color-action-violet)] disabled:opacity-50"
              >
                Upravit
              </button>
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-[8px] sm:flex-row sm:justify-between">
        <Button
          variant="ghost"
          className="min-h-[44px] w-full sm:w-auto"
          onClick={onBack}
          disabled={submitting}
        >
          Zpět
        </Button>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Odesílám…' : 'Odeslat rezervaci'}
        </Button>
      </div>
    </div>
  );
}
