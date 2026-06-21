import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
import {
  listPendingPayments,
  searchPendingPaymentsByVariableSymbol,
} from '@/lib/admin/payment-matcher';
import { createAdminClient } from '@/lib/supabase/admin';

import { PaymentsMatcher } from './payments-matcher';

/**
 * Ruční párování plateb admin dashboardu `/admin/payments` (feature
 * `admin-dashboard`, Requirement 8, task 15.2).
 *
 * SSR stránka načte seznam čekajících plateb ({@link listPendingPayments}, R8.1)
 * nebo — je-li ve `searchParams` zadán variabilní symbol (`?vs=`) — výsledek
 * vyhledání dle VS ({@link searchPendingPaymentsByVariableSymbol}, R8.2). Vlastní
 * akce spárování běží přes server action (`./actions.ts`) v interaktivní client
 * komponentě {@link PaymentsMatcher}.
 *
 * Přístup je chráněn Access_Guard middlewarem (`/admin/*`), proto stránka
 * předpokládá přihlášeného admina a čte přes service-role klienta.
 */

export const dynamic = 'force-dynamic';

type PaymentsPageProps = {
  searchParams: Promise<{ vs?: string | string[] }>;
};

function getParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function AdminPaymentsPage({ searchParams }: PaymentsPageProps) {
  const params = await searchParams;
  const variableSymbol = getParam(params.vs);

  const supabase = createAdminClient();
  const payments = variableSymbol
    ? await searchPendingPaymentsByVariableSymbol(supabase, variableSymbol)
    : await listPendingPayments(supabase);

  return (
    <div className="flex flex-col gap-6">
      <Card
        as="section"
        className="border border-[var(--color-border-vychozi)] p-[var(--card-padding)]"
        aria-label="Vyhledání podle variabilního symbolu"
      >
          <div className="mb-4 flex items-start justify-between gap-2">
            <h2 className="font-[var(--font-polysans)] text-xl font-semibold text-[var(--color-rich-violet)]">
              Vyhledání podle variabilního symbolu
            </h2>
            <InfoTooltip text="Najde čekající platby podle variabilního symbolu z bankovního příkazu. Když pole necháš prázdné a dáš Zobrazit vše, uvidíš všechny dosud nespárované platby." />
          </div>
          <form method="get" className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-slate-text)]">
                Variabilní symbol
              </span>
              <Input
                type="search"
                name="vs"
                defaultValue={variableSymbol ?? ''}
                placeholder="napr. 7043441770"
                inputMode="numeric"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-[var(--radius-buttons)] bg-[var(--color-action-violet)] px-5 text-sm font-normal leading-none text-[var(--color-canvas-white)] transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)]"
              >
                Vyhledat
              </button>
              <Link
                href="/admin/payments"
                className="text-sm font-medium text-[var(--color-action-violet)] hover:underline"
              >
                Zobrazit vše
              </Link>
            </div>
          </form>
        </Card>

      <PaymentsMatcher payments={payments} />
    </div>
  );
}
