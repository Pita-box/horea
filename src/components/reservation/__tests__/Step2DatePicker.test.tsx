import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Step2DatePicker } from '../Step2DatePicker';
import type { SlotsState } from '../types';

/**
 * RTL testy `Step2DatePicker` — rozlišení hlášek prázdných termínů.
 *
 * Klíčová záruka (požadavek): při PLNĚ OBSAZENÉM dni (stav `empty`) zůstává
 * původní hláška „V tento den nejsou dostupné žádné termíny. Zkuste jiný termín.".
 * Specifická hláška o příliš dlouhém bloku se ukáže jen ve stavu `too_long`.
 */

const FULLY_BOOKED = 'V tento den nejsou dostupné žádné termíny. Zkuste jiný termín.';

function renderPicker(
  slotsState: SlotsState,
  overrides: Partial<Parameters<typeof Step2DatePicker>[0]> = {},
) {
  const props = {
    date: '2025-06-16',
    today: '2025-06-16',
    slotsState,
    errorMessage: null,
    combinedDurationMinutes: 120,
    serviceCount: 2,
    onDateChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    onAdjustServices: vi.fn(),
    ...overrides,
  };
  render(<Step2DatePicker {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Step2DatePicker — hlášky prázdných termínů', () => {
  it('plně obsazený den (empty) zachová původní hlášku a NEukáže hlášku o délce', () => {
    renderPicker('empty');

    expect(screen.getByText(FULLY_BOOKED)).toBeTruthy();
    expect(screen.queryByText(/se do tohoto dne nevejdou/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upravit výběr služeb' })).toBeNull();
  });

  it('příliš dlouhý blok (too_long) ukáže výzvu k odebrání služeb a NEukáže hlášku o plně obsazeném dni', () => {
    const props = renderPicker('too_long', { combinedDurationMinutes: 120, serviceCount: 2 });

    expect(screen.queryByText(FULLY_BOOKED)).toBeNull();
    expect(screen.getByText(/Vybrané služby \(celkem 120 min\) se do tohoto dne nevejdou/)).toBeTruthy();

    // „Upravit výběr služeb" vrátí klienta na krok 1.
    fireEvent.click(screen.getByRole('button', { name: 'Upravit výběr služeb' }));
    expect(props.onAdjustServices).toHaveBeenCalledTimes(1);
  });

  it('too_long s jedinou službou vyzve jen ke změně termínu (bez tlačítka odebrání)', () => {
    renderPicker('too_long', { serviceCount: 1, combinedDurationMinutes: 90 });

    expect(screen.getByText(/Zvolte prosím jiný termín/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upravit výběr služeb' })).toBeNull();
  });

  it('„Pokračovat" je dostupné jen při načtených termínech (loaded)', () => {
    renderPicker('empty');
    expect((screen.getByRole('button', { name: 'Pokračovat' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    cleanup();
    renderPicker('loaded');
    expect((screen.getByRole('button', { name: 'Pokračovat' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
