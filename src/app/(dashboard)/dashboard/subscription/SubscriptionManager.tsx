'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { planPriceCzk, type SubscriptionPlan } from '@/lib/checkout/pricing';

import {
  cancelAutoRenewAction,
  cancelPlanChangeAction,
  enableAutoRenewAction,
  requestPlanChangeAction,
  validateCouponAction,
  type SubscriptionActionResult,
} from './actions';

const GENERIC_ERROR = 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.';

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

const PLAN_ORDER: readonly SubscriptionPlan[] = ['start', 'pokrocily', 'max'];

type SubscriptionStatus = 'free' | 'active' | 'grace_period' | 'expired' | 'deleted_data';

type SubscriptionManagerProps = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  autoRenew: boolean;
  pendingPlanChange: SubscriptionPlan | null;
  /** Předvybraný tarif (po příchodu z /dashboard/plans přes `?plan=`). */
  initialPlan?: SubscriptionPlan | null;
};

function formatPrice(plan: SubscriptionPlan): string {
  return `${new Intl.NumberFormat('cs-CZ').format(planPriceCzk(plan))} Kč/měsíc`;
}

export function SubscriptionManager({
  autoRenew,
  pendingPlanChange,
  plan,
  status,
  initialPlan = null,
}: SubscriptionManagerProps) {
  if (status === 'free') {
    return <CheckoutSection initialPlan={initialPlan} />;
  }

  if (status === 'active' || status === 'grace_period') {
    return (
      <ManageSection
        status={status}
        plan={plan}
        autoRenew={autoRenew}
        pendingPlanChange={pendingPlanChange}
        initialPlan={initialPlan}
      />
    );
  }

  // expired / deleted_data: tyto stavy middleware na /dashboard/* nepouští
  // (fail-closed), proto zde stačí informativní hláška.
  return (
    <Notice>
      Předplatné je neaktivní. Pro obnovení nás prosím kontaktujte nebo dokončete platbu podle
      e-mailu s pokyny.
    </Notice>
  );
}

function CheckoutSection({ initialPlan }: { initialPlan: SubscriptionPlan | null }) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(initialPlan ?? 'start');
  const [couponCode, setCouponCode] = useState('');
  const [couponNotice, setCouponNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingCoupon, startCouponCheck] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleCouponCheck() {
    setCouponNotice(null);
    startCouponCheck(() => {
      void validateCouponAction(couponCode).then((result) => {
        setCouponNotice({ ok: result.ok, message: result.message });
      });
    });
  }

  async function handleCheckout() {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          couponCode: couponCode.trim() || undefined,
        }),
      });

      const data = (await response.json()) as {
        outcome?: 'redirect' | 'activated';
        redirectUrl?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(data.message ?? GENERIC_ERROR);
        return;
      }

      if (data.outcome === 'redirect' && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      if (data.outcome === 'activated') {
        router.refresh();
        return;
      }

      setError(GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-[var(--spacing-24)]">
      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      <fieldset className="space-y-[var(--spacing-12)]">
        <legend className="text-base font-semibold text-[var(--color-rich-violet)]">
          Vyberte tarif
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLAN_ORDER.map((option) => {
            const checked = selectedPlan === option;
            return (
              <label
                key={option}
                className={[
                  'flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-[var(--radius-buttons)] border p-[var(--spacing-16)] transition-colors',
                  checked
                    ? 'border-[var(--color-action-violet)] bg-[color-mix(in_srgb,var(--color-action-violet)_6%,white)]'
                    : 'border-[var(--color-input-border)] bg-[var(--color-canvas-white)] hover:border-[var(--color-action-violet)]',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="plan"
                    value={option}
                    checked={checked}
                    onChange={() => setSelectedPlan(option)}
                    className="accent-[var(--color-action-violet)]"
                  />
                  <span className="text-base font-semibold text-[var(--color-rich-violet)]">
                    {PLAN_LABELS[option]}
                  </span>
                </span>
                <span className="text-sm text-[var(--color-slate-text)]">{formatPrice(option)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-[var(--spacing-8)]">
        <label
          htmlFor="coupon-code"
          className="block text-base font-semibold text-[var(--color-rich-violet)]"
        >
          Kupón (nepovinné)
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            id="coupon-code"
            type="text"
            value={couponCode}
            onChange={(event) => {
              setCouponCode(event.target.value);
              setCouponNotice(null);
            }}
            placeholder="Zadejte kód kupónu"
            className="h-11 w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-3 text-sm text-[var(--color-slate-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)] sm:max-w-xs"
          />
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={handleCouponCheck}
            disabled={isCheckingCoupon || isSubmitting}
          >
            {isCheckingCoupon ? 'Ověřuji...' : 'Ověřit kupón'}
          </Button>
        </div>
        {couponNotice ? (
          <Notice role="status" variant={couponNotice.ok ? 'neutral' : 'error'}>
            {couponNotice.message}
          </Notice>
        ) : null}
      </div>

      <Button
        type="button"
        className="w-full sm:w-auto"
        onClick={() => void handleCheckout()}
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Přesměrovávám...' : 'Pokračovat k platbě'}
      </Button>
    </div>
  );
}

function ManageSection({
  autoRenew,
  pendingPlanChange,
  plan,
  status,
  initialPlan = null,
}: SubscriptionManagerProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [targetPlan, setTargetPlan] = useState<SubscriptionPlan>(() => {
    // Předvybraný tarif z /plans má přednost, pokud není shodný s aktuálním.
    if (initialPlan && initialPlan !== plan) {
      return initialPlan;
    }
    const fallback = PLAN_ORDER.find((option) => option !== plan) ?? 'start';
    return fallback;
  });

  // Akce auto-obnovy a změny tarifu pracují jen nad `active` předplatným (R11.1,
  // R11.4, R8.1) — v grace_period je nenabízíme.
  const canManage = status === 'active';

  function runAction(action: () => Promise<SubscriptionActionResult>) {
    setMessage(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.ok) {
          router.refresh();
          return;
        }
        setMessage(result.message);
      });
    });
  }

  const planChangeOptions = PLAN_ORDER.filter((option) => option !== plan);

  return (
    <div className="space-y-[var(--spacing-24)]">
      {message ? (
        <Notice role="alert" variant="error">
          {message}
        </Notice>
      ) : null}

      {status === 'grace_period' ? (
        <Notice role="status">
          Poslední platba se nezdařila. Zkontrolujte prosím e-mail s QR kódem a fakturou pro ruční
          úhradu. Profil zůstává publikovaný do konce odkladu.
        </Notice>
      ) : null}

      {canManage ? (
        <section className="space-y-[var(--spacing-12)] border-b border-[var(--color-border-vychozi)] pb-[var(--spacing-24)]">
          <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
            Automatická obnova
          </h2>
          <p className="text-sm leading-6 text-[var(--color-slate-text)]">
            {autoRenew
              ? 'Předplatné se na konci období automaticky obnoví a strhne platba.'
              : 'Automatická obnova je vypnutá. Předplatné zůstane aktivní do konce zaplaceného období.'}
          </p>
          {autoRenew ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => runAction(cancelAutoRenewAction)}
              disabled={isPending}
            >
              {isPending ? 'Ukládám...' : 'Zrušit automatickou obnovu'}
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => runAction(enableAutoRenewAction)}
              disabled={isPending}
            >
              {isPending ? 'Ukládám...' : 'Obnovit automatickou obnovu'}
            </Button>
          )}
        </section>
      ) : null}

      {canManage ? (
        <section className="space-y-[var(--spacing-12)]">
          <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">Změna tarifu</h2>

          {pendingPlanChange ? (
            <div className="space-y-[var(--spacing-12)] rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-soft-gray-fill)] p-[var(--spacing-16)]">
              <p className="text-sm leading-6 text-[var(--color-slate-text)]">
                Na konci aktuálního období se tarif změní na{' '}
                <span className="font-semibold text-[var(--color-rich-violet)]">
                  {PLAN_LABELS[pendingPlanChange]}
                </span>
                . Změnu lze zrušit do konce období.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => runAction(cancelPlanChangeAction)}
                disabled={isPending}
              >
                {isPending ? 'Ukládám...' : 'Zrušit změnu tarifu'}
              </Button>
            </div>
          ) : planChangeOptions.length > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                aria-label="Cílový tarif"
                value={targetPlan}
                onChange={(event) => setTargetPlan(event.target.value as SubscriptionPlan)}
                className="h-11 w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-3 text-sm text-[var(--color-slate-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-action-violet)] sm:max-w-xs"
              >
                {planChangeOptions.map((option) => (
                  <option key={option} value={option}>
                    {PLAN_LABELS[option]} — {formatPrice(option)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => runAction(() => requestPlanChangeAction(targetPlan))}
                disabled={isPending}
              >
                {isPending ? 'Ukládám...' : 'Požádat o změnu tarifu'}
              </Button>
            </div>
          ) : null}
          <p className="text-sm leading-6 text-[var(--color-slate-text)]">
            Změna tarifu se uplatní až od dalšího období, bez poměrného doúčtování.
          </p>
        </section>
      ) : null}
    </div>
  );
}
