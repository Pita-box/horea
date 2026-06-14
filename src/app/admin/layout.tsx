import { DashboardChrome } from '@/components/dashboard/DashboardChrome';

/**
 * Layout admin prostředí (`/admin/*`). Používá stejný dashboard shell jako owner
 * prostředí, jen s admin navigací (`variant="admin"`). Přístup chrání Access_Guard
 * middleware (`/admin/*`).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardChrome variant="admin">{children}</DashboardChrome>;
}
