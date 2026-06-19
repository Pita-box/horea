import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  clearEmployeeIfOutsideSelection,
  employeesForSelection,
  type EmployeeId,
  type ServiceEmployeeMapping,
  type ServiceId,
} from '../employees';

// Feature: multi-service-reservations, Property 11: Nabídka zaměstnanců je
// průnik přes vybrané služby (služba bez řádku = umí všichni; zrušení vybraného
// zaměstnance mimo průnik).
// Validates: Requirements 8.2, 8.3

const EMPLOYEE_POOL: readonly EmployeeId[] = ['e0', 'e1', 'e2', 'e3', 'e4'];
const SERVICE_POOL: readonly ServiceId[] = ['s0', 's1', 's2', 's3', 's4'];

/**
 * Mapování služba → zaměstnanci. Některé služby z fondu schválně chybí
 * (= „umí ji všichni"), takže do mapování zařadíme jen podmnožinu služeb.
 */
const mappingArb: fc.Arbitrary<ServiceEmployeeMapping> = fc
  .subarray([...SERVICE_POOL], { minLength: 0, maxLength: SERVICE_POOL.length })
  .chain((services) => {
    if (services.length === 0) {
      return fc.constant<ServiceEmployeeMapping>({});
    }
    return fc
      .tuple(
        ...services.map(() =>
          fc.subarray([...EMPLOYEE_POOL], {
            minLength: 0,
            maxLength: EMPLOYEE_POOL.length,
          }),
        ),
      )
      .map((employeeLists) => {
        const mapping: Record<ServiceId, readonly EmployeeId[]> = {};
        services.forEach((serviceId, index) => {
          mapping[serviceId] = employeeLists[index];
        });
        return mapping as ServiceEmployeeMapping;
      });
  });

/** Výběr služeb může obsahovat i služby bez řádku v mapování. */
const selectionArb: fc.Arbitrary<readonly ServiceId[]> = fc.subarray(
  [...SERVICE_POOL],
  { minLength: 0, maxLength: SERVICE_POOL.length },
);

/** Nezávislý referenční výpočet průniku se shodnou sémantikou jako implementace. */
function expectedIntersection(
  mapping: ServiceEmployeeMapping,
  selection: readonly ServiceId[],
): Set<EmployeeId> {
  const universe = new Set<EmployeeId>();
  for (const employees of Object.values(mapping)) {
    for (const employeeId of employees) {
      universe.add(employeeId);
    }
  }

  const constrainingSets = selection
    .map((serviceId) => mapping[serviceId])
    .filter((employees): employees is readonly EmployeeId[] => employees !== undefined)
    .map((employees) => new Set(employees));

  if (constrainingSets.length === 0) {
    return universe;
  }

  return new Set(
    [...universe].filter((employeeId) =>
      constrainingSets.every((set) => set.has(employeeId)),
    ),
  );
}

describe('employees — Property 11: Nabídka zaměstnanců je průnik přes vybrané služby', () => {
  it('employeesForSelection vrací průnik přes omezující služby (služba bez řádku = umí všichni)', () => {
    fc.assert(
      fc.property(mappingArb, selectionArb, (mapping, selection) => {
        const result = employeesForSelection(mapping, selection);
        const expected = expectedIntersection(mapping, selection);

        // Výsledek je množinově roven průniku.
        expect(new Set(result)).toEqual(expected);
        // Výsledek je bez duplicit.
        expect(result.length).toBe(new Set(result).size);
        // Každý nabídnutý zaměstnanec umí všechny omezující vybrané služby.
        for (const employeeId of result) {
          for (const serviceId of selection) {
            const employees = mapping[serviceId];
            if (employees !== undefined) {
              expect(employees).toContain(employeeId);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('clearEmployeeIfOutsideSelection zruší zaměstnance mimo průnik a zachová ho uvnitř', () => {
    fc.assert(
      fc.property(
        mappingArb,
        selectionArb,
        fc.constantFrom<EmployeeId | null>(null, ...EMPLOYEE_POOL),
        (mapping, selection, selectedEmployeeId) => {
          const result = clearEmployeeIfOutsideSelection(
            mapping,
            selection,
            selectedEmployeeId,
          );
          const available = new Set(employeesForSelection(mapping, selection));

          if (selectedEmployeeId !== null && available.has(selectedEmployeeId)) {
            // Uvnitř průniku → výběr zůstává zachován.
            expect(result).toBe(selectedEmployeeId);
          } else {
            // Mimo průnik nebo bez výběru → zrušeno.
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
