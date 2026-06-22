/**
 * Určení, zda má podnik PRÁVĚ TEĎ otevřeno, podle otevírací doby.
 *
 * Vyhodnocuje se v pásmu `Europe/Prague` (zobrazovací TZ platformy). Funkce je
 * čistá — `now` lze předat pro deterministické testy. Datový model nemá přesahy
 * přes půlnoc (každý den má vlastní opens/closes), takže otevřeno = aktuální čas
 * spadá do `[opens, closes)` daného dne.
 */
export type OpenStatusHours = {
  /** 0 = Pondělí … 6 = Neděle (shodně s tabulkou `opening_hours`). */
  dayOfWeek: number;
  /** „HH:MM" nebo „HH:MM:SS". */
  opensAt: string;
  closesAt: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Aktuální den (0=Po) a minuty od půlnoci v pásmu Europe/Prague. */
function pragueNow(now: Date): { dayIndex: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  return { dayIndex: WEEKDAY_INDEX[weekday] ?? 0, minutes: hour * 60 + minute };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

export function isBusinessOpenNow(hours: OpenStatusHours[], now: Date = new Date()): boolean {
  const { dayIndex, minutes } = pragueNow(now);
  const today = hours.find((h) => h.dayOfWeek === dayIndex);
  if (!today) {
    return false;
  }
  const opens = toMinutes(today.opensAt);
  const closes = toMinutes(today.closesAt);
  return minutes >= opens && minutes < closes;
}

/** Dnešní index dne (0=Po … 6=Ne) v pásmu Europe/Prague. */
export function getPragueWeekday(now: Date = new Date()): number {
  return pragueNow(now).dayIndex;
}

/** Otevírací doba pro DNEŠNÍ den (Europe/Prague), nebo `null` když je zavřeno. */
export function getTodaysHours<T extends OpenStatusHours>(
  hours: T[],
  now: Date = new Date(),
): T | null {
  const { dayIndex } = pragueNow(now);
  return hours.find((h) => h.dayOfWeek === dayIndex) ?? null;
}
