import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateLinkMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { generateLink: generateLinkMock } },
  })),
}));

vi.mock('@/lib/email/client', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key === 'origin' ? 'https://horea.test' : null),
  })),
}));

import { sendVerificationEmail } from '../verification-email';

beforeEach(() => {
  generateLinkMock.mockReset();
  sendEmailMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('sendVerificationEmail', () => {
  it('builds the /verify-email?token_hash=…&type=magiclink URL and sends via Resend', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'tok123' } },
      error: null,
    });
    sendEmailMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const result = await sendVerificationEmail('user@example.cz');

    expect(result).toEqual({ ok: true });
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'user@example.cz',
      options: { redirectTo: 'https://horea.test/verify-email' },
    });

    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.to).toBe('user@example.cz');
    expect(sendArgs.text).toContain(
      'https://horea.test/verify-email?token_hash=tok123&type=magiclink',
    );
  });

  it('returns ok:false and does not send when link generation fails', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: null },
      error: { message: 'boom' },
    });

    const result = await sendVerificationEmail('user@example.cz');

    expect(result.ok).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
