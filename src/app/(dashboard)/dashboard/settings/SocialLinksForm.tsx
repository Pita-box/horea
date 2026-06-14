'use client';

import {
  IconBrandFacebook,
  IconBrandGoogle,
  IconBrandInstagram,
  IconBrandYoutube,
  type IconProps,
} from '@tabler/icons-react';
import { useState, useTransition, type ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';

import { updateSocialLinksAction, type SocialKey, type SocialLinks } from './profile-actions';

type SocialLinksFormProps = {
  initialLinks: SocialLinks;
};

const FIELDS: { key: SocialKey; label: string; placeholder: string; icon: ComponentType<IconProps> }[] = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…', icon: IconBrandFacebook },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…', icon: IconBrandInstagram },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…', icon: IconBrandYoutube },
  { key: 'google', label: 'Google místo', placeholder: 'https://maps.google.com/…', icon: IconBrandGoogle },
];

export function SocialLinksForm({ initialLinks }: SocialLinksFormProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      void updateSocialLinksAction(formData).then((result) => {
        if (result.ok) {
          showToast('Odkazy byly uloženy.');
        } else {
          setStatus({ ok: false, message: result.message });
        }
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--spacing-24)]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">Sociální sítě</h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Vyplněné odkazy se zobrazí jako ikony na vašem veřejném profilu.
        </p>
      </div>

      {status ? (
        <Notice role="status" variant={status.ok ? 'neutral' : 'error'}>
          {status.message}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-4">
        {FIELDS.map(({ key, label, placeholder, icon: Icon }) => (
          <label key={key} className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--color-slate-text)]">
              <Icon size={18} stroke={2} aria-hidden="true" className="text-[var(--color-action-violet)]" />
              {label}
            </span>
            <Input
              type="url"
              name={key}
              defaultValue={initialLinks[key] ?? ''}
              placeholder={placeholder}
              inputMode="url"
            />
          </label>
        ))}
      </div>

      <Button type="submit" className="w-full sm:w-auto" disabled={isPending}>
        {isPending ? 'Ukládám…' : 'Uložit odkazy'}
      </Button>
    </form>
  );
}
