/**
 * Čisté funkce pro pohled „Obsazenost" (měsíční kalendář + graf obsazenosti).
 *
 * Bez I/O. Datum je vždy „nástěnný" den v Europe/Prague ve tvaru `YYYY-MM-DD`.
 * Obsazenost dne = rezervovaný čas (aktivní rezervace) / otevírací doba dne,
 * v procentech (0–100). Graf i mřížku krmí server přepočtenými daty; výběr
 * (den / rozsah) řeší klient nad těmito daty.
 */

import { pragueDateOf } from './calendar';

const DAY_MS = 86_400_000;

/** Krátké české názvy dnů, Po-first (shodně s `opening_hours.day_of_week`). */
export const WEEKDAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const;

/** Buňka měsíční mřížky. `inMonth = false` u dní z přesahu sousedního měsíce. */
export type MonthCell = {
  dateISO: string;
  day: number;
  inMonth: boolean;
};

/** Měsíční mřížka pro `MonthCalendar` + odkazy na sousední měsíce. */
export type MonthGrid = {
  /** Normalizovaná kotva měsíce (`YYYY-MM-01`). */
  anchor: string;
  /** Nadpis měsíce v češtině, např. „červen 2025". */
  title: string;
  weekdayLabels: readonly string[];
  /** Řádky po 7 buňkách (Po–Ne), 6 týdnů. */
  weeks: MonthCell[][];
  /** Data dnů patřících do měsíce (`YYYY-MM-DD`). */
  monthDates: string[];
  prevAnchor: string;
  nextAnchor: string;
};

/** Bod grafu obsazenosti pro jeden den. */
export type OccupancyPoint = {
  dateISO: string;
  /** Obsazenost v procentech (0–100). */
  occupancyPct: number;
  /** Počet aktivních rezervací (pending/approved) začínajících v daný den. */
  reservationCount: number;
  /** `true`, když je den dle otevírací doby zavřený (0 otevřených minut). */
  closed: boolean;
};

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0');
}

function formatYmd(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Po-first index dne v týdnu (0 = Po … 6 = Ne) pro kalendářní datum. */
export function pragueWeekdayIndex(dateISO: string): number {
  const [year, month, day] = dateISO.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayFirst + 6) % 7;
}

/** Posun kotvy o `n` měsíců; výsledek je vždy první den měsíce (`YYYY-MM-01`). */
export function addMonths(anchor: string, n: number): string {
  const [year, month] = anchor.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1 + n, 1));
  return formatYmd(base);
}

/** Sestaví měsíční mřížku (6×7, Po-first) pro měsíc, do kterého spadá `anchor`. */
export function buildMonthGrid(anchor: string): MonthGrid {
  const [year, month] = anchor.split('-').map(Number);
  const firstAnchor = `${pad(year, 4)}-${pad(month)}-01`;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = pragueWeekdayIndex(firstAnchor); // 0 = Po
  const gridStart = new Date(Date.UTC(year, month - 1, 1) - firstWeekday * DAY_MS);

  const weeks: MonthCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: MonthCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const date = new Date(gridStart.getTime() + (week * 7 + dow) * DAY_MS);
      row.push({
        dateISO: formatYmd(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month - 1,
      });
    }
    weeks.push(row);
  }

  const monthDates = Array.from({ length: daysInMonth }, (_, index) =>
    formatYmd(new Date(Date.UTC(year, month - 1, index + 1))),
  );

  const title = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  return {
    anchor: firstAnchor,
    title,
    weekdayLabels: WEEKDAY_LABELS,
    weeks,
    monthDates,
    prevAnchor: addMonths(firstAnchor, -1),
    nextAnchor: addMonths(firstAnchor, 1),
  };
}

/** "HH:MM[:SS]" → minuty od půlnoci. */
function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/** Otevřené minuty pro každý den v týdnu (Po-first); 0 = zavřeno / chybí. */
export function openMinutesByWeekday(
  hours: { day_of_week: number; opens_at: string; closes_at: string }[],
): number[] {
  const result = Array.from({ length: 7 }, () => 0);
  for (const row of hours) {
    if (row.day_of_week < 0 || row.day_of_week > 6) {
      continue;
    }
    const open = timeToMinutes(row.closes_at) - timeToMinutes(row.opens_at);
    result[row.day_of_week] = open > 0 ? open : 0;
  }
  return result;
}

type OccupancyReservation = {
  startsAt: string;
  endsAt: string;
  status: string;
};

const ACTIVE_STATUSES = new Set(['pending', 'approved']);

function clampPct(value: number): number {
  if (value <= 0) {
    return 0;
  }
  return value >= 100 ? 100 : Math.round(value);
}

/**
 * Spočítá denní obsazenost pro zadané dny měsíce. Rezervace se přiřazuje ke dni
 * podle svého začátku (Europe/Prague); počítají se jen aktivní (pending/approved).
 * Obsazenost = rezervované minuty / otevřené minuty dne × 100 (cap 100). Den bez
 * otevírací doby je `closed` (obsazenost 0).
 */
export function computeDailyOccupancy(
  monthDates: string[],
  reservations: readonly OccupancyReservation[],
  openMinutes: number[],
): OccupancyPoint[] {
  const bookedByDate = new Map<string, number>();
  const countByDate = new Map<string, number>();

  for (const reservation of reservations) {
    if (!ACTIVE_STATUSES.has(reservation.status)) {
      continue;
    }
    const dateISO = pragueDateOf(reservation.startsAt);
    const minutes = Math.max(
      0,
      Math.round((new Date(reservation.endsAt).getTime() - new Date(reservation.startsAt).getTime()) / 60_000),
    );
    bookedByDate.set(dateISO, (bookedByDate.get(dateISO) ?? 0) + minutes);
    countByDate.set(dateISO, (countByDate.get(dateISO) ?? 0) + 1);
  }

  return monthDates.map((dateISO) => {
    const open = openMinutes[pragueWeekdayIndex(dateISO)] ?? 0;
    const booked = bookedByDate.get(dateISO) ?? 0;
    const occupancyPct = open > 0 ? clampPct((booked / open) * 100) : booked > 0 ? 100 : 0;
    return {
      dateISO,
      occupancyPct,
      reservationCount: countByDate.get(dateISO) ?? 0,
      closed: open === 0,
    };
  });
}

/**
 * Barva tečky obsazenosti pod dnem v kalendáři podle vytíženosti dne.
 * Nízká obsazenost = zelená (volno), střední = oranžová, vysoká/plno = červená.
 * Prahy: < 40 % zelená, 40–79 % oranžová, ≥ 80 % červená.
 */
export function occupancyDotColor(occupancyPct: number): string {
  if (occupancyPct >= 80) {
    return '#e7000b'; // červená (= --color-red)
  }
  if (occupancyPct >= 40) {
    return '#f59e0b'; // oranžová
  }
  return '#16a34a'; // zelená
}

/**
 * Vyhladí lomenou čáru hodnot na SVG path (Catmull-Rom → kubické bézier).
 * `values` jsou 0–100; vrací `line` (čára) a `area` (výplň pod čarou) path data.
 */
export function buildSmoothPath(
  values: number[],
  options: { width: number; height: number; padTop?: number; padBottom?: number },
): { line: string; area: string; points: { x: number; y: number }[] } {
  const { width, height, padTop = 6, padBottom = 6 } = options;
  const innerHeight = height - padTop - padBottom;

  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = padTop + innerHeight * (1 - clampPct(value) / 100);
    return { x, y };
  });

  if (points.length === 0) {
    return { line: '', area: '', points };
  }
  if (points.length === 1) {
    const { x, y } = points[0];
    const line = `M ${x} ${y}`;
    return { line, area: `${line} L ${x} ${height - padBottom} Z`, points };
  }

  let line = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  const last = points[points.length - 1];
  const area = `${line} L ${last.x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;

  return { line, area, points };
}
