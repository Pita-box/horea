import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { decodeSpayd, encodeSpayd, type SpaydPayment } from '@/lib/payments/spayd';

/**
 * Feature: subscription-payments, Property 4: SPAYD round-trip.
 *
 * Pro LIBOVOLNOU validní kombinaci IBAN, částky v CZK (≤ 2 desetinná místa) a
 * variabilního symbolu platí, že `decodeSpayd(encodeSpayd(x))` vrátí přesně
 * stejný IBAN, částku, měnu (vždy `CZK`) a VS. Generátor cíleně vkládá do IBAN
 * i znaky `*` (oddělovač polí SPAYD) a `%` (escape prefix), aby ověřil, že
 * escapování/odescapování je round-trip bezpečné a nerozbije parsování polí.
 *
 * Validates: Requirements 4.4, 4.7
 */

const NUM_RUNS = 200;

/**
 * Znaky pro hodnotu IBAN se silným zastoupením „nebezpečných" znaků SPAYD
 * (`*`, `%`) i běžných (písmena, číslice, `:` které escapování neřeší).
 */
const ibanCharArb = fc.constantFrom(
  ...'CZ0704344177ABCDEFGH'.split(''),
  '*',
  '%',
  ':',
);

const ibanArb = fc
  .array(ibanCharArb, { minLength: 1, maxLength: 34 })
  .map((chars) => chars.join(''));

/**
 * Částka v CZK s nejvýše 2 desetinnými místy — generovaná z celých haléřů,
 * takže `toFixed(2)`/`parseFloat` round-trip je přesný (žádná ztráta na float).
 */
const amountCzkArb = fc
  .integer({ min: 0, max: 99_999_999 })
  .map((cents) => cents / 100);

/** Variabilní symbol — dekadický řetězec délky 1–10 číslic. */
const variableSymbolArb = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 10 })
  .map((digits) => digits.join(''));

const paymentArb: fc.Arbitrary<SpaydPayment> = fc.record({
  iban: ibanArb,
  amountCzk: amountCzkArb,
  variableSymbol: variableSymbolArb,
});

describe('Property 4: SPAYD round-trip', () => {
  it('decode(encode(x)) zachová IBAN, částku, měnu i VS (vč. znaků * a %)', () => {
    fc.assert(
      fc.property(paymentArb, (payment) => {
        const encoded = encodeSpayd(payment);
        const decoded = decodeSpayd(encoded);

        expect(decoded.iban).toBe(payment.iban);
        expect(decoded.amountCzk).toBe(payment.amountCzk);
        expect(decoded.variableSymbol).toBe(payment.variableSymbol);

        // Měna je v SPAYD vždy CZK (pole CC) — round-trip ji zachovává.
        expect(encoded).toContain('*CC:CZK*');
        // Hlavička SPAYD 1.0 je vždy přítomna.
        expect(encoded.startsWith('SPD*1.0*')).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
