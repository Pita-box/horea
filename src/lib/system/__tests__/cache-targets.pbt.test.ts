// Feature: admin-system-tools, Property 5: Vynucení allowlistu cílů revalidace
import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  isAllowedTarget,
  ALLOWED_PATHS,
  ALLOWED_TAGS,
  type RevalidateTarget,
} from '../cache-targets';

/**
 * Property 5: Vynucení allowlistu cílů revalidace.
 *
 * `isAllowedTarget(target)` musí být ekvivalentní přímému dotazu do příslušného
 * allowlistu — cesta musí být v `ALLOWED_PATHS`, tag v `ALLOWED_TAGS`. Generujeme
 * cíle uvnitř i mimo allowlist (path i tag, validní hodnoty z allowlistu i náhodné
 * řetězce), aby vlastnost pokryla obě větve i hraniční vstupy.
 *
 * **Validates: Requirements 10.5, 10.6**
 */
describe('cache-targets — Property 5: Vynucení allowlistu cílů revalidace', () => {
  // Generátor hodnoty: buď hodnota z allowlistu (pokud nějaká existuje), nebo náhodný řetězec.
  // Tím cíleně mícháme vstupy uvnitř i mimo allowlist místo čistě náhodných řetězců,
  // které by allowlist trefily jen výjimečně.
  const valueFrom = (allowed: readonly string[]) =>
    allowed.length > 0
      ? fc.oneof(fc.constantFrom(...allowed), fc.string())
      : fc.string();

  // Generátor celého cíle revalidace (path i tag větev).
  const targetArb: fc.Arbitrary<RevalidateTarget> = fc.oneof(
    valueFrom(ALLOWED_PATHS).map((value) => ({ kind: 'path', value }) as const),
    valueFrom(ALLOWED_TAGS).map((value) => ({ kind: 'tag', value }) as const),
  );

  it('isAllowedTarget je ekvivalentní příslušnému allowlistu', () => {
    fc.assert(
      fc.property(targetArb, (target) => {
        const expected =
          target.kind === 'path'
            ? ALLOWED_PATHS.includes(target.value)
            : ALLOWED_TAGS.includes(target.value);
        return isAllowedTarget(target) === expected;
      }),
      { numRuns: 100 },
    );
  });
});
