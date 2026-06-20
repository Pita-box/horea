'use client';

import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type InputHTMLAttributes } from 'react';

import { Input } from './input';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/**
 * Pole pro heslo s přepínačem zobrazit/skrýt (IconEye / IconEyeOff). Stejné API
 * jako `Input` (kromě `type`, který si řídí sám). `className` se aplikuje na
 * vnější obal (kvůli marginům jako `mt-2`); samotný input má rezervu vpravo na
 * ikonu. Přepínací tlačítko je `tabIndex={-1}`, aby nerušilo tabování ve formuláři.
 */
export function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={['relative', className].filter(Boolean).join(' ')}>
      <Input type={visible ? 'text' : 'password'} className="pr-11" disabled={disabled} {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        disabled={disabled}
        aria-label={visible ? 'Skrýt heslo' : 'Zobrazit heslo'}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[var(--radius-buttons)] text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)] transition-colors hover:text-[var(--color-action-violet)] disabled:opacity-50"
      >
        {visible ? (
          <IconEyeOff size={18} stroke={2} aria-hidden="true" />
        ) : (
          <IconEye size={18} stroke={2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
