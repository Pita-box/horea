// Feature: multi-service-reservations, Property 5: Korektnost toggle výběru služeb
// Validates: Requirements 1.1, 1.2, 1.3
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { toggleService } from '../selection';

const RUNS = { numRuns: 100 } as const;

// Malá doména id, aby docházelo k opakovaným toggle téhož id (přidání i odebrání).
const serviceId = fc.constantFrom('a', 'b', 'c', 'd', 'e');

// Sekvence toggle operací aplikovaná na počáteční (prázdný) seznam.
function applyToggles(ids: readonly string[]): string[] {
  return ids.reduce<string[]>((list, id) => toggleService(list, id), []);
}

describe('toggleService — Property 5: korektnost toggle výběru', () => {
  it('po libovolné sekvenci toggle neobsahuje duplicity', () => {
    fc.assert(
      fc.property(fc.array(serviceId), (ids) => {
        const result = applyToggles(ids);
        expect(new Set(result).size).toBe(result.length);
      }),
      RUNS,
    );
  });

  it('dvojí toggle téhož id zachová stejnou množinu vybraných služeb (R1.2, R1.3)', () => {
    fc.assert(
      fc.property(fc.array(serviceId), serviceId, (ids, id) => {
        const base = applyToggles(ids);
        const twice = toggleService(toggleService(base, id), id);
        // Sémantika append-on-add: dvojí toggle zachová stejnou množinu výběru
        // (pořadí se může změnit, pokud byla služba odebrána a znovu přidána na konec).
        expect(new Set(twice)).toEqual(new Set(base));
      }),
      RUNS,
    );
  });

  it('dvojí toggle dosud nevybrané služby je úplná identita (R1.2, R1.3)', () => {
    fc.assert(
      fc.property(fc.array(serviceId), serviceId, (ids, id) => {
        const base = applyToggles(ids);
        fc.pre(!base.includes(id));
        // Přidání na konec a následné odebrání vrátí přesně původní seznam.
        const twice = toggleService(toggleService(base, id), id);
        expect(twice).toEqual(base);
      }),
      RUNS,
    );
  });

  it('toggle nevybrané služby ji přidá na konec a zachová pořadí (R1.1, R1.2)', () => {
    fc.assert(
      fc.property(fc.array(serviceId), serviceId, (ids, id) => {
        const base = applyToggles(ids);
        fc.pre(!base.includes(id));
        const next = toggleService(base, id);
        expect(next).toEqual([...base, id]);
      }),
      RUNS,
    );
  });

  it('toggle vybrané služby ji odebere a zachová pořadí ostatních (R1.2)', () => {
    fc.assert(
      fc.property(fc.array(serviceId, { minLength: 1 }), (ids) => {
        const base = applyToggles(ids);
        fc.pre(base.length > 0);
        const id = base[0];
        const next = toggleService(base, id);
        expect(next).toEqual(base.filter((x) => x !== id));
      }),
      RUNS,
    );
  });

  it('je čistá — nemutuje vstupní seznam', () => {
    fc.assert(
      fc.property(fc.array(serviceId), serviceId, (ids, id) => {
        const base = applyToggles(ids);
        const snapshot = [...base];
        toggleService(base, id);
        expect(base).toEqual(snapshot);
      }),
      RUNS,
    );
  });
});
