'use client';

import { IconMenu2, IconSettings, IconUser } from '@tabler/icons-react';
import Link from 'next/link';

import { DashboardSearch } from './DashboardSearch';

type DashboardHeaderProps = {
  /** Otevření mobilního sidebar draweru. */
  onMenuClick: () => void;
  /** Cíl ikony nastavení (owner vs admin). */
  settingsHref?: string;
  /** Cíl ikony účtu (owner → nastavení účtu). */
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
  accountHref = '/dashboard/account',
  showSearch = false,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 bg-[var(--color-milky-gray)] px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label="Otevřít navigaci"
          onClick={onMenuClick}
          className="-ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-buttons)] text-[var(--color-rich-violet)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)] lg:hidden"
        >
          <IconMenu2 size={22} stroke={2} aria-hidden="true" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        {showSearch ? <DashboardSearch /> : null}

        <Link
          href={settingsHref}
          aria-label="Nastavení"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-slate-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)] hover:text-[var(--color-action-violet)]"
        >
          <IconSettings size={20} stroke={2} aria-hidden="true" />
        </Link>
        <Link
          href={accountHref}
          aria-label="Nastavení účtu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)] text-[var(--color-action-violet)] transition-opacity hover:opacity-80"
        >
          <IconUser size={20} stroke={2} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
