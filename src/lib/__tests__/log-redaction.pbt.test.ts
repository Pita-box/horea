import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { redactContext } from '@/lib/log';

// Feature: admin-system-tools, Property 6: Redakce nikdy neemituje tajnou hodnotu
//
// Validates: Requirements 12.5, 15.4
//
// Vlastnost: pro libovolný log kontext, kde jsou pod citlivými klíči (obsahujícími
// `secret` vč. `CRON_SECRET`, `token`, `password`) vloženy rozeznatelné tajné hodnoty,
// serializace výstupu `redactContext` NIKDY neobsahuje původní tajnou hodnotu — je
// nahrazena `[REDACTED]`. Necitlivé klíče zůstávají zachované beze změny.

/** Prefix, podle kterého poznáme uniklou tajnou hodnotu ve výstupu. */
const SECRET_PREFIX = 'SECRET_VALUE_';

/** Citlivé klíče, které musí redakce vždy zamaskovat (substring, case-insensitive). */
const sensitiveKeyArb = fc.constantFrom(
  'password',
  'token',
  'authToken',
  'accessToken',
  'secret',
  'CRON_SECRET',
  'apiSecret',
  'userPassword',
);

/** Necitlivý klíč — nesmí kolidovat s citlivými substringy. */
const safeKeyArb = fc.constantFrom('id', 'name', 'count', 'action', 'studio', 'flag');

/** Rozeznatelná tajná hodnota s unikátním prefixem (neprázdná). */
const secretValueArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .map((s) => `${SECRET_PREFIX}${s}`);

/** Necitlivá hodnota — string/number/boolean, která nikdy nenese tajný prefix. */
const safeValueArb = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.string({ maxLength: 10 }).map((s) => `safe_${s}`),
);

describe('log redaction — Property 6: redakce nikdy neemituje tajnou hodnotu', () => {
  it('serializace výstupu neobsahuje žádnou původní tajnou hodnotu (numRuns: 100)', () => {
    fc.assert(
      fc.property(
        // Plochý citlivý klíč → tajná hodnota
        fc.dictionary(sensitiveKeyArb, secretValueArb, { minKeys: 1 }),
        // Vnořený citlivý klíč → tajná hodnota
        fc.dictionary(sensitiveKeyArb, secretValueArb, { minKeys: 1 }),
        // Necitlivá pole, která mají zůstat zachována
        fc.dictionary(safeKeyArb, safeValueArb),
        (topSecrets, nestedSecrets, safeFields) => {
          const ctx: Record<string, unknown> = {
            ...safeFields,
            ...topSecrets,
            nested: { ...nestedSecrets },
            list: [{ ...nestedSecrets }],
          };

          const redacted = redactContext(ctx);
          const serialized = JSON.stringify(redacted);

          // 1) Žádná tajná hodnota (podle prefixu) nesmí uniknout do serializace.
          expect(serialized.includes(SECRET_PREFIX)).toBe(false);

          // 2) Každý citlivý klíč (top-level i vnořený) je nahrazen [REDACTED].
          for (const key of Object.keys(topSecrets)) {
            expect(redacted[key]).toBe('[REDACTED]');
          }
          const nested = redacted.nested as Record<string, unknown>;
          for (const key of Object.keys(nestedSecrets)) {
            expect(nested[key]).toBe('[REDACTED]');
          }

          // 3) Necitlivé klíče zůstávají zachované beze změny.
          for (const [key, value] of Object.entries(safeFields)) {
            expect(redacted[key]).toStrictEqual(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
