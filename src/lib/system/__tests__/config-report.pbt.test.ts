// Feature: admin-system-tools, Property 4: Config report nikdy neobsahuje hodnoty a věrně reflektuje přítomnost
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildConfigReport, EXPECTED_ENV_KEYS } from '../config-report';

/**
 * Property 4: Config report nikdy neobsahuje hodnoty a věrně reflektuje přítomnost.
 *
 * Pro libovolnou mapu proměnných prostředí (i s tajnými hodnotami) a deklarovaný
 * seznam očekávaných klíčů platí:
 *  - výstup `buildConfigReport` neobsahuje žádnou hodnotu proměnné (ověřeno proti
 *    serializaci celého reportu),
 *  - pro každý očekávaný klíč existuje právě jeden záznam `{ key, isSet }`,
 *  - `isSet` je pravdivé právě tehdy, když je proměnná v mapě nastavená (truthy),
 *  - `logLevel` odpovídá `LOG_LEVEL` z mapy, případně výchozí hodnotě `info`.
 *
 * Validates: Requirements 6.2, 6.3, 7.1, 7.2, 7.4
 */

// Rozpoznatelná tajná hodnota — prefix 'secretvalue_' zaručí neprázdnost (truthy)
// a snadné dohledání ve výstupu. Prefix je záměrně malými písmeny, protože všechny
// EXPECTED_ENV_KEYS jsou VELKÝMI písmeny — tím se vyloučí falešná kolize, kdy by
// hodnota byla podřetězcem názvu klíče (např. 'SECRET_A' ⊂ 'R2_SECRET_ACCESS_KEY').
// Suffix je alfanumerický, aby nevznikalo JSON escapování.
const secretValue: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 24, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')) })
  .map((s) => `secretvalue_${s}`);

// Varianty hodnoty jedné proměnné: chybí / přítomná ale prázdná (falsy) / tajná (truthy).
const envValue: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  secretValue,
);

// Generátor mapy env: každý očekávaný klíč dostane některou z variant hodnoty,
// plus volitelně LOG_LEVEL a několik nadbytečných (neočekávaných) tajných klíčů,
// které report ignoruje.
const envMap: fc.Arbitrary<Record<string, string | undefined>> = fc
  .record({
    expected: fc.record(
      Object.fromEntries(EXPECTED_ENV_KEYS.map((key) => [key, envValue])),
    ),
    logLevel: fc.option(fc.constantFrom('trace', 'debug', 'info', 'warn', 'error'), {
      nil: undefined,
    }),
    extras: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 12 }).map((s) => `EXTRA_${s}`),
      secretValue,
      { maxKeys: 4 },
    ),
  })
  .map(({ expected, logLevel, extras }) => {
    const env: Record<string, string | undefined> = { ...extras, ...expected };
    if (logLevel !== undefined) env.LOG_LEVEL = logLevel;
    return env;
  });

describe('config-report — Property 4', () => {
  it('report nenese hodnoty proměnných a věrně reflektuje přítomnost', () => {
    fc.assert(
      fc.property(envMap, (env) => {
        const report = buildConfigReport(env, EXPECTED_ENV_KEYS);

        // 1) Pro každý očekávaný klíč právě jeden záznam, ve stejném pořadí.
        expect(report.env).toHaveLength(EXPECTED_ENV_KEYS.length);
        expect(report.env.map((e) => e.key)).toEqual([...EXPECTED_ENV_KEYS]);

        // 2) isSet koresponduje s truthy přítomností v mapě.
        for (const { key, isSet } of report.env) {
          expect(isSet).toBe(Boolean(env[key]));
        }

        // 3) logLevel odvozen z LOG_LEVEL (default 'info').
        expect(report.logLevel).toBe(env.LOG_LEVEL || 'info');

        // 4) Žádná tajná hodnota se nesmí objevit v serializaci reportu.
        const serialized = JSON.stringify(report);
        const secretValues = Object.values(env).filter(
          (v): v is string => typeof v === 'string' && v.startsWith('secretvalue_'),
        );
        for (const secret of secretValues) {
          expect(serialized.includes(secret)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
