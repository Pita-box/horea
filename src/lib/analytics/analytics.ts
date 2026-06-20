/**
 * Čisté funkce pro stránku „Analytika podniku" — výběr období a agregace metrik
 * nad rezervacemi. Bez I/O (kromě časových helperů z `calendar`/`occupancy`,
 * které jsou rovněž čisté). Datum je „nástěnný" den v Europe/Prague (`YYYY-MM-DD`).
 *
 * Definice úspěšnosti rezervace:
 *  - „uskutečněná" = `attendance === 'attended'` (z ní plynou tržby),
 *  - „propadlá"   = `attendance === 'no_show'`,
 *  - „zrušená"    = `status ∈ {cancelled, rejected}`,
 *  - „naplánovaná" = zbytek (pending/approved bez vyhodnocené docházky).
 */

import { pragueDateOf, pragueTimeOf } from '@/lib/reservations/calendar';
import type { AttendanceStatus, ReservationStatus } from '@/lib/reservations/labels';
import { pragueWeekdayIndex } from '@/lib/reservations/occupancy';

// ---------------------------------------------------------------------------
// Období
// ---------------------------------------------------------------------------

export type PeriodKey = 'this-month' | 'last-month' | 'last-7-days' | 'last-30-days' | 'this-year';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this-month', label: 'Tento měsíc' },
  { key: 'last-month', label: 'Minulý měsíc' },
  { key: 'last-7-days', label: 'Posledních 7 dní' },
  { key: 'last-30-days', label: 'Posledních 30 dní' },
  { key: 'this-year', label: 'Tento rok' },
];

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  comparisonLabel: string;
  /** Inkluzivní meze aktuálního období (`YYYY-MM-DD`). */
  from: string;
  to: string;
  /** Inkluzivní meze předchozího srovnávacího období. */
  prevFrom: string;
  prevTo: string;
};

function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0');
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(value: string, n: number): string {
  const d = parseYmd(value);
  return formatYmd(new Date(d.getTime() + n * 86_400_000));
}

function addMonthsIso(value: string, n: number): string {
  const d = parseYmd(value);
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())));
}

function firstOfMonth(value: string): string {
  const d = parseYmd(value);
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

function lastOfMonth(value: string): string {
  const d = parseYmd(value);
  return formatYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function parsePeriodKey(raw: string | undefined): PeriodKey {
  return PERIOD_OPTIONS.some((option) => option.key === raw) ? (raw as PeriodKey) : 'this-month';
}

/** Spočítá meze zvoleného období a srovnávacího (předchozího) období. */
export function resolvePeriod(key: PeriodKey, today: string): ResolvedPeriod {
  const label = PERIOD_OPTIONS.find((option) => option.key === key)?.label ?? 'Tento měsíc';

  if (key === 'last-month') {
    const lastMonthDay = addDaysIso(firstOfMonth(today), -1);
    const from = firstOfMonth(lastMonthDay);
    const to = lastOfMonth(lastMonthDay);
    const prevDay = addDaysIso(from, -1);
    return {
      key,
      label,
      comparisonLabel: 'vs. předchozí měsíc',
      from,
      to,
      prevFrom: firstOfMonth(prevDay),
      prevTo: lastOfMonth(prevDay),
    };
  }

  if (key === 'last-7-days' || key === 'last-30-days') {
    const span = key === 'last-7-days' ? 7 : 30;
    const to = today;
    const from = addDaysIso(today, -(span - 1));
    const prevTo = addDaysIso(from, -1);
    const prevFrom = addDaysIso(prevTo, -(span - 1));
    return {
      key,
      label,
      comparisonLabel: `vs. předchozích ${span} dní`,
      from,
      to,
      prevFrom,
      prevTo,
    };
  }

  if (key === 'this-year') {
    const year = parseYmd(today).getUTCFullYear();
    const from = `${year}-01-01`;
    const to = today;
    return {
      key,
      label,
      comparisonLabel: 'vs. loni',
      from,
      to,
      prevFrom: `${year - 1}-01-01`,
      prevTo: addMonthsIso(to, -12),
    };
  }

  // this-month (výchozí)
  const from = firstOfMonth(today);
  const to = lastOfMonth(today);
  const prevDay = addDaysIso(from, -1);
  return {
    key,
    label,
    comparisonLabel: 'vs. předchozí měsíc',
    from,
    to,
    prevFrom: firstOfMonth(prevDay),
    prevTo: lastOfMonth(prevDay),
  };
}

/** Začátek načítaného okna (kvůli detekci vracejících se klientů — 12 měsíců zpět). */
export function historyWindowStart(period: ResolvedPeriod): string {
  const yearBack = addMonthsIso(period.from, -12);
  return yearBack < period.prevFrom ? yearBack : period.prevFrom;
}

/** Seznam dnů (`YYYY-MM-DD`) v intervalu včetně obou konců. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  let current = from;
  // Pojistka proti nekonečné smyčce u převrácených mezí.
  for (let i = 0; i < 400 && current <= to; i += 1) {
    days.push(current);
    current = addDaysIso(current, 1);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Datový model agregace
// ---------------------------------------------------------------------------

export type AnalyticsService = { serviceId: string; name: string; priceCzk: number };

export type AnalyticsReservation = {
  id: string;
  startsAt: string;
  status: ReservationStatus;
  attendance: AttendanceStatus;
  /** Stabilní identita klienta (telefon/e-mail/jméno) pro loajalitu. */
  clientKey: string;
  clientName: string;
  employeeIds: string[];
  services: AnalyticsService[];
  /** Součet cen služeb rezervace (Kč). */
  revenue: number;
};

const CANCELLED_STATUSES = new Set<ReservationStatus>(['cancelled', 'rejected']);

export function isAttended(r: AnalyticsReservation): boolean {
  return r.attendance === 'attended';
}
export function isNoShow(r: AnalyticsReservation): boolean {
  return r.attendance === 'no_show';
}
export function isCancelled(r: AnalyticsReservation): boolean {
  return CANCELLED_STATUSES.has(r.status);
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

export type Kpis = {
  /** Tržby z uskutečněných rezervací (Kč). */
  revenue: number;
  /** Celkový počet rezervací (všechny stavy). */
  count: number;
  /** Průměrná hodnota uskutečněné rezervace (Kč). */
  avgValue: number;
  /** Podíl neuskutečněných (propadlé + zrušené) na vyhodnocených (0–1). */
  noShowRate: number;
};

export function computeKpis(reservations: AnalyticsReservation[]): Kpis {
  let revenue = 0;
  let attended = 0;
  let noShow = 0;
  let cancelled = 0;

  for (const r of reservations) {
    if (isAttended(r)) {
      revenue += r.revenue;
      attended += 1;
    } else if (isNoShow(r)) {
      noShow += 1;
    }
    if (isCancelled(r)) {
      cancelled += 1;
    }
  }

  const resolved = attended + noShow + cancelled;
  return {
    revenue,
    count: reservations.length,
    avgValue: attended > 0 ? revenue / attended : 0,
    noShowRate: resolved > 0 ? (noShow + cancelled) / resolved : 0,
  };
}

/** Relativní změna (0.12 = +12 %); `null`, když nelze spočítat (dělení nulou). */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return (current - previous) / previous;
}

// ---------------------------------------------------------------------------
// Stav rezervací (koláč)
// ---------------------------------------------------------------------------

export type StatusBreakdown = {
  attended: number;
  noShow: number;
  cancelled: number;
  upcoming: number;
};

export function computeStatusBreakdown(reservations: AnalyticsReservation[]): StatusBreakdown {
  const result: StatusBreakdown = { attended: 0, noShow: 0, cancelled: 0, upcoming: 0 };
  for (const r of reservations) {
    if (isCancelled(r)) {
      result.cancelled += 1;
    } else if (isAttended(r)) {
      result.attended += 1;
    } else if (isNoShow(r)) {
      result.noShow += 1;
    } else {
      result.upcoming += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Heatmapa vytížení (den v týdnu × hodina)
// ---------------------------------------------------------------------------

/** Matice [7 dní Po-Ne][24 hodin] s počty rezervací. */
export function computeHeatmap(reservations: AnalyticsReservation[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of reservations) {
    if (isCancelled(r)) {
      continue;
    }
    const weekday = pragueWeekdayIndex(pragueDateOf(r.startsAt));
    const hour = Number(pragueTimeOf(r.startsAt).split(':')[0]);
    if (weekday >= 0 && weekday < 7 && hour >= 0 && hour < 24) {
      grid[weekday][hour] += 1;
    }
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Vývoj tržeb v čase
// ---------------------------------------------------------------------------

export type RevenuePoint = { dateISO: string; revenue: number };

export function computeRevenueSeries(
  reservations: AnalyticsReservation[],
  days: string[],
): RevenuePoint[] {
  const byDate = new Map<string, number>();
  for (const r of reservations) {
    if (!isAttended(r)) {
      continue;
    }
    const date = pragueDateOf(r.startsAt);
    byDate.set(date, (byDate.get(date) ?? 0) + r.revenue);
  }
  return days.map((dateISO) => ({ dateISO, revenue: byDate.get(dateISO) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Nejvýdělečnější služby
// ---------------------------------------------------------------------------

export type ServiceRanking = { serviceId: string; name: string; revenue: number; count: number };

export function topServicesByRevenue(reservations: AnalyticsReservation[]): ServiceRanking[] {
  const map = new Map<string, ServiceRanking>();
  for (const r of reservations) {
    if (!isAttended(r)) {
      continue;
    }
    for (const service of r.services) {
      const entry = map.get(service.serviceId) ?? {
        serviceId: service.serviceId,
        name: service.name,
        revenue: 0,
        count: 0,
      };
      entry.revenue += service.priceCzk;
      entry.count += 1;
      map.set(service.serviceId, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

// ---------------------------------------------------------------------------
// Výkonnost zaměstnanců
// ---------------------------------------------------------------------------

export type EmployeeRanking = { employeeId: string; revenue: number; count: number };

export function employeePerformance(reservations: AnalyticsReservation[]): EmployeeRanking[] {
  const map = new Map<string, EmployeeRanking>();
  for (const r of reservations) {
    if (!isAttended(r)) {
      continue;
    }
    for (const employeeId of r.employeeIds) {
      const entry = map.get(employeeId) ?? { employeeId, revenue: 0, count: 0 };
      entry.revenue += r.revenue;
      entry.count += 1;
      map.set(employeeId, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
}

// ---------------------------------------------------------------------------
// Klienti (loajalita)
// ---------------------------------------------------------------------------

export type ClientRanking = { clientKey: string; name: string; spend: number; visits: number };

export function topClientsBySpend(reservations: AnalyticsReservation[]): ClientRanking[] {
  const map = new Map<string, ClientRanking>();
  for (const r of reservations) {
    if (!isAttended(r) || !r.clientKey) {
      continue;
    }
    const entry = map.get(r.clientKey) ?? {
      clientKey: r.clientKey,
      name: r.clientName,
      spend: 0,
      visits: 0,
    };
    entry.spend += r.revenue;
    entry.visits += 1;
    map.set(r.clientKey, entry);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend || b.visits - a.visits);
}

export type ClientMix = { newClients: number; returningClients: number };

/**
 * Noví vs. vracející se klienti v období. Klient je „vracející se", pokud má
 * jakoukoli rezervaci PŘED začátkem období (v načteném historickém okně),
 * jinak „nový". Bere se identita `clientKey`.
 */
export function computeClientMix(
  periodReservations: AnalyticsReservation[],
  historyBeforePeriod: AnalyticsReservation[],
): ClientMix {
  const seenBefore = new Set(
    historyBeforePeriod.filter((r) => r.clientKey).map((r) => r.clientKey),
  );
  const periodClients = new Set(periodReservations.filter((r) => r.clientKey).map((r) => r.clientKey));
  let newClients = 0;
  let returningClients = 0;
  for (const clientKey of periodClients) {
    if (seenBefore.has(clientKey)) {
      returningClients += 1;
    } else {
      newClients += 1;
    }
  }
  return { newClients, returningClients };
}

// ---------------------------------------------------------------------------
// Formátování
// ---------------------------------------------------------------------------

const czkFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

export function formatCzk(value: number): string {
  return `${czkFormatter.format(Math.round(value))} Kč`;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)} %`;
}
