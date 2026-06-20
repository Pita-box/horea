import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_MESSAGES } from '@/lib/auth/messages';

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

import { forgotPasswordAction } from '../actions';

function formDataWith(email: string): FormData {
  const formData = new FormData();
  formData.set('email', email);
  return formData;
}

beforeEach(() => {
  generateLinkMock.mockReset();
  sendEmailMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('forgotPasswordAction', () => {
  it('returns the generic success message when the account does not exist (generateLink errors)', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: null },
      error: { message: 'User not found', status: 404 },
    });

    const result = await forgotPasswordAction(formDataWith('neexistuje@example.cz'));

    expect(result.message).toBe(AUTH_MESSAGES.forgotPasswordSent);
    expect(result.fieldErrors).toEqual({});
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns the same generic success message and sends a recovery e-mail when the account exists', async () => {
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'reset-tok' } },
      error: null,
    });
    sendEmailMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const result = await forgotPasswordAction(formDataWith('existuje@example.cz'));

    expect(result.message).toBe(AUTH_MESSAGES.forgotPasswordSent);
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'existuje@example.cz',
      options: { redirectTo: 'https://horea.test/auth/confirm' },
    });

    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.subject).toBe('Obnovení hesla — Horea');
    expect(sendArgs.text).toContain(
      'https://horea.test/auth/confirm?token_hash=reset-tok&type=recovery',
    );
  });

  it('returns a validation error for an invalid e-mail format', async () => {
    const result = await forgotPasswordAction(formDataWith('not-an-email'));

    expect(result.message).toBe(AUTH_MESSAGES.invalidEmail);
    expect(result.fieldErrors.email).toBe(AUTH_MESSAGES.invalidEmail);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });
});
