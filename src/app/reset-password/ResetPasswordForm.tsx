'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { useState, useTransition, type FormEvent } from 'react';

import { resetPasswordAction } from './actions';
import { INITIAL_RESET_PASSWORD_STATE, type ResetPasswordState } from './state';

export function ResetPasswordForm() {
  const [state, setState] = useState<ResetPasswordState>(INITIAL_RESET_PASSWORD_STATE);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void resetPasswordAction(formData).then(setState);
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
        Nové heslo
        <Input
          className="mt-2"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors.password)}
          disabled={isPending}
          placeholder="Alespoň 8 znaků"
        />
        {state.fieldErrors.password ? (
          <p className="mt-2 text-sm font-medium text-[var(--color-neon-pink)]">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </label>

      <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
        Potvrzení hesla
        <Input
          className="mt-2"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors.passwordConfirm)}
          disabled={isPending}
          placeholder="Zadejte heslo znovu"
        />
        {state.fieldErrors.passwordConfirm ? (
          <p className="mt-2 text-sm font-medium text-[var(--color-neon-pink)]">
            {state.fieldErrors.passwordConfirm}
          </p>
        ) : null}
      </label>

      <Button className="w-full" type="submit" disabled={isPending}>
        {isPending ? 'Ukládám...' : 'Změnit heslo'}
      </Button>
    </form>
  );
}
