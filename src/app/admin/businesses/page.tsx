import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import {
  listBusinesses,
  type BusinessListFilters,
  type SubscriptionStatus,
} from '@/lib/admin/business-manager';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Seznam podniků admin dashboardu `/admin/businesses` (feature `admin-dashboard`,
 * Requirement 3, task 7.2).
 *
 * SSR stránka napojená na {@link listBusinesses}. Filtry (stav předplatného,
 * datum registrace) a vyhledávací výraz se předávají přes `searchParams` z GET
 * formuláře. Při prázdném výsledku zobrazí českou informační hlášku (R3.5). Klik
 * na řádek vede na detail `/admin/businesses/[id]`.
 *
 * Přístup je chráněn Access_Guard middlewarem (`/admin/*`), proto stránka
 * předpokládá přihlášeného admina a čte cross-tenant data přes service-role
 * klienta.
 */

export const dynamic = 'force-dynamic';

type BusinessesPageProps = {
  searchParams: Promise<{
    stav?: string | string[];
    od?: string | string[];
    do?: string | string[];
    q?: string | string[];
  }>;
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  free: 'Free',
  active: 'Aktivní',
  grace_period: 'Grace period',
  expired: 'Vypršelo',
  deleted_data: 'Smazaná data',
};

const PLAN_LABELS: Record<string, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

const STATUS_VALUES = Object.keys(STATUS_LABELS) as SubscriptionStatus[];

function getParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveStatus(raw: string | undefined): SubscriptionStatus | undefined {
  return STATUS_VALUES.includes(raw as SubscriptionStatus) ? (raw as SubscriptionStatus) : undefined;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium' }).format(new Date(iso));
}

export default async function AdminBusinessesPage({ searchParams }: BusinessesPageProps) {
  const params = await searchParams;
  const status = resolveStatus(getParam(params.stav));
  const registeredFrom = getParam(params.od);
  const registeredTo = getParam(params.do);
  const search = getParam(params.q);

  const filters: BusinessListFilters = {
    status,
    // Datumové hranice interpretujeme jako celý den (od začátku, do konce).
    registeredFrom: registeredFrom ? `${registeredFrom}T00:00:00` : undefined,
    registeredTo: registeredTo ? `${registeredTo}T23:59:59` : undefined,
    search,
  };

  const supabase = createAdminClient();
  const businesses = await listBusinesses(supabase, filters);

  const selectClass =
    'h-10 w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none transition-colors focus:border-[var(--color-action-violet)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)]';

  return (
    <div className="flex flex-col gap-6">
      <Card
        as="section"
        className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Filtry seznamu podniků"
      >
          <form method="get" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">Vyhledávání</span>
              <Input
                type="search"
                name="q"
                defaultValue={search ?? ''}
                placeholder="E-mail, název nebo slug"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Stav předplatného
              </span>
              <select name="stav" defaultValue={status ?? ''} className={selectClass}>
                <option value="">Všechny stavy</option>
                {STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Registrace od
              </span>
              <DatePicker name="od" defaultValue={registeredFrom ?? ''} allowClear placeholder="Registrace od" aria-label="Registrace od" />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Registrace do
              </span>
              <DatePicker name="do" defaultValue={registeredTo ?? ''} allowClear placeholder="Registrace do" aria-label="Registrace do" />
            </label>

            <div className="flex items-center gap-3 md:col-span-2 lg:col-span-4">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
              >
                Filtrovat
              </button>
              <Link
                href="/admin/businesses"
                className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
              >
                Zrušit filtry
              </Link>
            </div>
          </form>
        </Card>

        {businesses.length === 0 ? (
          <Notice role="status">Žádný podnik neodpovídá zvoleným filtrům ani vyhledávání.</Notice>
        ) : (
          <Card
            as="section"
            className="overflow-hidden border border-[var(--color-border-vychozi)]"
            aria-label="Seznam podniků"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-vychozi)] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                    <th className="px-5 py-3 font-medium">Název</th>
                    <th className="px-5 py-3 font-medium">Slug</th>
                    <th className="px-5 py-3 font-medium">Vlastník</th>
                    <th className="px-5 py-3 font-medium">Stav</th>
                    <th className="px-5 py-3 font-medium">Tarif</th>
                    <th className="px-5 py-3 font-medium">Registrace</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((business) => (
                    <tr
                      key={business.id}
                      className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/businesses/${business.id}`}
                          className="font-medium text-[var(--color-action-violet)] hover:underline"
                        >
                          {business.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">{business.slug}</td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">
                        {business.ownerEmail ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">
                        {business.subscriptionStatus
                          ? STATUS_LABELS[business.subscriptionStatus]
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">
                        {business.subscriptionPlan
                          ? (PLAN_LABELS[business.subscriptionPlan] ?? business.subscriptionPlan)
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-[var(--color-slate-text)]">
                        {formatDate(business.registeredAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
    </div>
  );
}
