'use client';

import { Logo } from '@/components/Logo';
import { IconCalendarBolt, IconHelpCircle, IconLogout, type IconProps } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Přesná shoda cesty (jinak prefix). */
  exact?: boolean;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

type DashboardSidebarProps = {
  items: DashboardNavItem[];
  /** Zobrazit tlačítko „Předplatné" (jen owner). */
  showUpgrade?: boolean;
  /** Voláno po kliknutí na odkaz (zavření mobilního draweru). */
  onNavigate?: () => void;
};

/**
 * Sidebar dashboardu — stejný layout, dynamické položky (`items`). Brand nahoře,
 * navigace uprostřed (aktivní stav dle `usePathname`), akce dole (předplatné/nápověda/odhlášení).
 */
export function DashboardSidebar({ items, showUpgrade = false, onNavigate }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 px-4 py-8">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center px-4 transition-opacity hover:opacity-80"
      >
        <Logo width={104} height={36} className="h-8 w-auto" />
        <span className="sr-only">Horea</span>
      </Link>

      <nav aria-label="Hlavní navigace" className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-3 rounded-[var(--radius-buttons)] px-4 py-3 text-sm transition-colors',
                active
                  ? 'bg-[var(--color-canvas-white)] font-semibold text-[var(--color-action-violet)] shadow-sm'
                  : 'font-medium text-[var(--color-slate-text)] hover:bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)]',
              ].join(' ')}
            >
              <Icon size={20} stroke={2} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--color-input-border)_50%,transparent)] pt-4">
        {showUpgrade ? (
          <Link
            href="/dashboard/plans"
            onClick={onNavigate}
            className="mb-2 flex items-center justify-center gap-3 rounded-[var(--radius-buttons)] bg-[var(--color-canvas-white)] py-3 text-center text-sm font-semibold text-[var(--color-action-violet)] shadow-sm transition-colors hover:bg-[var(--color-action-violet)] hover:text-[white]"
          >
            <IconCalendarBolt size={20} stroke={2} aria-hidden="true" />
            Tarify
          </Link>
        ) : null}
        <Link
          href="/kontakt"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-[var(--radius-buttons)] px-4 py-2 text-sm font-medium text-[var(--color-slate-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)]"
        >
          <IconHelpCircle size={20} stroke={2} aria-hidden="true" />
          Nápověda
        </Link>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-[var(--radius-buttons)] px-4 py-2 text-left text-sm font-medium text-[var(--color-slate-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-action-violet)_14%,white)]"
          >
            <IconLogout size={20} stroke={2} aria-hidden="true" />
            Odhlásit se
          </button>
        </form>
      </div>
    </div>
  );
}
