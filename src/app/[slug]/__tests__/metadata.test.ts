import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testy `generateMetadata` z routy `/[slug]` pro tři stavy stránky (úkol 4.6).
 *
 * Stavová dispatch logika čte stav profilu přes RPC `get_public_business_state`
 * a — pro publikovaný profil — dočítá `businesses` (popis, logo). Mockujeme tedy
 * `createPublicClient` z `@/lib/supabase/public` přes `vi.hoisted` + `vi.mock`:
 * řídíme výsledek RPC `.maybeSingle()` i čtení `.from('businesses').select().eq().
 * maybeSingle()`. Služby a otevírací doba se v metadatech nepoužívají, ale
 * `loadPublishedProfile` je načítá, takže mock pokrývá i `.returns()`.
 *
 * Asserty preferujeme před snapshotem kvůli čitelnosti (které pole je proč).
 */

// `react.cache` je v Next.js runtime, ale v samostatném `react` balíčku (18.3.1)
// pod Vitest není dostupné. `getBusinessState`/`loadPublishedProfile` v page.tsx
// jsou jím obalené na úrovni modulu, takže ho nahradíme identitou (per-request
// dedupe není pro test podstatné — každé volání jen spustí funkci).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T>(fn: T): T => fn };
});

const supabaseMock = vi.hoisted(() => {
  const state = {
    rpc: { data: null as unknown, error: null as unknown },
    business: { data: null as unknown, error: null as unknown },
    services: { data: [] as unknown[], error: null as unknown },
    hours: { data: [] as unknown[], error: null as unknown },
  };
  return { state };
});

vi.mock('@/lib/supabase/public', () => {
  const { state } = supabaseMock;
  return {
    createPublicClient: () => ({
      // get_public_business_state(...).maybeSingle()
      rpc: () => ({
        maybeSingle: async () => state.rpc,
      }),
      // from(table).select(...).eq(...)[.order(...)].maybeSingle()/.returns()
      from: (table: string) => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          maybeSingle: async () => state.business,
          returns: async () => (table === 'services' ? state.services : state.hours),
        };
        return builder;
      },
    }),
  };
});

import { generateMetadata } from '../page';

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  // Výchozí stav = 404 (žádný řádek). Jednotlivé testy si přenastaví.
  supabaseMock.state.rpc = { data: null, error: null };
  supabaseMock.state.business = { data: null, error: null };
  supabaseMock.state.services = { data: [], error: null };
  supabaseMock.state.hours = { data: [], error: null };
});

describe('generateMetadata — publikovaný profil', () => {
  // Delší než 155 znaků, ať lze ověřit oříznutí description (R12.1).
  const longDescription = 'Příjemná kavárna s domácími dezerty. '.repeat(10);

  beforeEach(() => {
    supabaseMock.state.rpc = {
      data: { id: 'biz-1', name: 'Kavárna U Kočky', published: true },
      error: null,
    };
    supabaseMock.state.business = {
      data: {
        name: 'Kavárna U Kočky',
        type: 'beauty',
        description: longDescription,
        logo_url: 'https://cdn.example.com/logo.png',
        phone: '+420704344177',
        contact_email: 'kontakt@kavarna.cz',
        address: 'Náměstí Míru 1, Praha',
      },
      error: null,
    };
  });

  it('nastaví title, oříznutý description, canonical a Open Graph (s logem)', async () => {
    const metadata = await generateMetadata(params('kavarna'));

    expect(metadata.title).toBe('Kavárna U Kočky — rezervace online');
    // description = prvních 155 znaků popisu (R12.1).
    expect(metadata.description).toBe(longDescription.slice(0, 155));
    expect((metadata.description as string).length).toBe(155);
    expect(metadata.alternates?.canonical).toBe('https://www.horea.cz/kavarna');

    const og = metadata.openGraph;
    expect(og).toBeDefined();
    expect(og?.url).toBe('https://www.horea.cz/kavarna');
    expect(og && 'type' in og ? og.type : undefined).toBe('website');
    // og:image jen když má podnik logo (R12.2).
    expect(og?.images).toEqual([{ url: 'https://cdn.example.com/logo.png' }]);

    // Publikovaný profil se má indexovat → žádné noindex robots.
    expect(metadata.robots).toBeUndefined();
  });

  it('velké/malé písmo slugu se normalizuje na lowercase canonical', async () => {
    const metadata = await generateMetadata(params('KaVaRna'));
    expect(metadata.alternates?.canonical).toBe('https://www.horea.cz/kavarna');
    expect(metadata.openGraph?.url).toBe('https://www.horea.cz/kavarna');
  });

  it('bez loga nevkládá og:image', async () => {
    supabaseMock.state.business = {
      data: {
        name: 'Kavárna U Kočky',
        type: 'beauty',
        description: longDescription,
        logo_url: null,
        phone: null,
        contact_email: null,
        address: null,
      },
      error: null,
    };

    const metadata = await generateMetadata(params('kavarna'));
    expect(metadata.title).toBe('Kavárna U Kočky — rezervace online');
    expect(metadata.openGraph?.images).toBeUndefined();
  });
});

describe('generateMetadata — nepublikovaný profil', () => {
  it('vrátí pouze noindex robots, žádný title ani Open Graph (R2.3)', async () => {
    supabaseMock.state.rpc = {
      data: { id: 'biz-2', name: 'Salon', published: false },
      error: null,
    };

    const metadata = await generateMetadata(params('salon'));

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBeUndefined();
    expect(metadata.description).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
    expect(metadata.alternates).toBeUndefined();
  });
});

describe('generateMetadata — 404 (slug nenalezen)', () => {
  it('vrátí pouze noindex robots (R3.3)', async () => {
    supabaseMock.state.rpc = { data: null, error: null };

    const metadata = await generateMetadata(params('neexistuje'));

    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.title).toBeUndefined();
    expect(metadata.openGraph).toBeUndefined();
  });
});
