import { describe, it } from 'vitest';
import fc from 'fast-check';

import { computeNextRun, detectScheduleDrift } from '../cron-schedule';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

// Generátor `now` v rozumném rozsahu (epocha → ~2100), zaokrouhlený na celé ms;
// nikdy Invalid Date (mimo vstupní prostor funkce).
const nowArb = fc.date({ min: new Date(0), max: new Date('2100-01-01T00:00:00.000Z'), noInvalidDate: true });

describe('cron-schedule (PBT)', () => {
  // Feature: admin-system-tools, Property 13: Výpočet příštího běhu cronu pro podporované výrazy
  // Validates: Requirements 24.2
  it('Property 13: computeNextRun vrací nejbližší budoucí čas vyhovující výrazu', () => {
    // Dvě podporované rodiny výrazů: denní 'M H * * *' a krokový '*/N * * * *'.
    const dailyArb = fc.record({
      kind: fc.constant('daily' as const),
      minute: fc.integer({ min: 0, max: 59 }),
      hour: fc.integer({ min: 0, max: 23 }),
    });
    const stepArb = fc.record({
      kind: fc.constant('step' as const),
      step: fc.integer({ min: 1, max: 59 }),
    });

    fc.assert(
      fc.property(nowArb, fc.oneof(dailyArb, stepArb), (now, spec) => {
        if (spec.kind === 'daily') {
          // Sestavení výrazu 'M H * * *'.
          const expr = `${spec.minute} ${spec.hour} * * *`;
          const next = computeNextRun(expr, now);
          const delta = next.getTime() - now.getTime();

          // Výsledek je ostře po `now`.
          if (delta <= 0) return false;
          // Výsledek má požadované UTC hodiny/minuty (a vynulované sekundy/ms).
          if (next.getUTCHours() !== spec.hour) return false;
          if (next.getUTCMinutes() !== spec.minute) return false;
          if (next.getUTCSeconds() !== 0 || next.getUTCMilliseconds() !== 0) return false;
          // Denní běhy jsou 24h od sebe → nejbližší budoucí leží < 24h po now,
          // tudíž mezi `now` a výsledkem žádný dřívější vyhovující čas není.
          return delta < MS_PER_DAY;
        }

        // Krokový výraz '*/N * * * *' — pozor na JS literál, ať nevznikne komentář '*/'.
        const expr = '*/' + spec.step + ' * * * *';
        const next = computeNextRun(expr, now);
        const delta = next.getTime() - now.getTime();

        // Výsledek je ostře po `now`.
        if (delta <= 0) return false;
        // Vynulované sekundy/ms a minuta dělitelná N.
        if (next.getUTCSeconds() !== 0 || next.getUTCMilliseconds() !== 0) return false;
        if (next.getUTCMinutes() % spec.step !== 0) return false;
        // Vyhovující minuty jsou ≤ N od sebe (reset na 0 každou hodinu) → nejbližší
        // budoucí leží ≤ N minut po now, takže žádný dřívější vyhovující čas neexistuje.
        return delta <= spec.step * MS_PER_MINUTE;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: admin-system-tools, Property 14: Detekce driftu rozvrhu cronů
  // Validates: Requirements 24.4
  it('Property 14: detectScheduleDrift odpovídá set-logice a žádný drift ⟺ shodné mapy', () => {
    // Malý prostor klíčů a výrazů, aby vznikaly průniky (missing/extra/mismatched).
    const keyArb = fc.constantFrom('cleanup', 'billing', 'warnings', 'email-retry', 'extra');
    const exprArb = fc.constantFrom('0 3 * * *', '30 3 * * *', '0 4 * * *', '*/15 * * * *');
    const mapArb = fc.dictionary(keyArb, exprArb);

    fc.assert(
      fc.property(mapArb, mapArb, (configured, monitored) => {
        const drift = detectScheduleDrift(configured, monitored);

        const configuredKeys = Object.keys(configured);
        const monitoredKeys = Object.keys(monitored);

        // Očekávané množiny dle definice.
        const expectedMissing = configuredKeys.filter((k) => !(k in monitored)).sort();
        const expectedExtra = monitoredKeys.filter((k) => !(k in configured)).sort();
        const expectedMismatched = configuredKeys
          .filter((k) => k in monitored && configured[k] !== monitored[k])
          .sort();

        const sameArr = (a: string[], b: string[]) =>
          a.length === b.length && a.every((v, i) => v === b[i]);

        if (!sameArr([...drift.missing].sort(), expectedMissing)) return false;
        if (!sameArr([...drift.extra].sort(), expectedExtra)) return false;
        if (!sameArr(drift.mismatched.map((m) => m.job).sort(), expectedMismatched)) return false;

        // Položky mismatched nesou správné hodnoty configured/monitored.
        for (const m of drift.mismatched) {
          if (m.configured !== configured[m.job]) return false;
          if (m.monitored !== monitored[m.job]) return false;
        }

        // Žádný drift (všechny prázdné) ⟺ mapy jsou shodné (stejné klíče i hodnoty).
        const noDrift =
          drift.missing.length === 0 && drift.extra.length === 0 && drift.mismatched.length === 0;
        const mapsEqual =
          configuredKeys.length === monitoredKeys.length &&
          configuredKeys.every((k) => k in monitored && configured[k] === monitored[k]);

        return noDrift === mapsEqual;
      }),
      { numRuns: 100 },
    );
  });
});
