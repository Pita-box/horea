'use client';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Switch } from '@/components/ui/switch';
import { TimePicker } from '@/components/ui/TimePicker';
import { WEEK_DAYS, type HoursDraft } from '@/lib/onboarding/data';
import { useState, useTransition, type FormEvent } from 'react';

import { StepBackLink } from '../StepBackLink';
import { submitHoursAction } from './actions';
import { INITIAL_HOURS_STEP_STATE, type HoursStepState } from './state';

type HoursFormProps = {
  initialHours: HoursDraft[];
};

export function HoursForm({ initialHours }: HoursFormProps) {
  const [hours, setHours] = useState(initialHours);
  const [state, setState] = useState<HoursStepState>(INITIAL_HOURS_STEP_STATE);
  const [isPending, startTransition] = useTransition();

  function updateDay(dayOfWeek: number, patch: Partial<HoursDraft>) {
    setHours((current) =>
      current.map((item) => (item.dayOfWeek === dayOfWeek ? { ...item, ...patch } : item)),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void submitHoursAction(formData).then(setState);
    });
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <div className="space-y-[var(--spacing-12)]">
        {WEEK_DAYS.map(({ dayOfWeek, label }) => {
          const value = hours.find((item) => item.dayOfWeek === dayOfWeek);
          const isOpen = value?.isOpen ?? false;

          return (
            <div
              key={dayOfWeek}
              className="grid gap-[var(--spacing-12)] rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] p-[var(--spacing-16)] sm:grid-cols-[1fr_140px_140px] sm:items-center"
            >
              <label className="flex items-center gap-[var(--spacing-12)] text-sm font-semibold text-[var(--color-rich-violet)]">
                <Switch
                  name="openDay"
                  value={dayOfWeek}
                  checked={isOpen}
                  onChange={(event) => updateDay(dayOfWeek, { isOpen: event.target.checked })}
                  disabled={isPending}
                />
                <span>{label}</span>
              </label>

              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold text-[var(--color-slate-text)]"
                  htmlFor={`opens-at-${dayOfWeek}`}
                >
                  Otevřeno od
                </label>
                <TimePicker
                  id={`opens-at-${dayOfWeek}`}
                  name={`opensAt-${dayOfWeek}`}
                  value={value?.opensAt ?? '09:00'}
                  onChange={(next) => updateDay(dayOfWeek, { opensAt: next })}
                  disabled={isPending || !isOpen}
                  aria-label={`${label} – otevřeno od`}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold text-[var(--color-slate-text)]"
                  htmlFor={`closes-at-${dayOfWeek}`}
                >
                  Otevřeno do
                </label>
                <TimePicker
                  id={`closes-at-${dayOfWeek}`}
                  name={`closesAt-${dayOfWeek}`}
                  value={value?.closesAt ?? '17:00'}
                  onChange={(next) => updateDay(dayOfWeek, { closesAt: next })}
                  disabled={isPending || !isOpen}
                  aria-label={`${label} – otevřeno do`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StepBackLink href="/onboarding/4" />
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? 'Ukládám...' : 'Pokračovat'}
        </Button>
      </div>
    </form>
  );
}
