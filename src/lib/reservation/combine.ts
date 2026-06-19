/**
 * Čisté doménové helpery pro kombinovanou rezervaci více služeb.
 *
 * Tvoří jediný zdroj pravdy pro výpočet `Combined_Duration` a `Combined_Price`
 * v TS vrstvě (klient i server) a pro spojení názvů služeb do jednoho pole
 * CSV exportu. Funkce jsou čisté (bez vedlejších efektů) a nemodifikují vstup.
 *
 * Pozn.: autoritativní `Combined_Duration` historických rezervací počítá SQL
 * pod advisory lockem ze snapshotů; tyto helpery slouží pro průběžný výpočet
 * ve formuláři, pre-lock grid check, e-maily a CSV.
 */

/**
 * Služba vstupující do kombinovaných výpočtů.
 *
 * `position` je volitelná — určuje pořadí služby v rámci rezervace
 * (`Reservation_Service_Set`). Pokud chybí, zachovává se pořadí prvků v poli.
 */
export type CombinableService = {
  name: string;
  durationMinutes: number;
  priceCzk: number;
  position?: number;
};

/**
 * `Combined_Duration` = součet `durationMinutes` všech služeb (R2.1).
 *
 * Pro prázdný seznam vrací 0.
 */
export function combinedDuration(services: readonly CombinableService[]): number {
  return services.reduce((sum, service) => sum + service.durationMinutes, 0);
}

/**
 * `Combined_Price` = součet `priceCzk` všech služeb (R3.1).
 *
 * Pro prázdný seznam vrací 0.
 */
export function combinedPrice(services: readonly CombinableService[]): number {
  return services.reduce((sum, service) => sum + service.priceCzk, 0);
}

/**
 * Spojí názvy služeb do jednoho pole oddělovačem ` + ` (mezera-plus-mezera)
 * v pořadí `position` (R4.3, R14.1).
 *
 * Oddělovač ` + ` se používá záměrně místo `; ` — český MS Excel bere středník
 * jako oddělovač sloupců a rozbil by tím tabulku.
 *
 * Pokud je `position` u všech služeb definovaná, řadí se podle ní vzestupně;
 * jinak se zachová pořadí prvků ve vstupním poli. Řazení je stabilní.
 */
export function joinServiceNames(services: readonly CombinableService[]): string {
  return services
    .map((service, index) => ({ service, index }))
    .sort((a, b) => {
      const posA = a.service.position ?? a.index;
      const posB = b.service.position ?? b.index;

      if (posA !== posB) {
        return posA - posB;
      }

      return a.index - b.index;
    })
    .map(({ service }) => service.name)
    .join(' + ');
}
