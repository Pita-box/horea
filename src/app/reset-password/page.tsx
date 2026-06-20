import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ResetPasswordForm } from './ResetPasswordForm';

type ResetPasswordSearchParams = {
  code?: string | string[];
  token_hash?: string | string[];
  type?: string | string[];
  error?: string | string[];
};

type ResetPasswordPageProps = {
  searchParams: Promise<ResetPasswordSearchParams>;
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nové heslo | Horea',
  description: 'Nastavení nového hesla k účtu Horea.',
};

function getParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function ResetLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-cloud-mist)] px-5 py-10 text-[var(--color-slate-text)]">
      <div className="w-full max-w-[520px] space-y-6">
        <div className="space-y-3 text-center">
          <Link href="/" className="inline-flex items-center hover:opacity-80">
            <Logo width={84} height={29} className="h-7 w-auto" />
            <span className="sr-only">Horea</span>
          </Link>
          <div className="space-y-2">
            <h1 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
              {title}
            </h1>
            <p className="text-base leading-7 text-[var(--color-slate-text)]">{description}</p>
          </div>
        </div>

        <Card className="space-y-6 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]">
          {children}
        </Card>
      </div>
    </main>
  );
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  // Verifikaci recovery tokenu řeší Route Handler /auth/confirm (umí zapsat
  // cookies a nejdřív odhlásí případnou jinou session). Odkazy mířící sem
  // s tokenem (např. starší e-maily) tam přesměrujeme se zachováním parametrů.
  const tokenHash = getParam(params.token_hash);
  const type = getParam(params.type);
  const code = getParam(params.code);

  if ((tokenHash && type) || code) {
    const query = new URLSearchParams();
    if (tokenHash) {
      query.set('token_hash', tokenHash);
    }
    if (type) {
      query.set('type', type);
    }
    if (code) {
      query.set('code', code);
    }
    redirect(`/auth/confirm?${query.toString()}`);
  }

  // Bez tokenu rozhoduje existence recovery session (nastavené /auth/confirm).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ResetLayout
        title="Odkaz nefunguje"
        description="Odkaz pro obnovení hesla je neplatný nebo expiroval. Požádejte o nový."
      >
        <Link
          className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
          href="/forgot-password"
        >
          Poslat nový odkaz
        </Link>
      </ResetLayout>
    );
  }

  return (
    <ResetLayout
      title="Nastavit nové heslo"
      description="Zadejte nové heslo. Po uložení odhlásíme všechny relace tohoto účtu."
    >
      <ResetPasswordForm />
    </ResetLayout>
  );
}
