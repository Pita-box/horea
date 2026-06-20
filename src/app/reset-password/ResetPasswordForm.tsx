'use client';

import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Notice } from '@/components/ui/notice';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import { resetPasswordAction } from './actions';
import { INITIAL_RESET_PASSWORD_STATE, type ResetPasswordState } from './state';

export function ResetPasswordForm() {
  const [state, setState] = useState<ResetPasswordState>(INITIAL_RESET_PASSWORD_STATE);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    const form = formRef.current;
    if (!form) {
      return;
    }
    const formData = new FormData(form);

    startTransition(() => {
      void resetPasswordAction(formData).then(setState);
    });
  }

  // Odeslání přes Enter v poli — zabráníme nativnímu submitu (ten je v
  // sandboxovaném rámci bez `allow-forms` blokován) a zpracujeme přes JS.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  return (
    <form ref={formRef} className="space-y-5" onSubmit={handleSubmit} noValidate>
      {state.message ? (
        <Notice role="alert" variant="error">
          {state.message}
        </Notice>
      ) : null}

      <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
        Nové heslo
        <PasswordInput
          className="mt-2"
          name="password"
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
        <PasswordInput
          className="mt-2"
          name="passwordConfirm"
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

      <Button className="w-full" type="button" onClick={submit} disabled={isPending}>
        {isPending ? 'Ukládám...' : 'Změnit heslo'}
      </Button>
    </form>
  );
}
