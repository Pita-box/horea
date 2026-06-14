import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReservationFormController } from '../ReservationFormController';
import type { ReservationService } from '../types';

/**
 * RTL testy `ReservationFormController` (úkol 6.7).
 *
 * Controller je čistě prezentační/UX vrstva nad dvěma server actions. Ty zde
 * mockujeme přes `vi.hoisted` + `vi.mock`, takže se netahá serverový import
 * řetězec (admin klient, Resend) a chování slotů/odeslání plně řídíme z testu.
 *
 * Co ověřujeme:
 *  - krok 1 (výběr služby) — render seznamu služeb + blokovaný přechod bez výběru,
 *  - R8.2 — zachování vybrané služby při návratu z kroku 2 zpět do kroku 1,
 *  - R8.4 — SYNCHRONNÍ znepřístupnění tlačítka „Odeslat rezervaci" hned po kliku
 *    (createReservation vrací pending promise, kterou rozhodujeme až po asserci).
 *
 * Dotazy přes role/text (ne přes konkrétní markup), aby test nebyl křehký.
 * `@testing-library/user-event` není v projektu k dispozici → používáme `fireEvent`.
 */

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

const SERVICES: ReservationService[] = [
  { id: 'svc-strih', name: 'Stříhání vlasů', durationMinutes: 30, priceCzk: 500, description: null },
  { id: 'svc-barveni', name: 'Barvení', durationMinutes: 90, priceCzk: 1500, description: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  actions.getAvailableSlots.mockResolvedValue({ ok: true, slots: ['09:00', '09:30'] });
});

describe('ReservationFormController — krok 1 (výběr služby)', () => {
  it('vykreslí seznam služeb a blokuje přechod bez výběru', () => {
    const { container } = render(<ReservationFormController slug="kavarna" services={SERVICES} />);

    expect(screen.getByRole('heading', { name: 'Výběr služby' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stříhání vlasů/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Barvení/ })).toBeTruthy();

    // Bez vybrané služby je „Pokračovat" zakázané (R4.2).
    const next = screen.getByRole('button', { name: 'Pokračovat' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    expect(container).toMatchSnapshot();
  });
});

describe('ReservationFormController — zachování dat při návratu (R8.2)', () => {
  it('po návratu z kroku 2 do kroku 1 zůstane služba vybraná', () => {
    render(<ReservationFormController slug="kavarna" services={SERVICES} />);

    // Vybereme službu → „Pokračovat" se odemkne.
    fireEvent.click(screen.getByRole('button', { name: /Stříhání vlasů/ }));
    const selected = screen.getByRole('button', { name: /Stříhání vlasů/ });
    expect(selected.getAttribute('aria-pressed')).toBe('true');

    // Krok 1 → krok 2 (datum zatím prázdné, žádný fetch slotů se nespustí).
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));
    expect(screen.getByRole('heading', { name: 'Výběr data' })).toBeTruthy();

    // Krok 2 → zpět na krok 1.
    fireEvent.click(screen.getByRole('button', { name: 'Zpět' }));
    expect(screen.getByRole('heading', { name: 'Výběr služby' })).toBeTruthy();

    // Služba je stále vybraná (data se neztratila — R8.2).
    const stillSelected = screen.getByRole('button', { name: /Stříhání vlasů/ });
    expect(stillSelected.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('ReservationFormController — synchronní disable v kroku 5 (R8.4)', () => {
  it('po kliknutí na „Odeslat rezervaci" je tlačítko okamžitě znepřístupněné', async () => {
    // createReservation drží pending promise — rozhodneme ji až po asserci, aby
    // disabled stav nezávisel na dokončení requestu (musí být SYNCHRONNÍ).
    let resolveCreate!: (value: { ok: true; status: 'approved' | 'pending' }) => void;
    actions.createReservation.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(<ReservationFormController slug="kavarna" services={SERVICES} />);

    // Krok 1 → vyber službu → pokračuj.
    fireEvent.click(screen.getByRole('button', { name: /Stříhání vlasů/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));

    // Krok 2 → vyber budoucí datum → počkej na načtení slotů (Pokračovat se odemkne).
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2099-12-31' } });
    await waitFor(() => {
      const next = screen.getByRole('button', { name: 'Pokračovat' }) as HTMLButtonElement;
      expect(next.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));

    // Krok 3 → vyber čas → pokračuj.
    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));

    // Krok 4 → vyplň validní kontakt → pokračuj.
    fireEvent.change(screen.getByLabelText('Jméno'), { target: { value: 'Jan Novák' } });
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+420704344177' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'jan@example.cz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));

    // Krok 5 → tlačítko je před odesláním povolené.
    const submit = screen.getByRole('button', { name: 'Odeslat rezervaci' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    // Klik → tlačítko musí být OKAMŽITĚ disabled (R8.4), ještě než request doběhne.
    fireEvent.click(submit);
    const submitting = screen.getByRole('button', { name: 'Odesílám…' }) as HTMLButtonElement;
    expect(submitting.disabled).toBe(true);
    expect(actions.createReservation).toHaveBeenCalledTimes(1);

    // Dokončíme request a ověříme úspěšné zobrazení děkovné hlášky.
    resolveCreate({ ok: true, status: 'approved' });
    await waitFor(() => {
      expect(screen.getByText('Děkujeme za rezervaci')).toBeTruthy();
    });
  });
});
