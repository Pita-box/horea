// Feature: telegram-operator-notifications, Property 9: Rozpoznání příkazů a odmítnutí neznámého textu
//
// Property 9 ověřuje čistou funkci `parseCommand(text)` z `src/lib/telegram/commands.ts`:
// - pozitivní větev: každý známý příkaz (`/trzby`, `/odhad`, `/stav`, `/start`, `/help`) je
//   rozpoznán bez ohledu na velikost písmen, okolní whitespace a volitelný `@botname` suffix,
// - negativní větev: jakýkoli text, který po normalizaci neodpovídá známému příkazu, → `unknown`.
//
// Validates: Requirements 12.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseCommand, type Command } from '../commands';

/** Známé příkazy — jediný zdroj pravdy pro generátory i oracle v tomto testu. */
const KNOWN_COMMANDS: readonly Command[] = ['trzby', 'odhad', 'stav', 'start', 'help'];

/**
 * Nezávislý oracle (zrcadlí akceptační kritérium R12.1/R12.2): rozhodne, zda by text
 * po normalizaci odpovídal známému příkazu. Slouží jen k vyloučení náhodné shody
 * v negativní větvi, aby se generovaly opravdu „neznámé" vstupy.
 */
function looksLikeKnownCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized.startsWith('/')) {
    return false;
  }
  const token = normalized.slice(1).split('@', 1)[0];
  return (KNOWN_COMMANDS as readonly string[]).includes(token);
}

/** Náhodně promíchá velikost písmen jednotlivých znaků (tolerance velikosti písmen). */
function mixedCaseArb(word: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((flags) =>
      word
        .split('')
        .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join(''),
    );
}

/** Generátor okolního whitespace (mezery, taby, nové řádky), může být prázdný. */
const whitespaceArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 4 })
  .map((chars) => chars.join(''));

describe('parseCommand — Property 9', () => {
  it('rozpozná každý známý příkaz napříč variacemi velikosti písmen, whitespace a @botname suffixu', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_COMMANDS),
        whitespaceArb,
        whitespaceArb,
        // volitelný @botname suffix (alfanumerický), nebo žádný
        fc.option(fc.stringMatching(/^[a-zA-Z0-9_]{1,16}$/), { nil: undefined }),
        fc.boolean(),
        (command, leading, trailing, botName, mixCase) => {
          // Sestavíme variantu vstupu: <ws>/<příkaz>[@botname]<ws>
          const casedCommand = mixCase ? command.toUpperCase() : command;
          const suffix = botName !== undefined ? `@${botName}` : '';
          const input = `${leading}/${casedCommand}${suffix}${trailing}`;

          const result = parseCommand(input);
          expect(result).toEqual({ kind: 'command', command });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rozpozná náhodně promíchanou velikost písmen jako tentýž příkaz', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_COMMANDS).chain((command) =>
          mixedCaseArb(command).map((cased) => ({ command, cased })),
        ),
        ({ command, cased }) => {
          const result = parseCommand(`/${cased}`);
          expect(result).toEqual({ kind: 'command', command });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('odmítne libovolný text, který neodpovídá známému příkazu, jako unknown', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          // častější varianty blízké příkazům, ať generátor pokrývá hraniční případy
          fc.string().map((s) => `/${s}`),
          fc.constant(''),
        ),
        (text) => {
          // Vyloučíme náhodnou shodu se známým příkazem (jinak by „unknown" neplatilo).
          fc.pre(!looksLikeKnownCommand(text));
          const result = parseCommand(text);
          expect(result).toEqual({ kind: 'unknown' });
        },
      ),
      { numRuns: 100 },
    );
  });
});
