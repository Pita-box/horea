import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { isReservedSlug, normalizeRouteSlug } from '@/lib/slug/route';
import { RESERVED_SLUGS } from '@/lib/slug/reserved';

/**
 * Feature: public-business-page, Property 1: Slug case-insensitivity.
 *
 * Routovací rozhodnutí o stránce `/[slug]` (tj. lookup klíč, kterým se URL slug
 * porovnává s už-normalizovaným DB slugem) MUSÍ být nezávislé na velikosti
 * písmen. `normalizeRouteSlug` proto vrací IDENTICKÝ výsledek pro libovolnou
 * casing variantu téhož slugu a `isReservedSlug` je vůči casingu invariantní.
 * Důsledek: `/Kavarna`, `/KAVARNA` i `/kavarna` se mapují na stejný business,
 * takže žádná casing varianta URL nemůže najít business, který by jiná nenašla.
 *
 * Validates: Requirements 3.1, 3.2
 */

const NUM_RUNS = 200;

/** Znaky validního slugu (DB slug je lowercase ASCII + číslice + pomlčky). */
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyz0704344177-'.split('');

/** Základní (lowercase) slug string. */
const baseSlugArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...SLUG_CHARS), { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(''));

/** Pro daný základ vygeneruje variantu s náhodně změněnou velikostí každého písmene. */
function casingVariantArb(base: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: base.length, maxLength: base.length })
    .map((upperFlags) =>
      base
        .split('')
        .map((char, index) => (upperFlags[index] ? char.toUpperCase() : char.toLowerCase()))
        .join(''),
    );
}

/** Základ + dvě nezávislé casing varianty téhož slugu. */
const baseWithTwoCasingsArb: fc.Arbitrary<[string, string, string]> = baseSlugArb.chain((base) =>
  fc.tuple(fc.constant(base), casingVariantArb(base), casingVariantArb(base)),
);

/** Rezervovaný slug + jeho náhodná casing varianta. */
const reservedWithCasingArb: fc.Arbitrary<[string, string]> = fc
  .constantFrom(...RESERVED_SLUGS)
  .chain((slug) => fc.tuple(fc.constant(slug), casingVariantArb(slug)));

describe('Property 1: case-insensitivita slugu (routovací rozhodnutí)', () => {
  it('normalizeRouteSlug dává identický výsledek pro všechny casing varianty', () => {
    fc.assert(
      fc.property(baseWithTwoCasingsArb, ([base, variantA, variantB]) => {
        const canonical = base.toLowerCase();

        // Každá casing varianta se normalizuje na tentýž lowercase tvar.
        expect(normalizeRouteSlug(variantA)).toBe(canonical);
        expect(normalizeRouteSlug(variantB)).toBe(canonical);
        // A tedy i navzájem (lookup klíč je case-insensitive).
        expect(normalizeRouteSlug(variantA)).toBe(normalizeRouteSlug(variantB));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isReservedSlug je invariantní vůči casingu pro libovolný slug', () => {
    fc.assert(
      fc.property(baseWithTwoCasingsArb, ([, variantA, variantB]) => {
        expect(isReservedSlug(variantA)).toBe(isReservedSlug(variantB));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isReservedSlug detekuje rezervovaný slug v jakékoli velikosti písmen', () => {
    fc.assert(
      fc.property(reservedWithCasingArb, ([, variant]) => {
        expect(isReservedSlug(variant)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
