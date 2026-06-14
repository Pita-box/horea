'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { ResendVerificationForm } from '@/app/verify-email/ResendVerificationForm';
import { useState, useTransition, type FormEvent } from 'react';

import { loginAction } from './actions';
import { INITIAL_LOGIN_STATE, type LoginActionState } from './state';

export function LoginForm() {
  const [state, setState] = useState<LoginActionState>(INITIAL_LOGIN_STATE);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void loginAction(formData).then(setState);
    });
  }

  return (
    <div className="space-y-6">
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {state.message ? (
          <Notice role="alert" variant="error">
            {state.message}
          </Notice>
        ) : null}

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

        <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
          Heslo
          <Input
            className="mt-2"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors.password)}
            disabled={isPending}
            placeholder="Vaše heslo"
          />
        </label>

        <label className="flex gap-[var(--spacing-12)] text-sm leading-6 text-[var(--color-slate-text)]">
          <Checkbox name="rememberMe" disabled={isPending} />
          <span>Zůstat přihlášen</span>
        </label>

        <Button className="w-full" type="submit" disabled={isPending}>
          {isPending ? 'Přihlašuji...' : 'Přihlásit se'}
        </Button>
      </form>

      {state.emailNotConfirmed ? (
        <div className="space-y-3 border-t border-[var(--color-border-vychozi)] pt-6">
          <p className="text-sm leading-6 text-[var(--color-slate-text)]">
            Zadejte email z registrace a pošleme nový ověřovací odkaz.
          </p>
          <ResendVerificationForm />
        </div>
      ) : null}
    </div>
  );
}
