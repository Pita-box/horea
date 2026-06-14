import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Příkladový test prázdného stavu `Client_Detail_View` (úkol 10.7 — R14.5).
 *
 * Když klient v daném podniku nemá žádnou odpovídající rezervaci, detail místo
 * seznamu historie zobrazí českou hlášku „Klient zatím nemá žádné rezervace".
 * Server komponentu stránky vykreslíme s mockem Supabase: podnik existuje,
 * klient existuje, ale dotaz na rezervace vrátí prázdnou množinu.
 */

const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === 'businesses') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: 'biz-1' }, error: null }) }),
        }),
      };
    }
    if (table === 'clients') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'client-1', name: 'Jan Novák', phone: '+420777888999', email: null },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    // reservations — žádná odpovídající rezervace (prázdná historie).
    return {
      select: () => ({
        eq: () => ({ order: () => ({ returns: async () => ({ data: [], error: null }) }) }),
      }),
    };
  }),
);

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: fromMock,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import ClientDetailPage from '@/app/(dashboard)/dashboard/clients/[id]/page';

beforeEach(() => {
  fromMock.mockClear();
});

describe('Client_Detail_View — prázdná historie (R14.5)', () => {
  it('zobrazí hlášku „Klient zatím nemá žádné rezervace"', async () => {
    const ui = await ClientDetailPage({ params: Promise.resolve({ id: 'client-1' }) });
    const { container } = render(ui);

    expect(container.textContent).toContain('Klient zatím nemá žádné rezervace');
  });
});
