// Feature: telegram-operator-notifications, Property 10: Formátování CZK
//
// Property 10 ověřuje, že `formatCzk` formátuje nezáporné celočíselné částky
// v cs-CZ podobě (oddělovač tisíců, bez desetinných míst) se sufixem „ Kč".
// Po odstranění sufixu a všech oddělovačů tisíců musí číselný obsah odpovídat
// vstupní částce.
//
// Validates: Requirements 14.1, 14.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatCzk } from '../messages';

describe('Property 10: Formátování CZK', () => {
  it('výstup obsahuje „Kč" a číselný obsah odpovídá vstupní částce', () => {
    fc.assert(
      fc.property(fc.nat(), (amountCzk) => {
        const formatted = formatCzk(amountCzk);

        // Výstup musí obsahovat měnový sufix.
        expect(formatted).toContain('Kč');

        // Odstraň sufix „Kč" a ponech jen číslice — tím se zbavíme všech
        // oddělovačů tisíců (běžná mezera, nezlomitelná mezera U+00A0
        // i úzká nezlomitelná mezera U+202F, kterou cs-CZ Intl může použít).
        const digitsOnly = formatted.replace('Kč', '').replace(/\D/g, '');

        expect(Number(digitsOnly)).toBe(amountCzk);
      }),
      { numRuns: 100 },
    );
  });
});
