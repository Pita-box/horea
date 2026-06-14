'use client';

import { useState } from 'react';

import { Button, Input, Notice } from '@/components/ui';
import { reservationContactSchema } from '@/lib/reservation/schema';

import type { ContactValues } from './types';

/**
 * Krok 4 — kontaktní údaje (R7.1–R7.6).
 *
 * Klientská validace je POUZE UX vrstva — používá stejné `reservationContactSchema`
 * jako server (single source of truth pro hlášky), ale server validuje vše znovu
 * a nezávisle (R7.7). Při chybě blokujeme přechod do kroku 5 a zobrazíme českou
 * hlášku u příslušného pole.
 */
type Step4ContactFormProps = {
  values: ContactValues;
  submitError: string | null;
  onChange: (patch: Partial<ContactValues>) => void;
  onNext: () => void;
  onBack: () => void;
};

type FieldErrors = Partial<Record<keyof ContactValues, string>>;

export function Step4ContactForm({
  values,
  submitError,
  onChange,
  onNext,
  onBack,
}: Step4ContactFormProps) {
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleNext() {
    const result = reservationContactSchema.safeParse({
      clientName: values.clientName,
      clientPhone: values.clientPhone,
      clientEmail: values.clientEmail,
      note: values.note,
    });

    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !(field in nextErrors)) {
          nextErrors[field as keyof ContactValues] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    onNext();
  }

  return (
    <div className="flex w-full flex-col gap-[16px]">
      <h2 className="text-[20px] font-semibold text-[var(--color-rich-violet)]">Kontaktní údaje</h2>

      {submitError ? (
        <Notice role="alert" variant="error">
          {submitError}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-[8px]">
        <label
          className="text-[14px] font-medium text-[var(--color-slate-text)]"
          htmlFor="client-name"
        >
          Jméno
        </label>
        <Input
          id="client-name"
          value={values.clientName}
          onChange={(event) => onChange({ clientName: event.target.value })}
          aria-invalid={Boolean(errors.clientName)}
          autoComplete="name"
          className="min-h-[44px]"
        />
        {errors.clientName ? (
          <p className="text-[14px] font-medium text-[var(--color-neon-pink)]">
            {errors.clientName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-[8px]">
        <label
          className="text-[14px] font-medium text-[var(--color-slate-text)]"
          htmlFor="client-phone"
        >
          Telefon
        </label>
        <Input
          id="client-phone"
          type="tel"
          inputMode="tel"
          value={values.clientPhone}
          onChange={(event) => onChange({ clientPhone: event.target.value })}
          aria-invalid={Boolean(errors.clientPhone)}
          autoComplete="tel"
          className="min-h-[44px]"
        />
        {errors.clientPhone ? (
          <p className="text-[14px] font-medium text-[var(--color-neon-pink)]">
            {errors.clientPhone}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-[8px]">
        <label
          className="text-[14px] font-medium text-[var(--color-slate-text)]"
          htmlFor="client-email"
        >
          E-mail
        </label>
        <Input
          id="client-email"
          type="email"
          inputMode="email"
          value={values.clientEmail}
          onChange={(event) => onChange({ clientEmail: event.target.value })}
          aria-invalid={Boolean(errors.clientEmail)}
          autoComplete="email"
          className="min-h-[44px]"
        />
        {errors.clientEmail ? (
          <p className="text-[14px] font-medium text-[var(--color-neon-pink)]">
            {errors.clientEmail}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-[8px]">
        <label className="text-[14px] font-medium text-[var(--color-slate-text)]" htmlFor="note">
          Poznámka (volitelné)
        </label>
        <textarea
          id="note"
          rows={3}
          value={values.note}
          onChange={(event) => onChange({ note: event.target.value })}
          aria-invalid={Boolean(errors.note)}
          className="w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.4] text-[var(--color-slate-text)] outline-none transition-colors placeholder:text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)]"
        />
        {errors.note ? (
          <p className="text-[14px] font-medium text-[var(--color-neon-pink)]">{errors.note}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-[8px] sm:flex-row sm:justify-between">
        <Button variant="ghost" className="min-h-[44px] w-full sm:w-auto" onClick={onBack}>
          Zpět
        </Button>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={handleNext}>
          Pokračovat
        </Button>
      </div>
    </div>
  );
}
