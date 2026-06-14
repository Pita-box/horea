import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit test e-mailového outboxu — klasifikace chyb, enqueue při selhání a drain.
 * Poskytovatelé (Resend/SMTP2GO), Supabase i logger jsou mockované.
 */

const sendEmailMock = vi.hoisted(() => vi.fn());
const isSmtp2goConfiguredMock = vi.hoisted(() => vi.fn(() => false));
const sendViaSmtp2goMock = vi.hoisted(() => vi.fn());

const inserts = vi.hoisted(() => [] as Record<string, unknown>[]);
const updates = vi.hoisted(() => [] as { id: unknown; payload: Record<string, unknown> }[]);
const selectResult = vi.hoisted(() => ({ value: { data: [] as unknown[], error: null as unknown } }));

vi.mock('@/lib/email/client', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/email/smtp-client', () => ({
  isSmtp2goConfigured: isSmtp2goConfiguredMock,
  sendViaSmtp2go: sendViaSmtp2goMock,
}));
vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: () => ({
          lte: () => ({
            order: () => ({ limit: () => Promise.resolve(selectResult.value) }),
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (_col: string, id: unknown) => {
          updates.push({ id, payload });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { drainEmailOutbox, sendBestEffort } from '@/lib/email/outbox';

const INVOICE_EMAIL = {
  category: 'invoice' as const,
  to: 'klient@priklad.cz',
  subject: 'Faktura',
  text: 'Tělo',
  html: '<p>Tělo</p>',
};

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  selectResult.value = { data: [], error: null };
  sendEmailMock.mockReset();
  isSmtp2goConfiguredMock.mockReturnValue(false);
});

describe('sendBestEffort', () => {
  it('při úspěchu odešle inline a NEzařadí do outboxu', async () => {
    sendEmailMock.mockResolvedValue({ data: { id: 'e1' }, error: null });

    const result = await sendBestEffort(INVOICE_EMAIL);

    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(0);
  });

  it('přechodnou chybu (429) zařadí jako pending k retry', async () => {
    sendEmailMock.mockResolvedValue({ data: null, error: { statusCode: 429, name: 'rate_limit' } });

    const result = await sendBestEffort(INVOICE_EMAIL);

    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ status: 'pending', attempts: 1, category: 'invoice', provider: 'resend' });
  });

  it('permanentní chybu (422) zařadí jako dead (bez retry)', async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { statusCode: 422, name: 'validation_error' },
    });

    const result = await sendBestEffort(INVOICE_EMAIL);

    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ status: 'dead' });
  });
});

describe('drainEmailOutbox', () => {
  it('úspěšně odeslaný řádek označí jako sent', async () => {
    selectResult.value = {
      data: [
        {
          id: 'r1',
          category: 'invoice',
          provider: 'resend',
          to_email: 'k@p.cz',
          reply_to: null,
          subject: 'Faktura',
          html_body: null,
          text_body: 'Tělo',
          attempts: 1,
          max_attempts: 6,
        },
      ],
      error: null,
    };
    sendEmailMock.mockResolvedValue({ data: { id: 'e2' }, error: null });

    const result = await drainEmailOutbox(10);

    expect(result).toMatchObject({ processed: 1, sent: 1, requeued: 0, dead: 0 });
    expect(updates[0]?.payload).toMatchObject({ status: 'sent' });
  });

  it('přechodná chyba řádek znovu zařadí (requeued, attempts++)', async () => {
    selectResult.value = {
      data: [
        {
          id: 'r2',
          category: 'invoice',
          provider: 'resend',
          to_email: 'k@p.cz',
          reply_to: null,
          subject: 'Faktura',
          html_body: null,
          text_body: 'Tělo',
          attempts: 1,
          max_attempts: 6,
        },
      ],
      error: null,
    };
    sendEmailMock.mockResolvedValue({ data: null, error: { statusCode: 503, name: 'server_error' } });

    const result = await drainEmailOutbox(10);

    expect(result).toMatchObject({ processed: 1, sent: 0, requeued: 1, dead: 0 });
    expect(updates[0]?.payload).toMatchObject({ status: 'pending', attempts: 2 });
  });

  it('vyčerpané pokusy označí jako dead', async () => {
    selectResult.value = {
      data: [
        {
          id: 'r3',
          category: 'invoice',
          provider: 'resend',
          to_email: 'k@p.cz',
          reply_to: null,
          subject: 'Faktura',
          html_body: null,
          text_body: 'Tělo',
          attempts: 5,
          max_attempts: 6,
        },
      ],
      error: null,
    };
    sendEmailMock.mockResolvedValue({ data: null, error: { statusCode: 429, name: 'rate_limit' } });

    const result = await drainEmailOutbox(10);

    expect(result).toMatchObject({ processed: 1, dead: 1 });
    expect(updates[0]?.payload).toMatchObject({ status: 'dead', attempts: 6 });
  });
});
