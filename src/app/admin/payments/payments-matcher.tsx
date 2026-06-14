'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import type { PendingPaymentItem } from '@/lib/admin/payment-matcher';
import { toPragueDisplay } from '@/lib/datetime';

import { matchPaymentAction } from './actions';

/**
 * Interaktivní tabulka čekajících plateb s akcí spárování (`/admin/payments`,
 * feature `admin-dashboard`, task 15.2). Client komponenta nad server action
 * {@link matchPaymentAction}. Při selhání zobrazí českou hlášku a platba zůstává
 * `pending` (R8.4); samotná data se načítají SSR na stránce.
 */

type PaymentsMatcherProps = {
  payments: PendingPaymentItem[];
};

function formatCzk(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(value);
}

export function PaymentsMatcher({ payments }: PaymentsMatcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleMatch(paymentId: string) {
    setError(null);
    setSuccess(null);
    setPendingId(paymentId);
    startTransition(async () => {
      const result = await matchPaymentAction(paymentId);
      if (result.ok) {
        setSuccess('Platba byla spárována.');
        router.refresh();
      } else {
        setError(result.message);
      }
      setPendingId(null);
    });
  }

  if (payments.length === 0) {
    return <Notice role="status">Žádná čekající platba neodpovídá zvoleným kritériím.</Notice>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Notice variant="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {success ? <Notice role="status">{success}</Notice> : null}

      <Card
        as="section"
        className="overflow-hidden border border-[var(--color-border-vychozi)]"
        aria-label="Čekající platby"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-vychozi)] text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
                <th className="px-4 py-3 font-medium">VS</th>
                <th className="px-4 py-3 font-medium">Částka</th>
                <th className="px-4 py-3 font-medium">Podnik</th>
                <th className="px-4 py-3 font-medium">Vytvořeno</th>
                <th className="px-4 py-3 font-medium">Akce</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
                >
                  <td className="px-4 py-3 font-mono text-[var(--color-slate-text)]">
                    {payment.variableSymbol}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-slate-text)]">
                    {formatCzk(payment.amountCzk)}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-slate-text)]">
                    {payment.businessName ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--color-slate-text)]">
                    {toPragueDisplay(payment.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      type="button"
                      onClick={() => handleMatch(payment.id)}
                      disabled={isPending}
                    >
                      {isPending && pendingId === payment.id ? 'Páruji…' : 'Spárovat'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
