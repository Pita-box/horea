'use client';

import { useState, useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';

import { updateEmailAction, updatePasswordAction } from './actions';

type AccountCredentialsFormProps = {
  initialEmail: string;
};

export function AccountCredentialsForm({ initialEmail }: AccountCredentialsFormProps) {
  const { showToast } = useToast();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailInfo, setEmailInfo] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isEmailPending, startEmailTransition] = useTransition();
  const [isPasswordPending, startPasswordTransition] = useTransition();

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setEmailInfo(null);
    const formData = new FormData(event.currentTarget);
    startEmailTransition(() => {
      void updateEmailAction(formData).then((result) => {
        if (result.ok) {
          setEmailInfo(result.message);
          showToast('Potvrzovací e-mail odeslán.');
        } else {
          setEmailError(result.message);
        }
      });
    });
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    startPasswordTransition(() => {
      void updatePasswordAction(formData).then((result) => {
        if (result.ok) {
          form.reset();
          showToast('Heslo bylo změněno.');
        } else {
          setPasswordError(result.message);
        }
      });
    });
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-24)]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">Přihlašovací údaje</h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Změňte e-mail nebo heslo svého účtu.
        </p>
      </div>

      {/* Změna e-mailu */}
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3" noValidate>
        {emailError ? (
          <Notice role="alert" variant="error">
            {emailError}
          </Notice>
        ) : null}
        {emailInfo ? (
          <Notice role="status" variant="neutral">
            {emailInfo}
          </Notice>
        ) : null}

        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="account-email">
            E-mail
          </label>
          <Input
            id="account-email"
            name="email"
            type="email"
            defaultValue={initialEmail}
            autoComplete="email"
            disabled={isEmailPending}
          />
        </div>

        <Button type="submit" className="w-full sm:w-auto" disabled={isEmailPending}>
          {isEmailPending ? 'Ukládám…' : 'Změnit e-mail'}
        </Button>
      </form>

      {/* Změna hesla */}
      <form
        onSubmit={handlePasswordSubmit}
        className="flex flex-col gap-3 border-t border-[var(--color-border-vychozi)] pt-[var(--spacing-24)]"
        noValidate
      >
        {passwordError ? (
          <Notice role="alert" variant="error">
            {passwordError}
          </Notice>
        ) : null}

        <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="account-password">
              Nové heslo
            </label>
            <PasswordInput
              id="account-password"
              name="password"
              autoComplete="new-password"
              disabled={isPasswordPending}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="account-password-confirm">
              Heslo znovu
            </label>
            <PasswordInput
              id="account-password-confirm"
              name="passwordConfirm"
              autoComplete="new-password"
              disabled={isPasswordPending}
            />
          </div>
        </div>
        <p className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Alespoň 8 znaků, jedno velké písmeno a jedna číslice.
        </p>

        <Button type="submit" className="w-full sm:w-auto" disabled={isPasswordPending}>
          {isPasswordPending ? 'Ukládám…' : 'Změnit heslo'}
        </Button>
      </form>
    </div>
  );
}
