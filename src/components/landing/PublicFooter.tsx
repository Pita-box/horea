/**
 * Patička veřejných (marketingových) stránek Horea. Sdílená přes (marketing) layout.
 */
import { IconBrandFacebook, IconBrandInstagram } from '@tabler/icons-react';

import { Logo } from '@/components/Logo';

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: 'Kontaktní údaje', href: '/kontakt' },
  { label: 'Předplatné', href: '/predplatne' },
  { label: 'Všeobecné podmínky', href: '/vseobecne-podminky' },
  { label: 'Zásady ochrany osobních údajů', href: '/ochrana-osobnich-udaju' },
  { label: 'Nastavení cookies', href: '#' },
];

const SOCIAL_LINKS = [
  { label: 'Facebook', href: 'https://www.facebook.com/horea', Icon: IconBrandFacebook },
  { label: 'Instagram', href: 'https://www.instagram.com/horea', Icon: IconBrandInstagram },
];

const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]';

export function PublicFooter({ transparent = false }: { transparent?: boolean } = {}) {
  const year = new Date().getFullYear();

  return (
    <footer className={`mt-auto ${transparent ? 'bg-transparent' : 'bg-[var(--color-cloud-mist)]'}`}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-[16px] py-[48px] md:px-10">
        {/* Řádek 1 — vlevo logo + kontakt, vpravo social ikony */}
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
            <Logo width={104} height={36} className="h-9 w-auto" />
            <div className={`flex flex-col gap-1 font-[var(--font-plus-jakarta-sans)] text-sm ${mutedClass}`}>
              <p>
                <a
                  href="mailto:info@horea.cz"
                  className="transition-colors hover:text-[var(--color-action-violet)]"
                >
                  info@horea.cz
                </a>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-action-violet)] hover:text-[var(--color-canvas-white)]"
              >
                <Icon size={22} stroke={2} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        {/* Řádek 2 — odkazy na řádku + copyright vpravo */}
        <div className="flex w-full flex-col items-center gap-4 border-t border-[color-mix(in_srgb,var(--color-slate-text)_12%,transparent)] pt-6 md:flex-row md:justify-between">
          <nav
            aria-label="Patička"
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-[var(--font-plus-jakarta-sans)] text-sm"
          >
            {FOOTER_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className={`${mutedClass} transition-colors hover:text-[var(--color-action-violet)]`}
              >
                {label}
              </a>
            ))}
          </nav>
          <p className={`text-center font-[var(--font-plus-jakarta-sans)] text-sm md:text-right ${mutedClass}`}>
            © {year} Horea. Všechna práva vyhrazena.
          </p>
        </div>
      </div>
    </footer>
  );
}
