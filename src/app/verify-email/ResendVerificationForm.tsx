'use client';

import { IconSend } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { useState, useTransition, type FormEvent } from 'react';

import { resendVerificationAction } from './actions';
import { INITIAL_RESEND_VERIFICATION_STATE, type ResendVerificationState } from './state';

export function ResendVerificationForm() {
  const [state, setState] = useState<ResendVerificationState>(INITIAL_RESEND_VERIFICATION_STATE);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void resendVerificationAction(formData).then(setState);
    });
  }

  return (
    <form className="w-full space-y-4 text-left" onSubmit={handleSubmit} noValidate>
      <label className="block text-sm font-semibold text-[var(--color-rich-violet)]">
        Email
        <Input
          className="mt-2"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors.email)}
          disabled={isPending}
          placeholder="jmeno@firma.cz"
        />
        {state.fieldErrors.email ? (
          <p className="mt-2 text-sm font-medium text-[var(--color-neon-pink)]">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-6 font-[var(--font-plus-jakarta-sans)] text-base font-semibold text-[var(--color-canvas-white)] transition-opacity hover:opacity-90 disabled:border disabled:border-[var(--color-action-violet)] disabled:bg-[var(--color-canvas-white)] disabled:text-[var(--color-action-violet)]"
      >
        {isPending ? 'Odesílám…' : 'Znovu odeslat potvrzovací e-mail'}
        {isPending ? null : <IconSend size={20} stroke={2} aria-hidden="true" />}
      </button>

      {state.message ? (
        <Notice
          role={state.status === 'error' ? 'alert' : 'status'}
          variant={state.status === 'error' ? 'error' : 'neutral'}
        >
          {state.message}
        </Notice>
      ) : null}
    </form>
  );
}
