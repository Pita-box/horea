// Feature: admin-system-tools, Property 11: Čerstvost GoPay webhooku
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { computeWebhookFreshness, type WebhookFreshness } from '../webhook-freshness';

/**
 * Property 11: Čerstvost GoPay webhooku.
 *
 * `computeWebhookFreshness(lastActivityAt, now, thresholdHours, isProxy)` odvozuje
 * čerstvost webhooku jako diskriminovanou unii. Ověřujeme:
 *  - Null vstup: `lastActivityAt === null` ⇒ `{ hasActivity: false }` (R20.4).
 *  - Jinak `hasActivity: true`, přičemž:
 *      - `stale` je pravdivé právě tehdy, když je věk aktivity ostře větší
 *        než `thresholdHours` (R20.3).
 *      - `isProxy` je převzato beze změny ze vstupu (R20.2, R20.6).
 *      - `lastActivityAt` je zachováno beze změny ze vstupu (R20.5).
 *  - Žádné tajemství / PII: výstup nese pouze časové razítko a příznaky,
 *    nikdy ne další pole (R20.5).
 *
 * MS_PER_HOUR = 60 * 60 * 1000 = 3 600 000.
 *
 * **Validates: Requirements 20.2, 20.3, 20.4, 20.5, 20.6**
 */
describe('webhook-freshness — Property 11: Čerstvost GoPay webhooku', () => {
  const MS_PER_HOUR = 60 * 60 * 1000;

  // Generátor `lastActivityAt`: buď null (bez aktivity), nebo validní ISO řetězec.
  const lastActivityArb = fc.option(
    fc
      .date({
        min: new Date('2000-01-01T00:00:00.000Z'),
        max: new Date('2100-01-01T00:00:00.000Z'),
      })
      .filter((d) => !Number.isNaN(d.getTime()))
      .map((d) => d.toISOString()),
    { nil: null },
  );

  // Generátor `now`: validní Date v rozumném rozsahu.
  const nowArb = fc
    .date({
      min: new Date('2000-01-01T00:00:00.000Z'),
      max: new Date('2100-01-01T00:00:00.000Z'),
    })
    .filter((d) => !Number.isNaN(d.getTime()));

  // Generátor kladné hranice v hodinách (výchozí v aplikaci je 48).
  const thresholdArb = fc.integer({ min: 1, max: 10000 });

  it('null vstup ⇒ { hasActivity: false }', () => {
    fc.assert(
      fc.property(nowArb, thresholdArb, fc.boolean(), (now, thresholdHours, isProxy) => {
        const result = computeWebhookFreshness(null, now, thresholdHours, isProxy);
        return result.hasActivity === false && Object.keys(result).length === 1;
      }),
      { numRuns: 100 },
    );
  });

  it('ne-null vstup ⇒ hasActivity: true, stale ⟺ věk > hranice (ostře), isProxy a lastActivityAt zachovány', () => {
    fc.assert(
      fc.property(
        lastActivityArb.filter((v): v is string => v !== null),
        nowArb,
        thresholdArb,
        fc.boolean(),
        (lastActivityAt, now, thresholdHours, isProxy) => {
          const result = computeWebhookFreshness(lastActivityAt, now, thresholdHours, isProxy);

          if (result.hasActivity !== true) return false;

          // lastActivityAt i isProxy musí být převzaty beze změny.
          if (result.lastActivityAt !== lastActivityAt) return false;
          if (result.isProxy !== isProxy) return false;

          // stale ⟺ věk aktivity je ostře větší než hranice.
          const ageMs = now.getTime() - new Date(lastActivityAt).getTime();
          const expectedStale = ageMs > thresholdHours * MS_PER_HOUR;
          return result.stale === expectedStale;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('výstup nese jen timestamp + příznaky — žádné tajemství/PII navíc', () => {
    fc.assert(
      fc.property(
        lastActivityArb,
        nowArb,
        thresholdArb,
        fc.boolean(),
        (lastActivityAt, now, thresholdHours, isProxy) => {
          const result: WebhookFreshness = computeWebhookFreshness(
            lastActivityAt,
            now,
            thresholdHours,
            isProxy,
          );

          // Povolené množiny klíčů přesně odpovídají diskriminované unii.
          const keys = Object.keys(result).sort();
          if (result.hasActivity === false) {
            return keys.length === 1 && keys[0] === 'hasActivity';
          }
          return (
            keys.length === 4 &&
            keys.join(',') === ['hasActivity', 'isProxy', 'lastActivityAt', 'stale'].sort().join(',')
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
