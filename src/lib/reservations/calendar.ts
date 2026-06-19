/**
 * Logika kalendářního pohledu seznamu rezervací (R4) — čisté funkce sdílené
 * mezi server komponentou `Reservations_List` (výpočet období + meze dotazu)
 * a prezentační `Reservations_Calendar_View` (render mřížky a navigace).
 *
 * Bez I/O kromě `fromPragueInput` (převod hranice dne na UTC). Datum období
 * je vždy „nástěnný" den v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`.
 */

import { fromPragueInput } from '@/lib/datetime';

import {
  buildReservationSearchParams,
  type ReservationFilters,
} from './filters';

const TIME_ZONE = 'Europe/Prague';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Pohled seznamu — tabulka (výchozí), kalendář, nebo obsazenost. */
export type CalendarView = 'table' | 'calendar' | 'occupancy';
/** Režim kalendáře — jeden den nebo týden (Po–Ne). */
export type CalendarMode = 'day' | 'week';

/** Parametry kalendáře nesené v URL (`view`, `mode`, `anchor`). */
export type CalendarParams = {
  view: CalendarView;
  mode: CalendarMode;
  /** Kotevní datum období ve tvaru `YYYY-MM-DD` (Europe/Prague). */
  anchor: string;
};

/** Den období s rezervacemi pro render mřížky. */
export type CalendarDay = {
  /** Datum dne ve tvaru `YYYY-MM-DD`. */
  date: string;
  /** Krátký český název dne (např. „po"). */
  weekday: string;
  /** Den a měsíc pro hlavičku (např. „15.07."). */
  label: string;
};

type SearchParamValue = string | string[] | undefined;

function first(value: SearchParamValue): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

/** Naformátuje `Date` (interpretovaný v UTC) na `YYYY-MM-DD`. */
function formatYmd(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Posune kalendářní datum o `n` dní (kladně i záporně). DST se netýká — jde o čistý den. */
export function addDays(dateStr: string, n: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return formatYmd(new Date(Date.UTC(year, month - 1, day) + n * DAY_MS));
}

/** Vrátí pondělí týdne (Po–Ne), do kterého spadá zadané datum. */
export function mondayOf(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = neděle … 6 = sobota
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(dateStr, diff);
}

/** Dnešní datum v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
export function todayPragueDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Datum okamžiku (ISO/UTC) v pásmu Europe/Prague ve tvaru `YYYY-MM-DD`. */
export function pragueDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Čas okamžiku (ISO/UTC) v pásmu Europe/Prague ve tvaru `HH:mm` (24h). */
export function pragueTimeOf(iso: string): string {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  return formatted === '24:00' ? '00:00' : formatted;
}

/** Sestaví popisek dne (krátký název + den.měsíc) pro hlavičku kalendáře. */
function describeDay(dateStr: string): CalendarDay {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(date);
  return {
    date: dateStr,
    weekday: weekday.replace('.', ''),
    label: `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.`,
  };
}

/** Vrátí dny zobrazeného období: 1 den (denní režim) nebo 7 dní Po–Ne (týdenní). */
export function periodDays(mode: CalendarMode, anchor: string): CalendarDay[] {
  if (mode === 'day') {
    return [describeDay(anchor)];
  }
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, index) => describeDay(addDays(monday, index)));
}

/**
 * UTC meze zobrazeného období pro dotaz do DB. Hranice jsou inkluzivní a
 * interpretované v Europe/Prague (00:00:00 prvního dne až 23:59:59 posledního).
 */
export function periodBoundsUtc(days: CalendarDay[]): { fromIso: string; toIso: string } {
  const firstDay = days[0].date;
  const lastDay = days[days.length - 1].date;
  return {
    fromIso: fromPragueInput(`${firstDay}T00:00:00`).toISOString(),
    toIso: fromPragueInput(`${lastDay}T23:59:59`).toISOString(),
  };
}

/**
 * Parsuje parametry kalendáře z `searchParams`. Výchozí stav: obsazenost,
 * týdenní režim, kotva = dnešní pražské datum. Neplatná kotva spadne na dnešek.
 * (Pohled „tabulka" byl zrušen — staré odkazy `?view=table` spadnou na obsazenost.)
 */
export function parseCalendarParams(
  searchParams: Record<string, SearchParamValue>,
): CalendarParams {
  const viewRaw = first(searchParams.view);
  const view: CalendarView = viewRaw === 'calendar' ? 'calendar' : 'occupancy';
  const mode: CalendarMode = first(searchParams.mode) === 'day' ? 'day' : 'week';
  const anchorRaw = first(searchParams.anchor);
  const anchor = anchorRaw && DATE_PATTERN.test(anchorRaw) ? anchorRaw : todayPragueDate();
  return { view, mode, anchor };
}

const RESERVATIONS_PATH = '/dashboard/reservations';

/**
 * Sestaví odkaz na seznam rezervací zachovávající aktivní filtry (status,
 * služba, časový rozsah) a měnící POUZE parametry pohledu (`view`, `mode`,
 * `anchor`). Pro tabulku se kalendářní parametry vynechávají (R4.6).
 */
export function buildReservationsHref(
  filters: ReservationFilters,
  params:
    | { view: 'table' }
    | { view: 'calendar'; mode: CalendarMode; anchor: string }
    | { view: 'occupancy'; anchor: string },
): string {
  // Stránkování do kalendáře nepatří — pro odkazy začínáme od první strany.
  const search = buildReservationSearchParams({ ...filters, page: 1 });
  if (params.view === 'calendar') {
    search.set('view', 'calendar');
    search.set('mode', params.mode);
    search.set('anchor', params.anchor);
  } else if (params.view === 'occupancy') {
    search.set('view', 'occupancy');
    search.set('anchor', params.anchor);
  }
  const query = search.toString();
  return query ? `${RESERVATIONS_PATH}?${query}` : RESERVATIONS_PATH;
}
