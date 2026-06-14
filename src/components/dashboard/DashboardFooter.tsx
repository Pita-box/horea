import Link from 'next/link';

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: 'Všeobecné podmínky', href: '/vseobecne-podminky' },
  { label: 'Ochrana osobních údajů', href: '/ochrana-osobnich-udaju' },
  { label: 'Nápověda', href: '/kontakt' },
];

const mutedClass = 'text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]';

/**
 * Patička dashboardu — vystředěné textové odkazy + copyright. Stejný layout napříč
 * dashboard prostředím (owner i admin).
 */
export function DashboardFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--color-border-vychozi)] px-5 py-6 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-3 text-center">
        <nav
          aria-label="Patička dashboardu"
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
        >
          {FOOTER_LINKS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              className={`${mutedClass} transition-colors hover:text-[var(--color-action-violet)]`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className={`text-sm ${mutedClass}`}>© {year} Horea. Všechna práva vyhrazena.</p>
      </div>
    </footer>
  );
}
