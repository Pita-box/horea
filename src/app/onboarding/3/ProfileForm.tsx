'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import type { ProfileDraft } from '@/lib/onboarding/data';
import { IconMail, IconMapPin, IconPhone } from '@tabler/icons-react';
import { useState, useTransition, type FocusEvent, type FormEvent } from 'react';

import { StepBackLink } from '../StepBackLink';
import { submitProfileAction } from './actions';
import { INITIAL_PROFILE_STEP_STATE, type ProfileField, type ProfileStepState } from './state';

type ProfileFormProps = {
  initialProfile: ProfileDraft;
};

const REQUIRED_MESSAGES: Record<ProfileField, string> = {
  name: 'Zadejte název podniku.',
  description: 'Zadejte krátký popis podniku.',
  phone: 'Zadejte telefon.',
  email: 'Zadejte kontaktní email.',
};

const fieldIconClass =
  'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]';

export function ProfileForm({ initialProfile }: ProfileFormProps) {
  const [state, setState] = useState<ProfileStepState>(INITIAL_PROFILE_STEP_STATE);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [phone, setPhone] = useState(() =>
    (initialProfile.phone ?? '').replace(/\D/g, '').slice(0, 9),
  );
  const [descLen, setDescLen] = useState(() => initialProfile.description.length);
  const [isPending, startTransition] = useTransition();

  function handleRequiredBlur(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const field = event.currentTarget.name as ProfileField;
    if (!(field in REQUIRED_MESSAGES)) {
      return;
    }

    const hasValue = Boolean(event.currentTarget.value.trim());

    setFieldErrors((current) => {
      const next = { ...current };
      if (hasValue) {
        delete next[field];
      } else {
        next[field] = REQUIRED_MESSAGES[field];
      }
      return next;
    });
  }

  function handlePhoneBlur() {
    setFieldErrors((current) => {
      const next = { ...current };
      if (!phone) {
        next.phone = 'Zadejte telefon.';
      } else if (!/^\d{9}$/.test(phone)) {
        next.phone = 'Telefon musí mít přesně 9 číslic.';
      } else {
        delete next.phone;
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void submitProfileAction(formData).then(setState);
    });
  }

  const errors = { ...fieldErrors, ...state.fieldErrors };

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <div className="grid gap-[var(--spacing-16)]">
        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="name">
            Název podniku
          </label>
          <Input
            id="name"
            name="name"
            defaultValue={initialProfile.name}
            onBlur={handleRequiredBlur}
            placeholder="Např. Horea Studio"
            aria-invalid={Boolean(errors.name)}
            disabled={isPending}
          />
          {errors.name ? (
            <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.name}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="description">
            Krátký popis
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={initialProfile.description}
            onBlur={handleRequiredBlur}
            onChange={(event) => setDescLen(event.currentTarget.value.length)}
            maxLength={400}
            placeholder="Napište něco o svém podniku, čím se zabýváte..."
            className="min-h-[120px] w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.6] text-[var(--color-slate-text)] outline-none transition-colors placeholder:text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)] disabled:opacity-50"
            aria-invalid={Boolean(errors.description)}
            disabled={isPending}
          />
          <div className="flex items-center justify-between gap-2">
            {errors.description ? (
              <p className="text-sm font-medium text-[var(--color-neon-pink)]">
                {errors.description}
              </p>
            ) : (
              <span />
            )}
            <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
              {descLen}/400
            </span>
          </div>
        </div>

        <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="phone">
              Telefon
            </label>
            <div className="relative">
              <IconPhone size={18} stroke={2} aria-hidden="true" className={fieldIconClass} />
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                maxLength={9}
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 9))}
                onBlur={handlePhoneBlur}
                placeholder="123456789"
                className="pl-11"
                aria-invalid={Boolean(errors.phone)}
                disabled={isPending}
              />
            </div>
            {errors.phone ? (
              <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.phone}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="email">
              Kontaktní email
            </label>
            <div className="relative">
              <IconMail size={18} stroke={2} aria-hidden="true" className={fieldIconClass} />
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={initialProfile.email}
                onBlur={handleRequiredBlur}
                placeholder="email@podnik.cz"
                className="pl-11"
                aria-invalid={Boolean(errors.email)}
                disabled={isPending}
              />
            </div>
            {errors.email ? (
              <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.email}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="address">
            Adresa
          </label>
          <div className="relative">
            <IconMapPin size={18} stroke={2} aria-hidden="true" className={fieldIconClass} />
            <Input
              id="address"
              name="address"
              defaultValue={initialProfile.address}
              placeholder="Ulice, č.p., Město, PSČ"
              className="pl-11"
              disabled={isPending}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StepBackLink href="/onboarding/2" />
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? 'Ukládám...' : 'Pokračovat'}
        </Button>
      </div>
    </form>
  );
}
