/**
 * Sdílené sestavení popisu služeb rezervace pro výpisy (tabulka rezervací,
 * historie klienta, kalendář). Multi-service rezervace spojuje názvy z
 * `Reservation_Service_Set` v pořadí `position` oddělené `, ` a ořezává na
 * maximální délku (po celých názvech; přebytek → „ …"). Fallback na
 * denormalizovaný primary `services(name)` u starších jednoslužbových rezervací.
 *
 * Čisté funkce bez I/O — jediný zdroj pravdy pro tento popis, aby byl výpis
 * konzistentní napříč obrazovkami.
 */

/** Maximální délka popisu služeb ve výpisu (znaků); přebytek se zkrátí „ …". */
export const SERVICE_LABEL_MAX_CHARS = 66;

/** Embedovaný `services` z PostgRESTu (objekt nebo pole). */
export type EmbeddedService = { name: string } | { name: string }[] | null;

/** Vnořený řádek `reservation_services` s pořadím a názvem služby. */
export type ReservationServiceNameRow = {
  position: number;
  services: EmbeddedService;
};

/** Název z embedovaného `services` (PostgREST vrací objekt nebo pole). */
export function embeddedServiceName(services: EmbeddedService): string | null {
  if (!services) {
    return null;
  }
  return Array.isArray(services) ? (services[0]?.name ?? null) : services.name;
}

/**
 * Spojí názvy služeb do jednoho popisu odděleného `, `. Přidává celé názvy,
 * dokud se vejdou do `maxChars`; nevejde-li se další, doplní „ …".
 */
export function combinedServiceLabel(
  names: string[],
  maxChars = SERVICE_LABEL_MAX_CHARS,
): string {
  const separator = ', ';
  const parts: string[] = [];
  let length = 0;

  for (const name of names) {
    const addition = parts.length === 0 ? name.length : separator.length + name.length;
    if (parts.length > 0 && length + addition > maxChars) {
      return `${parts.join(separator)} …`;
    }
    parts.push(name);
    length += addition;
  }

  return parts.join(separator);
}

/**
 * Popis služeb rezervace pro výpis: spojené názvy z `Reservation_Service_Set`
 * v pořadí `position`. Fallback na denormalizovaný primary `services(name)`
 * u starších jednoslužbových rezervací bez navázaných řádků.
 */
export function reservationServiceLabel(
  reservationServices: ReservationServiceNameRow[] | null,
  primaryServices: EmbeddedService,
): string | null {
  const set = reservationServices ?? [];
  if (set.length > 0) {
    const names = [...set]
      .sort((a, b) => a.position - b.position)
      .map((item) => embeddedServiceName(item.services))
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) {
      return combinedServiceLabel(names);
    }
  }
  return embeddedServiceName(primaryServices);
}
