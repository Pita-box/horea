/**
 * Filtrační vrstva seznamu rezervací (R3) — čisté funkce sdílené mezi
 * server komponentou `Reservations_List` (parsování z URL) a klientskou
 * `Reservations_Filter_Bar` (serializace zpět do URL).
 *
 * Bez I/O — vstupem je vždy hodnota `searchParams`, výstupem normalizovaná
 * sada filtrů, případně dotazovací řetězec. Díky tomu jdou filtry testovat
 * nezávisle na Next.js i Supabase.
 */

import type { ReservationStatus } from './labels';

/** Pořadí stavů pro UI a validaci hodnot z URL. */
export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
];

/** Maximální počet řádků načtených jedním requestem (R2.7, R13.4). */
export const RESERVATIONS_PAGE_SIZE = 100;

/** Normalizovaná sada filtrů seznamu rezervací. */
export type ReservationFilters = {
  /** Vybrané stavy (konjunktivně s ostatními filtry); prázdné = bez omezení stavu. */
  statuses: ReservationStatus[];
  /** Vybrané služby (`service_id`); prázdné = bez omezení služby. */
  serviceIds: string[];
  /** Počáteční datum rozsahu (inkluzivně) ve tvaru `YYYY-MM-DD`, nebo `null`. */
  from: string | null;
  /** Koncové datum rozsahu (inkluzivně) ve tvaru `YYYY-MM-DD`, nebo `null`. */
  to: string | null;
  /** Stránka (1-based). */
  page: number;
};

/** Hodnota jednoho klíče z `searchParams` Next.js app routeru. */
type SearchParamValue = string | string[] | undefined;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Sloučí hodnotu searchParamu (string / pole / čárkou oddělené) na pole neprázdných řetězců. */
function toValues(value: SearchParamValue): string[] {
  if (value === undefined) {
    return [];
  }

  const raw = Array.isArray(value) ? value : [value];

  return raw
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isReservationStatus(value: string): value is ReservationStatus {
  return (RESERVATION_STATUSES as readonly string[]).includes(value);
}

/** Vrátí datum, pokud odpovídá formátu `YYYY-MM-DD`, jinak `null`. */
function parseDate(value: SearchParamValue): string | null {
  const [first] = toValues(value);

  return first && DATE_PATTERN.test(first) ? first : null;
}

/**
 * Parsuje filtry ze `searchParams`. Neznámé hodnoty stavu ignoruje, duplicity
 * odstraní a zachová pořadí podle {@link RESERVATION_STATUSES}.
 */
export function parseReservationFilters(
  searchParams: Record<string, SearchParamValue>,
): ReservationFilters {
  const statusValues = new Set(toValues(searchParams.status).filter(isReservationStatus));
  const statuses = RESERVATION_STATUSES.filter((status) => statusValues.has(status));

  const serviceIds = Array.from(new Set(toValues(searchParams.service)));

  const pageRaw = Number.parseInt(toValues(searchParams.page)[0] ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return {
    statuses,
    serviceIds,
    from: parseDate(searchParams.from),
    to: parseDate(searchParams.to),
    page,
  };
}

/**
 * Serializuje filtry do `URLSearchParams`. Prázdné filtry se vynechávají,
 * stránka se přidává jen pro `page > 1` — výchozí URL tak zůstává čistá.
 */
export function buildReservationSearchParams(filters: ReservationFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.statuses.length > 0) {
    params.set('status', filters.statuses.join(','));
  }

  if (filters.serviceIds.length > 0) {
    params.set('service', filters.serviceIds.join(','));
  }

  if (filters.from) {
    params.set('from', filters.from);
  }

  if (filters.to) {
    params.set('to', filters.to);
  }

  if (filters.page > 1) {
    params.set('page', String(filters.page));
  }

  return params;
}

/** Pomocný řetězec dotazu (`?a=b`) pro odkazy; prázdný, pokud nejsou žádné filtry. */
export function buildReservationQuery(filters: ReservationFilters): string {
  const params = buildReservationSearchParams(filters);
  const query = params.toString();

  return query ? `?${query}` : '';
}
