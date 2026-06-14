'use client';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES } from '@/lib/onboarding/business-types';
import { useState, useTransition, type FormEvent } from 'react';

import { submitTypeAction } from './actions';
import { INITIAL_TYPE_STEP_STATE, type TypeStepInitialValue, type TypeStepState } from './state';

type TypeFormProps = {
  initialType: TypeStepInitialValue;
};

export function TypeForm({ initialType }: TypeFormProps) {
  const [state, setState] = useState<TypeStepState>(INITIAL_TYPE_STEP_STATE);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void submitTypeAction(formData).then(setState);
    });
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <fieldset className="space-y-5" disabled={isPending}>
        <legend className="text-sm font-semibold text-[var(--color-slate-text)]">
          Typ podniku
        </legend>
        <div className="grid gap-[var(--spacing-12)] sm:grid-cols-2">
          {BUSINESS_TYPES.map((type) => (
            <label
              key={type}
              className="group flex cursor-pointer items-center gap-[var(--spacing-12)] rounded-[var(--radius-buttons)] border border-[#dce3ff] bg-[var(--color-canvas-white)] px-[var(--spacing-16)] py-[var(--spacing-16)] text-sm font-medium text-[var(--color-slate-text)] transition-colors hover:border-[var(--color-action-violet)] has-[:checked]:border-[var(--color-action-violet)] has-[:checked]:bg-[color-mix(in_srgb,var(--color-action-violet)_7%,white)]"
            >
              <input
                className="peer sr-only"
                name="type"
                type="radio"
                value={type}
                defaultChecked={initialType === type}
              />
              <span
                aria-hidden="true"
                className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border border-[#dce3ff] bg-[var(--color-canvas-white)] peer-checked:border-[var(--color-action-violet)] peer-checked:bg-[var(--color-action-violet)]"
              >
                <span className="h-[6px] w-[6px] rounded-full bg-[var(--color-canvas-white)] opacity-0 group-has-[:checked]:opacity-100" />
              </span>
              <span>{BUSINESS_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
        {state.fieldErrors.type ? (
          <p className="text-sm font-medium text-[var(--color-neon-pink)]">
            {state.fieldErrors.type}
          </p>
        ) : null}
      </fieldset>

      <div className="flex sm:justify-end">
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
          {isPending ? 'Ukládám...' : 'Pokračovat'}
        </Button>
      </div>
    </form>
  );
}
