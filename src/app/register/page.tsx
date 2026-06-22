import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/AuthShell';
import { redirectIfAuthenticated } from '@/lib/auth/redirect-if-authenticated';

import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Registrace | Horea',
  description: 'Vytvoření účtu podnikatele v rezervační platformě Horea.',
};

const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

export default async function RegisterPage() {
  await redirectIfAuthenticated();

  return (
    <AuthShell>
      <div className="grid w-full grid-cols-1 items-center gap-[var(--section-gap)] lg:grid-cols-2 lg:gap-12">
        {/* Levý brandový panel (jen desktop) */}
        <div className="hidden lg:block">
          <div className="relative flex aspect-[4/5] w-full flex-col justify-end overflow-hidden rounded-[40px] bg-[var(--color-air-blue)] p-[var(--card-padding)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- asset na vlastní R2 CDN (media.horea.cz) mimo next/image remotePatterns; responzivní přes srcSet */}
            <img
              src="https://media.horea.cz/de64ab9c-842e-46c9-8047-ce40323a32fb/horea-rezervace-klientu-640.webp"
              srcSet="https://media.horea.cz/de64ab9c-842e-46c9-8047-ce40323a32fb/horea-rezervace-klientu-360.webp 360w, https://media.horea.cz/de64ab9c-842e-46c9-8047-ce40323a32fb/horea-rezervace-klientu-480.webp 480w, https://media.horea.cz/de64ab9c-842e-46c9-8047-ce40323a32fb/horea-rezervace-klientu-640.webp 640w"
              sizes="(min-width: 1024px) min(536px, calc(50vw - 64px)), 1px"
              alt="Podnikatelka ve své provozovně"
              width={640}
              height={800}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Tmavý gradient pro čitelnost textu */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(33,22,76,0.78)] via-[rgba(33,22,76,0.25)] to-transparent"
            />
            <div className="relative z-10 flex flex-col gap-3">
              <span className="inline-flex w-fit rounded-full border border-[var(--color-canvas-white)] px-4 py-1 font-[var(--font-plus-jakarta-sans)] text-sm font-semibold text-[var(--color-canvas-white)]">
                NOVINKA
              </span>
              <h2 className="font-[var(--font-polysans)] text-[38px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-canvas-white)]">
                Tvořte s lehkostí.
              </h2>
              <p className="max-w-md font-[var(--font-plus-jakarta-sans)] text-lg text-[color-mix(in_srgb,var(--color-canvas-white)_88%,transparent)]">
                Připojte se k podnikatelům, kteří už používají Horea ke zefektivnění svých rezervací.
              </p>
            </div>
          </div>
        </div>

        {/* Pravý formulář */}
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <div className="rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-[var(--card-padding)] shadow-sm">
            <div className="mb-6">
              <h1 className="font-[var(--font-polysans)] text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)]">
                Vytvořit účet
              </h1>
              <p className={`mt-1 text-sm ${mutedClass}`}>
                Registrace pro podnikatele, kteří chtějí nastavit vlastní rezervační profil.
              </p>
            </div>

            <RegisterForm />

            <p className={`mt-6 text-center text-sm ${mutedClass}`}>
              Už máte účet?{' '}
              <Link
                className="font-semibold text-[var(--color-action-violet)] hover:underline"
                href="/login"
              >
                Přihlaste se
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
