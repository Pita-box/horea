'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { IconWorld } from '@tabler/icons-react';
import { useEffect, useState, useTransition, type FormEvent } from 'react';

import { StepBackLink } from '../StepBackLink';
import { checkSlugAction, submitSlugAction } from './actions';
import { INITIAL_SLUG_STEP_STATE, type SlugCheckResult, type SlugStepState } from './state';

type SlugFormProps = {
  initialBusinessName: string;
  initialSlug: string;
  initialMessage?: string | null;
};

function getInitialCheck(initialSlug: string): SlugCheckResult {
  return {
    kind: initialSlug ? 'ok' : 'idle',
    slug: initialSlug,
    previewUrl: `horea.cz/${initialSlug || 'vas-podnik'}`,
    message: initialSlug ? 'Uložený název.' : null,
  };
}

export function SlugForm({
  initialBusinessName,
  initialSlug,
  initialMessage = null,
}: SlugFormProps) {
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [state, setState] = useState<SlugStepState>({
    ...INITIAL_SLUG_STEP_STATE,
    message: initialMessage,
  });
  const [checkResult, setCheckResult] = useState<SlugCheckResult>(() =>
    getInitialCheck(initialSlug),
  );
  const [isChecking, startCheckTransition] = useTransition();
  const [isPending, startSubmitTransition] = useTransition();

  useEffect(() => {
    const value = businessName.trim();

    if (!value) {
      setCheckResult(getInitialCheck(''));
      return;
    }

    const timeout = window.setTimeout(() => {
      startCheckTransition(() => {
        void checkSlugAction(value).then(setCheckResult);
      });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [businessName]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startSubmitTransition(() => {
      void submitSlugAction(formData).then(setState);
    });
  }

  const checkMessage = isChecking ? 'Ověřuji dostupnost...' : checkResult.message;
  const hasError = checkResult.kind === 'error' || Boolean(state.fieldErrors.businessName);
  const previewSlug = checkResult.slug || 'vas-nazev';

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <div className="space-y-2">
        <label
          className="block text-sm font-semibold text-[var(--color-slate-text)]"
          htmlFor="business-name"
        >
          Název podniku
        </label>
        <Input
          id="business-name"
          name="businessName"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="Salon Růženka"
          autoComplete="off"
          aria-describedby="business-name-preview business-name-help"
          aria-invalid={hasError}
          disabled={isPending}
        />
        <div
          id="business-name-preview"
          className="flex items-center justify-between gap-3 rounded-[var(--radius-buttons)] border border-dashed border-[var(--color-input-border)] bg-[color-mix(in_srgb,var(--color-action-violet)_5%,white)] px-4 py-3"
        >
          <span className="flex min-w-0 items-center gap-2 text-base">
            <IconWorld
              size={18}
              stroke={2}
              aria-hidden="true"
              className="shrink-0 text-[var(--color-slate-text)]"
            />
            <span className="text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
              horea.cz/
            </span>
            <span className="truncate font-bold text-[var(--color-action-violet)]">
              {previewSlug}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold tracking-wide text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
            Náhled
          </span>
        </div>
        <p
          id="business-name-help"
          className={[
            'text-sm font-medium',
            checkResult.kind === 'ok'
              ? 'text-[color-mix(in_srgb,var(--color-action-violet)_75%,black)]'
              : 'text-[var(--color-slate-text)]',
          ].join(' ')}
        >
          {checkMessage ?? 'URL adresu vytvoříme automaticky z názvu podniku.'}
        </p>
        {state.fieldErrors.businessName ? (
          <p className="text-sm font-medium text-[var(--color-neon-pink)]">
            {state.fieldErrors.businessName}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StepBackLink href="/onboarding/1" />
        <Button className="w-full sm:w-auto" type="submit" disabled={isPending || isChecking}>
          {isPending ? 'Ukládám...' : 'Pokračovat'}
        </Button>
      </div>
    </form>
  );
}
