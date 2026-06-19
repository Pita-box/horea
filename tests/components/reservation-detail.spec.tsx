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
const pageState = vi.hoisted(() => ({
  reservation: null as unknown,
  serviceSet: [] as unknown[],
  services: [] as unknown[],
  employees: [] as unknown[],
}));

const reservationMaybeSingle = vi.hoisted(() =>
  vi.fn(async () => ({ data: pageState.reservation, error: null })),
);

const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === 'reservations') {
      return { select: () => ({ eq: () => ({ maybeSingle: reservationMaybeSingle }) }) };
    }
    if (table === 'reservation_services') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({ returns: async () => ({ data: pageState.serviceSet, error: null }) }),
          }),
        }),
      };
    }
    if (table === 'reservation_employees') {
      // Množina přiřazených zaměstnanců — pro tyto testy prázdná (fallback na employee_id).
      return {
        select: () => ({
          eq: () => ({ returns: async () => ({ data: [], error: null }) }),
        }),
      };
    }
    // services — pro detail nenalezené rezervace se nevolá, ale držíme bezpečný default.
    return {
      select: () => ({
        eq: () => ({
          order: () => ({ returns: async () => ({ data: pageState.services, error: null }) }),
        }),
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

// Zaměstnanci se čtou service-role klientem (employees nemá owner-select RLS).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({ returns: async () => ({ data: pageState.employees, error: null }) }),
          }),
        }),
      }),
    }),
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
      currentServiceIds={['svc-1']}
      startsAt="2024-07-15T08:00:00.000Z"
    />,
  );

  return Array.from(container.querySelectorAll('button')).map((btn) =>
    (btn.textContent ?? '').trim(),
  );
}

beforeEach(() => {
  pageState.reservation = null;
  pageState.serviceSet = [];
  pageState.services = [];
  pageState.employees = [];
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

describe('Reservation_Detail_View — kombinovaná rezervace (R13.1–R13.4)', () => {
  it('zobrazí všechny služby v pořadí, součty, časový blok a přiřazeného zaměstnance', async () => {
    pageState.reservation = {
      id: 'res-1',
      business_id: 'biz-1',
      service_id: 'svc-1',
      starts_at: '2024-07-15T08:00:00.000Z',
      ends_at: '2024-07-15T09:30:00.000Z',
      status: 'approved',
      attendance: 'unknown',
      client_name: 'Jan Novák',
      client_phone: null,
      client_email: null,
      note: null,
      status_reason: null,
      employee_id: 'emp-1',
      services: { name: 'Dámský střih' },
    };
    pageState.serviceSet = [
      {
        position: 0,
        service_id: 'svc-1',
        duration_minutes_snapshot: 60,
        price_czk_snapshot: 500,
        services: { name: 'Dámský střih' },
      },
      {
        position: 1,
        service_id: 'svc-2',
        duration_minutes_snapshot: 30,
        price_czk_snapshot: 200,
        services: { name: 'Foukání' },
      },
    ];
    pageState.employees = [{ id: 'emp-1', name: 'Petra' }];

    const ui = await ReservationDetailPage({ params: Promise.resolve({ id: 'res-1' }) });
    const { container } = render(ui);
    const text = container.textContent ?? '';

    // Všechny služby v uloženém pořadí + délka každé (R13.1).
    expect(text).toContain('1. Dámský střih');
    expect(text).toContain('2. Foukání');
    expect(text).toContain('60 min');
    expect(text).toContain('30 min');
    // Combined_Duration a Combined_Price ze snapshotů (R13.2).
    expect(text).toContain('90 min');
    expect(text).toContain('700 Kč');
    // Jeden časový blok v Europe/Prague (R13.3) — 08:00 UTC = 10:00 CEST.
    expect(text).toContain('15.07.2024 10:00 – 15.07.2024 11:30');
    // Přiřazený zaměstnanec (R13.4).
    expect(text).toContain('Petra');
  });

  it('skryje cenu, když je Combined_Price 0 Kč (R3.3 konvence souhrnu)', async () => {
    pageState.reservation = {
      id: 'res-2',
      business_id: 'biz-1',
      service_id: 'svc-1',
      starts_at: '2024-07-15T08:00:00.000Z',
      ends_at: '2024-07-15T08:45:00.000Z',
      status: 'pending',
      attendance: 'unknown',
      client_name: 'Jan Novák',
      client_phone: null,
      client_email: null,
      note: null,
      status_reason: null,
      employee_id: null,
      services: { name: 'Konzultace' },
    };
    pageState.serviceSet = [
      {
        position: 0,
        service_id: 'svc-1',
        duration_minutes_snapshot: 45,
        price_czk_snapshot: 0,
        services: { name: 'Konzultace' },
      },
    ];

    const ui = await ReservationDetailPage({ params: Promise.resolve({ id: 'res-2' }) });
    const { container } = render(ui);
    const text = container.textContent ?? '';

    expect(text).toContain('Konzultace');
    expect(text).toContain('45 min');
    expect(text).not.toContain('Celková cena');
  });
});
