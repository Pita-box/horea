'use client';

import { IconMenu2, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Logo } from '@/components/Logo';

/**
 * Plovoucí „pill" header pro veřejné (marketingové) stránky Horea — homepage,
 * Obchodní podmínky, Kontakt, Blog apod. NEPOUŽÍVAT na auth stránkách, veřejné
 * stránce podniku ani v dashboardu.
 *
 * Chování: ve výchozím stavu (nahoře) zobrazuje logo + navigaci + odkaz na
 * přihlášení. Po odscrollování se lišta zkompaktní a zprava se vysune primární
 * CTA „Vytvořit účet". Na mobilu je navigace skrytá a dostupná přes hamburger
 * tlačítko vpravo, které rozbalí menu pod lištou.
 */

const NAV_LINKS = [
  { label: 'Domů', href: '/' },
  { label: 'Výhody', href: '/#vyhody' },
  { label: 'Funkce', href: '/#funkce' },
  { label: 'Druh podniků', href: '/#obory' },
  { label: 'Ceník', href: '/#cenik' },
  { label: 'Časté dotazy', href: '/#faq' },
];

const navLinkClass =
  'rounded-full px-3 py-2 font-[var(--font-plus-jakarta-sans)] text-sm font-bold text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)] transition-colors duration-200 hover:bg-[var(--color-cloud-mist)] hover:text-[var(--color-action-violet)]';

export function PublicHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <div className="relative mx-auto w-full max-w-[960px]">
        <div
          className={[
            'flex w-full items-center justify-between gap-4 rounded-full border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] pl-6 pr-3 transition-all duration-300',
            scrolled ? 'py-2 shadow-md' : 'py-3 shadow-sm',
          ].join(' ')}
        >
          <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
            <Logo width={92} height={32} priority className="h-8 w-auto" />
            <span className="sr-only">Horea</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Hlavní navigace">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} href={link.href} className={navLinkClass}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden min-h-[44px] items-center px-3 font-[var(--font-plus-jakarta-sans)] text-sm font-bold text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)] transition-colors hover:text-[var(--color-action-violet)] sm:flex"
            >
              Přihlásit se
            </Link>
            <div
              className={[
                'overflow-hidden opacity-100 transition-all duration-300 ease-out',
                // Mobil: CTA vždy viditelné. Desktop (md+): vysune se až po odscrollování.
                'max-w-[220px]',
                scrolled ? 'md:max-w-[220px] md:opacity-100' : 'md:max-w-0 md:opacity-0',
              ].join(' ')}
            >
              <Link
                href="/register"
                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 py-2 font-[var(--font-plus-jakarta-sans)] text-sm font-semibold text-[var(--color-canvas-white)] transition-opacity hover:opacity-90"
              >
                Vytvořit účet
              </Link>
            </div>

            {/* Hamburger — jen mobil/tablet (skrytý od md). */}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-menu"
              aria-label={menuOpen ? 'Zavřít menu' : 'Otevřít menu'}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors hover:bg-[var(--color-cloud-mist)] md:hidden"
            >
              {menuOpen ? (
                <IconX size={24} stroke={2} aria-hidden="true" />
              ) : (
                <IconMenu2 size={24} stroke={2} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobilní rozbalovací menu (overlay pod lištou). */}
        {menuOpen ? (
          <nav
            id="public-mobile-menu"
            aria-label="Hlavní navigace"
            className="absolute left-0 right-0 top-full mt-2 flex flex-col gap-1 rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-3 shadow-md md:hidden"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-[var(--radius-buttons)] px-3 font-[var(--font-plus-jakarta-sans)] text-sm font-bold text-[var(--color-slate-text)] transition-colors hover:bg-[var(--color-cloud-mist)] hover:text-[var(--color-action-violet)]"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-[44px] items-center rounded-[var(--radius-buttons)] px-3 font-[var(--font-plus-jakarta-sans)] text-sm font-bold text-[var(--color-action-violet)] transition-colors hover:bg-[var(--color-cloud-mist)]"
            >
              Přihlásit se
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
