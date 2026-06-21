import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HealthReport } from '@/lib/system/health';

/**
 * Testy přístupnosti panelů Správy systému (feature `admin-system-tools`, úkol 28.3).
 *
 * Ověřujeme tři přístupnostní invarianty napříč sekcemi (R14.1, R14.2, R14.3,
 * R16.8, R20.3, R21.3, R24.4):
 *  1. **Textové labely stavů, ne jen barva** (R14.1) — stavy služeb v health
 *     sekci nesou český textový label (v pořádku / zhoršené / nedostupné).
 *  2. **Ovladatelnost klávesnicí** (R14.2) — akční tlačítka jsou nativní `<button>`
 *     prvky, lze je zaměřit Tabem a aktivovat Enterem.
 *  3. **`aria-live` region aktualizovaný po akci** (R14.3, R21.3) — po doběhnutí
 *     server action se v `aria-live` regionu objeví textový výsledek.
 *
 * Server actions z `./actions` mockujeme jako spy s řízeným výsledkem, takže testy
 * neprovádějí žádné I/O a nejsou závislé na síti ani prostředí.
 */

// Spy na server actions — řízený výsledek bez I/O.
const actions = vi.hoisted(() => ({
  recheckHealth: vi.fn(),
  revalidateTarget: vi.fn(),
  triggerCron: vi.fn(),
  pruneCronRuns: vi.fn(),
  sendTestEmail: vi.fn(),
}));

vi.mock('../actions', () => ({
  recheckHealth: actions.recheckHealth,
  revalidateTarget: actions.revalidateTarget,
  triggerCron: actions.triggerCron,
  pruneCronRuns: actions.pruneCronRuns,
  sendTestEmail: actions.sendTestEmail,
}));

import { HealthRecheckButton } from '../HealthRecheckButton';
import { RevalidatePanel } from '../RevalidatePanel';
import { TestEmailPanel } from '../TestEmailPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Výchozí health report pro render: dva ze tří možných stavů, ať lze ověřit labely. */
function buildInitialReport(): HealthReport {
  return {
    aggregate: 'degraded',
    checkedAt: '2024-01-01T10:00:00.000Z',
    services: [
      { service: 'supabase', label: 'Supabase', status: 'ok', latencyMs: 12, errorKind: null },
      { service: 'resend', label: 'Resend', status: 'degraded', latencyMs: 2500, errorKind: null },
      { service: 'gopay', label: 'GoPay', status: 'down', latencyMs: null, errorKind: 'timeout' },
    ],
  };
}

describe('HealthRecheckButton — přístupnost stavů a re-check (R14.1, R14.2, R21.3)', () => {
  it('stavy služeb mají textový label (ne jen barvu) a je přítomen aria-live region', () => {
    const { container } = render(<HealthRecheckButton initialReport={buildInitialReport()} />);

    // R14.1 — každý stav má v tabulce služeb český textový label, ne jen barevný
    // indikátor. Dotaz scopujeme do tabulky (agregát „zhoršené" se opakuje v aria-live).
    const table = within(screen.getByRole('table'));
    expect(table.getByText('v pořádku')).toBeTruthy();
    expect(table.getByText('zhoršené')).toBeTruthy();
    expect(table.getByText('nedostupné')).toBeTruthy();

    // R14.3 / R21.3 — existuje aria-live region oznamující agregovaný stav a čas.
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(within(liveRegion as HTMLElement).getByText(/Celkový stav:/)).toBeTruthy();
  });

  it('tlačítko „Zkontrolovat znovu" je ovladatelné klávesnicí a po Enteru se aria-live region aktualizuje', async () => {
    const user = userEvent.setup();

    // Mock vrátí nový report s jiným agregátem i časem kontroly.
    actions.recheckHealth.mockResolvedValue({
      ok: true,
      report: {
        aggregate: 'ok',
        checkedAt: '2024-06-15T08:30:00.000Z',
        services: [
          { service: 'supabase', label: 'Supabase', status: 'ok', latencyMs: 10, errorKind: null },
        ],
      } satisfies HealthReport,
    });

    const { container } = render(<HealthRecheckButton initialReport={buildInitialReport()} />);

    // Výchozí agregát „zhoršené".
    const liveRegion = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(within(liveRegion).getByText('zhoršené')).toBeTruthy();

    // R14.2 — tlačítko lze zaměřit Tabem (focus) a aktivovat Enterem (klávesnice).
    await user.tab();
    const button = screen.getByRole('button', { name: 'Zkontrolovat znovu' });
    expect(document.activeElement).toBe(button);

    await user.keyboard('{Enter}');

    // Akce se zavolala a aria-live region se aktualizoval novým agregátem.
    expect(actions.recheckHealth).toHaveBeenCalledTimes(1);
    expect(await within(liveRegion).findByText('v pořádku')).toBeTruthy();
  });
});

describe('TestEmailPanel — potvrzení a aria-live výsledek (R14.1, R14.3, R22.2)', () => {
  it('má aria-live region, akce je za explicitním potvrzením a po akci se objeví textový výsledek', async () => {
    const user = userEvent.setup();
    actions.sendTestEmail.mockResolvedValue({ ok: true });

    const { container } = render(<TestEmailPanel />);

    // aria-live region existuje a je zprvu prázdný (žádný výsledek).
    const liveRegion = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(liveRegion).not.toBeNull();
    expect(liveRegion.textContent).toBe('');

    // První klik jen odhalí krok potvrzení — akce se ještě NEspustí (R15.2/R22.2).
    await user.click(screen.getByRole('button', { name: 'Odeslat testovací e-mail' }));
    expect(actions.sendTestEmail).not.toHaveBeenCalled();
    expect(screen.getByText('Opravdu odeslat testovací e-mail na administrátorskou adresu?')).toBeTruthy();

    // Po explicitním potvrzení se akce zavolá a v aria-live regionu se objeví textový výsledek (R14.1).
    await user.click(screen.getByRole('button', { name: 'Potvrdit odeslání' }));
    expect(actions.sendTestEmail).toHaveBeenCalledTimes(1);
    expect(
      await within(liveRegion).findByText('Testovací e-mail byl odeslán na administrátorskou adresu.'),
    ).toBeTruthy();
  });
});

describe('RevalidatePanel — potvrzení a aria-live výsledek (R14.1, R14.3, R15.2)', () => {
  it('po potvrzení revalidace se v aria-live regionu objeví textový výsledek', async () => {
    const user = userEvent.setup();
    actions.revalidateTarget.mockResolvedValue({
      ok: true,
      target: { kind: 'path', value: '/' },
    });

    const { container } = render(<RevalidatePanel />);

    const liveRegion = container.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(liveRegion).not.toBeNull();

    // První klik odhalí potvrzení — akce se ještě nespustí (R15.2).
    await user.click(screen.getByRole('button', { name: 'Revalidovat cache' }));
    expect(actions.revalidateTarget).not.toHaveBeenCalled();

    // Potvrzení → akce se zavolá a výsledek se zobrazí jako text (ne jen barva, R14.1).
    await user.click(screen.getByRole('button', { name: 'Potvrdit revalidaci' }));
    expect(actions.revalidateTarget).toHaveBeenCalledTimes(1);
    expect(await within(liveRegion).findByText(/byla úspěšně revalidována/)).toBeTruthy();
  });
});
