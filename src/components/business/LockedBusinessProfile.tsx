import { IconClock, IconHome, IconLock, IconPhone, IconUser } from '@tabler/icons-react';
import Image from 'next/image';
import Link from 'next/link';

import { Logo } from '@/components/Logo';
import {
  BUSINESS_TYPE_LABELS,
  isBusinessType,
  type BusinessType,
} from '@/lib/onboarding/business-types';
import { getTodaysHours, isBusinessOpenNow } from '@/lib/business/open-status';

/**
 * „Zamčený" veřejný náhled NEPUBLIKOVANÉHO podniku pro nepřihlášené návštěvníky
 * (a návštěvníky, kteří nejsou majitel). Ukazuje jen teaser (cover, logo/iniciála,
 * název, typ, stav otevřeno/zavřeno, dnešní otevírací doba, telefon) a vyzývá k
 * přihlášení („Odemknout profil"). Plný profil ani rezervace nejsou dostupné.
 *
 * Server component — žádná interaktivita kromě odkazů.
 */

/** Fallback cover, když podnik žádný nenahrál. */
const FALLBACK_COVER =
  'https://media.horea.cz/de64ab9c-842e-46c9-8047-ce40323a32fb/reserved.webp';

export type LockedBusinessProfileProps = {
  slug: string;
  name: string;
  type: BusinessType | string;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  openingHours: { dayOfWeek: number; opensAt: string; closesAt: string }[];
};

function typeLabel(type: BusinessType | string): string {
  return isBusinessType(type) ? BUSINESS_TYPE_LABELS[type] : BUSINESS_TYPE_LABELS.ostatni;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

export function LockedBusinessProfile({
  slug,
  name,
  type,
  logoUrl,
  coverUrl,
  phone,
  openingHours,
}: LockedBusinessProfileProps) {
  const cover = coverUrl ?? FALLBACK_COVER;
  const isOpenNow = isBusinessOpenNow(openingHours);
  const today = getTodaysHours(openingHours);
  const hoursLine = today
    ? `Dnes ${toHourMinute(today.opensAt)} – ${toHourMinute(today.closesAt)}`
    : 'Dnes zavřeno';

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-cloud-mist)]">
      <main className="flex flex-1 items-center justify-center px-[16px] py-[32px]">
        <div className="w-full max-w-[440px] overflow-hidden rounded-[var(--radius-cards)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] shadow-sm">
          {/* Cover + logo/iniciála */}
          <div className="relative h-[180px] w-full">
            <Image src={cover} alt="" fill priority sizes="440px" className="object-cover" />
            <div className="absolute -bottom-8 left-6 h-24 w-24 overflow-hidden rounded-[var(--radius-2xl)] border-4 border-[var(--color-canvas-white)] bg-[var(--color-canvas-white)] shadow-sm">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={`Logo podniku ${name}`}
                  width={96}
                  height={96}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-full w-full items-center justify-center bg-[var(--color-light-violet)] text-[28px] font-semibold text-[var(--color-rich-violet)]"
                >
                  {initial(name)}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[16px] px-6 pb-6 pt-[44px]">
            {/* Název + disabled slug */}
            <div className="flex flex-col gap-1">
              <h1 className="font-[var(--font-polysans)] text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)]">
                {name}
              </h1>
              <span className="text-[16px] text-[color-mix(in_srgb,var(--color-slate-text)_45%,white)]">
                horea.cz/{slug}
              </span>
            </div>

            {/* Štítky: typ podniku + stav otevřeno/zavřeno */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[var(--color-light-violet)] px-3 py-1 text-[14px] font-semibold text-[var(--color-rich-violet)]">
                {typeLabel(type)}
              </span>
              <span
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-semibold',
                  isOpenNow
                    ? 'bg-[color-mix(in_srgb,var(--color-electric-green)_22%,white)] text-[color-mix(in_srgb,var(--color-electric-green)_55%,var(--color-slate-text))]'
                    : 'bg-[var(--color-soft-gray-fill)] text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'inline-block h-2 w-2 rounded-full',
                    isOpenNow
                      ? 'bg-[var(--color-electric-green)]'
                      : 'bg-[color-mix(in_srgb,var(--color-slate-text)_35%,white)]',
                  ].join(' ')}
                />
                {isOpenNow ? 'Nyní otevřeno' : 'Zavřeno'}
              </span>
            </div>

            {/* Primární akce */}
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 text-[16px] font-semibold text-[var(--color-canvas-white)] transition-opacity hover:opacity-90"
            >
              Odemknout profil
            </Link>

            {/* Otevírací doba (1 řádek) + telefon */}
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-3 text-[16px] text-[var(--color-slate-text)]">
                <IconClock
                  size={20}
                  stroke={2}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-action-violet)]"
                />
                <span>{hoursLine}</span>
              </div>
              {phone ? (
                <div className="flex items-center gap-3 text-[16px]">
                  <IconPhone
                    size={20}
                    stroke={2}
                    aria-hidden="true"
                    className="shrink-0 text-[var(--color-action-violet)]"
                  />
                  <a
                    href={`tel:${phone}`}
                    className="text-[var(--color-slate-text)] hover:text-[var(--color-action-violet)]"
                  >
                    {phone}
                  </a>
                </div>
              ) : null}
            </div>

            {/* Zámek úplně dole + popisek */}
            <div className="flex flex-col items-center gap-2 pt-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-light-violet)]">
                <IconLock
                  size={30}
                  stroke={2}
                  aria-hidden="true"
                  className="text-[var(--color-action-violet)]"
                />
              </span>
              <p className="text-center text-[14px] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                Podnik zatím neodemknul svůj profil.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Spodní navigace — logo ukotvené vlevo, ikony na střed */}
      <nav className="sticky bottom-0 border-t border-[var(--color-input-border)] bg-[var(--color-canvas-white)]">
        <div className="relative flex items-center justify-center px-6 py-3">
          <Link
            href="/"
            aria-label="Horea — domů"
            className="absolute left-6 top-1/2 flex -translate-y-1/2 items-center transition-opacity hover:opacity-80"
          >
            <Logo width={92} height={32} className="h-7 w-auto" />
            <span className="sr-only">Horea</span>
          </Link>
          <ul className="flex items-center gap-2">
            <li>
              <Link
                href="/"
                aria-label="Domů"
                className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-2xl)] text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-light-violet)]"
              >
                <IconHome size={24} stroke={2} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link
                href="/login"
                aria-label="Účet"
                className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-2xl)] text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-light-violet)]"
              >
                <IconUser size={24} stroke={2} aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  );
}
