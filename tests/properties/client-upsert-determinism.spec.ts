import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  computeClientPatch,
  matchClient,
  normalizePhone,
  type ClientCandidate,
} from '@/server/ClientUpsertor';

/**
 * Feature: reservation-management, Property 4: Client upsert determinism.
 *
 * `Client_Upsertor` páruje kontakt z nově vytvořené rezervace proti `clients`
 * v rámci `business_id` deterministicky (R15.2–R15.4, R15.6):
 *
 *  - **Striktní pořadí telefon → e-mail → insert.** Je-li telefon vyplněn a
 *    nalezne klienta (po normalizaci), má přednost před e-mailovou shodou.
 *    Jinak se hledá podle e-mailu (case-insensitive). Není-li shoda ani jednou,
 *    výsledkem je `null` (→ INSERT nového klienta).
 *  - **Normalizace telefonu je invariantní vůči formátování.** Mezery, pomlčky,
 *    závorky a volitelný úvodní `+` se ignorují, takže různé varianty zápisu
 *    téhož čísla se napárují na téhož klienta.
 *  - **Aktualizace doplní chybějící kontakt BEZ přepsání vyplněného.**
 *    `computeClientPatch` aktualizuje `name`, doplní prázdný `phone`/`email`,
 *    ale nikdy nepřepíše už vyplněný kontakt.
 *
 * Generátor pokrývá varianty normalizace telefonu (oddělovače + úvodní `+`)
 * a casing e-mailu.
 *
 * Validates: Requirements 15.2, 15.3, 15.4, 15.6
 */

const NUM_RUNS = 100;

/** Číslice telefonu (9–12) jako kanonický klíč shody — po normalizaci. */
const digitsArb = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 9, maxLength: 12 })
  .map((digits) => digits.join(''));

/** Oddělovač, který `normalizePhone` zahazuje (mezery, pomlčky, závorky). */
const separatorArb = fc.constantFrom('', ' ', '-', '(', ')', '  ', ' -');

/**
 * Vyrobí náhodnou „lidskou" variantu zápisu daných číslic: oddělovače mezi
 * číslicemi + volitelný jediný úvodní `+`. Po `normalizePhone` se vždy vrátí
 * původní řetězec číslic — to je jádro invariance párování (R15.2).
 */
function phoneVariantArb(digits: string): fc.Arbitrary<string> {
  return fc
    .record({
      leadingPlus: fc.boolean(),
      seps: fc.array(separatorArb, { minLength: digits.length + 1, maxLength: digits.length + 1 }),
    })
    .map(({ leadingPlus, seps }) => {
      let out = leadingPlus ? '+' : '';
      for (let i = 0; i < digits.length; i += 1) {
        out += (seps[i] ?? '') + digits[i];
      }
      out += seps[digits.length] ?? '';
      return out;
    });
}

/** Náhodné zamíchání casingu e-mailu (a@B.cz vs A@b.CZ) — shoda je case-insensitive. */
function emailCasingArb(email: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: email.length, maxLength: email.length })
    .map((upper) =>
      email
        .split('')
        .map((ch, i) => (upper[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join(''),
    );
}

const lowerToken = (min: number, max: number) =>
  fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: min, maxLength: max })
    .map((c) => c.join(''));

const emailArb = fc
  .record({ local: lowerToken(3, 8), domain: lowerToken(3, 8) })
  .map(({ local, domain }) => `${local}@${domain}.cz`);

describe('Property 4: determinismus upsertu klienta', () => {
  it('normalizace telefonu je invariantní vůči oddělovačům a úvodnímu + (různé varianty se napárují)', () => {
    fc.assert(
      fc.property(
        digitsArb.chain((digits) =>
          fc.record({
            digits: fc.constant(digits),
            stored: phoneVariantArb(digits),
            incoming: phoneVariantArb(digits),
          }),
        ),
        ({ digits, stored, incoming }) => {
          // Obě varianty normalizují na tytéž číslice.
          expect(normalizePhone(stored)).toBe(digits);
          expect(normalizePhone(incoming)).toBe(digits);

          const candidates: ClientCandidate[] = [
            { id: 'c1', name: 'Jan', phone: stored, email: null },
          ];
          // Příchozí varianta téhož čísla najde uloženého klienta podle telefonu.
          expect(matchClient(candidates, incoming, '')?.id).toBe('c1');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('striktní pořadí: telefonní shoda má přednost před e-mailovou (R15.2)', () => {
    fc.assert(
      fc.property(
        phoneVariantGen(),
        emailArb,
        ({ phoneCandidateVariant, phoneIncomingVariant }, email) => {
          // Kandidát c-phone matchuje telefonem, c-email jiným e-mailem.
          const candidates: ClientCandidate[] = [
            { id: 'c-email', name: 'Petr', phone: null, email },
            { id: 'c-phone', name: 'Jan', phone: phoneCandidateVariant, email: 'jiny@example.cz' },
          ];
          // Telefon i e-mail by samostatně našly jiného klienta → telefon vyhrává.
          expect(matchClient(candidates, phoneIncomingVariant, email)?.id).toBe('c-phone');
          // Při prázdném telefonu padáme na e-mail.
          expect(matchClient(candidates, '', email)?.id).toBe('c-email');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('e-mailová shoda je case-insensitive a nastupuje, když telefon nesedí (R15.2)', () => {
    fc.assert(
      fc.property(
        emailArb.chain((email) =>
          fc.record({
            stored: emailCasingArb(email),
            incoming: emailCasingArb(email),
          }),
        ),
        ({ stored, incoming }) => {
          const candidates: ClientCandidate[] = [
            { id: 'c1', name: 'Petr', phone: '+420111222333', email: stored },
          ];
          // Telefon nesedí → padáme na e-mail bez ohledu na casing.
          expect(matchClient(candidates, '999000999', incoming)?.id).toBe('c1');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('žádná shoda (telefon ani e-mail) → null (insert nového klienta)', () => {
    fc.assert(
      fc.property(digitsArb, emailArb, (digits, email) => {
        const candidates: ClientCandidate[] = [
          { id: 'c1', name: 'Jan', phone: '+420777888999', email: 'jan@example.cz' },
        ];
        // Číslice i e-mail se liší od jediného kandidáta → bez shody.
        const incomingPhone = `1${digits}`; // jiné číslice
        const incomingEmail = `x${email}`; // jiný local part
        expect(matchClient(candidates, incomingPhone, incomingEmail)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('patch aktualizuje name a doplní chybějící kontakt, ale NIKDY nepřepíše vyplněný (R15.3)', () => {
    fc.assert(
      fc.property(
        fc.record({
          existingName: fc.option(lowerToken(1, 10), { nil: null }),
          existingPhone: fc.option(digitsArb, { nil: null }),
          existingEmail: fc.option(emailArb, { nil: null }),
          incomingName: lowerToken(0, 10),
          incomingPhone: fc.oneof(fc.constant(''), digitsArb),
          incomingEmail: fc.oneof(fc.constant(''), emailArb),
        }),
        ({ existingName, existingPhone, existingEmail, incomingName, incomingPhone, incomingEmail }) => {
          const existing: ClientCandidate = {
            id: 'c1',
            name: existingName,
            phone: existingPhone,
            email: existingEmail,
          };
          const patch = computeClientPatch(existing, incomingName, incomingPhone, incomingEmail);

          // (a) Vyplněný kontakt se NIKDY nepřepisuje.
          if (existing.phone) {
            expect(patch.phone).toBeUndefined();
          }
          if (existing.email) {
            expect(patch.email).toBeUndefined();
          }

          // (b) Chybějící kontakt se doplní právě tehdy, když rezervace nese hodnotu.
          if (!existing.phone && incomingPhone) {
            expect(patch.phone).toBe(incomingPhone);
          } else {
            expect(patch.phone).toBeUndefined();
          }
          if (!existing.email && incomingEmail) {
            expect(patch.email).toBe(incomingEmail);
          } else {
            expect(patch.email).toBeUndefined();
          }

          // (c) name se aktualizuje jen na neprázdnou a odlišnou hodnotu.
          if (incomingName && existing.name !== incomingName) {
            expect(patch.name).toBe(incomingName);
          } else {
            expect(patch.name).toBeUndefined();
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

/** Pomocný generátor pro test pořadí: digits + dvě varianty téhož telefonu. */
function phoneVariantGen(): fc.Arbitrary<{
  digits: string;
  phoneCandidateVariant: string;
  phoneIncomingVariant: string;
}> {
  return digitsArb.chain((digits) =>
    fc.record({
      digits: fc.constant(digits),
      phoneCandidateVariant: phoneVariantArb(digits),
      phoneIncomingVariant: phoneVariantArb(digits),
    }),
  );
}
