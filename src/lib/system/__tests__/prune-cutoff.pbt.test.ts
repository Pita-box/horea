// Feature: admin-system-tools, Property 10: Hranice retence běhů cronů je monotónní a týká se jen starších záznamů
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { computePruneCutoff } from '../prune-cutoff';

/**
 * Property 10: Hranice retence běhů cronů je monotónní a týká se jen starších záznamů.
 *
 * `computePruneCutoff(now, days)` vrací ISO řetězec hranice retence `cutoff = now - days`.
 * Ověřujeme tři vlastnosti:
 *  - Korektnost výpočtu: rozdíl `now - cutoff` v ms je přesně `days * 86 400 000`.
 *  - Monotonie: pro `days1 <= days2` platí `cutoff(days2) <= cutoff(days1)`
 *    (větší retence → starší nebo stejná hranice → maže se méně nebo stejně řádků).
 *  - Predikát „older-than": záznam je kandidát na smazání právě tehdy, když je jeho
 *    čas ostře starší než cutoff. Záznam přesně na hranici se nemaže.
 *
 * MS_PER_DAY = 24 * 60 * 60 * 1000 = 86 400 000.
 *
 * **Validates: Requirements 19.1, 19.2**
 */
describe('prune-cutoff — Property 10: Hranice retence běhů cronů je monotónní a týká se jen starších záznamů', () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Generátor `now`: validní Date v rozumném rozsahu (vyhneme se extrémním datům,
  // která by mohla po odečtení dní přetéct mimo platný rozsah Date).
  const nowArb = fc
    .date({
      min: new Date('2000-01-01T00:00:00.000Z'),
      max: new Date('2100-01-01T00:00:00.000Z'),
    })
    .filter((d) => !Number.isNaN(d.getTime()));

  // Generátor kladného počtu dní retence. Retence se vždy zadává v celých dnech
  // (výchozí 90), proto generujeme celá čísla — výpočet pak zůstává přesný v ms.
  const daysArb = fc.integer({ min: 1, max: 3650 });

  it('cutoff = now - days (rozdíl v ms je přesně days * 86 400 000)', () => {
    fc.assert(
      fc.property(nowArb, daysArb, (now, days) => {
        const cutoff = computePruneCutoff(now, days);
        const diffMs = now.getTime() - new Date(cutoff).getTime();
        return diffMs === days * MS_PER_DAY;
      }),
      { numRuns: 100 },
    );
  });

  it('je monotónní v days: days1 <= days2 ⇒ cutoff(days2) <= cutoff(days1)', () => {
    fc.assert(
      fc.property(nowArb, daysArb, daysArb, (now, a, b) => {
        const days1 = Math.min(a, b);
        const days2 = Math.max(a, b);
        const cutoff1 = new Date(computePruneCutoff(now, days1)).getTime();
        const cutoff2 = new Date(computePruneCutoff(now, days2)).getTime();
        return cutoff2 <= cutoff1;
      }),
      { numRuns: 100 },
    );
  });

  it('predikát „older-than": záznam je kandidát na smazání ⟺ jeho čas je ostře starší než cutoff', () => {
    fc.assert(
      fc.property(nowArb, daysArb, fc.integer({ min: 1, max: 5 }), (now, days, offsetDays) => {
        const cutoffMs = new Date(computePruneCutoff(now, days)).getTime();

        // Tři reprezentativní časy záznamu: před hranicí, přesně na hranici, za hranicí.
        const beforeCutoff = cutoffMs - MS_PER_DAY; // ostře starší → kandidát
        const atCutoff = cutoffMs; // přesně na hranici → NEní kandidát
        const afterCutoff = cutoffMs + offsetDays * MS_PER_DAY; // novější → NEní kandidát

        // Predikát „kandidát na smazání" = čas záznamu je ostře starší než cutoff.
        const isCandidate = (recordMs: number) => recordMs < cutoffMs;

        return (
          isCandidate(beforeCutoff) === true &&
          isCandidate(atCutoff) === false &&
          isCandidate(afterCutoff) === false
        );
      }),
      { numRuns: 100 },
    );
  });
});
