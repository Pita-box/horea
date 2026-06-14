'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';
import type { ServiceInput } from '@/lib/services/schema';
import type { ServiceField, ServiceRecord } from '@/lib/services/types';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

import { createService, updateService } from './actions';

type ServiceFormProps = {
  service?: ServiceRecord;
  onClose: () => void;
};

type FormValues = {
  name: string;
  durationMinutes: string;
  priceCzk: string;
  description: string;
};

function initialValues(service?: ServiceRecord): FormValues {
  if (!service) {
    return { name: '', durationMinutes: '', priceCzk: '', description: '' };
  }

  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),
    priceCzk: String(service.priceCzk),
    description: service.description ?? '',
  };
}

export function ServiceForm({ service, onClose }: ServiceFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState<FormValues>(() => initialValues(service));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ServiceField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(service);

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFieldErrors({});

    const input: ServiceInput = {
      name: values.name,
      durationMinutes: values.durationMinutes,
      priceCzk: values.priceCzk,
      description: values.description,
    };

    startTransition(() => {
      const action = service ? updateService(service.id, input) : createService(input);

      void action.then((result) => {
        if (result.ok) {
          showToast(isEdit ? 'Změny uloženy.' : 'Služba přidána.');
          onClose();
          router.refresh();
          return;
        }

        setMessage(result.message);
        setFieldErrors(result.fieldErrors ?? {});
      });
    });
  }

  return (
    <form className="space-y-[var(--spacing-16)]" onSubmit={handleSubmit} noValidate>
      <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
        {isEdit ? 'Upravit službu' : 'Nová služba'}
      </h2>

      {message ? (
        <Notice role="alert" variant="error">
          {message}
        </Notice>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="service-name">
          Název
        </label>
        <Input
          id="service-name"
          name="name"
          value={values.name}
          onChange={(event) => updateValue('name', event.currentTarget.value)}
          aria-invalid={Boolean(fieldErrors.name)}
          disabled={isPending}
        />
        {fieldErrors.name ? (
          <p className="text-sm font-medium text-[var(--color-neon-pink)]">{fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="service-duration">
            Trvání (min)
          </label>
          <Input
            id="service-duration"
            name="durationMinutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            step={5}
            value={values.durationMinutes}
            onChange={(event) => updateValue('durationMinutes', event.currentTarget.value)}
            aria-invalid={Boolean(fieldErrors.durationMinutes)}
            disabled={isPending}
          />
          {fieldErrors.durationMinutes ? (
            <p className="text-sm font-medium text-[var(--color-neon-pink)]">
              {fieldErrors.durationMinutes}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="service-price">
            Cena (Kč){' '}
            <span className="font-normal text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
              (nepovinné)
            </span>
          </label>
          <Input
            id="service-price"
            name="priceCzk"
            type="text"
            inputMode="decimal"
            value={values.priceCzk}
            onChange={(event) => updateValue('priceCzk', event.currentTarget.value)}
            placeholder="Nechte prázdné pro skrytí ceny"
            aria-invalid={Boolean(fieldErrors.priceCzk)}
            disabled={isPending}
          />
          {fieldErrors.priceCzk ? (
            <p className="text-sm font-medium text-[var(--color-neon-pink)]">
              {fieldErrors.priceCzk}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="service-description">
          Popis
        </label>
        <textarea
          id="service-description"
          name="description"
          value={values.description}
          onChange={(event) => updateValue('description', event.currentTarget.value)}
          className="min-h-[120px] w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.6] text-[var(--color-slate-text)] outline-none transition-colors placeholder:text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)] disabled:opacity-50"
          aria-invalid={Boolean(fieldErrors.description)}
          disabled={isPending}
        />
        {fieldErrors.description ? (
          <p className="text-sm font-medium text-[var(--color-neon-pink)]">
            {fieldErrors.description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? 'Ukládám...' : isEdit ? 'Uložit změny' : 'Přidat službu'}
        </Button>
        <Button
          className="w-full sm:w-auto"
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={isPending}
        >
          Zrušit
        </Button>
      </div>
    </form>
  );
}
