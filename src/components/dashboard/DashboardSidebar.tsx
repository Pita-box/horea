'use client';

import { Logo } from '@/components/Logo';
import {
  IconCalendarBolt,
  IconHelpCircle,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  type IconProps,
} from '@tabler/icons-react';
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
  /** Zobrazit odkaz „Nápověda" (jen owner; admin ho nepotřebuje). */
  showHelp?: boolean;
  /** Voláno po kliknutí na odkaz (zavření mobilního draweru). */
  onNavigate?: () => void;
  /** Sbalený režim — jen ikony (desktop rail). */
  collapsed?: boolean;
  /** Přepínač sbalení (jen desktop); když chybí, tlačítko se nezobrazí. */
  onToggleCollapse?: () => void;
};

/**
 * Sidebar dashboardu — stejný layout, dynamické položky (`items`). Brand nahoře,
 * navigace uprostřed (aktivní stav dle `usePathname`), akce dole (předplatné/nápověda/odhlášení).
 * V režimu `collapsed` se skryjí textové popisky a zůstanou jen vycentrované ikony
 * (popisky dostupné přes `title` a skrytý text pro čtečky).
 */
export function DashboardSidebar({
  items,
  showUpgrade = false,
  showHelp = true,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <div className={`flex h-full flex-col gap-6 py-8 ${collapsed ? 'px-2' : 'px-4'}`}>
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
        {collapsed ? null : (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <Logo width={104} height={36} white className="h-8 w-auto" />
            <span className="sr-only">Horea</span>
          </Link>
        )}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Rozbalit postranní panel' : 'Sbalit postranní panel'}
            aria-pressed={collapsed}
            title={collapsed ? 'Rozbalit' : 'Sbalit'}
            className="hidden rounded-[var(--radius-buttons)] p-2 text-[white] transition-colors hover:bg-[var(--color-dark-light)] hover:text-[var(--color-light-violet)] lg:flex"
          >
            {collapsed ? (
              <IconLayoutSidebarLeftExpand size={20} stroke={2} aria-hidden="true" />
            ) : (
              <IconLayoutSidebarLeftCollapse size={20} stroke={2} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

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
              title={collapsed ? item.label : undefined}
              className={[
                'flex items-center gap-3 rounded-[var(--radius-buttons)] text-sm transition-colors',
                collapsed ? 'justify-center px-0 py-3' : 'px-4 py-3',
                active
                  ? 'bg-[var(--color-canvas-white)] font-semibold text-[var(--color-action-violet)] shadow-sm'
                  : 'font-medium text-[white] hover:bg-[var(--color-dark-light)]',
              ].join(' ')}
            >
              <Icon size={20} stroke={2} aria-hidden="true" />
              {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--color-input-border)_10%,transparent)] pt-4">
        {showUpgrade ? (
          <Link
            href="/dashboard/plans"
            onClick={onNavigate}
            title={collapsed ? 'Tarify' : undefined}
            className={[
              'mb-2 flex items-center justify-center gap-3 rounded-[var(--radius-buttons)] bg-[var(--color-electric-green)] py-3 text-center text-sm font-semibold text-[var(--color-dark)] shadow-sm transition-colors hover:bg-[var(--color-action-violet)] hover:text-[white]',
              collapsed ? 'px-0' : '',
            ].join(' ')}
          >
            <IconCalendarBolt size={20} stroke={2} aria-hidden="true" />
            {collapsed ? <span className="sr-only">Tarify</span> : 'Tarify'}
          </Link>
        ) : null}
        {showHelp ? (
          <Link
            href="/kontakt"
            onClick={onNavigate}
            title={collapsed ? 'Nápověda' : undefined}
            className={[
              'flex items-center gap-3 rounded-[var(--radius-buttons)] py-2 text-sm font-medium text-[var(--color-gay)] transition-colors hover:bg-[var(--color-dark-light)] hover:text-[white]',
              collapsed ? 'justify-center px-0' : 'px-4',
            ].join(' ')}
          >
            <IconHelpCircle size={20} stroke={2} aria-hidden="true" />
            {collapsed ? <span className="sr-only">Nápověda</span> : 'Nápověda'}
          </Link>
        ) : null}
        <form action="/logout" method="post">
          <button
            type="submit"
            title={collapsed ? 'Odhlásit se' : undefined}
            className={[
              'flex w-full items-center gap-3 rounded-[var(--radius-buttons)] py-2 text-left text-sm font-medium text-[var(--color-gay)] transition-colors hover:bg-[var(--color-red)] hover:text-[white]',
              collapsed ? 'justify-center px-0' : 'px-4',
            ].join(' ')}
          >
            <IconLogout size={20} stroke={2} aria-hidden="true" />
            {collapsed ? <span className="sr-only">Odhlásit se</span> : 'Odhlásit se'}
          </button>
        </form>
      </div>
    </div>
  );
}
