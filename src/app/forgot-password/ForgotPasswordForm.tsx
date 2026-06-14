'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { useState, useTransition, type FormEvent } from 'react';

import { forgotPasswordAction } from './actions';
import { INITIAL_FORGOT_PASSWORD_STATE, type ForgotPasswordState } from './state';

export function ForgotPasswordForm() {
  const [state, setState] = useState<ForgotPasswordState>(INITIAL_FORGOT_PASSWORD_STATE);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void forgotPasswordAction(formData).then(setState);
    });
  }

  return (
    <form className="w-full space-y-5 text-left" onSubmit={handleSubmit} noValidate>
      {state.message ? <Notice role="status">{state.message}</Notice> : null}

      <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
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

      <Button className="w-full" type="submit" disabled={isPending}>
        {isPending ? 'Odesílám...' : 'Odeslat odkaz'}
      </Button>
    </form>
  );
}
