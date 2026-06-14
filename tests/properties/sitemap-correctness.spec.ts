import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: public-business-page, Property 7: Sitemap correctness.
 *
 * Skutečnou vazbu „URL v sitemap ⟺ business je Published_Business" vynucuje RLS
 * policy (migrace 0013: anon SELECT na `businesses` přes `is_business_published`),
 * která je ověřena integračně v úkolech 8.x. Anon klíč proto v `businesses` VIDÍ
 * POUZE Published_Business řádky. Tento PBT ověřuje druhou půlku invariantu na
 * úrovni samotné `sitemap` funkce: že VĚRNĚ mapuje řádky, které jí RLS vrátí —
 * žádný řádek nepřidá ani neztratí — a že `lastModified` odpovídá `updated_at`.
 * RLS zde proto simulujeme řízeným datasetem vraceným z mocku klienta.
 *
 * Validates: Requirements 13.2, 13.3
 */

const createPublicClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/public', () => ({ createPublicClient: createPublicClientMock }));

import sitemap from '@/app/sitemap';

const NUM_RUNS = 100;
const SITE_URL = 'https://www.horea.cz';

type BusinessRow = { slug: string; updated_at: string };

/**
 * Fake Supabase klient podporující jen řetězení, které `sitemap()` používá:
 * `.from('businesses').select(...).order(...).returns()` → `{ data, error }`.
 */
function buildPublicClient(result: { data: BusinessRow[] | null; error: unknown }) {
  const builder = {
    select: () => builder,
    order: () => builder,
    returns: () => Promise.resolve(result),
  };
  return { from: () => builder };
}

/** Slug: lowercase ASCII + číslice + pomlčky (tvar uložený v DB). */
const slugArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0704344177-'.split('')), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(''));

/** Náhodný řádek publikovaného podniku: unikátní slug + ISO `updated_at`. */
const businessRowArb: fc.Arbitrary<BusinessRow> = fc.record({
  slug: slugArb,
  updated_at: fc
    .date({
      min: new Date('2000-01-01T00:00:00.000Z'),
      max: new Date('2035-12-31T23:59:59.999Z'),
      noInvalidDate: true,
    })
    .map((date) => date.toISOString()),
});

/** Dataset s navzájem unikátními slugy (PRIMARY KEY garance v reálné DB). */
const datasetArb: fc.Arbitrary<BusinessRow[]> = fc.uniqueArray(businessRowArb, {
  selector: (row) => row.slug,
  minLength: 0,
  maxLength: 30,
});

beforeEach(() => {
  createPublicClientMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Property 7: korektnost sitemap (věrné mapování řádků z RLS)', () => {
  it('sitemap obsahuje právě jednu URL na každý řádek a lastModified = updated_at', async () => {
    await fc.assert(
      fc.asyncProperty(datasetArb, async (rows) => {
        createPublicClientMock.mockReturnValue(buildPublicClient({ data: rows, error: null }));

        const result = await sitemap();

        // Žádný řádek navíc, žádný nechybí.
        expect(result).toHaveLength(rows.length);

        // Pro každý vstupní řádek právě jedna odpovídající URL + správný lastModified.
        for (const row of rows) {
          const matches = result.filter((entry) => entry.url === `${SITE_URL}/${row.slug}`);
          expect(matches).toHaveLength(1);
          expect(new Date(matches[0].lastModified!).getTime()).toBe(
            new Date(row.updated_at).getTime(),
          );
        }

        // Žádná URL ve výstupu, která by neodpovídala některému vstupnímu řádku.
        const expectedUrls = new Set(rows.map((row) => `${SITE_URL}/${row.slug}`));
        for (const entry of result) {
          expect(expectedUrls.has(entry.url)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('prázdný dataset → prázdná sitemap', async () => {
    createPublicClientMock.mockReturnValue(buildPublicClient({ data: [], error: null }));

    await expect(sitemap()).resolves.toEqual([]);
  });

  it('chyba klienta (error) → prázdná sitemap (degradace)', async () => {
    createPublicClientMock.mockReturnValue(
      buildPublicClient({ data: null, error: { message: 'boom' } }),
    );

    await expect(sitemap()).resolves.toEqual([]);
  });
});
