// Feature: admin-system-tools, Property 9: Stav záloh — nakonfigurováno právě tehdy, když jsou všechny GOOGLE_* klíče přítomné
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildBackupStatus, GOOGLE_BACKUP_ENV_KEYS } from '../backup-status';
import type { ServiceStatus } from '../status';

/**
 * Property 9: Stav záloh — nakonfigurováno právě tehdy, když jsou všechny GOOGLE_* klíče přítomné.
 *
 * Pro libovolnou mapu proměnných prostředí (náhodná podmnožina GOOGLE_BACKUP_ENV_KEYS
 * s variantami chybí / prázdná / tajná hodnota, plus nadbytečné tajné klíče) a libovolný
 * Service_Status Google Drive platí:
 *  - `configured` je pravdivé právě tehdy, když jsou VŠECHNY očekávané klíče nastavené (truthy),
 *  - `driveStatus` je věrně převzat ze vstupu,
 *  - serializace výsledku neobsahuje žádnou hodnotu proměnné prostředí (tajemství neuniká).
 *
 * Validates: Requirements 18.1, 18.5
 */

// Rozpoznatelná tajná hodnota — prefix 'SECRET_' zaručí neprázdnost (truthy)
// a snadnou dohledatelnost ve výstupu. Suffix je alfanumerický kvůli stabilní serializaci.
const secretValue: fc.Arbitrary<string> = fc
  .string({
    minLength: 1,
    maxLength: 24,
    unit: fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
    ),
  })
  .map((s) => `SECRET_${s}`);

// Varianty hodnoty jednoho GOOGLE_* klíče: chybí / přítomná ale prázdná (falsy) / tajná (truthy).
const envValue: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  secretValue,
);

// Generátor env mapy: každý očekávaný klíč dostane některou z variant (náhodná podmnožina
// truthy klíčů) a navíc několik nadbytečných tajných klíčů, které funkce ignoruje.
const envMap: fc.Arbitrary<Record<string, string | undefined>> = fc
  .record({
    expected: fc.record(
      Object.fromEntries(GOOGLE_BACKUP_ENV_KEYS.map((key) => [key, envValue])),
    ),
    extras: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 12 }).map((s) => `EXTRA_${s}`),
      secretValue,
      { maxKeys: 4 },
    ),
  })
  .map(({ expected, extras }) => ({ ...extras, ...expected }));

const driveStatusArb: fc.Arbitrary<ServiceStatus> = fc.constantFrom(
  'ok',
  'degraded',
  'down',
);

describe('backup-status — Property 9', () => {
  it('configured ⟺ všechny GOOGLE_* klíče truthy, driveStatus převzat, žádné hodnoty neunikají', () => {
    fc.assert(
      fc.property(envMap, driveStatusArb, (env, driveStatus) => {
        const result = buildBackupStatus(env, driveStatus);

        // 1) configured je pravdivé právě tehdy, když jsou všechny očekávané klíče truthy.
        const allTruthy = GOOGLE_BACKUP_ENV_KEYS.every((key) => Boolean(env[key]));
        expect(result.configured).toBe(allTruthy);

        // 2) driveStatus je věrně převzat ze vstupu.
        expect(result.driveStatus).toBe(driveStatus);

        // 3) Žádná hodnota proměnné prostředí se nesmí objevit v serializaci výsledku.
        const serialized = JSON.stringify(result);
        const envValues = Object.values(env).filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        );
        for (const value of envValues) {
          expect(serialized.includes(value)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
