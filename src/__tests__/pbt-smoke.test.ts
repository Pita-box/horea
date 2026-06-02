import { describe, it } from 'vitest';
import fc from 'fast-check';

describe('pbt-smoke', () => {
  it('ověří, že fast-check funguje', () => {
    fc.assert(fc.property(fc.integer(), (n) => n + 0 === n));
  });
});
