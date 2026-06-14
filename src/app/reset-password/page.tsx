import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/card';
import { serverLog } from '@/lib/log-server';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from './ResetPasswordForm';

type ResetPasswordSearchParams = {
  code?: string | string[];
  token_hash?: string | string[];
  type?: string | string[];
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

async function establishRecoverySession(params: ResetPasswordSearchParams): Promise<boolean> {
  const tokenHash = getParam(params.token_hash);
  const type = getParam(params.type);

  if (tokenHash && type === 'recovery') {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });

    if (error) {
      await serverLog.warn('reset_password_verify_otp_failed', { error });
      return false;
    }

    return true;
  }

  // Zpětná kompatibilita se staršími odkazy s parametrem `?code=`.
  const code = getParam(params.code);
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      await serverLog.warn('reset_password_code_exchange_failed', { error });
      return false;
    }

    return true;
  }

  return false;
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
  const isValidSession = await establishRecoverySession(params);

  if (!isValidSession) {
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
