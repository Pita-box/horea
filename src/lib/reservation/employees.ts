/**
 * Čisté helpery pro výběr zaměstnance u kombinované rezervace (R8.2, R8.3).
 *
 * Při více vybraných službách lze přiřadit pouze zaměstnance, který umí
 * VŠECHNY vybrané služby — tj. průnik `service_employees` přes vybrané služby.
 * Služba bez řádku v `service_employees` se chová jako „umí ji všichni
 * zaměstnanci" a do průniku tedy nevnáší žádné omezení (R8.2).
 *
 * Funkce jsou čisté a bez závislosti na DB — pracují nad mapováním
 * služba → zaměstnanci a seznamem vybraných služeb.
 */

export type ServiceId = string;
export type EmployeeId = string;

/**
 * Mapování služba → zaměstnanci, kteří ji umí (řádky `service_employees`).
 *
 * Služba BEZ klíče v tomto mapování (nebo bez záznamu) = „umí ji všichni
 * zaměstnanci" a do průniku nevnáší žádné omezení (R8.2).
 */
export type ServiceEmployeeMapping = Readonly<Record<ServiceId, readonly EmployeeId[]>>;

/**
 * „Vesmír" všech známých zaměstnanců = sjednocení všech zaměstnanců napříč
 * mapováním, v pořadí prvního výskytu (deduplikováno). Slouží jako neutrální
 * prvek průniku pro služby bez řádku („umí ji všichni").
 */
function employeeUniverse(mapping: ServiceEmployeeMapping): EmployeeId[] {
  const universe: EmployeeId[] = [];
  const seen = new Set<EmployeeId>();

  for (const employees of Object.values(mapping)) {
    for (const employeeId of employees) {
      if (!seen.has(employeeId)) {
        seen.add(employeeId);
        universe.push(employeeId);
      }
    }
  }

  return universe;
}

/**
 * Vrátí zaměstnance nabídnutelné pro daný výběr služeb = průnik `service_employees`
 * přes všechny vybrané služby (R8.2).
 *
 * - Služba bez řádku v mapování se považuje za „umí ji všichni" a do průniku
 *   nevnáší omezení.
 * - Prázdný výběr (žádné omezující služby) → vrací celý vesmír zaměstnanců
 *   (průnik přes prázdnou množinu omezení).
 *
 * Pořadí výsledku odpovídá pořadí prvního výskytu zaměstnance v mapování;
 * výsledek je deduplikovaný.
 */
export function employeesForSelection(
  mapping: ServiceEmployeeMapping,
  selection: readonly ServiceId[],
): EmployeeId[] {
  const universe = employeeUniverse(mapping);

  // Vyber jen služby, které vnášejí omezení (mají řádek v mapování).
  const constrainingSets: ReadonlySet<EmployeeId>[] = [];
  for (const serviceId of selection) {
    const employees = mapping[serviceId];
    if (employees !== undefined) {
      constrainingSets.push(new Set(employees));
    }
  }

  // Žádná omezující služba → „umí ji všichni" pro celý výběr → celý vesmír.
  if (constrainingSets.length === 0) {
    return universe;
  }

  return universe.filter((employeeId) =>
    constrainingSets.every((set) => set.has(employeeId)),
  );
}

/**
 * Vrátí platný výběr zaměstnance po změně vybraných služeb (R8.3).
 *
 * Zachová dříve vybraného zaměstnance pouze tehdy, je-li stále v průniku
 * nabídnutelných zaměstnanců; jinak výběr zruší (vrátí `null`).
 */
export function clearEmployeeIfOutsideSelection(
  mapping: ServiceEmployeeMapping,
  selection: readonly ServiceId[],
  selectedEmployeeId: EmployeeId | null,
): EmployeeId | null {
  if (selectedEmployeeId === null) {
    return null;
  }

  const available = employeesForSelection(mapping, selection);
  return available.includes(selectedEmployeeId) ? selectedEmployeeId : null;
}
