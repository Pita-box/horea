import { describe, expect, it } from 'vitest';

import { isReservedSlug, normalizeRouteSlug } from '../route';

describe('normalizeRouteSlug', () => {
  it('převede slug na malá písmena', () => {
    expect(normalizeRouteSlug('Kavarna')).toBe('kavarna');
    expect(normalizeRouteSlug('KAVARNA')).toBe('kavarna');
  });

  it('ořízne okolní whitespace', () => {
    expect(normalizeRouteSlug('  kavarna  ')).toBe('kavarna');
    expect(normalizeRouteSlug('\tKavarna\n')).toBe('kavarna');
  });

  it('nestrhává diakritiku ani nemění pomlčky (DB slug je už ASCII)', () => {
    // Na rozdíl od normalizeSlug zůstává vstup jinak nedotčený.
    expect(normalizeRouteSlug('salon-ruzenka')).toBe('salon-ruzenka');
  });
});

describe('isReservedSlug', () => {
  it('detekuje rezervované slugy nezávisle na velikosti písmen', () => {
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('ADMIN')).toBe(true);
    expect(isReservedSlug('  Dashboard  ')).toBe(true);
  });

  it('nerezervovaný slug vrací false', () => {
    expect(isReservedSlug('kavarna')).toBe(false);
    expect(isReservedSlug('salon-ruzenka')).toBe(false);
  });
});
