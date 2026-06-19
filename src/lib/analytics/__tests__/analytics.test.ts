import { describe, expect, it } from 'vitest';

import {
  computeClientMix,
  computeKpis,
  computeStatusBreakdown,
  employeePerformance,
  relativeChange,
  resolvePeriod,
  topClientsBySpend,
  topServicesByRevenue,
  type AnalyticsReservation,
} from '../analytics';

function makeReservation(overrides: Partial<AnalyticsReservation>): AnalyticsReservation {
  return {
    id: Math.random().toString(36).slice(2),
    startsAt: '2026-06-10T08:00:00.000Z',
    status: 'approved',
    attendance: null,
    clientKey: 'tel:+420777111222',
    clientName: 'Jan Novák',
    employeeIds: [],
    services: [],
    revenue: 0,
    ...overrides,
  };
}

describe('analytics — KPI', () => {
  it('tržby a průměr počítá jen z uskutečněných (attended)', () => {
    const reservations = [
      makeReservation({ attendance: 'attended', revenue: 500 }),
      makeReservation({ attendance: 'attended', revenue: 300 }),
      makeReservation({ attendance: 'no_show', revenue: 999 }),
      makeReservation({ status: 'cancelled', revenue: 999 }),
      makeReservation({ attendance: null, revenue: 999 }),
    ];
    const kpis = computeKpis(reservations);
    expect(kpis.revenue).toBe(800);
    expect(kpis.count).toBe(5);
    expect(kpis.avgValue).toBe(400);
    // vyhodnocené = 2 attended + 1 no_show + 1 cancelled = 4; neúspěšné = 2 → 0.5
    expect(kpis.noShowRate).toBeCloseTo(0.5, 5);
  });

  it('relativeChange ošetří dělení nulou', () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2, 5);
    expect(relativeChange(0, 0)).toBe(0);
    expect(relativeChange(10, 0)).toBeNull();
  });
});

describe('analytics — rozpady a žebříčky', () => {
  it('status breakdown rozřadí do disjunktních kategorií', () => {
    const breakdown = computeStatusBreakdown([
      makeReservation({ attendance: 'attended' }),
      makeReservation({ attendance: 'no_show' }),
      makeReservation({ status: 'rejected' }),
      makeReservation({ status: 'cancelled', attendance: 'attended' }), // zrušená má přednost
      makeReservation({ attendance: null }),
    ]);
    expect(breakdown).toEqual({ attended: 1, noShow: 1, cancelled: 2, upcoming: 1 });
  });

  it('nejvýdělečnější služby sčítají cenu jen z uskutečněných', () => {
    const ranking = topServicesByRevenue([
      makeReservation({
        attendance: 'attended',
        services: [
          { serviceId: 's1', name: 'Střih', priceCzk: 400 },
          { serviceId: 's2', name: 'Barva', priceCzk: 600 },
        ],
      }),
      makeReservation({
        attendance: 'attended',
        services: [{ serviceId: 's1', name: 'Střih', priceCzk: 400 }],
      }),
      makeReservation({
        attendance: 'no_show',
        services: [{ serviceId: 's2', name: 'Barva', priceCzk: 600 }],
      }),
    ]);
    expect(ranking[0]).toMatchObject({ serviceId: 's1', revenue: 800, count: 2 });
    expect(ranking.find((r) => r.serviceId === 's2')).toMatchObject({ revenue: 600, count: 1 });
  });

  it('výkonnost zaměstnanců přiřadí tržby všem přiřazeným', () => {
    const ranking = employeePerformance([
      makeReservation({ attendance: 'attended', revenue: 1000, employeeIds: ['e1', 'e2'] }),
      makeReservation({ attendance: 'attended', revenue: 500, employeeIds: ['e1'] }),
    ]);
    expect(ranking.find((r) => r.employeeId === 'e1')).toMatchObject({ revenue: 1500, count: 2 });
    expect(ranking.find((r) => r.employeeId === 'e2')).toMatchObject({ revenue: 1000, count: 1 });
  });

  it('TOP klienti dle útraty z uskutečněných', () => {
    const ranking = topClientsBySpend([
      makeReservation({ attendance: 'attended', clientKey: 'a', clientName: 'A', revenue: 300 }),
      makeReservation({ attendance: 'attended', clientKey: 'a', clientName: 'A', revenue: 200 }),
      makeReservation({ attendance: 'attended', clientKey: 'b', clientName: 'B', revenue: 400 }),
    ]);
    expect(ranking[0]).toMatchObject({ clientKey: 'a', spend: 500, visits: 2 });
    expect(ranking[1]).toMatchObject({ clientKey: 'b', spend: 400, visits: 1 });
  });

  it('noví vs. vracející se dle historie před obdobím', () => {
    const period = [
      makeReservation({ clientKey: 'a' }),
      makeReservation({ clientKey: 'b' }),
    ];
    const history = [makeReservation({ clientKey: 'a' })];
    expect(computeClientMix(period, history)).toEqual({ newClients: 1, returningClients: 1 });
  });
});

describe('analytics — období', () => {
  it('this-month vrací meze měsíce a předchozí měsíc', () => {
    const period = resolvePeriod('this-month', '2026-06-16');
    expect(period.from).toBe('2026-06-01');
    expect(period.to).toBe('2026-06-30');
    expect(period.prevFrom).toBe('2026-05-01');
    expect(period.prevTo).toBe('2026-05-31');
  });

  it('last-7-days vrací posledních 7 dní a předchozích 7', () => {
    const period = resolvePeriod('last-7-days', '2026-06-16');
    expect(period.from).toBe('2026-06-10');
    expect(period.to).toBe('2026-06-16');
    expect(period.prevTo).toBe('2026-06-09');
    expect(period.prevFrom).toBe('2026-06-03');
  });
});
