import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DashboardHeader } from '../DashboardHeader';

/**
 * RTL testy topbaru dashboardu v admin režimu (úkol 29.3).
 *
 * Co ověřujeme (props předává {@link DashboardChrome} pro `variant="admin"`):
 *  - R1.1 / R1.2 / R14.4 — ikona nastavení (gear) míří na `/admin/system`
 *    a má přístupný název „Správa systému" (aria-label),
 *  - R1.3 / R1.4 — ikona účtu míří na `/admin/account` a je to samostatný,
 *    od nastavení oddělený odkaz (dva různé `<a>` s odlišnými cíli).
 *
 * Dotazy přes role/aria-label (ne přes konkrétní markup), aby test nebyl křehký.
 * `next/link` se pod jsdom renderuje jako `<a href>`, takže není potřeba mock.
 */

afterEach(() => {
  cleanup();
});

// Společné admin props odpovídající tomu, co předává DashboardChrome.
const adminProps = {
  onMenuClick: vi.fn(),
  showSettings: true,
  settingsHref: '/admin/system',
  settingsLabel: 'Správa systému',
  accountHref: '/admin/account',
} as const;

describe('DashboardHeader — admin režim (R1.1, R1.2, R1.3, R1.4, R14.4)', () => {
  it('ikona nastavení míří na /admin/system a má aria-label „Správa systému"', () => {
    render(<DashboardHeader {...adminProps} />);

    const settingsLink = screen.getByRole('link', { name: 'Správa systému' });
    expect(settingsLink.getAttribute('href')).toBe('/admin/system');
  });

  it('ikona účtu míří na /admin/account a je oddělená od nastavení', () => {
    render(<DashboardHeader {...adminProps} />);

    const settingsLink = screen.getByRole('link', { name: 'Správa systému' });
    const accountLink = screen.getByRole('link', { name: 'Nastavení účtu' });

    // Účet míří na admin účet…
    expect(accountLink.getAttribute('href')).toBe('/admin/account');
    // …a jde o jiný odkaz než nastavení (dva různé prvky, dva různé cíle).
    expect(accountLink).not.toBe(settingsLink);
    expect(accountLink.getAttribute('href')).not.toBe(
      settingsLink.getAttribute('href'),
    );
  });

  it('bez showSettings se ikona nastavení nezobrazí, účet zůstává', () => {
    render(<DashboardHeader {...adminProps} showSettings={false} />);

    expect(screen.queryByRole('link', { name: 'Správa systému' })).toBeNull();
    // Účet je stále dostupný.
    expect(screen.getByRole('link', { name: 'Nastavení účtu' })).toBeTruthy();
  });
});
