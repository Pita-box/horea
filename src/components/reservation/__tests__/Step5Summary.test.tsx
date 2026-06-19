import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Step5Summary } from '../Step5Summary';
import type { ContactValues, ReservationService } from '../types';

/**
 * RTL testy `Step5Summary` (úkol 7.1) — souhrn kombinované rezervace.
 *
 * Co ověřujeme:
 *  - R12.1 — výpis všech služeb v uloženém pořadí (název + délka), s pořadovým
 *    číslem při více službách,
 *  - R12.2 — Combined_Duration jako celková délka,
 *  - R12.3 — Combined_Price jen když je > 0 Kč (jinak skryté),
 *  - R12.4 — jeden časový blok (datum + čas) v Europe/Prague,
 *  - per-service „Upravit" skáče na krok 1.
 */

const CONTACT: ContactValues = {
  clientName: 'Jana Nováková',
  clientPhone: '+420123456789',
  clientEmail: 'jana@example.cz',
  note: '',
};

function renderSummary(services: ReservationService[], overrides: Partial<Parameters<typeof Step5Summary>[0]> = {}) {
  const props = {
    services,
    date: '2025-03-14',
    time: '09:30',
    contact: CONTACT,
    submitState: 'idle' as const,
    submitError: null,
    reservationStatus: null,
    onEditStep: vi.fn(),
    onBack: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<Step5Summary {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Step5Summary — souhrn kombinované rezervace', () => {
  it('vypíše více služeb v pořadí s pořadovým číslem a délkou (R12.1)', () => {
    renderSummary([
      { id: 'a', name: 'Dámský střih', durationMinutes: 45, priceCzk: 500, description: null },
      { id: 'b', name: 'Foukání', durationMinutes: 30, priceCzk: 200, description: null },
    ]);

    expect(screen.getByText('1. Dámský střih (45 min)')).toBeTruthy();
    expect(screen.getByText('2. Foukání (30 min)')).toBeTruthy();
  });

  it('u jediné služby nepoužije pořadové číslo (R12.1)', () => {
    renderSummary([
      { id: 'a', name: 'Dámský střih', durationMinutes: 45, priceCzk: 500, description: null },
    ]);

    expect(screen.getByText('Dámský střih (45 min)')).toBeTruthy();
    expect(screen.queryByText('1. Dámský střih (45 min)')).toBeNull();
  });

  it('zobrazí Combined_Duration jako celkovou délku (R12.2)', () => {
    renderSummary([
      { id: 'a', name: 'Dámský střih', durationMinutes: 45, priceCzk: 500, description: null },
      { id: 'b', name: 'Foukání', durationMinutes: 30, priceCzk: 200, description: null },
    ]);

    expect(screen.getByText('Trvání celkem')).toBeTruthy();
    expect(screen.getByText('75 min')).toBeTruthy();
  });

  it('zobrazí Combined_Price když je > 0 Kč (R12.3)', () => {
    renderSummary([
      { id: 'a', name: 'Dámský střih', durationMinutes: 45, priceCzk: 500, description: null },
      { id: 'b', name: 'Foukání', durationMinutes: 30, priceCzk: 200, description: null },
    ]);

    expect(screen.getByText('Cena celkem')).toBeTruthy();
    expect(screen.getByText('700 Kč')).toBeTruthy();
  });

  it('skryje Combined_Price když je 0 Kč (R12.3)', () => {
    renderSummary([
      { id: 'a', name: 'Konzultace', durationMinutes: 15, priceCzk: 0, description: null },
      { id: 'b', name: 'Prohlídka', durationMinutes: 15, priceCzk: 0, description: null },
    ]);

    expect(screen.queryByText('Cena celkem')).toBeNull();
  });

  it('zobrazí jeden časový blok — datum a čas (R12.4)', () => {
    renderSummary([
      { id: 'a', name: 'Dámský střih', durationMinutes: 45, priceCzk: 500, description: null },
    ]);

    expect(screen.getByText('14. 3. 2025')).toBeTruthy();
    expect(screen.getByText('09:30')).toBeTruthy();
  });

  it('„Upravit" u služby skáče na krok 1', () => {
    const props = renderSummary([
      { id: 'a', name: 'Dámský střih', durationMinutes: 45, priceCzk: 500, description: null },
    ]);

    const editButtons = screen.getAllByRole('button', { name: 'Upravit' });
    fireEvent.click(editButtons[0]);
    expect(props.onEditStep).toHaveBeenCalledWith(1);
  });
});
