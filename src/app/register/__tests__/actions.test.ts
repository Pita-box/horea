import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingleMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() =>
  vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    insert: insertMock,
  })),
);
const createUserMock = vi.hoisted(() => vi.fn());
const recordAcceptanceMock = vi.hoisted(() => vi.fn());
const sendVerificationEmailMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: fromMock,
    auth: { admin: { createUser: createUserMock } },
  })),
}));

vi.mock('@/lib/dpa/manager', () => ({
  recordAcceptance: recordAcceptanceMock,
}));

vi.mock('@/lib/auth/verification-email', () => ({
  sendVerificationEmail: sendVerificationEmailMock,
}));

vi.mock('@/lib/log-server', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import { registerAction } from '../actions';

function validForm(): FormData {
  const formData = new FormData();
  formData.set('email', 'Novy@Example.cz');
  formData.set('password', 'Heslo123');
  formData.set('tosAccepted', 'on');
  formData.set('dpaAccepted', 'on');
  return formData;
}

beforeEach(() => {
  maybeSingleMock.mockReset();
  insertMock.mockReset();
  fromMock.mockClear();
  createUserMock.mockReset();
  recordAcceptanceMock.mockReset();
  sendVerificationEmailMock.mockReset();
  redirectMock.mockClear();
});

describe('registerAction', () => {
  it('sends the verification e-mail after a successful signup and redirects to /verify-email', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    createUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    insertMock.mockResolvedValue({ error: null });
    recordAcceptanceMock.mockResolvedValue(undefined);
    sendVerificationEmailMock.mockResolvedValue({ ok: true });

    await expect(registerAction(validForm())).rejects.toThrow('NEXT_REDIRECT:/verify-email');

    expect(sendVerificationEmailMock).toHaveBeenCalledWith('novy@example.cz');
    expect(redirectMock).toHaveBeenCalledWith('/verify-email');
  });

  it('still redirects to /verify-email when sending the verification e-mail fails', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    createUserMock.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    });
    insertMock.mockResolvedValue({ error: null });
    recordAcceptanceMock.mockResolvedValue(undefined);
    sendVerificationEmailMock.mockResolvedValue({ ok: false });

    await expect(registerAction(validForm())).rejects.toThrow('NEXT_REDIRECT:/verify-email');

    expect(sendVerificationEmailMock).toHaveBeenCalledWith('novy@example.cz');
    expect(redirectMock).toHaveBeenCalledWith('/verify-email');
  });
});
