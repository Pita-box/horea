import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: subscription-payments, Property 2: Idempotence webhooku.
 *
 * `processGopayWebhook(supabase, event, now)` musí být idempotentní (R3.4, R3.5):
 * aplikace téže platební události dvakrát po sobě vede ke STEJNÉMU koncovému
 * stavu Payment i Subscription jako jediná aplikace — bez duplicitního záznamu a
 * bez opakovaného přechodu Stavoveho_Automatu. Webhook s neznámým
 * `gopay_payment_id` nezpůsobí žádnou změnu.
 *
 * Test pohání REÁLNÝ handler nad in-memory Supabase modelem, který věrně zrcadlí
 * **guarded flip** stavu platby (`UPDATE payments SET status = cíl
 * WHERE id = ? AND status <> cíl`) — právě jedna aplikace řádek překlopí a vrátí
 * jej, ostatní dostanou prázdný výsledek. Doprovodné efekty (aktivace / grace /
 * faktura) jsou mockované a POČÍTAJÍ počet skutečných volání; prodloužení období
 * (`extendPeriod`) ověřujeme observačně přes `current_period_end`.
 *
 * Generátor varíruje:
 *  - tarif (199/299/599) a stav hlášený GoPay (PAID / CANCELED / CANCELLED /
 *    TIMEOUTED / neakční CREATED…),
 *  - počáteční stav Payment (pending / paid / failed),
 *  - počáteční stav Subscription + kotvu + období,
 *  - zda `gopay_payment_id` odkazuje na existující platbu, nebo je NEZNÁMÝ.
 *
 * Klíčové ověření po 1× vs. 2× aplikaci: koncový stav je identický a počty
 * doprovodných efektů se mezi prvním a druhým během NEZVÝŠÍ (každý efekt
 * nejvýše jednou).
 *
 * Validates: Requirements 3.4, 3.5
 */

// --- Mockované doprovodné efekty + sdílený store ---------------------------
//
// `activeStore` je nastaven v každé iteraci property; hoisted mocky transitions
// a invoice-generatoru nad ním operují (mutace + počítadla volání).

type PaymentStatus = 'pending' | 'paid' | 'failed';
type SubStatus = 'free' | 'active' | 'grace_period' | 'expired' | 'deleted_data';

interface PaymentRow {
  id: string;
  gopay_payment_id: string;
  status: PaymentStatus;
  subscription_id: string;
  business_id: string;
  amount_czk: number;
  variable_symbol: string;
  invoice_number: string | null;
}

interface SubRow {
  id: string;
  status: SubStatus;
  plan: 'start' | 'pokrocily' | 'max';
  current_period_end: string;
  first_failed_charge_at: string | null;
}

interface BusinessRow {
  id: string;
  name: string;
}

interface Store {
  payments: PaymentRow[];
  subscriptions: SubRow[];
  businesses: BusinessRow[];
  counts: { activate: number; grace: number; invoice: number };
}

let activeStore: Store | null = null;

function requireStore(): Store {
  if (!activeStore) {
    throw new Error('activeStore není nastaven.');
  }
  return activeStore;
}

const activateMock = vi.hoisted(() => vi.fn());
const graceMock = vi.hoisted(() => vi.fn());
const invoiceMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/subscription/transitions', () => ({
  activateSubscription: activateMock,
  transitionToGracePeriod: graceMock,
}));

vi.mock('@/lib/invoices/invoice-generator', () => ({
  generateAndStoreInvoice: invoiceMock,
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processGopayWebhook, type GopayWebhookEvent } from '@/lib/webhooks/handler';

// --- In-memory Supabase fake -----------------------------------------------

type SupabaseResult<T> = { data: T | null; error: unknown };

/**
 * Fake Supabase klient nad `store`. Podporuje přesně dotazy, které handler dělá:
 *  - `payments.select(...).eq('gopay_payment_id', x).maybeSingle()` — lookup,
 *  - `payments.update({status}).eq('id', x).neq('status', cíl).select('id').maybeSingle()`
 *    — GUARDED FLIP (změní řádek jen pokud status != cíl),
 *  - `subscriptions.select('current_period_end, plan').eq('id', x).maybeSingle()`,
 *  - `subscriptions.update({current_period_end}).eq('id', x)` — awaited update,
 *  - `businesses.select('name').eq('id', x).maybeSingle()`.
 */
function buildSupabase(store: Store) {
  function from(table: string) {
    const op = {
      table,
      type: 'select' as 'select' | 'update' | 'update_select',
      payload: null as Record<string, unknown> | null,
      eqFilters: {} as Record<string, unknown>,
      neqFilters: {} as Record<string, unknown>,
    };

    function findPayment(): PaymentRow | undefined {
      if (op.eqFilters.gopay_payment_id !== undefined) {
        return store.payments.find((p) => p.gopay_payment_id === op.eqFilters.gopay_payment_id);
      }
      if (op.eqFilters.id !== undefined) {
        return store.payments.find((p) => p.id === op.eqFilters.id);
      }
      return undefined;
    }

    function resolveMaybeSingle(): SupabaseResult<unknown> {
      if (op.table === 'payments') {
        if (op.type === 'update_select') {
          // Guarded flip: aplikuj jen pokud status != neq.status.
          const payment = store.payments.find((p) => p.id === op.eqFilters.id);
          if (!payment) {
            return { data: null, error: null };
          }
          const guardStatus = op.neqFilters.status;
          if (guardStatus !== undefined && payment.status === guardStatus) {
            return { data: null, error: null }; // už v cíli → žádný dotčený řádek
          }
          Object.assign(payment, op.payload);
          return { data: { id: payment.id }, error: null };
        }
        // select lookup payment
        const payment = findPayment();
        if (!payment) {
          return { data: null, error: null };
        }
        return {
          data: {
            id: payment.id,
            status: payment.status,
            subscription_id: payment.subscription_id,
            business_id: payment.business_id,
            amount_czk: payment.amount_czk,
            variable_symbol: payment.variable_symbol,
            invoice_number: payment.invoice_number,
          },
          error: null,
        };
      }

      if (op.table === 'subscriptions') {
        const sub = store.subscriptions.find((s) => s.id === op.eqFilters.id);
        if (!sub) {
          return { data: null, error: null };
        }
        return { data: { current_period_end: sub.current_period_end, plan: sub.plan }, error: null };
      }

      if (op.table === 'businesses') {
        const business = store.businesses.find((b) => b.id === op.eqFilters.id);
        return { data: business ? { name: business.name } : null, error: null };
      }

      return { data: null, error: null };
    }

    function resolveThenable(): SupabaseResult<unknown> {
      if (op.table === 'subscriptions' && op.type === 'update') {
        const sub = store.subscriptions.find((s) => s.id === op.eqFilters.id);
        if (sub && op.payload) {
          Object.assign(sub, op.payload);
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    const builder = {
      select() {
        op.type = op.type === 'update' ? 'update_select' : 'select';
        return builder;
      },
      update(payload: Record<string, unknown>) {
        op.type = 'update';
        op.payload = payload;
        return builder;
      },
      eq(column: string, value: unknown) {
        op.eqFilters[column] = value;
        return builder;
      },
      neq(column: string, value: unknown) {
        op.neqFilters[column] = value;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(resolveMaybeSingle());
      },
      then<TResult1 = unknown, TResult2 = never>(
        onFulfilled?: ((value: SupabaseResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve(resolveThenable()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return { from } as unknown as Parameters<typeof processGopayWebhook>[0];
}

// --- Generátory -------------------------------------------------------------

const PAYMENT_STATUSES = ['pending', 'paid', 'failed'] as const;
const SUB_STATUSES = ['free', 'active', 'grace_period', 'expired'] as const;
const PLANS = ['start', 'pokrocily', 'max'] as const;
const ACTIONABLE_STATES = ['PAID', 'CANCELED', 'CANCELLED', 'TIMEOUTED'] as const;
const NON_ACTIONABLE_STATES = ['CREATED', 'PAYMENT_METHOD_CHOSEN', 'AUTHORIZED', 'REFUNDED'] as const;

const KNOWN_GOPAY_ID = 'gp-known-1';
const PERIOD_END_ISO = '2025-03-01T00:00:00.000Z';

const scenarioArb = fc.record({
  plan: fc.constantFrom(...PLANS),
  paymentStatus: fc.constantFrom(...PAYMENT_STATUSES),
  subStatus: fc.constantFrom(...SUB_STATUSES),
  anchor: fc.option(fc.constant('2025-01-15T00:00:00.000Z'), { nil: null }),
  state: fc.oneof(fc.constantFrom(...ACTIONABLE_STATES), fc.constantFrom(...NON_ACTIONABLE_STATES)),
  // Buď cílí na existující platbu (KNOWN_GOPAY_ID), nebo na neznámé ID.
  unknownTarget: fc.boolean(),
  amount: fc.constantFrom(199, 299, 599),
});

/** Snapshot relevantního stavu pro srovnání idempotence. */
function snapshot(store: Store) {
  const p = store.payments[0];
  const s = store.subscriptions[0];
  return {
    paymentStatus: p.status,
    subStatus: s.status,
    periodEnd: s.current_period_end,
    anchor: s.first_failed_charge_at,
    counts: { ...store.counts },
  };
}

function buildStore(spec: fc.infer<typeof scenarioArb>): Store {
  const store: Store = {
    payments: [
      {
        id: 'pay-1',
        gopay_payment_id: KNOWN_GOPAY_ID,
        status: spec.paymentStatus,
        subscription_id: 'sub-1',
        business_id: 'biz-1',
        amount_czk: spec.amount,
        variable_symbol: '12345',
        invoice_number: null,
      },
    ],
    subscriptions: [
      {
        id: 'sub-1',
        status: spec.subStatus,
        plan: spec.plan,
        current_period_end: PERIOD_END_ISO,
        first_failed_charge_at: spec.anchor,
      },
    ],
    businesses: [{ id: 'biz-1', name: 'Podnik Test' }],
    counts: { activate: 0, grace: 0, invoice: 0 },
  };
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();

  // activateSubscription: aktivace + vymazání kotvy (R5.6) nad activeStore.
  activateMock.mockImplementation(async (_supabase: unknown, subscriptionId: string) => {
    const store = requireStore();
    store.counts.activate += 1;
    const sub = store.subscriptions.find((s) => s.id === subscriptionId);
    if (sub) {
      sub.status = 'active';
      sub.first_failed_charge_at = null;
    }
    return { ok: true as const };
  });

  // transitionToGracePeriod: přechod do grace + nastavení kotvy (jen pokud chybí).
  graceMock.mockImplementation(async (_supabase: unknown, subscriptionId: string) => {
    const store = requireStore();
    store.counts.grace += 1;
    const sub = store.subscriptions.find((s) => s.id === subscriptionId);
    if (sub) {
      sub.status = 'grace_period';
      if (sub.first_failed_charge_at === null) {
        sub.first_failed_charge_at = '2025-02-20T00:00:00.000Z';
      }
    }
    return { ok: true as const };
  });

  // generateAndStoreInvoice: počítadlo + úspěch.
  invoiceMock.mockImplementation(async () => {
    requireStore().counts.invoice += 1;
    return { ok: true as const, invoiceNumber: '2025-0001', invoiceUrl: 'https://example/inv' };
  });
});

describe('Property 2: idempotence webhooku', () => {
  it('druhá aplikace téže události nic nezmění a efekty proběhnou nejvýše jednou', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (spec) => {
        const store = buildStore(spec);
        activeStore = store;
        const supabase = buildSupabase(store);

        const event: GopayWebhookEvent = {
          gopayPaymentId: spec.unknownTarget ? 'gp-unknown-xyz' : KNOWN_GOPAY_ID,
          state: spec.state,
        };
        const now = new Date('2025-02-15T12:00:00.000Z');

        // --- 1. aplikace ---
        const r1 = await processGopayWebhook(supabase, event, now);
        expect(r1.ok).toBe(true);
        const afterFirst = snapshot(store);

        // --- 2. aplikace téže události ---
        const r2 = await processGopayWebhook(supabase, event, now);
        expect(r2.ok).toBe(true);
        const afterSecond = snapshot(store);

        // (a) Idempotence: koncový stav je po 2× shodný s 1×.
        expect(afterSecond).toEqual(afterFirst);

        // (b) Doprovodné efekty proběhnou každý nejvýše jednou (přes oba běhy).
        expect(store.counts.activate).toBeLessThanOrEqual(1);
        expect(store.counts.grace).toBeLessThanOrEqual(1);
        expect(store.counts.invoice).toBeLessThanOrEqual(1);

        const targetStatus = mapState(spec.state);

        // (c) Neznámé gopay_payment_id ⇒ žádná změna a žádné efekty (R3.4).
        if (spec.unknownTarget) {
          expect(afterFirst.paymentStatus).toBe(spec.paymentStatus);
          expect(afterFirst.subStatus).toBe(spec.subStatus);
          expect(afterFirst.periodEnd).toBe(PERIOD_END_ISO);
          expect(afterFirst.anchor).toBe(spec.anchor);
          expect(store.counts).toEqual({ activate: 0, grace: 0, invoice: 0 });
          return;
        }

        // (d) Neakční stav ⇒ žádná změna platby ani předplatného (R3.3).
        if (targetStatus === null) {
          expect(afterFirst.paymentStatus).toBe(spec.paymentStatus);
          expect(afterFirst.subStatus).toBe(spec.subStatus);
          expect(store.counts).toEqual({ activate: 0, grace: 0, invoice: 0 });
          return;
        }

        // (e) Akční stav: platba končí v cílovém stavu (guarded flip, R3.5).
        expect(afterFirst.paymentStatus).toBe(targetStatus);

        if (targetStatus === 'paid') {
          if (spec.paymentStatus === 'paid') {
            // Už byla paid ⇒ noop, žádné efekty, období beze změny.
            expect(store.counts.activate).toBe(0);
            expect(store.counts.invoice).toBe(0);
            expect(afterFirst.periodEnd).toBe(PERIOD_END_ISO);
          } else {
            // Přechod na paid ⇒ aktivace, faktura a prodloužení období +30 dní.
            expect(store.counts.activate).toBe(1);
            expect(store.counts.invoice).toBe(1);
            expect(afterFirst.subStatus).toBe('active');
            expect(afterFirst.anchor).toBeNull();
            expect(new Date(afterFirst.periodEnd).getTime()).toBe(
              new Date(PERIOD_END_ISO).getTime() + 2_592_000 * 1000,
            );
          }
        } else {
          // failed
          if (spec.paymentStatus === 'failed') {
            expect(store.counts.grace).toBe(0);
          } else {
            expect(store.counts.grace).toBe(1);
            expect(afterFirst.subStatus).toBe('grace_period');
          }
        }
      }),
      { numRuns: 150 },
    );
  });
});

/** Lokální oracle mapování stavu GoPay → cílový Payment stav (nezávislý na handleru). */
function mapState(state: string): 'paid' | 'failed' | null {
  switch (state.toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'CANCELED':
    case 'CANCELLED':
    case 'TIMEOUTED':
      return 'failed';
    default:
      return null;
  }
}
