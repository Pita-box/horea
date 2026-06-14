import { describe, expect, it } from 'vitest';

import { normalizeSlug } from '../normalize';

describe('normalizeSlug', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['ab', 'length'],
    ['a'.repeat(51), 'length'],
    ['foo_bar', 'charset'],
    ['foo/bar', 'charset'],
    ['---', 'hyphens'],
    ['--foo', 'hyphens'],
    ['foo--bar', 'hyphens'],
    ['-foo', 'hyphens'],
    ['foo-', 'hyphens'],
  ] as const)('rejects %s with %s', (input, reason) => {
    expect(normalizeSlug(input)).toEqual({ kind: 'invalid_format', reason });
  });

  it('normalizes Czech diacritics, casing and whitespace', () => {
    expect(normalizeSlug(' Salón Růženka ')).toEqual({ kind: 'ok', value: 'salon-ruzenka' });
  });

  it('detects reserved slugs after normalization', () => {
    expect(normalizeSlug('Ádmīn')).toEqual({ kind: 'reserved' });
    expect(normalizeSlug('FORGOT password')).toEqual({ kind: 'reserved' });
  });
});
