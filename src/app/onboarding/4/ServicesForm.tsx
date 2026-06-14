'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import type { ServiceDraft } from '@/lib/onboarding/data';
import { useState, useTransition, type FormEvent } from 'react';

import { StepBackLink } from '../StepBackLink';
import { submitServicesAction } from './actions';
import { INITIAL_SERVICES_STEP_STATE, type ServicesStepState } from './state';

type ServicesFormProps = {
  initialServices: ServiceDraft[];
};

type ServiceRow = {
  id: string;
  name: string;
  duration: string;
  price: string;
};

function createRow(service?: ServiceDraft, index = 0): ServiceRow {
  return {
    id: `${index}-${service?.name ?? 'service'}`,
    name: service?.name ?? '',
    duration: service ? String(service.durationMinutes) : '30',
    price: service ? String(service.priceCzk) : '0',
  };
}

function createEmptyRow(): ServiceRow {
  return {
    id: `${Date.now()}-${Math.random()}`,
    name: '',
    duration: '30',
    price: '0',
  };
}

export function ServicesForm({ initialServices }: ServicesFormProps) {
  const [rows, setRows] = useState<ServiceRow[]>(() =>
    initialServices.length > 0 ? initialServices.map(createRow) : [createRow()],
  );
  const [state, setState] = useState<ServicesStepState>(INITIAL_SERVICES_STEP_STATE);
  const [isPending, startTransition] = useTransition();

  function updateRow(rowId: string, patch: Partial<ServiceRow>) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function removeRow(rowId: string) {
    setRows((current) => current.filter((row) => row.id !== rowId));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void submitServicesAction(formData).then(setState);
    });
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <div className="space-y-[var(--spacing-16)]">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="space-y-[var(--spacing-16)] rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] p-[var(--spacing-16)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--color-rich-violet)]">
                Služba {index + 1}
              </p>
              {rows.length > 1 ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={isPending}
                >
                  Odebrat
                </Button>
              ) : null}
            </div>

            <div className="grid gap-[var(--spacing-16)]">
              <div className="space-y-2">
                <label className="block text-sm font-semibold" htmlFor={`service-name-${row.id}`}>
                  Název služby
                </label>
                <Input
                  id={`service-name-${row.id}`}
                  name="serviceName"
                  value={row.name}
                  onChange={(event) => updateRow(row.id, { name: event.target.value })}
                  placeholder="Pánský střih"
                  disabled={isPending}
                />
              </div>

              <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    className="block text-sm font-semibold"
                    htmlFor={`service-duration-${row.id}`}
                  >
                    Doba trvání v minutách
                  </label>
                  <Input
                    id={`service-duration-${row.id}`}
                    name="serviceDuration"
                    type="number"
                    min="1"
                    step="1"
                    value={row.duration}
                    onChange={(event) => updateRow(row.id, { duration: event.target.value })}
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="block text-sm font-semibold"
                    htmlFor={`service-price-${row.id}`}
                  >
                    Cena v Kč
                  </label>
                  <Input
                    id={`service-price-${row.id}`}
                    name="servicePrice"
                    inputMode="decimal"
                    value={row.price}
                    onChange={(event) => updateRow(row.id, { price: event.target.value })}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        type="button"
        onClick={() => setRows((current) => [...current, createEmptyRow()])}
      >
        Přidat další službu
      </Button>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StepBackLink href="/onboarding/3" />
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? 'Ukládám...' : 'Pokračovat'}
        </Button>
      </div>
    </form>
  );
}
