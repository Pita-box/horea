import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CalendarView } from '@/components/reservations/CalendarView';
import { TableView } from '@/components/reservations/TableView';
import { periodDays } from '@/lib/reservations/calendar';
import type { ReservationFilters } from '@/lib/reservations/filters';
import type { ReservationListItem } from '@/lib/reservations/types';

/**
 * Snapshot a příkladové testy tabulkového a kalendářního pohledu
 * (úkol 6.5 — R2.3, R2.4, R4.5, R4.6, R11.7).
 *
 * - České mapování stavů v obou pohledech (R2.3).
 * - Vizuální zvýraznění `pending` v tabulce (R2.4).
 * - Vizuální odlišení `rejected` / `cancelled` v kalendáři (R4.5).
 * - Zachování filtrů (status, služba) v odkazech kalendáře při přepnutí
 *   pohledu / navigaci (R4.6).
 *
 * Pozn. k R11.7: tabulkový a kalendářní pohled v aktuální implementaci docházku
 * nezobrazují (sloupce: čas, služba, klient, stav); mapování `Attendance_Status`
 * → čeština je čistá utilita pokrytá `labels.test.ts`.
 */

// Všechny rezervace jednoho dne (2024-07-15) v Europe/Prague pro deterministický kalendář.
const RESERVATIONS: ReservationListItem[] = [
  {
    id: 'res-pending',
    startsAt: '2024-07-15T08:00:00.000Z',
    endsAt: '2024-07-15T09:00:00.000Z',
    status: 'pending',
    attendance: null,
    serviceName: 'Stříhání',
    clientName: 'Jan Novák',
    clientPhone: '+420777888999',
  },
  {
    id: 'res-approved',
    startsAt: '2024-07-15T10:00:00.000Z',
    endsAt: '2024-07-15T11:00:00.000Z',
    status: 'approved',
    attendance: 'attended',
    serviceName: 'Barvení',
    clientName: 'Eva Malá',
    clientPhone: null,
  },
  {
    id: 'res-rejected',
    startsAt: '2024-07-15T12:00:00.000Z',
    endsAt: '2024-07-15T12:30:00.000Z',
    status: 'rejected',
    attendance: null,
    serviceName: 'Konzultace',
    clientName: 'Petr Velký',
    clientPhone: null,
  },
  {
    id: 'res-cancelled',
    startsAt: '2024-07-15T14:00:00.000Z',
    endsAt: '2024-07-15T15:00:00.000Z',
    status: 'cancelled',
    attendance: 'no_show',
    serviceName: 'Masáž',
    clientName: 'Klára Nová',
    clientPhone: null,
  },
];

const FILTERS: ReservationFilters = {
  statuses: ['pending', 'approved'],
  serviceIds: ['svc-1', 'svc-2'],
  from: null,
  to: null,
  page: 1,
};

describe('TableView (R2.2–R2.4)', () => {
  it('zobrazí všechny stavy v češtině a zvýrazní pending', () => {
    const { container } = render(<TableView reservations={RESERVATIONS} />);

    // České mapování stavů (R2.3).
    expect(container.textContent).toContain('Čeká na schválení');
    expect(container.textContent).toContain('Schváleno');
    expect(container.textContent).toContain('Odmítnuto');
    expect(container.textContent).toContain('Zrušeno');

    // Zvýraznění pending řádku — barevný levý okraj (R2.4).
    const pendingLink = container.querySelector('a[href="/dashboard/reservations/res-pending"]');
    expect(pendingLink?.className).toContain('border-l-4');

    // Ostatní řádky zvýraznění nemají.
    const approvedLink = container.querySelector('a[href="/dashboard/reservations/res-approved"]');
    expect(approvedLink?.className).not.toContain('border-l-4');

    expect(container).toMatchSnapshot();
  });

  it('vykreslí prázdný stav, když nejsou žádné rezervace', () => {
    const { container } = render(<TableView reservations={[]} />);
    expect(container.textContent).toContain('Žádné rezervace neodpovídají zvoleným filtrům.');
    expect(container).toMatchSnapshot();
  });
});

describe('CalendarView (R4.5, R4.6)', () => {
  const days = periodDays('day', '2024-07-15');

  // Odkaz „Dnes" počítá aktuální pražské datum přes todayPragueDate(); bez
  // pevného času by snapshot byl závislý na dni běhu (flaky o půlnoci).
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-15T10:00:00.000Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('vizuálně odliší rejected/cancelled od aktivních rezervací', () => {
    const { container } = render(
      <CalendarView
        reservations={RESERVATIONS}
        mode="day"
        anchor="2024-07-15"
        days={days}
        filters={FILTERS}
      />,
    );

    // Neaktivní stavy mají ztlumení + přeškrtnutí (R4.5).
    const rejectedLink = container.querySelector('a[href="/dashboard/reservations/res-rejected"]');
    const cancelledLink = container.querySelector(
      'a[href="/dashboard/reservations/res-cancelled"]',
    );
    expect(rejectedLink?.className).toContain('line-through');
    expect(cancelledLink?.className).toContain('opacity-60');

    // Aktivní rezervace odlišení nemají.
    const approvedLink = container.querySelector('a[href="/dashboard/reservations/res-approved"]');
    expect(approvedLink?.className).not.toContain('line-through');

    expect(container).toMatchSnapshot();
  });

  it('zachová filtry statusu a služby v odkazech navigace a přepínání režimu (R4.6)', () => {
    const { container } = render(
      <CalendarView
        reservations={RESERVATIONS}
        mode="day"
        anchor="2024-07-15"
        days={days}
        filters={FILTERS}
      />,
    );

    // Každý navigační / režimový odkaz nese aktivní filtry status + service.
    const hrefs = Array.from(container.querySelectorAll('a'))
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.includes('view=calendar'));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toContain('status=pending%2Capproved');
      expect(href).toContain('service=svc-1%2Csvc-2');
    }
  });
});
