import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReservationStatus } from '@/lib/reservations/labels';

/**
 * Příkladové testy `Reservation_Detail_View` (úkol 6.6 — R5.2, R5.4).
 *
 * 1. Mapování stavu → množina dostupných akcí (4 případy: pending / approved /
 *    rejected / cancelled). Akce vykresluje klientská `ReservationActions` podle
 *    propu `status`, takže je testujeme přímo renderem komponenty.
 * 2. Hláška „Rezervace nebyla nalezena" pro neexistující / cizí `id` (R5.4) —
 *    ověřena renderem server komponenty stránky s mockem Supabase vracejícím
 *    žádný řádek.
 */

// Konfigurovatelný výsledek načtení rezervace pro test stránky.
const pageState = vi.hoisted(() => ({ reservation: null as unknown }));

const reservationMaybeSingle = vi.hoisted(() =>
  vi.fn(async () => ({ data: pageState.reservation, error: null })),
);

const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === 'reservations') {
      return { select: () => ({ eq: () => ({ maybeSingle: reservationMaybeSingle }) }) };
    }
    // services — pro detail nenalezené rezervace se nevolá, ale držíme bezpečný default.
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
  usePathname: () => '/dashboard/reservations/res-1',
}));

import { ReservationActions } from '@/app/(dashboard)/dashboard/reservations/[id]/ReservationActions';
import ReservationDetailPage from '@/app/(dashboard)/dashboard/reservations/[id]/page';

/** Vrátí množinu textů akčních tlačítek vykreslených pro daný stav. */
function actionLabelsFor(status: ReservationStatus): string[] {
  const { container } = render(
    <ReservationActions
      reservationId="res-1"
      status={status}
      services={[{ id: 'svc-1', name: 'Stříhání' }]}
      currentServiceId="svc-1"
      startsAt="2024-07-15T08:00:00.000Z"
    />,
  );

  return Array.from(container.querySelectorAll('button')).map((btn) =>
    (btn.textContent ?? '').trim(),
  );
}

beforeEach(() => {
  pageState.reservation = null;
  reservationMaybeSingle.mockClear();
  fromMock.mockClear();
});

describe('Reservation_Detail_View — akce dle stavu (R5.2)', () => {
  it('pending → Schválit, Odmítnout, Upravit, Smazat', () => {
    const labels = actionLabelsFor('pending');
    expect(labels).toEqual(
      expect.arrayContaining(['Schválit', 'Odmítnout', 'Upravit', 'Smazat']),
    );
    expect(labels).not.toContain('Zrušit');
  });

  it('approved → Zrušit, Upravit, Smazat (bez Schválit / Odmítnout)', () => {
    const labels = actionLabelsFor('approved');
    expect(labels).toEqual(expect.arrayContaining(['Zrušit', 'Upravit', 'Smazat']));
    expect(labels).not.toContain('Schválit');
    expect(labels).not.toContain('Odmítnout');
  });

  it('rejected → pouze Smazat', () => {
    expect(actionLabelsFor('rejected')).toEqual(['Smazat']);
  });

  it('cancelled → pouze Smazat', () => {
    expect(actionLabelsFor('cancelled')).toEqual(['Smazat']);
  });
});

describe('Reservation_Detail_View — neexistující rezervace (R5.4)', () => {
  it('zobrazí hlášku „Rezervace nebyla nalezena"', async () => {
    pageState.reservation = null; // žádný řádek → loadReservation vrátí null

    const ui = await ReservationDetailPage({ params: Promise.resolve({ id: 'missing' }) });
    const { container } = render(ui);

    expect(container.textContent).toContain('Rezervace nebyla nalezena');
  });
});
