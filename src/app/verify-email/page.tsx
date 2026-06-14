import { IconHeadset, IconHelpCircle, IconMailExclamation } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/AuthShell';
import { redirectIfAuthenticated } from '@/lib/auth/redirect-if-authenticated';

import { ResendVerificationForm } from './ResendVerificationForm';
import { VerifyEmailLinkScreen } from './VerifyEmailLinkScreen';

type VerifyEmailSearchParams = {
  code?: string | string[];
  error?: string | string[];
  error_code?: string | string[];
  token_hash?: string | string[];
  type?: string | string[];
};

type VerifyEmailPageProps = {
  searchParams: Promise<VerifyEmailSearchParams>;
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ověření emailu | Horea',
  description: 'Ověření emailové adresy pro účet Horea.',
};

function getParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

const helpCardClass =
  'group relative block overflow-hidden rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-6 text-left';
/** Kruh, který se ze středu ikony (left-12/top-12) roztáhne přes celou kartu. */
const rippleClass =
  'pointer-events-none absolute left-12 top-12 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full transition-transform duration-500 ease-out group-hover:scale-100';
const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

/** Výchozí stav stránky — účet po registraci ještě nepotvrzen (neaktivovaný účet). */
function UnconfirmedAccountScreen() {
  return (
    <AuthShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-[var(--section-gap)] lg:max-w-xl">
        {/* Hlavní karta */}
        <div className="relative overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[var(--color-action-violet)] text-[var(--color-canvas-white)] shadow-lg">
              <IconMailExclamation size={40} stroke={1.8} aria-hidden="true" />
            </div>
            <h1 className="mb-4 font-[var(--font-polysans)] text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)]">
              Váš účet zatím nebyl potvrzen.
            </h1>
            <p className={`mb-8 leading-relaxed ${mutedClass}`}>
              Zkontrolujte prosím svůj e-mail a klikněte na aktivační odkaz. Pokud vám e-mail
              nedorazil, zkontrolujte složku se spamem nebo si nechte odkaz poslat znovu.
            </p>
            <ResendVerificationForm />
          </div>
        </div>

        {/* Pomocné karty */}
        <div className="grid grid-cols-1 gap-[16px] md:grid-cols-2">
          <Link href="/kontakt" className={helpCardClass}>
            <span aria-hidden="true" className={`${rippleClass} bg-[var(--color-air-blue)]`} />
            <div className="relative z-10 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-air-blue)] text-[var(--color-rich-violet)]">
                <IconHelpCircle size={24} stroke={2} aria-hidden="true" />
              </div>
              <div>
                <p className="font-[var(--font-plus-jakarta-sans)] font-semibold text-[var(--color-rich-violet)]">
                  Potřebujete pomoct?
                </p>
                <p className={`text-sm ${mutedClass}`}>
                  Mrkněte na často kladené otázky pro více informací.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/kontakt" className={helpCardClass}>
            <span
              aria-hidden="true"
              className={`${rippleClass} bg-[color-mix(in_srgb,var(--color-sunset-pink)_30%,white)]`}
            />
            <div className="relative z-10 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-buttons)] bg-[color-mix(in_srgb,var(--color-sunset-pink)_30%,white)] text-[var(--color-neon-pink)]">
                <IconHeadset size={24} stroke={2} aria-hidden="true" />
              </div>
              <div>
                <p className="font-[var(--font-plus-jakarta-sans)] font-semibold text-[var(--color-rich-violet)]">
                  Kontaktujte podporu
                </p>
                <p className={`text-sm ${mutedClass}`}>
                  Náš tým je tu pro vás, pokud máte problémy s registrací.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const code = getParam(params.code);
  const error = getParam(params.error);
  const errorCode = getParam(params.error_code);
  const tokenHash = getParam(params.token_hash);
  const type = getParam(params.type);

  if (code) {
    return <VerifyEmailLinkScreen code={code} />;
  }

  if (error || errorCode) {
    return <VerifyEmailLinkScreen />;
  }

  if (tokenHash) {
    return <VerifyEmailLinkScreen tokenHash={tokenHash} type={type ?? ''} />;
  }

  // Výchozí větev (bez parametrů) = info „účet nepotvrzen". Přihlášený (a tedy už
  // potvrzený) uživatel sem nepatří → přesměrování na dashboard.
  await redirectIfAuthenticated();

  return <UnconfirmedAccountScreen />;
}
