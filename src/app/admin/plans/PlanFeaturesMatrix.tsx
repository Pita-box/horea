'use client';

import { Notice } from '@/components/ui/notice';
import { Switch } from '@/components/ui/switch';
import { BUSINESS_FEATURES } from '@/lib/plans/features';
import type { PlanFeatureMatrix } from '@/lib/plans/feature-matrix';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import { useState, useTransition } from 'react';

import { setPlanFeatureAction } from './actions';

const PLAN_ORDER: SubscriptionPlan[] = ['start', 'pokrocily', 'max'];
const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  start: 'Start',
  pokrocily: 'Pokročilý',
  max: 'Max',
};

export function PlanFeaturesMatrix({ initialMatrix }: { initialMatrix: PlanFeatureMatrix }) {
  const [matrix, setMatrix] = useState<PlanFeatureMatrix>(initialMatrix);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(plan: SubscriptionPlan, key: (typeof BUSINESS_FEATURES)[number]['key']) {
    const next = !matrix[plan][key];
    // Optimistická aktualizace.
    setMatrix((current) => ({
      ...current,
      [plan]: { ...current[plan], [key]: next },
    }));
    setError(null);

    startTransition(() => {
      void setPlanFeatureAction(plan, key, next).then((result) => {
        if (!result.ok) {
          // Rollback při selhání.
          setMatrix((current) => ({
            ...current,
            [plan]: { ...current[plan], [key]: !next },
          }));
          setError(result.message);
        }
      });
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-vychozi)] text-[var(--color-rich-violet)]">
              <th className="px-5 py-4 font-semibold">Funkce</th>
              {PLAN_ORDER.map((plan) => (
                <th key={plan} className="px-5 py-4 text-center font-semibold">
                  {PLAN_LABELS[plan]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BUSINESS_FEATURES.map((feature) => (
              <tr
                key={feature.key}
                className="border-b border-[var(--color-border-vychozi)] last:border-b-0"
              >
                <td className="px-5 py-3">
                  <span className="block font-medium text-[var(--color-slate-text)]">
                    {feature.label}
                  </span>
                  <span className="block text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                    {feature.description}
                  </span>
                </td>
                {PLAN_ORDER.map((plan) => (
                  <td key={plan} className="px-5 py-3">
                    <div className="flex justify-center">
                      <Switch
                        checked={matrix[plan][feature.key]}
                        disabled={isPending}
                        onChange={() => toggle(plan, feature.key)}
                        aria-label={`${feature.label} — ${PLAN_LABELS[plan]}`}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
