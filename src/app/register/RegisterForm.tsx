'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Notice } from '@/components/ui/notice';
import { passwordChecks } from '@/lib/auth/password';
import { IconCircle, IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import { registerAction } from './actions';
import { INITIAL_REGISTER_STATE, type RegisterActionState } from './state';

const legalLinkClass = 'font-semibold text-[var(--color-action-violet)] hover:underline';

const PASSWORD_RULES: { label: string; test: (password: string) => boolean }[] = [
  { label: 'Alespoň 8 znaků', test: passwordChecks.minLength },
  { label: 'Alespoň jedno velké písmeno', test: passwordChecks.hasUppercase },
  { label: 'Alespoň jedna číslice', test: passwordChecks.hasDigit },
];

const okClass = 'text-[color-mix(in_srgb,var(--color-electric-green)_60%,var(--color-slate-text))]';
const failClass = 'text-[var(--color-neon-pink)]';
const idleClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

function PasswordChecklist({ password }: { password: string }) {
  const touched = password.length > 0;

  return (
    <ul className="mt-3 space-y-1.5" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        const state = !touched ? 'idle' : ok ? 'ok' : 'fail';
        const Icon = state === 'ok' ? IconCircleCheck : state === 'fail' ? IconCircleX : IconCircle;
        const colorClass = state === 'ok' ? okClass : state === 'fail' ? failClass : idleClass;

        return (
          <li key={rule.label} className={`flex items-center gap-2 text-sm ${colorClass}`}>
            <Icon size={16} stroke={2} aria-hidden="true" className="shrink-0" />
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-sm font-medium text-[var(--color-neon-pink)]">{message}</p>;
}

export function RegisterForm() {
  const [state, setState] = useState<RegisterActionState>(INITIAL_REGISTER_STATE);
  const [password, setPassword] = useState('');
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    const form = formRef.current;
    if (!form) {
      return;
    }
    const formData = new FormData(form);

    startTransition(() => {
      void registerAction(formData).then(setState);
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
        <FieldError message={state.fieldErrors.email} />
      </label>

      <label className="block text-sm font-semibold text-[var(--color-slate-text)]">
        Heslo
        <PasswordInput
          className="mt-2"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors.password)}
          disabled={isPending}
          placeholder="Alespoň 8 znaků"
        />
        <PasswordChecklist password={password} />
        <FieldError message={state.fieldErrors.password} />
      </label>

      <label
        className={`flex gap-[var(--spacing-12)] text-sm leading-6 ${
          state.fieldErrors.tosAccepted
            ? 'text-[var(--color-neon-pink)] has-[:checked]:text-[var(--color-slate-text)]'
            : 'text-[var(--color-slate-text)]'
        }`}
      >
        <Checkbox
          name="tosAccepted"
          disabled={isPending}
          aria-invalid={Boolean(state.fieldErrors.tosAccepted)}
        />
        <span>
          Souhlasím s{' '}
          <a
            className={legalLinkClass}
            href="/vseobecne-podminky"
            target="_blank"
            rel="noopener noreferrer"
          >
            Všeobecnými obchodními podmínkami
          </a>
          .
        </span>
      </label>

      <label
        className={`flex gap-[var(--spacing-12)] text-sm leading-6 ${
          state.fieldErrors.dpaAccepted
            ? 'text-[var(--color-neon-pink)] has-[:checked]:text-[var(--color-slate-text)]'
            : 'text-[var(--color-slate-text)]'
        }`}
      >
        <Checkbox
          name="dpaAccepted"
          disabled={isPending}
          aria-invalid={Boolean(state.fieldErrors.dpaAccepted)}
        />
        <span>
          Souhlasím se{' '}
          <a
            className={legalLinkClass}
            href="/vseobecne-podminky#sekce-7"
            target="_blank"
            rel="noopener noreferrer"
          >
            smlouvou o zpracování osobních údajů (DPA)
          </a>
          .
        </span>
      </label>

      <Button className="w-full" type="button" onClick={submit} disabled={isPending}>
        {isPending ? 'Odesílám...' : 'Vytvořit účet'}
      </Button>
    </form>
  );
}
