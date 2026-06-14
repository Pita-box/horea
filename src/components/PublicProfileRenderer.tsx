import {
  IconBrandFacebook,
  IconBrandGoogle,
  IconBrandInstagram,
  IconBrandYoutube,
  IconMail,
  IconMapPin,
  IconPhone,
  type IconProps,
} from '@tabler/icons-react';
import Image from 'next/image';
import type { ComponentType, ReactNode } from 'react';

import { PublicFooter } from '@/components/landing/PublicFooter';
import { Card, Notice } from '@/components/ui';
import {
  BUSINESS_TYPE_LABELS,
  isBusinessType,
  type BusinessType,
} from '@/lib/onboarding/business-types';
import { WEEK_DAYS } from '@/lib/onboarding/data';

/**
 * Server component vykreslující PUBLIKOVANÝ profil podniku (R1, R14, R17).
 *
 * HTML sanitizace (R1.7): uživatelská pole (popis, názvy) se renderují jako
 * PROSTÝ TEXT přes JSX (`{value}`) → React auto-escape. Žádný `dangerouslySetInnerHTML`.
 */
export type PublicProfileBusiness = {
  name: string;
  type: BusinessType | string;
  description: string | null;
  logoUrl: string | null;
  /** Cover/hero obrázek; `null` → cover se vůbec nevyrenderuje. */
  coverUrl?: string | null;
  /** Svislá pozice cover obrázku (object-position Y) v % 0–100. */
  coverPosition?: number;
  phone: string | null;
  contactEmail: string | null;
  address: string | null;
  /** Volitelné odkazy na sociální sítě (zobrazí se jen vyplněné). */
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  googleUrl?: string | null;
};

export type PublicProfileService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCzk: number;
  description: string | null;
  /** ISO timestamp vytvoření — řídí pořadí výpisu vzestupně (R1.4, R4.1). */
  createdAt: string;
};

export type PublicProfileOpeningHours = {
  /** 0 = Pondělí … 6 = Neděle (shodně s tabulkou `opening_hours`). */
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
};

export type PublicProfileEmployee = {
  id: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
};

export type PublicProfileRendererProps = {
  business: PublicProfileBusiness;
  services: PublicProfileService[];
  openingHours: PublicProfileOpeningHours[];
  employees?: PublicProfileEmployee[];
  /** Otevřeno právě teď (dle otevírací doby, TZ Europe/Prague). `undefined` → status se nezobrazí. */
  isOpenNow?: boolean;
  reservationForm?: ReactNode;
};

const priceFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });

function formatPriceCzk(value: number): string {
  return `${priceFormatter.format(value)} Kč`;
}

function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

function typeLabel(type: BusinessType | string): string {
  return isBusinessType(type) ? BUSINESS_TYPE_LABELS[type] : BUSINESS_TYPE_LABELS.ostatni;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

type ActionLink = {
  key: string;
  label: string;
  href: string;
  icon: ComponentType<IconProps>;
  external: boolean;
};

export function PublicProfileRenderer({
  business,
  services,
  openingHours,
  employees = [],
  isOpenNow,
  reservationForm,
}: PublicProfileRendererProps) {
  const hoursByDay = new Map<number, PublicProfileOpeningHours>();
  for (const row of openingHours) {
    hoursByDay.set(row.dayOfWeek, row);
  }

  const orderedServices = [...services].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const hasServices = orderedServices.length > 0;
  const hasTeam = employees.length > 0;
  const hasCover = Boolean(business.coverUrl);
  const coverPos = Math.max(0, Math.min(100, business.coverPosition ?? 50));

  // Akční ikony v hlavičce: telefon, e-mail, sociální sítě — jen vyplněné.
  const actionLinks: ActionLink[] = [];
  if (business.phone) {
    actionLinks.push({
      key: 'phone',
      label: 'Zavolat',
      href: `tel:${business.phone}`,
      icon: IconPhone,
      external: false,
    });
  }
  if (business.contactEmail) {
    actionLinks.push({
      key: 'email',
      label: 'Napsat e-mail',
      href: `mailto:${business.contactEmail}`,
      icon: IconMail,
      external: false,
    });
  }
  if (business.facebookUrl) {
    actionLinks.push({
      key: 'facebook',
      label: 'Facebook',
      href: business.facebookUrl,
      icon: IconBrandFacebook,
      external: true,
    });
  }
  if (business.instagramUrl) {
    actionLinks.push({
      key: 'instagram',
      label: 'Instagram',
      href: business.instagramUrl,
      icon: IconBrandInstagram,
      external: true,
    });
  }
  if (business.youtubeUrl) {
    actionLinks.push({
      key: 'youtube',
      label: 'YouTube',
      href: business.youtubeUrl,
      icon: IconBrandYoutube,
      external: true,
    });
  }
  if (business.googleUrl) {
    actionLinks.push({
      key: 'google',
      label: 'Google',
      href: business.googleUrl,
      icon: IconBrandGoogle,
      external: true,
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-cloud-mist)]">
      {/* Cover — vyrenderuje se jen pokud je nahraný */}
      {hasCover ? (
        <div className="relative h-[220px] w-full md:h-[300px]">
          <Image
            src={business.coverUrl as string}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: `center ${coverPos}%` }}
          />
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 md:px-10">
        {/* Avatar (překrývá cover jen když cover existuje) + akční ikony vpravo */}
        <div
          className={`relative z-10 flex items-end justify-between gap-4 ${hasCover ? '-mt-16' : 'pt-8'}`}
        >
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-[var(--color-canvas-white)] bg-[var(--color-canvas-white)] shadow-sm">
            {business.logoUrl ? (
              <Image
                src={business.logoUrl}
                alt={`Logo podniku ${business.name}`}
                width={128}
                height={128}
                priority
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full w-full items-center justify-center bg-[var(--color-air-blue)] text-[32px] font-semibold text-[var(--color-rich-violet)]"
              >
                {initial(business.name)}
              </div>
            )}
          </div>

        
        </div>

        {/* Název + dekorativní druh podniku + popis */}
        <div className="mt-4 flex flex-col gap-2">
          <div className='flex flex-wrap justify-between gap-2'>
          <div className="flex items-center gap-3">
            <h1 className="font-[var(--font-polysans)] text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)] md:text-[38px]">
              {business.name}
            </h1>
            {isOpenNow !== undefined ? (
              <span
                aria-hidden="true"
                title={isOpenNow ? 'Máme otevřeno' : 'Máme zavřeno'}
                className={[
                  'inline-block h-3 w-3 shrink-0 rounded-full',
                  isOpenNow
                    ? 'bg-[var(--color-electric-green)]'
                    : 'bg-[color-mix(in_srgb,var(--color-slate-text)_35%,white)]',
                ].join(' ')}
              />
            ) : null}
          </div>
          {actionLinks.length > 0 ? (
            <ul className="flex flex-wrap items-center justify-end gap-6 pb-2">
              {actionLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <li key={link.key}>
                    <a
                      href={link.href}
                      aria-label={link.label}
                      title={link.label}
                      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] text-[var(--color-rich-violet)] transition-colors hover:border-[var(--color-action-violet)] hover:text-[var(--color-action-violet)]"
                    >
                      <Icon size={20} stroke={2} aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
          </div>
          <p className="text-[16px] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
            {typeLabel(business.type)}
          </p>
          {business.description ? (
            <p className="mt-2 max-w-3xl whitespace-pre-line text-[16px] leading-relaxed text-[var(--color-slate-text)]">
              {business.description}
            </p>
          ) : null}
        </div>

        {/* Obsah ve dvou sloupcích */}
        <div className="mt-[var(--section-gap)] grid grid-cols-1 gap-[var(--section-gap)] lg:grid-cols-3">
          {/* Levý (široký) sloupec */}
          <div className="flex flex-col gap-[var(--section-gap)] lg:col-span-2">
            <Card as="section" className="p-[var(--card-padding)]">
              <h2 className="mb-[var(--spacing-24)] font-[var(--font-polysans)] text-[28px] font-bold text-[var(--color-rich-violet)]">
                Rezervace
              </h2>
              {hasServices ? (
                reservationForm ? (
                  reservationForm
                ) : (
                  <ul className="flex flex-col gap-3">
                    {orderedServices.map((service) => (
                      <li
                        key={service.id}
                        className="flex items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border-vychozi)] p-4"
                      >
                        <div className="flex flex-col gap-[2px]">
                          <span className="text-[16px] font-medium text-[var(--color-slate-text)]">
                            {service.name}
                          </span>
                          <span className="text-[14px] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                            {service.durationMinutes} min
                          </span>
                        </div>
                        {service.priceCzk > 0 ? (
                          <span className="shrink-0 text-[16px] font-medium text-[var(--color-slate-text)]">
                            {formatPriceCzk(service.priceCzk)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <Notice>Tento podnik zatím nemá žádné rezervovatelné služby</Notice>
              )}
            </Card>

            {hasTeam ? (
              <Card as="section" className="p-[var(--card-padding)]">
                <h2 className="mb-[var(--spacing-24)] font-[var(--font-polysans)] text-[28px] font-bold text-[var(--color-rich-violet)]">
                  Náš tým
                </h2>
                <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3">
                  {employees.map((member) => (
                    <li key={member.id} className="flex flex-col items-center text-center">
                      <div className="mb-4 h-32 w-32 overflow-hidden rounded-[var(--radius-cards)] bg-[var(--color-air-blue)]">
                        {member.photoUrl ? (
                          <Image
                            src={member.photoUrl}
                            alt={member.name}
                            width={128}
                            height={128}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[32px] font-semibold text-[var(--color-rich-violet)]">
                            {initial(member.name)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-[16px] font-bold text-[var(--color-rich-violet)]">
                        {member.name}
                      </h3>
                      {member.role ? (
                        <p className="text-[14px] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                          {member.role}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>

          {/* Pravý (úzký) sloupec */}
          <div className="flex flex-col gap-[var(--section-gap)]">
            <Card as="section" className="p-[var(--card-padding)]">
              <div className="mb-[var(--spacing-16)] flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-[var(--font-polysans)] text-[28px] font-bold text-[var(--color-rich-violet)]">
                  Otevírací doba
                </h2>
                {isOpenNow !== undefined ? (
                  <span
                    className={[
                      'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
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
                    {isOpenNow ? 'Máme otevřeno' : 'Máme zavřeno'}
                  </span>
                ) : null}
              </div>
              <ul className="flex flex-col gap-3">
                {WEEK_DAYS.map((day) => {
                  const hours = hoursByDay.get(day.dayOfWeek);
                  return (
                    <li
                      key={day.dayOfWeek}
                      className={[
                        'flex items-center justify-between gap-4 text-[16px] text-[var(--color-slate-text)]',
                        hours ? '' : 'opacity-60',
                      ].join(' ')}
                    >
                      <span>{day.label}</span>
                      <span>
                        {hours
                          ? `${toHourMinute(hours.opensAt)}–${toHourMinute(hours.closesAt)}`
                          : 'Zavřeno'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {business.phone || business.contactEmail || business.address ? (
              <Card as="section" className="p-[var(--card-padding)]">
                <h2 className="mb-[var(--spacing-16)] font-[var(--font-polysans)] text-[28px] font-bold text-[var(--color-rich-violet)]">
                  Kontakt
                </h2>
                <ul className="flex flex-col gap-4">
                  {business.phone ? (
                    <li className="flex items-start gap-3">
                      <IconPhone
                        size={22}
                        stroke={2}
                        aria-hidden="true"
                        className="mt-[2px] shrink-0 text-[var(--color-action-violet)]"
                      />
                      <a
                        href={`tel:${business.phone}`}
                        className="text-[16px] text-[var(--color-slate-text)] hover:text-[var(--color-action-violet)]"
                      >
                        {business.phone}
                      </a>
                    </li>
                  ) : null}
                  {business.contactEmail ? (
                    <li className="flex items-start gap-3">
                      <IconMail
                        size={22}
                        stroke={2}
                        aria-hidden="true"
                        className="mt-[2px] shrink-0 text-[var(--color-action-violet)]"
                      />
                      <a
                        href={`mailto:${business.contactEmail}`}
                        className="break-all text-[16px] text-[var(--color-slate-text)] hover:text-[var(--color-action-violet)]"
                      >
                        {business.contactEmail}
                      </a>
                    </li>
                  ) : null}
                  {business.address ? (
                    <li className="flex items-start gap-3">
                      <IconMapPin
                        size={22}
                        stroke={2}
                        aria-hidden="true"
                        className="mt-[2px] shrink-0 text-[var(--color-action-violet)]"
                      />
                      <span className="text-[16px] text-[var(--color-slate-text)]">
                        {business.address}
                      </span>
                    </li>
                  ) : null}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
