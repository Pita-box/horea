import { resolveAppUserGuardState } from '@/lib/auth/app-user-guard';
import { decideFreeUserGuard } from '@/lib/auth/free-user-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function ErrorPage() {
  // Přihlášený uživatel se zdravým stavem účtu sem nepatří → přesměruj ho TAM,
  // kam ho guard reálně pustí (NE natvrdo na /dashboard). Kdybychom posílali na
  // /dashboard i uzamčené účty (expired/deleted_data), middleware by je hned
  // vrátil na /error → ERR_TOO_MANY_REDIRECTS. Proto použijeme stejné rozhodnutí
  // jako middleware a na /error zůstaneme jen tehdy, když by guard znovu vedl sem.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const guardState = await resolveAppUserGuardState(createAdminClient(), user.id);
    if (guardState) {
      const decision = decideFreeUserGuard({
        pathname: '/dashboard',
        isAdmin: guardState.isAdmin,
        hasBusiness: guardState.hasBusiness,
        subscriptionStatus: guardState.subscriptionStatus,
        draftCurrentStep: guardState.draftCurrentStep,
      });

      if (decision.kind === 'continue') {
        redirect('/dashboard');
      } else if (decision.pathname !== '/error') {
        redirect(decision.search ? `${decision.pathname}?${decision.search}` : decision.pathname);
      }
      // Pokud by guard znovu vedl na /error (stav nelze bezpečně určit) →
      // zůstáváme zde a zobrazíme hlášku. Žádná redirect smyčka.
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-cloud-mist)] px-5 py-10 text-center text-[var(--color-slate-text)]">
      <div className="w-full max-w-[520px] space-y-5 rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)]">
        <p className="text-sm font-semibold text-[var(--color-action-violet)]">Chyba přístupu</p>
        <h1 className="font-[var(--font-polysans)] text-3xl font-semibold text-[var(--color-rich-violet)]">
          Nepodařilo se ověřit stav účtu.
        </h1>
        <p className="text-base leading-7">
          Z bezpečnostních důvodů vás teď nemůžeme pustit do chráněné části aplikace. Zkuste se
          prosím přihlásit znovu.
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-0 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
        >
          Přejít na přihlášení
        </Link>
      </div>
    </main>
  );
}
