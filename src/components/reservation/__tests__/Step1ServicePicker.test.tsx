import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Step1ServicePicker } from '../Step1ServicePicker';
import { ReservationFormController } from '../ReservationFormController';
import type { ReservationService } from '../types';

/**
 * RTL testy klientského výběru služeb (úkol 6.3).
 *
 * Co ověřujeme:
 *  - R1.4 / R3.3 — cena 0 Kč se nezobrazuje (per-service ani v průběžném souhrnu),
 *    cena > 0 Kč se zobrazí,
 *  - R1.6 — pokus přidat 11. službu se odmítne hláškou „Najednou lze vybrat
 *    nejvýše 10 služeb" a `onToggle` se NEzavolá (picker je controlled —
 *    renderujeme ho s `selectedServiceIds` délky 10),
 *  - R1.7 — prázdný seznam služeb → hláška „Tento podnik zatím nemá žádné
 *    rezervovatelné služby",
 *  - R8.3 — při změně množiny služeb se dříve vybraný zaměstnanec mimo nový
 *    průnik zruší (ověřeno na úrovni controlleru, kde je toto chování zapojené).
 *
 * Dotazy přes role/text/title (ne přes konkrétní markup), aby test nebyl křehký.
 * `@testing-library/user-event` není v projektu k dispozici → používáme `fireEvent`.
 */

// Server actions controlleru mockujeme, aby se netahal serverový import řetězec.
const actions = vi.hoisted(() => ({
  getAvailableSlots: vi.fn(),
  createReservation: vi.fn(),
}));

vi.mock('@/server/AvailableSlotsService', () => ({
  getAvailableSlots: actions.getAvailableSlots,
}));

vi.mock('@/server/ReservationCreator', () => ({
  createReservation: actions.createReservation,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Step1ServicePicker — cena 0 Kč se nezobrazuje (R1.4, R3.3)', () => {
  const services: ReservationService[] = [
    { id: 'placena', name: 'Stříhání vlasů', durationMinutes: 30, priceCzk: 500, description: null },
    { id: 'zdarma', name: 'Konzultace', durationMinutes: 15, priceCzk: 0, description: null },
  ];

  it('u služby s cenou > 0 Kč cenu zobrazí, u 0 Kč ji skryje', () => {
    render(
      <Step1ServicePicker
        services={services}
        selectedServiceIds={[]}
        onToggle={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    // Cena > 0 Kč se zobrazí.
    expect(screen.getByText('500 Kč')).toBeTruthy();
    // Cena 0 Kč se nikde nevypisuje.
    expect(screen.queryByText('0 Kč')).toBeNull();
  });

  it('průběžný souhrn skryje Combined_Price, když je celková cena 0 Kč', () => {
    render(
      <Step1ServicePicker
        services={services}
        selectedServiceIds={['zdarma']}
        onToggle={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    // Souhrn ukazuje trvání, ale žádnou cenu (0 Kč skryto).
    expect(screen.getByText('Celkem 15 min')).toBeTruthy();
    expect(screen.queryByText('0 Kč')).toBeNull();
  });
});

describe('Step1ServicePicker — odmítnutí 11. služby (R1.6)', () => {
  // 11 služeb; prvních 10 je vybraných → klik na 11. musí být odmítnut.
  const services: ReservationService[] = Array.from({ length: 11 }, (_, index) => ({
    id: `svc-${index}`,
    name: `Služba ${index + 1}`,
    durationMinutes: 30,
    priceCzk: 100,
    description: null,
  }));
  const selectedTen = services.slice(0, 10).map((service) => service.id);

  it('zobrazí limitní hlášku a NEzavolá onToggle při pokusu o 11. službu', () => {
    const onToggle = vi.fn();
    render(
      <Step1ServicePicker
        services={services}
        selectedServiceIds={selectedTen}
        onToggle={onToggle}
        onNext={vi.fn()}
      />,
    );

    // Hláška se před kliknutím nezobrazuje.
    expect(screen.queryByText('Najednou lze vybrat nejvýše 10 služeb')).toBeNull();

    // Klik na nevybranou 11. službu.
    fireEvent.click(screen.getByRole('button', { name: /Služba 11/ }));

    // Hláška se zobrazí a výběr se nezměnil (onToggle se nezavolal).
    expect(screen.getByText('Najednou lze vybrat nejvýše 10 služeb')).toBeTruthy();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('odebrání už vybrané služby zůstane povolené i na horním limitu', () => {
    const onToggle = vi.fn();
    render(
      <Step1ServicePicker
        services={services}
        selectedServiceIds={selectedTen}
        onToggle={onToggle}
        onNext={vi.fn()}
      />,
    );

    // Klik na již vybranou službu = odebrání → onToggle se zavolá.
    // (Přístupný název spojuje texty bez mezer: „Služba 130 min100 Kč" → kotvíme zleva.)
    fireEvent.click(screen.getByRole('button', { name: /^Služba 130 min/ }));
    expect(onToggle).toHaveBeenCalledWith('svc-0');
  });
});

describe('Step1ServicePicker — prázdný seznam služeb (R1.7)', () => {
  it('zobrazí hlášku, že podnik nemá rezervovatelné služby', () => {
    render(
      <Step1ServicePicker services={[]} selectedServiceIds={[]} onToggle={vi.fn()} onNext={vi.fn()} />,
    );

    expect(
      screen.getByText('Tento podnik zatím nemá žádné rezervovatelné služby'),
    ).toBeTruthy();
  });
});

describe('ReservationFormController — zrušení zaměstnance mimo průnik (R8.3)', () => {
  const services: ReservationService[] = [
    { id: 'svc-a', name: 'Stříhání vlasů', durationMinutes: 30, priceCzk: 500, description: null },
    { id: 'svc-b', name: 'Barvení', durationMinutes: 90, priceCzk: 1500, description: null },
  ];

  // svc-a umí Eva i Petr, svc-b umí jen Petr → průnik {a,b} = pouze Petr.
  const serviceEmployees = {
    'svc-a': [
      { id: 'eva', name: 'Eva', photoUrl: null },
      { id: 'petr', name: 'Petr', photoUrl: null },
    ],
    'svc-b': [{ id: 'petr', name: 'Petr', photoUrl: null }],
  };

  beforeEach(() => {
    actions.getAvailableSlots.mockResolvedValue({ ok: true, slots: ['09:00'] });
  });

  it('po přidání služby mimo průnik se dříve vybraný zaměstnanec zruší', async () => {
    render(
      <ReservationFormController
        slug="kavarna"
        services={services}
        serviceEmployees={serviceEmployees}
        allowEmployeeSelection
      />,
    );

    // Vyber svc-a → nabídnou se Eva i Petr.
    fireEvent.click(screen.getByRole('button', { name: /Stříhání vlasů/ }));
    const eva = screen.getByTitle('Eva');
    expect(eva).toBeTruthy();

    // Vyber zaměstnankyni Eva → je vybraná.
    fireEvent.click(eva);
    await waitFor(() => {
      expect(screen.getByTitle('Eva').getAttribute('aria-pressed')).toBe('true');
    });

    // Přidej svc-b → průnik je jen Petr; Eva vypadne z nabídky a výběr se zruší (R8.3).
    fireEvent.click(screen.getByRole('button', { name: /Barvení/ }));

    await waitFor(() => {
      // Eva už není nabízená (mimo průnik).
      expect(screen.queryByTitle('Eva')).toBeNull();
    });
    // Petr je stále nabízený, ale není vybraný (předchozí výběr Evy se nepřenesl).
    expect(screen.getByTitle('Petr').getAttribute('aria-pressed')).toBe('false');
  });
});
