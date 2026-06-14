import { describe, expect, it } from 'vitest';

import { serviceSchema, SERVICE_MESSAGES } from '../schema';

const validService = {
  name: 'Střih',
  durationMinutes: 30,
  priceCzk: 450,
  description: 'Krátký popis',
};

function firstError(input: Record<string, unknown>): string {
  const result = serviceSchema.safeParse({ ...validService, ...input });

  if (result.success) {
    throw new Error('Expected validation error');
  }

  return result.error.issues[0].message;
}

describe('serviceSchema', () => {
  it('normalizes valid service input', () => {
    expect(
      serviceSchema.parse({
        name: '  Střih  ',
        durationMinutes: '45',
        priceCzk: '499,90',
        description: '  Popis služby  ',
      }),
    ).toEqual({
      name: 'Střih',
      durationMinutes: 45,
      priceCzk: 499.9,
      description: 'Popis služby',
    });
  });

  it('stores empty description as null', () => {
    expect(serviceSchema.parse({ ...validService, description: '   ' }).description).toBeNull();
    expect(serviceSchema.parse({ ...validService, description: undefined }).description).toBeNull();
  });

  it('requires a non-empty name', () => {
    expect(firstError({ name: '   ' })).toBe(SERVICE_MESSAGES.nameRequired);
  });

  it('limits name length', () => {
    expect(firstError({ name: 'a'.repeat(101) })).toBe(SERVICE_MESSAGES.nameMaxLength);
  });

  it('requires duration to be a positive integer', () => {
    expect(firstError({ durationMinutes: 0 })).toBe(SERVICE_MESSAGES.durationPositiveInteger);
    expect(firstError({ durationMinutes: -5 })).toBe(SERVICE_MESSAGES.durationPositiveInteger);
    expect(firstError({ durationMinutes: 7.5 })).toBe(SERVICE_MESSAGES.durationPositiveInteger);
    expect(firstError({ durationMinutes: 'abc' })).toBe(SERVICE_MESSAGES.durationPositiveInteger);
  });

  it('requires duration within 5 to 480 minutes', () => {
    expect(firstError({ durationMinutes: 1 })).toBe(SERVICE_MESSAGES.durationRange);
    expect(firstError({ durationMinutes: 485 })).toBe(SERVICE_MESSAGES.durationRange);
  });

  it('requires duration to be a multiple of five', () => {
    expect(firstError({ durationMinutes: 7 })).toBe(SERVICE_MESSAGES.durationMultipleOfFive);
  });

  it('requires price to be numeric and non-negative', () => {
    expect(firstError({ priceCzk: 'abc' })).toBe(SERVICE_MESSAGES.priceNumber);
    expect(firstError({ priceCzk: -1 })).toBe(SERVICE_MESSAGES.priceNonNegative);
  });

  it('treats empty/blank price as optional (0)', () => {
    expect(serviceSchema.parse({ ...validService, priceCzk: '' }).priceCzk).toBe(0);
    expect(serviceSchema.parse({ ...validService, priceCzk: '   ' }).priceCzk).toBe(0);
    expect(serviceSchema.parse({ ...validService, priceCzk: undefined }).priceCzk).toBe(0);
  });

  it('limits price to 100000 CZK', () => {
    expect(firstError({ priceCzk: 100_000.01 })).toBe(SERVICE_MESSAGES.priceMax);
  });

  it('limits description length', () => {
    expect(firstError({ description: 'a'.repeat(501) })).toBe(
      SERVICE_MESSAGES.descriptionMaxLength,
    );
  });
});
