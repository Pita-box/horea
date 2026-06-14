'use client';

import {
  IconBriefcase,
  IconBuildingStore,
  IconCalendarEvent,
  IconClipboardList,
  IconClock,
  IconCreditCard,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconSettings,
  IconTicket,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toast';

import { DashboardFooter } from './DashboardFooter';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar, type DashboardNavItem } from './DashboardSidebar';

export type DashboardVariant = 'owner' | 'admin';

const NAV_BY_VARIANT: Record<DashboardVariant, DashboardNavItem[]> = {
  owner: [
    { href: '/dashboard', label: 'Přehled', icon: IconLayoutDashboard, exact: true },
    { href: '/dashboard/reservations', label: 'Rezervace', icon: IconCalendarEvent },
    { href: '/dashboard/services', label: 'Služby', icon: IconBriefcase },
    { href: '/dashboard/clients', label: 'Klienti', icon: IconUsers },
    { href: '/dashboard/employees', label: 'Zaměstnanci', icon: IconUsersGroup },
    { href: '/dashboard/opening-hours', label: 'Otevírací doba', icon: IconClock },
    { href: '/dashboard/settings', label: 'Nastavení', icon: IconSettings },
  ],
  admin: [
    { href: '/admin', label: 'Přehled', icon: IconLayoutDashboard, exact: true },
    { href: '/admin/businesses', label: 'Podniky', icon: IconBuildingStore },
    { href: '/admin/payments', label: 'Platby', icon: IconCreditCard },
    { href: '/admin/coupons', label: 'Kupóny', icon: IconTicket },
    { href: '/admin/plans', label: 'Tarify a funkce', icon: IconLayoutGrid },
    { href: '/admin/audit', label: 'Audit', icon: IconClipboardList },
  ],
};

/**
 * Titulek topbaru odvozený z aktuální cesty (nejdelší shoda prefixu; `/dashboard`
 * a `/admin` jen přesně). Pokud nic nesedí, fallback „Dashboard".
 */
const TITLE_BY_PATH: { prefix: string; exact?: boolean; title: string }[] = [
  { prefix: '/dashboard', exact: true, title: 'Přehled' },
  { prefix: '/dashboard/reservations', title: 'Rezervace' },
  { prefix: '/dashboard/services', title: 'Služby' },
  { prefix: '/dashboard/clients', title: 'Klienti' },
  { prefix: '/dashboard/employees', title: 'Zaměstnanci' },
  { prefix: '/dashboard/opening-hours', title: 'Otevírací doba' },
  { prefix: '/dashboard/settings', title: 'Nastavení' },
  { prefix: '/dashboard/account', title: 'Nastavení účtu' },
  { prefix: '/dashboard/subscription', title: 'Předplatné' },
  { prefix: '/dashboard/plans', title: 'Tarify a funkce' },
  { prefix: '/dashboard/faq', title: 'Nápověda' },
  { prefix: '/admin', exact: true, title: 'Přehled' },
  { prefix: '/admin/businesses', title: 'Podniky' },
  { prefix: '/admin/payments', title: 'Platby' },
  { prefix: '/admin/coupons', title: 'Kupóny' },
  { prefix: '/admin/plans', title: 'Tarify a funkce' },
  { prefix: '/admin/audit', title: 'Audit' },
];

function resolveTitle(pathname: string): string {
  let best: { title: string; len: number } | null = null;
  for (const entry of TITLE_BY_PATH) {
    const match = entry.exact
      ? pathname === entry.prefix
      : pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`);
    if (match && (best === null || entry.prefix.length > best.len)) {
      best = { title: entry.title, len: entry.prefix.length };
    }
  }
  return best?.title ?? 'Dashboard';
}

type DashboardChromeProps = {
  variant?: DashboardVariant;
  children: ReactNode;
};

/**
 * Shell dashboard prostředí — skládá Sidebar + Header + Footer kolem `children`.
 * Layout je stejný, obsah dynamický podle `variant` (owner/admin nav položky).
 * Obsah ({@link children}) sedí v bílé ploše se zaoblenými rohy; titulek sekce
 * nese topbar (odvozeno z cesty). Drží stav mobilního sidebar draweru.
 */
export function DashboardChrome({ variant = 'owner', children }: DashboardChromeProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const items = NAV_BY_VARIANT[variant];
  const settingsHref = variant === 'admin' ? '/admin' : '/dashboard/settings';
  const accountHref = variant === 'admin' ? '/admin' : '/dashboard/account';
  const title = resolveTitle(pathname);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--color-milky-gray)] text-[var(--color-slate-text)]">
        {/* Desktop sidebar */}
        <aside className="fixed left-0 top-0 z-20 hidden h-full w-64 border-[var(--color-input-border)] bg-[var(--color-milky-gray)] lg:block">
          <DashboardSidebar items={items} showUpgrade={variant === 'owner'} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-[rgba(33,22,76,0.45)]"
              aria-hidden="true"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 border-r border-[var(--color-input-border)] bg-[var(--color-milky-gray)] shadow-xl">
              <DashboardSidebar
                items={items}
                showUpgrade={variant === 'owner'}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        {/* Content column — fixní výška, vlastní scroll je až uvnitř panelu */}
        <div className="flex h-screen min-w-0 flex-1 flex-col lg:ml-64">
          <DashboardHeader
            onMenuClick={() => setMobileOpen(true)}
            settingsHref={settingsHref}
            accountHref={accountHref}
            showSearch={variant === 'owner'}
          />
          <main className="min-h-0 flex-1 p-4 pt-0">
            <div className="flex h-full flex-col overflow-y-auto rounded-[var(--radius-cards)] bg-gradient-to-br from-[color-mix(in_srgb,var(--color-action-violet)_18%,white)] via-[var(--color-action-violet)_18%] to-[color-mix(in_srgb,var(--color-sunset-pink)_22%,white)]">
              <div className="flex-1 p-[var(--section-gap)]">
                <h1 className="mb-6 font-[var(--font-polysans)] text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--color-rich-violet)] md:text-[32px]">
                  {title}
                </h1>
                {children}
              </div>
              <DashboardFooter />
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
