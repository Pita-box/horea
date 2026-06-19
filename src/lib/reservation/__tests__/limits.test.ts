import { describe, expect, it } from 'vitest';

import {
  MAX_SERVICES_PER_RESERVATION,
  MIN_SERVICES_PER_RESERVATION,
  validateServiceCount,
} from '../limits';

describe('validateServiceCount', () => {
  it('odmítne prázdný výběr českou hláškou (R5.2, R1.5)', () => {
    const result = validateServiceCount(0);
    expect(result).toEqual({
      ok: false,
      reason: 'too_few',
      message: 'Vyberte alespoň jednu službu',
    });
  });

  it('odmítne příliš velký výběr českou hláškou (R5.3, R1.6)', () => {
    const result = validateServiceCount(MAX_SERVICES_PER_RESERVATION + 1);
    expect(result).toEqual({
      ok: false,
      reason: 'too_many',
      message: 'Najednou lze vybrat nejvýše 10 služeb',
    });
  });

  it('přijme hraniční minimum (n = 1)', () => {
    expect(validateServiceCount(MIN_SERVICES_PER_RESERVATION)).toEqual({ ok: true });
  });

  it('přijme hraniční maximum (n = 10)', () => {
    expect(validateServiceCount(MAX_SERVICES_PER_RESERVATION)).toEqual({ ok: true });
  });

  it('přijme počet uvnitř rozsahu', () => {
    expect(validateServiceCount(5)).toEqual({ ok: true });
  });
});
