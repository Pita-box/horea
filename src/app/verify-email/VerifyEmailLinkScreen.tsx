'use client';

import { IconCircleCheck, IconMailExclamation } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { AuthShell } from '@/components/auth/AuthShell';

import { verifyEmailCodeAction, verifyEmailLinkAction, type VerifyEmailLinkResult } from './actions';
import { ResendVerificationForm } from './ResendVerificationForm';

type VerifyEmailLinkScreenProps = {
  tokenHash?: string;
  type?: string;
  code?: string;
};

type ScreenState = { kind: 'pending' } | { kind: 'success' } | { kind: 'expired' };

const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';
const headingClass =
  'mb-4 font-[var(--font-polysans)] text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)]';
const violetBubbleClass =
  'mb-6 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[var(--color-action-violet)] text-[var(--color-canvas-white)] shadow-lg';

function getScreenState(result: VerifyEmailLinkResult): ScreenState {
  return result.kind === 'success' ? { kind: 'success' } : { kind: 'expired' };
}

function SuccessContent() {
  return (
    <>
      <div className="relative mb-6">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--color-lush-green)]">
          <IconCircleCheck
            size={56}
            stroke={2}
            aria-hidden="true"
            className="text-[var(--color-action-violet)]"
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-[color-mix(in_srgb,var(--color-aqua-blue)_35%,white)]"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -left-3 h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--color-sunset-pink)_35%,white)]"
        />
      </div>
      <h1 className={headingClass}>Váš účet byl úspěšně potvrzen!</h1>
      <p className={`mb-8 leading-relaxed ${mutedClass}`}>
        Nyní se můžete přihlásit a začít využívat všechny funkce Horea. Vaše kreativní cesta za
        efektivitou začíná právě teď.
      </p>
      <Link
        href="/login"
        className="inline-flex min-h-[48px] items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-10 font-[var(--font-plus-jakarta-sans)] text-base font-semibold text-[var(--color-canvas-white)] shadow-lg transition-opacity hover:opacity-90"
      >
        Přejít k přihlášení
      </Link>
    </>
  );
}

function ExpiredContent() {
  return (
    <>
      <div className={violetBubbleClass}>
        <IconMailExclamation size={40} stroke={1.8} aria-hidden="true" />
      </div>
      <h1 className={headingClass}>Odkaz vypršel</h1>
      <p className={`mb-8 leading-relaxed ${mutedClass}`}>
        Platnost potvrzovacího odkazu vypršela. Zadejte znovu email z registrace a pošleme vám nový
        potvrzovací odkaz.
      </p>
      <ResendVerificationForm />
    </>
  );
}

function PendingContent() {
  return (
    <>
      <div className={violetBubbleClass}>
        <IconMailExclamation size={40} stroke={1.8} aria-hidden="true" />
      </div>
      <h1 className={headingClass}>Potvrzujeme účet</h1>
      <p className={`leading-relaxed ${mutedClass}`}>
        Ověřujeme potvrzovací odkaz. Tato kontrola obvykle trvá jen chvíli.
      </p>
    </>
  );
}

export function VerifyEmailLinkScreen({
  tokenHash = '',
  type = '',
  code = '',
}: VerifyEmailLinkScreenProps) {
  const [state, setState] = useState<ScreenState>({ kind: 'pending' });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    const verify = code ? verifyEmailCodeAction(code) : verifyEmailLinkAction(tokenHash, type);

    void verify.then((result) => {
      setState(getScreenState(result));
    });
  }, [code, tokenHash, type]);

  return (
    <AuthShell>
      <div className="mx-auto flex w-full max-w-md flex-col gap-[var(--section-gap)] lg:max-w-xl">
        <div className="relative overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] shadow-sm">
          <div className="flex flex-col items-center text-center">
            {state.kind === 'success' ? (
              <SuccessContent />
            ) : state.kind === 'expired' ? (
              <ExpiredContent />
            ) : (
              <PendingContent />
            )}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
