import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { normalizeSlug, type SlugResult } from '../normalize';
import { RESERVED_SLUGS } from '../reserved';

const RESULT_KINDS: SlugResult['kind'][] = ['ok', 'invalid_format', 'reserved'];

function randomizeCase(value: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: value.length, maxLength: value.length })
    .map((upperFlags) =>
      value
        .split('')
        .map((char, index) => (upperFlags[index] ? char.toUpperCase() : char.toLowerCase()))
        .join(''),
    );
}

describe('normalizeSlug properties', () => {
  it('is total for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeSlug(input);

        expect(RESULT_KINDS).toContain(result.kind);
        if (result.kind === 'invalid_format') {
          expect(['charset', 'length', 'hyphens', 'empty']).toContain(result.reason);
        }
      }),
    );
  });

  it('is idempotent for valid slugs', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = normalizeSlug(input);

        if (first.kind !== 'ok') {
          return;
        }

        expect(normalizeSlug(first.value)).toEqual(first);
      }),
    );
  });

  it('detects reserved slugs regardless of letter case', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RESERVED_SLUGS), (reservedSlug) => {
        fc.assert(
          fc.property(randomizeCase(reservedSlug), (input) => {
            expect(normalizeSlug(input)).toEqual({ kind: 'reserved' });
          }),
        );
      }),
    );
  });

  it('detects reserved slugs after diacritic stripping', () => {
    expect(normalizeSlug('Ádmīn')).toEqual({ kind: 'reserved' });
  });
});
