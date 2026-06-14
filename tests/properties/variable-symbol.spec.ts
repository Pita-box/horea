import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  generateVariableSymbol,
  MAX_VARIABLE_SYMBOL_VALUE,
} from '@/lib/payments/variable-symbol';

/**
 * Feature: subscription-payments, Property 3: Formát a unikátnost variabilního
 * symbolu.
 *
 * `generateVariableSymbol(sequence)` odvozuje VS z monotónní sekvence dekadickým
 * zápisem. Pro LIBOVOLNOU posloupnost sekvenčních hodnot (0 .. 9 999 999 999)
 * platí, že každý VS je tvořen pouze číslicemi o délce 1–10 znaků a že různé
 * sekvenční hodnoty dávají vždy různé VS (injektivita ⇒ unikátnost je zaručená,
 * ne pravděpodobnostní). Generátor cíleně pokrývá hranice délky: 1 číslice
 * (sekvence 0–9) i 10 číslic (1 000 000 000 – 9 999 999 999), plus validaci
 * rozsahu (mimo rozsah / nezáporné celé ⇒ chyba).
 *
 * Validates: Requirements 5.1, 5.2
 */

const NUM_RUNS = 200;

/**
 * Generátor sekvenční hodnoty cílený na hranice délky 1–10 číslic: vybere počet
 * číslic `d`, sestaví číslo z číslic (první 1–9 pro `d > 1`, jinak 0–9) a vrátí
 * jak číselnou hodnotu, tak očekávaný dekadický zápis bez vodicích nul.
 */
const sequenceWithExpectedArb: fc.Arbitrary<{ value: number; expected: string }> = fc
  .integer({ min: 1, max: 10 })
  .chain((digits) => {
    if (digits === 1) {
      return fc.integer({ min: 0, max: 9 }).map((d) => ({ value: d, expected: String(d) }));
    }
    const firstDigit = fc.integer({ min: 1, max: 9 });
    const restDigits = fc.array(fc.integer({ min: 0, max: 9 }), {
      minLength: digits - 1,
      maxLength: digits - 1,
    });
    return fc.tuple(firstDigit, restDigits).map(([first, rest]) => {
      const text = String(first) + rest.join('');
      return { value: Number(text), expected: text };
    });
  });

describe('Property 3: formát a unikátnost variabilního symbolu', () => {
  it('VS je 1–10 číslic bez vodicích nul (vč. hranic délky 1 a 10)', () => {
    fc.assert(
      fc.property(sequenceWithExpectedArb, ({ value, expected }) => {
        const vs = generateVariableSymbol(value);
        expect(vs).toMatch(/^\d{1,10}$/);
        expect(vs).toBe(expected);
        expect(vs.length).toBeGreaterThanOrEqual(1);
        expect(vs.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('injektivita — různé sekvence dávají různé VS', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: MAX_VARIABLE_SYMBOL_VALUE }), {
          minLength: 2,
          maxLength: 50,
        }),
        (sequences) => {
          const symbols = sequences.map(generateVariableSymbol);
          // Žádné dva platební pokusy nesdílejí stejný VS.
          expect(new Set(symbols).size).toBe(symbols.length);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('validace rozsahu — mimo rozsah / nezáporné celé číslo vyhodí chybu', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: MAX_VARIABLE_SYMBOL_VALUE + 1, max: Number.MAX_SAFE_INTEGER }),
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: -1 }),
          fc.double({ min: 0, max: 1, noNaN: true }).filter((n) => !Number.isInteger(n)),
        ),
        (invalid) => {
          expect(() => generateVariableSymbol(invalid)).toThrow();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
