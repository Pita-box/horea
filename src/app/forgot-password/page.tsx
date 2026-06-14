import { IconArrowLeft, IconRestore, IconShieldCheck } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/AuthShell';

import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Zapomenuté heslo | Horea',
  description: 'Obnovení hesla k účtu Horea.',
};

const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-[var(--section-gap)] lg:max-w-[480px]">
        {/* Hlavní karta */}
        <div className="relative overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] shadow-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] text-[var(--color-canvas-white)] shadow-lg">
              <IconRestore size={32} stroke={1.8} aria-hidden="true" />
            </div>
            <h1 className="mb-2 font-[var(--font-polysans)] text-[38px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)]">
              Zapomenuté heslo
            </h1>
            <p className={`max-w-[320px] leading-relaxed ${mutedClass}`}>
              Zadejte svůj e-mail a my vám zašleme odkaz pro obnovení hesla.
            </p>
          </div>

          <ForgotPasswordForm />

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-action-violet)] transition-all hover:underline"
            >
              <IconArrowLeft size={18} stroke={2} aria-hidden="true" />
              Zpět na přihlášení
            </Link>
          </div>
        </div>

        {/* Bezpečnostní badge */}
        <div className="text-center">
          <div
            className={`inline-flex items-center gap-2 rounded-full border border-[var(--color-input-border)] bg-[var(--color-cloud-mist)] px-4 py-2 text-sm ${mutedClass}`}
          >
            <IconShieldCheck size={16} stroke={2} aria-hidden="true" />
            Zabezpečené šifrování dat 256-bit
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
