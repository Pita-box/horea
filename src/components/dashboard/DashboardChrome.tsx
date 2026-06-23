'use client';

import {
  IconBriefcase,
  IconBuildingStore,
  IconCalendarEvent,
  IconChartHistogram,
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
import { Suspense, useEffect, useState, type ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toast';

import { DashboardFooter } from './DashboardFooter';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar, type DashboardNavItem } from './DashboardSidebar';
import { PageLoader } from './PageLoader';
import { ScrollToHashOnLoad } from './ScrollToHashOnLoad';

export type DashboardVariant = 'owner' | 'admin';

const NAV_BY_VARIANT: Record<DashboardVariant, DashboardNavItem[]> = {
  owner: [
    { href: '/dashboard', label: 'Přehled', icon: IconLayoutDashboard, exact: true },
    { href: '/dashboard/reservations', label: 'Rezervace', icon: IconCalendarEvent },
    { href: '/dashboard/services', label: 'Služby', icon: IconBriefcase },
    { href: '/dashboard/clients', label: 'Klienti', icon: IconUsers },
    { href: '/dashboard/employees', label: 'Zaměstnanci', icon: IconUsersGroup },
    { href: '/dashboard/opening-hours', label: 'Otevírací doba', icon: IconClock },
    { href: '/dashboard/analytics', label: 'Analytika', icon: IconChartHistogram },
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
  { prefix: '/dashboard/analytics', title: 'Analytika' },
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
  { prefix: '/admin/account', title: 'Nastavení účtu' },
  { prefix: '/admin/system', title: 'Správa systému' },
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
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  // Stránka rezervací potřebuje šířku (levý filtr column na „Obsazenosti") →
  // sidebar se zde sbalí automaticky (uživatel ho může ručně zase rozbalit).
  const isReservationsPage = pathname === '/dashboard/reservations';

  useEffect(() => {
    if (isReservationsPage) {
      setCollapsed(true);
    }
  }, [isReservationsPage]);

  const items = NAV_BY_VARIANT[variant];
  const accountHref = variant === 'admin' ? '/admin/account' : '/dashboard/account';
  const settingsHref = variant === 'admin' ? '/admin/system' : '/dashboard/settings';
  const settingsLabel = variant === 'admin' ? 'Správa systému' : 'Nastavení';
  const title = resolveTitle(pathname);

  return (
    <ToastProvider>
      {/* Owner shell: po načtení odscrolluje na #hash kotvu z fulltextu (R12.1/R12.2). */}
      {variant === 'owner' ? <ScrollToHashOnLoad /> : null}
      <Suspense fallback={null}>
        <PageLoader />
      </Suspense>
      <div className="flex h-screen overflow-hidden bg-[var(--color-milky-gray)] text-[var(--color-slate-text)]">
        {/* Desktop sidebar */}
        <aside
          /* className={`fixed left-0 top-0 z-20 hidden h-full border-[var(--color-input-border)] bg-[var(--color-milky-gray)] lg:block ${ */
          className={`fixed left-0 top-0 z-20 hidden h-full border-[var(--color-input-border)] bg-[var(--color-dark)] lg:block ${
            collapsed ? 'w-16' : 'w-64'
          }`}
        >
          <DashboardSidebar
            items={items}
            showUpgrade={variant === 'owner'}
            showHelp={variant === 'owner'}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((value) => !value)}
          />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-[rgba(33,22,76,0.45)]"
              aria-hidden="true"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 border-[var(--color-input-border)] bg-[var(--color-dark)] shadow-2xl">
              <DashboardSidebar
                items={items}
                showUpgrade={variant === 'owner'}
                showHelp={variant === 'owner'}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        {/* Content column — fixní výška, vlastní scroll je až uvnitř panelu */}
        <div
          className={`flex h-screen min-w-0 flex-1 flex-col ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}
        >
          <DashboardHeader
            onMenuClick={() => setMobileOpen(true)}
            settingsHref={settingsHref}
            settingsLabel={settingsLabel}
            accountHref={accountHref}
            showSettings
            showSearch={variant === 'owner'}
          />
          <main className="min-h-0 flex-1 p-4 pt-0 bg-[var(--color-dark)]">
            <div className="flex h-full flex-col overflow-y-auto rounded-[var(--radius-cards)] bg-[image:var(--color-gradient-main)]">
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
