import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { encodeCsvField } from '@/server/CsvExporter';

/**
 * Feature: reservation-management, Property 6: CSV escaping round-trip.
 *
 * Pro LIBOVOLNÝ řetězec platí `parseCsvField(encodeCsvField(value)) === value`.
 * `encodeCsvField` (RFC 4180, R17.2) obalí hodnotu s čárkou, uvozovkou nebo
 * novým řádkem (`\n`/`\r`) do dvojitých uvozovek a vnitřní uvozovky zdvojí.
 * Malý field parser níže provádí inverzní operaci — round-trip tedy musí
 * vrátit původní hodnotu i pro hraniční kombinace čárek, uvozovek, `\n`, `\r\n`.
 *
 * Validates: Requirements 17.2
 */

const NUM_RUNS = 100;

/**
 * Minimální RFC 4180 parser JEDNOHO pole (inverze `encodeCsvField`):
 *  - Nezačíná-li uvozovkou, je to neescapované pole → vrátí se beze změny.
 *  - Začíná-li uvozovkou, čte se obsah mezi vnějšími uvozovkami; sekvence `""`
 *    se dekóduje na jednu `"`, samostatná `"` ukončuje pole.
 */
function parseCsvField(encoded: string): string {
  if (encoded.length === 0 || encoded[0] !== '"') {
    return encoded;
  }

  let result = '';
  let i = 1; // přeskoč úvodní uvozovku
  while (i < encoded.length) {
    const ch = encoded[i];
    if (ch === '"') {
      if (encoded[i + 1] === '"') {
        result += '"';
        i += 2;
      } else {
        i += 1; // uzavírací uvozovka
        break;
      }
    } else {
      result += ch;
      i += 1;
    }
  }
  return result;
}

/**
 * Generátor řetězců se silným zastoupením „nebezpečných" znaků RFC 4180
 * (čárka, uvozovka, `\n`, `\r`) i běžných znaků, aby se otestovaly kombinace
 * jako `\r\n`, vnořené uvozovky a smíšený obsah.
 */
const csvCharArb = fc.constantFrom(
  'a',
  'b',
  '1',
  ' ',
  ',',
  '"',
  '\n',
  '\r',
  '\t',
  'é',
  ';',
);

const dangerousStringArb = fc
  .array(csvCharArb, { maxLength: 40 })
  .map((chars) => chars.join(''));

/** Mix cílených „nebezpečných" řetězců a obecných (libovolných) řetězců. */
const valueArb = fc.oneof(dangerousStringArb, fc.string());

describe('Property 6: round-trip CSV escapingu', () => {
  it('parseCsvField(encodeCsvField(value)) === value pro libovolný řetězec', () => {
    fc.assert(
      fc.property(valueArb, (value) => {
        expect(parseCsvField(encodeCsvField(value))).toBe(value);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('explicitní hraniční případy (čárka, uvozovka, \\n, \\r\\n, kombinace)', () => {
    const cases = [
      '',
      'plain',
      'a,b',
      'a"b',
      '"quoted"',
      'line1\nline2',
      'line1\r\nline2',
      'a,"b"\r\nc',
      '""',
      ',',
      '\r\n',
      'mix, "uvozovky" a\nnový řádek',
    ];
    for (const value of cases) {
      expect(parseCsvField(encodeCsvField(value))).toBe(value);
    }
  });
});
