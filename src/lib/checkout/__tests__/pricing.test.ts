import { describe, expect, it } from 'vitest';

import {
  buildAutoChargePayment,
  planPriceCzk,
  type SubscriptionPlan,
} from '@/lib/checkout/pricing';

/**
 * Unit test mapování tarif → částka a sestavení Payment řádku (task 8.2 — R1.1).
 *
 * Ověřuje pevný ceník (199 / 299 / 599 Kč) a že {@link buildAutoChargePayment}
 * sestaví Payment ve stavu `pending`, metodou `auto_charge`, se správnou částkou,
 * měnou `CZK`, variabilním symbolem a identifikátory. DB insert se zde
 * neprovádí (patří do checkout server action, task 8.3).
 */

describe('planPriceCzk — pevný ceník tarifů (R1.1)', () => {
  it.each<[SubscriptionPlan, number]>([
    ['start', 199],
    ['pokrocily', 299],
    ['max', 599],
  ])('tarif "%s" stojí %i Kč', (plan, expected) => {
    expect(planPriceCzk(plan)).toBe(expected);
  });
});

describe('buildAutoChargePayment — Payment pending / auto_charge (R1.1)', () => {
  const baseInput = {
    businessId: 'biz-1',
    subscriptionId: 'sub-1',
    variableSymbol: '7043441770',
  };

  it.each<[SubscriptionPlan, number]>([
    ['start', 199],
    ['pokrocily', 299],
    ['max', 599],
  ])('pro tarif "%s" sestaví řádek s částkou %i Kč', (plan, expectedAmount) => {
    const row = buildAutoChargePayment({ ...baseInput, plan });

    expect(row).toEqual({
      business_id: 'biz-1',
      subscription_id: 'sub-1',
      amount_czk: expectedAmount,
      currency: 'CZK',
      variable_symbol: '7043441770',
      status: 'pending',
      method: 'auto_charge',
    });
  });

  it('vždy nastaví status "pending" a metodu "auto_charge"', () => {
    const row = buildAutoChargePayment({ ...baseInput, plan: 'start' });

    expect(row.status).toBe('pending');
    expect(row.method).toBe('auto_charge');
    expect(row.currency).toBe('CZK');
  });

  it('propaguje předaný variabilní symbol beze změny', () => {
    const row = buildAutoChargePayment({ ...baseInput, plan: 'max', variableSymbol: '7' });

    expect(row.variable_symbol).toBe('7');
    expect(row.amount_czk).toBe(599);
  });
});
