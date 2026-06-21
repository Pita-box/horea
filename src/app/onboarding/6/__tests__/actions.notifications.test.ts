// Feature: telegram-operator-notifications — integrační test hooku notifikace
// vzniku podniku v `commitAction` (task 11.3).
//
// Ověřujeme dvě vlastnosti napojení Notifieru na dokončení onboardingu:
//  1) Po `commitOnboarding` ok je `notifyBusinessCreated` zavolán PŘED
//     `redirect('/dashboard')` (R3.1).
//  2) I když `notifyBusinessCreated` vyhodí, `redirect('/dashboard')` se přesto
//     provede — selhání notifikace nezmění tok ani redirect (R5.1).
//
// Validates: Requirements 3.1, 5.1, 6.2

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocky závislostí server action ----------------------------------------
// commitOnboarding → úspěch (sem se hook dostane jen po `{ ok: true }`).
const commitOnboardingMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/onboarding/commit', () => ({
  commitOnboarding: commitOnboardingMock,
}));

// Supabase server klient — auth.getUser vrací přihlášeného uživatele a
// from('businesses').select('name').eq(...).single() vrací název podniku.
const getUserMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
    }),
  })),
}));

// Notifier — hlavní předmět testu (spy).
const notifyBusinessCreatedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telegram/notifications', () => ({
  notifyBusinessCreated: notifyBusinessCreatedMock,
  notifyPaymentConfirmed: vi.fn(),
}));

// redirect() vyhazuje NEXT_REDIRECT (stejně jako v Next.js).
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import { commitAction } from '../actions';

beforeEach(() => {
  commitOnboardingMock.mockReset();
  commitOnboardingMock.mockResolvedValue({ ok: true });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  singleMock.mockReset();
  singleMock.mockResolvedValue({ data: { name: 'Kadeřnictví U Lípy' } });
  notifyBusinessCreatedMock.mockReset();
  notifyBusinessCreatedMock.mockResolvedValue({ status: 'sent' });
  redirectMock.mockClear();
});

describe('commitAction — hook notifikace vzniku podniku', () => {
  it('po commitOnboarding ok zavolá notifyBusinessCreated PŘED redirect na /dashboard (R3.1)', async () => {
    await expect(commitAction()).rejects.toThrow('NEXT_REDIRECT:/dashboard');

    expect(notifyBusinessCreatedMock).toHaveBeenCalledTimes(1);
    expect(notifyBusinessCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: 'Kadeřnictví U Lípy' }),
    );
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
    // Pořadí volání: notifikace musí předcházet redirectu.
    expect(notifyBusinessCreatedMock.mock.invocationCallOrder[0]).toBeLessThan(
      redirectMock.mock.invocationCallOrder[0],
    );
  });

  it('i při selhání notifikace se přesto provede redirect na /dashboard (R5.1)', async () => {
    notifyBusinessCreatedMock.mockRejectedValue(new Error('telegram down'));

    await expect(commitAction()).rejects.toThrow('NEXT_REDIRECT:/dashboard');

    expect(notifyBusinessCreatedMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });
});
