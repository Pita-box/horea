import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PublicProfileRenderer,
  type PublicProfileOpeningHours,
  type PublicProfileService,
} from '@/components/PublicProfileRenderer';

/**
 * Snapshot testy `PublicProfileRenderer` (úkol 3.4).
 *
 * ROZSAH KOMPONENTY: `PublicProfileRenderer` je doménově odpovědný JEN za render
 * PUBLIKOVANÉHO profilu — dostává už načtená data publikovaného podniku a jen je
 * vykreslí. Proto zde snapshotujeme varianty publikovaného profilu (s logem /
 * bez loga, různé kombinace kontaktů, prázdný seznam služeb).
 *
 * VĚDOMÁ ODCHYLKA od doslovného „3 stavy stránky": stavy „nepublikováno" a „404"
 * NEJSOU doménou této komponenty — jsou to ROUTE-level rozhodnutí v
 * `app/[slug]/page.tsx` (dispatch publikováno / nepublikováno / 404) a v jeho
 * `generateMetadata` (noindex). Tyto stavy pokrývá routa `/[slug]` a metadata
 * test 4.6 (`app/[slug]/__tests__/metadata.test.ts`). Async server routu zde
 * v jsdom nevykreslujeme — testujeme přesně tu část, kterou tato komponenta řeší.
 *
 * Pro deterministické snapshoty: `priceCzk` / `durationMinutes` mají pevné
 * hodnoty a `createdAt` pevné ISO řetězce (komponenta podle nich jen řadí).
 */

// next/image vyžaduje běhové prostředí Next.js (optimalizační loader), které v
// jsdom není. Pro deterministický a čitelný snapshot mockujeme `next/image` na
// prosté `<img>` a Next-only prop `priority` do DOM nepropagujeme.
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    priority?: boolean;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test mock, ne produkční render
    <img src={src} alt={alt} width={width} height={height} />
  ),
}));

/** Pevné otevírací doby: Po–Pá otevřeno, So + Ne chybí (→ „zavřeno"). */
const WEEKDAY_HOURS: PublicProfileOpeningHours[] = [
  { dayOfWeek: 0, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 1, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 2, opensAt: '09:00:00', closesAt: '17:00:00' },
  { dayOfWeek: 3, opensAt: '10:00:00', closesAt: '18:30:00' },
  { dayOfWeek: 4, opensAt: '09:00:00', closesAt: '14:00:00' },
];

const MULTIPLE_SERVICES: PublicProfileService[] = [
  {
    id: 'svc-espresso',
    name: 'Espresso',
    durationMinutes: 15,
    priceCzk: 65,
    description: 'Silné espresso z lokální pražírny.',
    createdAt: '2024-01-01T08:00:00.000Z',
  },
  {
    id: 'svc-konzultace',
    name: 'Úvodní konzultace zdarma',
    durationMinutes: 30,
    priceCzk: 0,
    description: null,
    createdAt: '2024-01-02T08:00:00.000Z',
  },
  {
    id: 'svc-latte',
    name: 'Dýňové latte',
    durationMinutes: 20,
    priceCzk: 1200,
    description: null,
    createdAt: '2024-01-03T08:00:00.000Z',
  },
];

describe('PublicProfileRenderer (snapshot)', () => {
  it('vykreslí publikovaný profil s logem, všemi kontakty, více službami a zavřenými dny', () => {
    const { container } = render(
      <PublicProfileRenderer
        business={{
          name: 'Kavárna U Kočky',
          type: 'beauty',
          description: 'Útulná kavárna v centru města.\nOtevřeno přes celý týden.',
          logoUrl: 'https://cdn.example.com/logo.png',
          phone: '+420704344177',
          contactEmail: 'kontakt@kavarna.cz',
          address: 'Náměstí Míru 1, Praha',
        }}
        services={MULTIPLE_SERVICES}
        openingHours={WEEKDAY_HOURS}
        reservationForm={<div data-testid="reservation-form">Rezervační formulář</div>}
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('vykreslí publikovaný profil bez loga a bez kontaktů (zástupný vizuál, žádné kontaktní řádky)', () => {
    const { container } = render(
      <PublicProfileRenderer
        business={{
          name: 'Holičství Bez Loga',
          type: 'ostatni',
          description: null,
          logoUrl: null,
          phone: null,
          contactEmail: null,
          address: null,
        }}
        services={[
          {
            id: 'svc-strih',
            name: 'Pánský střih',
            durationMinutes: 30,
            priceCzk: 300,
            description: null,
            createdAt: '2024-01-01T08:00:00.000Z',
          },
        ]}
        openingHours={[]}
        reservationForm={<div data-testid="reservation-form">Rezervační formulář</div>}
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('při prázdném seznamu služeb zobrazí hlášku a nevykreslí rezervační formulář', () => {
    const { container } = render(
      <PublicProfileRenderer
        business={{
          name: 'Podnik Bez Služeb',
          type: 'kadernik',
          description: 'Profil zatím bez rezervovatelných služeb.',
          logoUrl: null,
          phone: '+420111222333',
          contactEmail: null,
          address: null,
        }}
        services={[]}
        openingHours={WEEKDAY_HOURS}
        // I když formulář předáme, komponenta ho při prázdných službách nevykreslí.
        reservationForm={<div data-testid="reservation-form">Rezervační formulář</div>}
      />,
    );

    // Defenzivní hláška (R4.4) a žádný rezervační formulář.
    expect(container.textContent).toContain('Tento podnik zatím nemá žádné rezervovatelné služby');
    expect(container.querySelector('[data-testid="reservation-form"]')).toBeNull();
    expect(container).toMatchSnapshot();
  });
});
