'use client';

import { IconMenu2, IconSettings, IconUser } from '@tabler/icons-react';
import Link from 'next/link';

import { DashboardSearch } from './DashboardSearch';

type DashboardHeaderProps = {
  /** Otevření mobilního sidebar draweru. */
  onMenuClick: () => void;
  /** Cíl ikony nastavení (owner). */
  settingsHref?: string;
  /** Přístupný název ikony nastavení (aria-label). */
  settingsLabel?: string;
  /** Zobrazit ikonu nastavení (owner → nastavení podniku, admin → správa systému). */
  showSettings?: boolean;
  /** Cíl ikony účtu (owner → nastavení účtu, admin → nastavení admin účtu). */
  accountHref?: string;
  /** Zobrazit funkční vyhledávání (zatím owner). */
  showSearch?: boolean;
};

/**
 * Topbar dashboardu — stejný layout napříč prostředím. Vlevo (mobil) hamburger,
 * vpravo akce: rozbalovací vyhledávání, nastavení a účet. Titulek sekce nese
 * hlavní obsahová plocha (ne header).
 */
export function DashboardHeader({
  onMenuClick,
  settingsHref = '/dashboard/settings',
  settingsLabel = 'Nastavení',
  accountHref = '/dashboard/account',
  showSettings = true,
  showSearch = false,
}: DashboardHeaderProps) {
  return (
    /* <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 bg-[var(--color-milky-gray)] px-4 md:px-6"> */
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 bg-[var(--color-dark)] px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label="Otevřít navigaci"
          onClick={onMenuClick}
          className="ahoj -ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-buttons)] text-[white] transition-colors hover:bg-[var(--color-dark-light)] lg:hidden"
        >
          <IconMenu2 size={22} stroke={2} aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {showSearch ? <DashboardSearch /> : null}

        {showSettings ? (
          <Link
            href={settingsHref}
            aria-label={settingsLabel}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--color-dark-light)] text-[white] transition-colors"
          >
            <IconSettings size={20} stroke={2} aria-hidden="true" />
          </Link>
        ) : null}
        <Link
          href={accountHref}
          aria-label="Nastavení účtu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--color-dark-light)] text-[white] transition-opacity"
        >
          <IconUser size={20} stroke={2} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
