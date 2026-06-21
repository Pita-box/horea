// Feature: telegram-operator-notifications — integrační testy hooku notifikace
// platby v `processGopayWebhook` (task 11.3).
//
// Ověřujeme tři vlastnosti napojení Notifieru na webhook GoPay:
//  1) Úspěšná PAID událost → `notifyPaymentConfirmed` zavolán právě jednou
//     s `{ businessName, plan, amountCzk }` (R4.1).
//  2) Dvojí doručení téže PAID události → `notifyPaymentConfirmed` zavolán CELKEM
//     právě jednou (druhé doručení je `noop` díky guarded flipu) — dedup (R6.1).
//  3) Když `notifyPaymentConfirmed` vyhodí, webhook přesto vrátí
//     `{ ok: true, outcome: 'paid_applied' }` — selhání notifikace nezmění
//     výsledek toku (R5.2).
//
// Validates: Requirements 4.1, 5.2, 6.1

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionPlan } from '@/lib/checkout/pricing';

// --- Mocky doprovodných závislostí ------------------------------------------
// Notifier — hlavní předmět testu (spy). `notifyBusinessCreated` zde nehraje roli.
const notifyPaymentConfirmedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telegram/notifications', () => ({
  notifyPaymentConfirmed: notifyPaymentConfirmedMock,
  notifyBusinessCreated: vi.fn(),
}));

// Generování faktury — nesouvisí s notifikací; vracíme úspěch.
const generateAndStoreInvoiceMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/invoices/invoice-generator', () => ({
  generateAndStoreInvoice: generateAndStoreInvoiceMock,
}));

// Přechody stavového automatu — aktivaci vracíme jako úspěšnou.
const activateSubscriptionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/subscription/transitions', () => ({
  activateSubscription: activateSubscriptionMock,
  transitionToGracePeriod: vi.fn(),
}));

// Logování bez reálné závislosti na next/headers.
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// `extendPeriod` (subscription/period) necháváme reálné — je to čistá funkce.

import { processGopayWebhook } from '../handler';

// --- Stavový mock Supabase klienta ------------------------------------------
// Simuluje guarded flip přes skutečný stav řádku Payment: `UPDATE ... WHERE
// status <> 'paid'` překlopí řádek jen tehdy, když ještě není `paid`. Druhé
// doručení tak při úvodním SELECT vidí status `paid` → idempotentní `noop`.

interface FakeState {
  payment: {
    id: string;
    status: 'pending' | 'paid' | 'failed';
    subscription_id: string;
    business_id: string;
    amount_czk: number;
    variable_symbol: string;
    invoice_number: string | null;
  };
  subscription: { current_period_end: string; plan: SubscriptionPlan };
  business: { name: string };
}

class QueryBuilder {
  private op: 'select' | 'update' = 'select';
  private patch: Record<string, unknown> = {};

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(): this {
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.op = 'update';
    this.patch = patch;
    return this;
  }

  eq(): this {
    return this;
  }

  neq(): this {
    return this;
  }

  // Terminál pro chainy zakončené `.maybeSingle()`.
  maybeSingle(): Promise<{ data: unknown; error: null }> {
    return Promise.resolve(this.resolve());
  }

  // Thenable — pro chainy `update().eq()` awaited přímo (subscriptions update).
  then<T>(
    onFulfilled: (value: { data: unknown; error: null }) => T,
  ): Promise<T> {
    return Promise.resolve(this.resolve()).then(onFulfilled);
  }

  private resolve(): { data: unknown; error: null } {
    const { state, table, op } = this;

    if (table === 'payments' && op === 'select') {
      return { data: { ...state.payment }, error: null };
    }

    if (table === 'payments' && op === 'update') {
      const target = this.patch.status as FakeState['payment']['status'];
      // Guarded flip: překlopí jen pokud aktuální stav není cílový.
      if (state.payment.status !== target) {
        state.payment.status = target;
        return { data: { id: state.payment.id }, error: null };
      }
      return { data: null, error: null };
    }

    if (table === 'subscriptions' && op === 'select') {
      return {
        data: {
          current_period_end: state.subscription.current_period_end,
          plan: state.subscription.plan,
        },
        error: null,
      };
    }

    if (table === 'subscriptions' && op === 'update') {
      if (typeof this.patch.current_period_end === 'string') {
        state.subscription.current_period_end = this.patch.current_period_end;
      }
      return { data: null, error: null };
    }

    if (table === 'businesses' && op === 'select') {
      return { data: { name: state.business.name }, error: null };
    }

    return { data: null, error: null };
  }
}

function createSupabaseMock(state: FakeState): SupabaseClient {
  return {
    from: (table: string) => new QueryBuilder(state, table),
  } as unknown as SupabaseClient;
}

function createState(): FakeState {
  return {
    payment: {
      id: 'pay-1',
      status: 'pending',
      subscription_id: 'sub-1',
      business_id: 'biz-1',
      amount_czk: 499,
      variable_symbol: '12345678',
      invoice_number: null,
    },
    subscription: { current_period_end: '2025-01-01T00:00:00.000Z', plan: 'start' },
    business: { name: 'Kadeřnictví U Lípy' },
  };
}

const PAID_EVENT = { gopayPaymentId: 'gopay-1', state: 'PAID' };

beforeEach(() => {
  notifyPaymentConfirmedMock.mockReset();
  notifyPaymentConfirmedMock.mockResolvedValue({ status: 'sent' });
  generateAndStoreInvoiceMock.mockReset();
  generateAndStoreInvoiceMock.mockResolvedValue({ ok: true });
  activateSubscriptionMock.mockReset();
  activateSubscriptionMock.mockResolvedValue({ ok: true });
});

describe('processGopayWebhook — hook notifikace platby', () => {
  it('PAID událost zavolá notifyPaymentConfirmed právě jednou s názvem, tarifem a částkou (R4.1)', async () => {
    const state = createState();
    const supabase = createSupabaseMock(state);

    const result = await processGopayWebhook(supabase, PAID_EVENT);

    expect(result).toEqual({ ok: true, outcome: 'paid_applied' });
    expect(notifyPaymentConfirmedMock).toHaveBeenCalledTimes(1);
    expect(notifyPaymentConfirmedMock).toHaveBeenCalledWith({
      businessName: 'Kadeřnictví U Lípy',
      plan: 'start',
      amountCzk: 499,
    });
  });

  it('dvojí doručení téže PAID události zavolá notifyPaymentConfirmed celkem právě jednou (R6.1)', async () => {
    const state = createState();
    const supabase = createSupabaseMock(state);

    const first = await processGopayWebhook(supabase, PAID_EVENT);
    const second = await processGopayWebhook(supabase, PAID_EVENT);

    // První doručení překlopí a aplikuje; druhé je idempotentní noop.
    expect(first).toEqual({ ok: true, outcome: 'paid_applied' });
    expect(second).toEqual({ ok: true, outcome: 'noop' });
    expect(notifyPaymentConfirmedMock).toHaveBeenCalledTimes(1);
  });

  it('selhání notifikace nezmění výsledek webhooku — stále paid_applied (R5.2)', async () => {
    const state = createState();
    const supabase = createSupabaseMock(state);
    notifyPaymentConfirmedMock.mockRejectedValue(new Error('telegram down'));

    const result = await processGopayWebhook(supabase, PAID_EVENT);

    expect(result).toEqual({ ok: true, outcome: 'paid_applied' });
    expect(notifyPaymentConfirmedMock).toHaveBeenCalledTimes(1);
  });
});
