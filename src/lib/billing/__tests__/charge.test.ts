import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { GopayClient } from '@/lib/payments/gopay/client';
import type { MonthlyChargeContext } from '@/lib/billing/charge';

/**
 * Unit test Billing_Engine — měsíční charge (task 10.3 — R2.4, R2.5).
 *
 * Ověřuje dvě klíčová pravidla:
 *  - Payment `pending` / `auto_charge` vzniká **PŘED** voláním GoPay charge (R2.4).
 *  - Při selhání iniciace (GoPay nedostupné) zůstává předplatné nedotčené
 *    (status `active`) a administrátor je upozorněn e-mailem (R2.5).
 *
 * Supabase, GoPay, e-mailová vrstva i logger jsou mockované — žádná reálná DB
 * ani brána (styl `src/server/ClientUpsertor.test.ts`,
 * `tests/unit/reservation-deleter.spec.ts`).
 */

const sendEmailMock = vi.hoisted(() => vi.fn(async () => ({ data: { id: 'email-1' }, error: null })));
const nextVariableSymbolMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true, variableSymbol: '4242' })),
);

vi.mock('@/lib/payments/variable-symbol-source', () => ({
  nextVariableSymbol: nextVariableSymbolMock,
}));

vi.mock('@/lib/email/client', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/email/dispatcher', () => ({
  describeResendError: vi.fn(() => 'resend-error'),
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { chargeMonthly } from '@/lib/billing/charge';

type Call = { op: 'insert' | 'update'; table: string; payload: Record<string, unknown> };

/**
 * Fake Supabase, který zaznamenává insert/update operace v pořadí volání.
 * `payments.insert(...).select('id').maybeSingle()` vrací řádek s `id`.
 */
function makeSupabase(calls: Call[]): SupabaseClient {
  return {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        calls.push({ op: 'insert', table, payload });
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: 'payment-1' }, error: null }),
          }),
        };
      },
      update: (payload: Record<string, unknown>) => {
        calls.push({ op: 'update', table, payload });
        return { eq: async () => ({ data: null, error: null }) };
      },
    }),
  } as unknown as SupabaseClient;
}

const CONTEXT: MonthlyChargeContext = {
  subscriptionId: 'sub-1',
  businessId: 'biz-1',
  scheduleId: 'schedule-1',
  plan: 'pokrocily',
};

beforeEach(() => {
  sendEmailMock.mockClear();
  nextVariableSymbolMock.mockClear();
  process.env.HOREA_ADMIN_EMAIL = 'admin@horea.test';
});

afterEach(() => {
  delete process.env.HOREA_ADMIN_EMAIL;
});

describe('chargeMonthly — úspěšná iniciace (R2.4)', () => {
  it('vytvoří Payment pending/auto_charge PŘED voláním GoPay charge', async () => {
    const calls: Call[] = [];
    const supabase = makeSupabase(calls);

    const chargeOrder: string[] = [];
    const gopay = {
      chargeRecurrence: vi.fn(async () => {
        chargeOrder.push('charge');
        return { paymentId: 'gopay-pay-1' };
      }),
    } as unknown as GopayClient;

    // Insert se zaznamená do `calls`; charge do `chargeOrder` — pořadí ověříme níže.
    const result = await chargeMonthly(supabase, gopay, CONTEXT);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('očekáván úspěch');
    expect(result.paymentId).toBe('payment-1');
    expect(result.gopayPaymentId).toBe('gopay-pay-1');

    // Payment pending vznikl jako první operace, ještě před voláním charge.
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert?.table).toBe('payments');
    expect(insert?.payload).toMatchObject({
      subscription_id: 'sub-1',
      business_id: 'biz-1',
      amount_czk: 299,
      currency: 'CZK',
      variable_symbol: '4242',
      status: 'pending',
      method: 'auto_charge',
    });

    // Insert proběhl před charge: charge se zavolal až po prvním insertu.
    expect(calls[0].op).toBe('insert');
    expect(gopay.chargeRecurrence).toHaveBeenCalledTimes(1);

    // Po úspěšné iniciaci se uloží gopay_payment_id k platbě.
    const update = calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual({ gopay_payment_id: 'gopay-pay-1' });

    // Administrátor se při úspěchu nenotifikuje.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('chargeMonthly — selhání iniciace (R2.5)', () => {
  it('GoPay nedostupné → status zůstává active + notifikace admina', async () => {
    const calls: Call[] = [];
    const supabase = makeSupabase(calls);

    const gopay = {
      chargeRecurrence: vi.fn(async () => {
        throw new Error('GoPay nedostupné');
      }),
    } as unknown as GopayClient;

    const result = await chargeMonthly(supabase, gopay, CONTEXT);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('očekáváno selhání');
    expect(result.error).toBe('initiation_failed');

    // Pending Payment se označí jako failed, aby nezůstal viset.
    const failUpdate = calls.find((c) => c.op === 'update' && c.payload.status === 'failed');
    expect(failUpdate).toBeDefined();
    expect(failUpdate?.table).toBe('payments');

    // Funkce se NEDOTKNE tabulky subscriptions → status zůstává `active` (R2.5).
    expect(calls.some((c) => c.table === 'subscriptions')).toBe(false);

    // Administrátor je upozorněn e-mailem.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const emailArg = sendEmailMock.mock.calls[0][0] as { to: string; subject: string };
    expect(emailArg.to).toBe('admin@horea.test');
    expect(emailArg.subject).toContain('selhala iniciace');
  });

  it('bez nastaveného HOREA_ADMIN_EMAIL se notifikace přeskočí, výsledek je stejný', async () => {
    delete process.env.HOREA_ADMIN_EMAIL;
    const calls: Call[] = [];
    const supabase = makeSupabase(calls);

    const gopay = {
      chargeRecurrence: vi.fn(async () => {
        throw new Error('GoPay nedostupné');
      }),
    } as unknown as GopayClient;

    const result = await chargeMonthly(supabase, gopay, CONTEXT);

    expect(result.ok).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
