import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

const sendEmailMock = vi.hoisted(() => vi.fn());
const renderInvoiceMock = vi.hoisted(() => vi.fn());
const createSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/client', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/email/dispatcher', () => ({ describeResendError: () => ({ code: 'mock' }) }));
vi.mock('@/lib/email/templates/subscription-invoice', () => ({
  renderSubscriptionInvoiceEmail: renderInvoiceMock,
}));
vi.mock('@/lib/invoices/invoice-generator', () => ({ createInvoiceSignedUrl: createSignedUrlMock }));
vi.mock('@/lib/log-server', () => ({ serverLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { NO_INVOICE_MESSAGE, resendLatestInvoice } from '@/lib/admin/invoice-resender';

import type { FakeRow } from './supabase-fake';

/**
 * Unit test opětovného odeslání poslední faktury (task 16.2 — R11.1, R11.2).
 *
 * Ověřuje:
 *  - existuje ≥1 `paid` platba s `invoice_url` → vybere se NEJNOVĚJŠÍ a odešle se
 *    na e-mail vlastníka (R11.1),
 *  - absence faktury (žádná `paid` s `invoice_url`) → `no_invoice` + česká hláška
 *    a nic se neodešle (R11.2).
 *
 * Resend (`sendEmail`), generátor podepsané URL a šablona jsou mockovány — žádná
 * reálná DB ani Resend.
 */

type FakeTables = Record<string, FakeRow[]>;

/**
 * Minimální chainable fake podporující řetězec z `resendLatestInvoice`:
 * `select().eq().eq().not(col,'is',null).order().limit().maybeSingle()`.
 */
function makeInvoiceFake(tables: FakeTables): SupabaseClient {
  function builder(rows: FakeRow[]) {
    let working = [...rows];
    let orderCol: string | null = null;
    let orderAsc = true;

    const api: Record<string, unknown> = {
      select: () => api,
      eq(column: string, value: unknown) {
        working = working.filter((row) => row[column] === value);
        return api;
      },
      not(column: string, op: string, value: unknown) {
        // Podporujeme jen `not(col, 'is', null)` → ponech jen ne-null hodnoty.
        if (op === 'is' && value === null) {
          working = working.filter((row) => row[column] !== null && row[column] !== undefined);
        }
        return api;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderCol = column;
        orderAsc = options?.ascending ?? true;
        return api;
      },
      limit(n: number) {
        const sorted = sortRows();
        working = sorted.slice(0, n);
        return api;
      },
      maybeSingle() {
        const sorted = sortRows();
        return Promise.resolve({ data: sorted[0] ?? null, error: null });
      },
    };

    function sortRows(): FakeRow[] {
      if (!orderCol) return working;
      const col = orderCol;
      const dir = orderAsc ? 1 : -1;
      return [...working].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }

    return api;
  }

  return {
    from: (table: string) => builder(tables[table] ?? []),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  renderInvoiceMock.mockReturnValue({ subject: 'Faktura', html: '<p>Faktura</p>', text: 'Faktura' });
  sendEmailMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resendLatestInvoice — existující faktura (R11.1)', () => {
  it('vybere nejnovější paid fakturu s invoice_url a odešle ji vlastníkovi', async () => {
    const supabase = makeInvoiceFake({
      payments: [
        { id: 'p-old', amount_czk: 200, invoice_url: 'https://cdn/faktura-old.pdf', invoice_number: 'F-001', status: 'paid', business_id: 'b-1', created_at: '2024-01-01T00:00:00.000Z' },
        { id: 'p-new', amount_czk: 300, invoice_url: 'https://cdn/faktura-new.pdf', invoice_number: 'F-002', status: 'paid', business_id: 'b-1', created_at: '2024-06-01T00:00:00.000Z' },
      ],
      businesses: [{ id: 'b-1', name: 'Kadeřnictví Lucie', owner_user_id: 'u-1' }],
      users: [{ id: 'u-1', email: 'lucie@firma.cz' }],
    });

    const result = await resendLatestInvoice(supabase, 'b-1');

    expect(result).toEqual({ ok: true });
    // Nejnovější faktura (F-002 / 300 Kč) byla předána šabloně.
    expect(renderInvoiceMock).toHaveBeenCalledWith({
      businessName: 'Kadeřnictví Lucie',
      invoiceNumber: 'F-002',
      amountCzk: 300,
      invoiceUrl: 'https://cdn/faktura-new.pdf',
    });
    // E-mail odešel vlastníkovi.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: 'lucie@firma.cz' });
  });
});

describe('resendLatestInvoice — bez faktury (R11.2)', () => {
  it('žádná paid faktura s invoice_url → no_invoice + česká hláška, neodešle', async () => {
    const supabase = makeInvoiceFake({
      payments: [
        { id: 'p-pending', amount_czk: 300, invoice_url: null, invoice_number: null, status: 'pending', business_id: 'b-1', created_at: '2024-06-01T00:00:00.000Z' },
      ],
      businesses: [{ id: 'b-1', name: 'Kadeřnictví Lucie', owner_user_id: 'u-1' }],
      users: [{ id: 'u-1', email: 'lucie@firma.cz' }],
    });

    const result = await resendLatestInvoice(supabase, 'b-1');

    expect(result).toEqual({ ok: false, reason: 'no_invoice', message: NO_INVOICE_MESSAGE });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('podnik bez jakékoli platby → no_invoice', async () => {
    const supabase = makeInvoiceFake({
      payments: [],
      businesses: [{ id: 'b-1', name: 'Kadeřnictví Lucie', owner_user_id: 'u-1' }],
      users: [{ id: 'u-1', email: 'lucie@firma.cz' }],
    });

    const result = await resendLatestInvoice(supabase, 'b-1');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'no_invoice' });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
