import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import {
  getBusinessDetail,
  type PaymentMethod,
  type PaymentStatus,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@/lib/admin/business-manager';
import { toPragueDisplay } from '@/lib/datetime';
import { createAdminClient } from '@/lib/supabase/admin';

import { BusinessActions } from './BusinessActions';

/**
 * Detail podniku admin dashboardu `/admin/businesses/[id]` (feature
 * `admin-dashboard`, Requirement 4, task 8.2).
 *
 * SSR stránka zobrazující **read-only** data podniku napojená na
 * {@link getBusinessDetail}: profil podniku a vlastníka (R4.1), aktuální
 * stav/tarif/`current_period_end` (R4.2), historii plateb (R4.3) a celkový počet
 * rezervací (R4.4). Pokud podnik neexistuje, zobrazí českou hlášku
 * „Podnik nebyl nalezen". Administrátorské akce (override, free trial, comp,
 * pozastavení, vynucené smazání, opětovné odeslání faktury) zajišťuje client
 * komponenta {@link BusinessActions} napojená na server actions (task 17.1).
 *
 * Přístup je chráněn Access_Guard middlewarem (`/admin/*`), proto stránka
 * předpokládá přihlášeného admina a čte cross-tenant data přes service-role
 * klienta.
 */

export const dynamic = 'force-dynamic';

type BusinessDetailPageProps = {
  params: Promise<{ id: string }>;
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  free: 'Free',
  active: 'Aktivní',
  grace_period: 'Grace period',
  expired: 'Vypršelo',
  deleted_data: 'Smazaná data',
};

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Čeká',
  paid: 'Zaplaceno',
  failed: 'Selhalo',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  auto_charge: 'Automatická platba',
  qr_manual: 'QR / ruční',
  admin_manual: 'Ruční (admin)',
};

function formatCzk(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(value);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-medium text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
        {label}
      </dt>
      <dd className="text-base text-[var(--color-slate-text)]">{value}</dd>
    </div>
  );
}

export default async function AdminBusinessDetailPage({ params }: BusinessDetailPageProps) {
  const { id } = await params;
  const supabase = createAdminClient();
  const business = await getBusinessDetail(supabase, id);

  if (!business) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/admin/businesses"
          className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
        >
          ← Zpět na seznam podniků
        </Link>
        <Notice role="status">Podnik nebyl nalezen.</Notice>
      </div>
    );
  }

  const subscriptionStatus = business.subscription.status
    ? STATUS_LABELS[business.subscription.status]
    : '—';
  const subscriptionPlan = business.subscription.plan
    ? PLAN_LABELS[business.subscription.plan]
    : '—';
  const periodEnd = business.subscription.currentPeriodEnd
    ? toPragueDisplay(business.subscription.currentPeriodEnd)
    : '—';

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/businesses"
        className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
      >
        ← Zpět na seznam podniků
      </Link>

      <h2 className="font-[var(--font-polysans)] text-2xl font-bold tracking-[-0.02em] text-[var(--color-rich-violet)]">
        {business.name}
      </h2>

      <Card
        as="section"
        className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Profil podniku a vlastníka"
      >
          <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            Profil
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailRow label="Název" value={business.name} />
            <DetailRow label="Slug" value={business.slug} />
            <DetailRow label="Typ" value={business.type} />
            <DetailRow label="Publikováno" value={business.isPublished ? 'Ano' : 'Ne'} />
            <DetailRow label="Registrace podniku" value={toPragueDisplay(business.registeredAt)} />
            <DetailRow label="E-mail vlastníka" value={business.owner.email ?? '—'} />
            <DetailRow
              label="Registrace vlastníka"
              value={
                business.owner.registeredAt ? toPragueDisplay(business.owner.registeredAt) : '—'
              }
            />
            <DetailRow label="Popis" value={business.description ?? '—'} />
          </dl>
        </Card>

        <Card
          as="section"
          className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          aria-label="Předplatné"
        >
          <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            Předplatné
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <DetailRow label="Stav" value={subscriptionStatus} />
            <DetailRow label="Tarif" value={subscriptionPlan} />
            <DetailRow label="Konec období" value={periodEnd} />
          </dl>
        </Card>

        <Card
          as="section"
          className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          aria-label="Rezervace"
        >
          <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            Rezervace
          </h2>
          <p className="text-base text-[var(--color-slate-text)]">
            Celkový počet rezervací:{' '}
            <span className="font-[var(--font-polysans)] font-semibold text-[var(--color-rich-violet)]">
              {new Intl.NumberFormat('cs-CZ').format(business.totalReservations)}
            </span>
          </p>
        </Card>

        <Card
          as="section"
          className="space-y-4 border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
          aria-label="Historie plateb"
        >
          <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
            Historie plateb
          </h2>
          {business.payments.length === 0 ? (
            <Notice role="status">Podnik zatím nemá žádné platby.</Notice>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-vychozi)] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                    <th className="px-3 py-3 font-medium">Datum</th>
                    <th className="px-3 py-3 font-medium">Částka</th>
                    <th className="px-3 py-3 font-medium">Stav</th>
                    <th className="px-3 py-3 font-medium">Metoda</th>
                    <th className="px-3 py-3 font-medium">VS</th>
                  </tr>
                </thead>
                <tbody>
                  {business.payments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-3 py-3 text-[var(--color-slate-text)]">
                        {toPragueDisplay(payment.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-slate-text)]">
                        {formatCzk(payment.amountCzk)}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-slate-text)]">
                        {payment.status ? PAYMENT_STATUS_LABELS[payment.status] : '—'}
                      </td>
                      <td className="px-3 py-3 text-[var(--color-slate-text)]">
                        {payment.method ? PAYMENT_METHOD_LABELS[payment.method] : '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-[var(--color-slate-text)]">
                        {payment.variableSymbol ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <BusinessActions
          businessId={business.id}
          currentPlan={business.subscription.plan}
          currentStatus={business.subscription.status}
          currentPeriodEnd={business.subscription.currentPeriodEnd}
        />
    </div>
  );
}
