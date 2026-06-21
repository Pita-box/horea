import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { isAuthorizedSecret } from '../webhook';

const NUM_RUNS = 100;

// Neprázdný secret (alespoň jeden znak). Pokrývá náhodné stringy včetně whitespace.
const nonEmptySecret: fc.Arbitrary<string> = fc.string({ minLength: 1 });

describe('isAuthorizedSecret properties', () => {
  // Feature: telegram-operator-notifications, Property 7: Autorizace webhook secretu
  // Validates: Requirements 7.1, 7.2, 7.3
  it('Feature: telegram-operator-notifications, Property 7: Autorizace webhook secretu', () => {
    fc.assert(
      fc.property(
        nonEmptySecret,
        fc.string(),
        fc.boolean(),
        (configured, randomHeader, useMatching) => {
          // (a) Shoda neprázdného secretu a hlavičky → true.
          expect(isAuthorizedSecret(configured, configured)).toBe(true);

          // (b) Neshoda → false. Pokud náhodný string náhodou odpovídá secretu,
          // odvodíme očekávaný výsledek z rovnosti řetězců (zůstává to property).
          const headerValue = useMatching ? configured : randomHeader;
          expect(isAuthorizedSecret(headerValue, configured)).toBe(headerValue === configured);

          // (c) Nenastavený secret (configured === null) → vždy false, ať je hlavička jakákoli.
          expect(isAuthorizedSecret(randomHeader, null)).toBe(false);
          expect(isAuthorizedSecret(configured, null)).toBe(false);
          expect(isAuthorizedSecret(null, null)).toBe(false);

          // (d) Chybějící hlavička (headerValue === null) → false.
          expect(isAuthorizedSecret(null, configured)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
