import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { RESERVATION_MESSAGES, reservationContactSchema } from '@/lib/reservation/schema';

/**
 * Feature: public-business-page, Property 5: Server-side validation totality.
 *
 * Nad `reservationContactSchema` (jediný zdroj pravdy serverové validace, R7.7):
 * pro libovolnou kombinaci validních i nevalidních kontaktních polí schéma
 * přijme PRÁVĚ ty vstupy, které splňují pravidla R7.2–R7.6, a odmítne ostatní.
 * Totalita = pro každý vstup vrátí `success` XOR množinu konkrétních chyb
 * odpovídajících porušeným pravidlům (žádná falešná chyba pro splněné pravidlo).
 *
 * Generátory jsou „labelované" — každá hodnota nese očekávanou chybu (nebo
 * `null`, je-li validní), takže reference je nezávislá na implementaci regexů.
 *
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

const NUM_RUNS = 200;

/** Hodnota pole + očekávaná chybová hláška (`null` = pole je validní). */
type Field = { value: unknown; message: string | null };

function valid(value: unknown): Field {
  return { value, message: null };
}

function invalid(value: unknown, message: string): Field {
  return { value, message };
}

/** `fc.oneof` s 2× vyšší vahou validních variant (valid uveden dvakrát). */
function mix(validArb: fc.Arbitrary<Field>, invalidArb: fc.Arbitrary<Field>): fc.Arbitrary<Field> {
  return fc.oneof(validArb, validArb, invalidArb);
}

// --- Jméno (R7.2, R7.3) ---------------------------------------------------
const validName = fc.oneof(
  fc.integer({ min: 1, max: 100 }).map((n) => valid('A'.repeat(n))),
  fc.integer({ min: 1, max: 96 }).map((n) => valid(`  ${'A'.repeat(n)}  `)), // trim ≤ 100
  fc.constant(valid('Jan Novák')),
);
const invalidName = fc.oneof(
  fc.constantFrom('', ' ', '   ', '\t', '\n  ').map((s) => invalid(s, RESERVATION_MESSAGES.nameRequired)),
  fc.integer({ min: 101, max: 160 }).map((n) => invalid('A'.repeat(n), RESERVATION_MESSAGES.nameMaxLength)),
);

// --- Telefon (R7.4) -------------------------------------------------------
const digits = (min: number, max: number): fc.Arbitrary<string> =>
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: min, maxLength: max }).map((d) => d.join(''));

const validPhone = fc.oneof(
  digits(9, 15).map((d) => valid(d)),
  digits(9, 15).map((d) => valid(`+${d}`)),
  digits(9, 12).map((d) => valid(`+420 ${d.slice(0, 3)} ${d.slice(3)}`)),
  digits(9, 12).map((d) => valid(`(${d.slice(0, 3)}) ${d.slice(3)}`)),
);
const invalidPhone = fc.oneof(
  digits(9, 13).map((d) => invalid(`${d}x`, RESERVATION_MESSAGES.phoneInvalid)), // písmeno
  digits(1, 8).map((d) => invalid(d, RESERVATION_MESSAGES.phoneInvalid)), // málo číslic
  digits(16, 22).map((d) => invalid(d, RESERVATION_MESSAGES.phoneInvalid)), // moc číslic
  fc.constantFrom('', '   ').map((s) => invalid(s, RESERVATION_MESSAGES.phoneInvalid)),
);

// --- E-mail (R7.5) --------------------------------------------------------
const alnum = (min: number, max: number): fc.Arbitrary<string> =>
  fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0704344177'.split('')), {
      minLength: min,
      maxLength: max,
    })
    .map((c) => c.join(''));

const validEmail = fc
  .record({ local: alnum(1, 12), domain: alnum(1, 12), tld: alnum(2, 4) })
  .map(({ local, domain, tld }) => valid(`${local}@${domain}.${tld}`));
const invalidEmail = fc.oneof(
  alnum(3, 12).map((s) => invalid(s, RESERVATION_MESSAGES.emailInvalid)), // bez @
  fc.record({ local: alnum(1, 8), domain: alnum(1, 8) }).map(({ local, domain }) =>
    invalid(`${local}@${domain}`, RESERVATION_MESSAGES.emailInvalid),
  ), // bez tečky v doméně
  fc
    .record({ local: alnum(1, 8), domain: alnum(1, 8), tld: alnum(2, 3) })
    .map(({ local, domain, tld }) => invalid(`${local} @${domain}.${tld}`, RESERVATION_MESSAGES.emailInvalid)), // whitespace
);

// --- Poznámka (R7.6) ------------------------------------------------------
const validNote = fc.oneof(
  fc.constant<Field>(valid(undefined)),
  fc.integer({ min: 0, max: 500 }).map((n) => valid('n'.repeat(n))),
  fc.constantFrom('   ', ' \t ').map((s) => valid(s)),
);
const invalidNote = fc
  .integer({ min: 501, max: 560 })
  .map((n) => invalid('n'.repeat(n), RESERVATION_MESSAGES.noteMaxLength));

const nameArb = mix(validName, invalidName);
const phoneArb = mix(validPhone, invalidPhone);
const emailArb = mix(validEmail, invalidEmail);
const noteArb = mix(validNote, invalidNote);

describe('Property 5: totalita serverové validace kontaktu', () => {
  it('schéma přijme přesně validní vstupy a odmítne ostatní s konkrétní chybou', () => {
    fc.assert(
      fc.property(nameArb, phoneArb, emailArb, noteArb, (name, phone, email, note) => {
        const result = reservationContactSchema.safeParse({
          clientName: name.value,
          clientPhone: phone.value,
          clientEmail: email.value,
          note: note.value,
        });

        const violated = [name, phone, email, note]
          .map((field) => field.message)
          .filter((message): message is string => message !== null);
        const expectedSuccess = violated.length === 0;

        // Totalita: úspěch právě tehdy, když žádné pole neporušuje pravidla.
        expect(result.success).toBe(expectedSuccess);

        if (!result.success) {
          // Vrácené chyby odpovídají PRÁVĚ porušeným pravidlům — žádná navíc, žádná nechybí.
          const actual = [...new Set(result.error.issues.map((issue) => issue.message))].sort();
          const expected = [...new Set(violated)].sort();
          expect(actual).toEqual(expected);
          return;
        }

        // Validní vstup → normalizovaný (trimovaný) výstup.
        const nameValue = name.value as string;
        const phoneValue = phone.value as string;
        const emailValue = email.value as string;
        const noteTrim = (typeof note.value === 'string' ? note.value : '').trim();

        expect(result.data.clientName).toBe(nameValue.trim());
        expect(result.data.clientPhone).toBe(phoneValue.trim());
        expect(result.data.clientEmail).toBe(emailValue.trim());
        expect(result.data.note).toBe(noteTrim.length > 0 ? noteTrim : null);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
