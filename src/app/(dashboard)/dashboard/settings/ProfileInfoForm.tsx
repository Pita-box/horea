'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';

import { updateProfileInfoAction, type ProfileInfo } from './profile-actions';

type ProfileInfoFormProps = {
  initialInfo: ProfileInfo;
};

type Field = 'name' | 'description' | 'phone' | 'email' | 'address';

export function ProfileInfoForm({ initialInfo }: ProfileInfoFormProps) {
  const { showToast } = useToast();
  const [descLen, setDescLen] = useState(initialInfo.description.length);
  const [phone, setPhone] = useState(initialInfo.phone.replace(/\D/g, '').slice(0, 9));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setErrors({});
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      void updateProfileInfoAction(formData).then((result) => {
        if (result.ok) {
          showToast('Údaje byly uloženy.');
        } else {
          setErrors((result.fieldErrors as Partial<Record<Field, string>>) ?? {});
          setStatus({ ok: false, message: result.message });
        }
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--spacing-24)]" noValidate>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">O nás a kontakt</h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Tyto údaje se zobrazují na veřejném profilu.
        </p>
      </div>

      {status ? (
        <Notice role={status.ok ? 'status' : 'alert'} variant={status.ok ? 'neutral' : 'error'}>
          {status.message}
        </Notice>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="pi-name">
          Název podniku
        </label>
        <Input
          id="pi-name"
          name="name"
          defaultValue={initialInfo.name}
          aria-invalid={Boolean(errors.name)}
          disabled={isPending}
        />
        {errors.name ? (
          <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.name}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="pi-description">
          O nás
        </label>
        <textarea
          id="pi-description"
          name="description"
          defaultValue={initialInfo.description}
          onChange={(event) => setDescLen(event.currentTarget.value.length)}
          maxLength={400}
          className="min-h-[120px] w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.6] text-[var(--color-slate-text)] outline-none transition-colors focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)] disabled:opacity-50"
          aria-invalid={Boolean(errors.description)}
          disabled={isPending}
        />
        <div className="flex items-center justify-between gap-2">
          {errors.description ? (
            <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.description}</p>
          ) : (
            <span />
          )}
          <span className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
            {descLen}/400
          </span>
        </div>
      </div>

      <div className="grid gap-[var(--spacing-16)] sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="pi-phone">
            Telefon
          </label>
          <Input
            id="pi-phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            maxLength={9}
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="123456789"
            aria-invalid={Boolean(errors.phone)}
            disabled={isPending}
          />
          {errors.phone ? (
            <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.phone}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="pi-email">
            Kontaktní e-mail
          </label>
          <Input
            id="pi-email"
            name="email"
            type="email"
            defaultValue={initialInfo.contactEmail}
            placeholder="email@podnik.cz"
            aria-invalid={Boolean(errors.email)}
            disabled={isPending}
          />
          {errors.email ? (
            <p className="text-sm font-medium text-[var(--color-neon-pink)]">{errors.email}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="pi-address">
          Adresa <span className="font-normal text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">(nepovinné)</span>
        </label>
        <Input
          id="pi-address"
          name="address"
          defaultValue={initialInfo.address}
          placeholder="Ulice, č.p., Město, PSČ"
          disabled={isPending}
        />
      </div>

      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending ? 'Ukládám…' : 'Uložit údaje'}
      </Button>
    </form>
  );
}
