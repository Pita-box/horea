import { describe, expect, it } from 'vitest';

import {
  addMonths,
  buildMonthGrid,
  buildSmoothPath,
  computeDailyOccupancy,
  occupancyDotColor,
  openMinutesByWeekday,
  pragueWeekdayIndex,
} from '../occupancy';

describe('addMonths', () => {
  it('posune měsíc a normalizuje na první den', () => {
    expect(addMonths('2025-06-15', 1)).toBe('2025-07-01');
    expect(addMonths('2025-06-15', -1)).toBe('2025-05-01');
  });

  it('zvládne přechod roku', () => {
    expect(addMonths('2025-12-10', 1)).toBe('2026-01-01');
    expect(addMonths('2025-01-10', -1)).toBe('2024-12-01');
  });
});

describe('pragueWeekdayIndex (Po-first)', () => {
  it('pondělí = 0, neděle = 6', () => {
    expect(pragueWeekdayIndex('2025-06-02')).toBe(0); // pondělí
    expect(pragueWeekdayIndex('2025-06-01')).toBe(6); // neděle
  });
});

describe('buildMonthGrid', () => {
  it('sestaví mřížku 6×7 s daty měsíce a sousedními kotvami', () => {
    const grid = buildMonthGrid('2025-06-10');

    expect(grid.anchor).toBe('2025-06-01');
    expect(grid.title.toLowerCase()).toContain('červen');
    expect(grid.title).toContain('2025');
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);

    expect(grid.monthDates).toHaveLength(30);
    expect(grid.monthDates[0]).toBe('2025-06-01');
    expect(grid.monthDates[29]).toBe('2025-06-30');

    // 1. 6. 2025 je neděle → v Po-first mřížce poslední buňka prvního týdne.
    expect(grid.weeks[0][6]).toMatchObject({ dateISO: '2025-06-01', inMonth: true });
    expect(grid.weeks[0][0].inMonth).toBe(false); // přesah z května

    expect(grid.prevAnchor).toBe('2025-05-01');
    expect(grid.nextAnchor).toBe('2025-07-01');
    expect(grid.weekdayLabels[0]).toBe('Po');
  });
});

describe('openMinutesByWeekday', () => {
  it('spočítá otevřené minuty a zavřené dny nechá na 0', () => {
    const result = openMinutesByWeekday([
      { day_of_week: 0, opens_at: '09:00:00', closes_at: '17:00:00' },
      { day_of_week: 2, opens_at: '08:30:00', closes_at: '12:00:00' },
    ]);

    expect(result[0]).toBe(480); // 8 h
    expect(result[2]).toBe(210); // 3,5 h
    expect(result[1]).toBe(0); // zavřeno
    expect(result).toHaveLength(7);
  });
});

describe('computeDailyOccupancy', () => {
  it('počítá obsazenost z aktivních rezervací ku otevírací době', () => {
    // Pondělí 2. 6. 2025, otevřeno 8 h (480 min).
    const openMinutes = openMinutesByWeekday([
      { day_of_week: 0, opens_at: '09:00:00', closes_at: '17:00:00' },
    ]);

    const points = computeDailyOccupancy(
      ['2025-06-02'],
      [
        // 60 min approved (10:00–11:00 Prague)
        { startsAt: '2025-06-02T08:00:00Z', endsAt: '2025-06-02T09:00:00Z', status: 'approved' },
        // 30 min pending
        { startsAt: '2025-06-02T11:00:00Z', endsAt: '2025-06-02T11:30:00Z', status: 'pending' },
        // cancelled se nepočítá
        { startsAt: '2025-06-02T12:00:00Z', endsAt: '2025-06-02T14:00:00Z', status: 'cancelled' },
      ],
      openMinutes,
    );

    expect(points).toHaveLength(1);
    expect(points[0].dateISO).toBe('2025-06-02');
    expect(points[0].reservationCount).toBe(2); // jen aktivní
    expect(points[0].occupancyPct).toBe(19); // round(90/480*100)
    expect(points[0].closed).toBe(false);
  });

  it('zavřený den je closed a obsazenost 0', () => {
    const points = computeDailyOccupancy(['2025-06-03'], [], openMinutesByWeekday([]));
    expect(points[0]).toMatchObject({ occupancyPct: 0, closed: true, reservationCount: 0 });
  });

  it('obsazenost je capnutá na 100 %', () => {
    const openMinutes = openMinutesByWeekday([
      { day_of_week: 0, opens_at: '09:00:00', closes_at: '10:00:00' }, // 60 min
    ]);
    const points = computeDailyOccupancy(
      ['2025-06-02'],
      [{ startsAt: '2025-06-02T08:00:00Z', endsAt: '2025-06-02T11:00:00Z', status: 'approved' }],
      openMinutes,
    );
    expect(points[0].occupancyPct).toBe(100);
  });
});

describe('occupancyDotColor', () => {
  it('volí barvu tečky podle obsazenosti (zelená/oranžová/červená)', () => {
    expect(occupancyDotColor(0)).toBe('#16a34a'); // volno → zelená
    expect(occupancyDotColor(39)).toBe('#16a34a');
    expect(occupancyDotColor(40)).toBe('#f59e0b'); // střední → oranžová
    expect(occupancyDotColor(79)).toBe('#f59e0b');
    expect(occupancyDotColor(80)).toBe('#e7000b'); // plno → červená
    expect(occupancyDotColor(100)).toBe('#e7000b');
  });
});

describe('buildSmoothPath', () => {
  it('vytvoří hladkou křivku i výplň pro více bodů', () => {
    const { line, area, points } = buildSmoothPath([0, 50, 100], { width: 300, height: 100 });
    expect(points).toHaveLength(3);
    expect(line.startsWith('M')).toBe(true);
    expect(line).toContain('C'); // kubické bézier segmenty
    expect(area.trimEnd().endsWith('Z')).toBe(true);
  });

  it('zvládne prázdný i jednobodový vstup', () => {
    expect(buildSmoothPath([], { width: 100, height: 100 })).toMatchObject({ line: '', area: '' });
    const single = buildSmoothPath([42], { width: 100, height: 100 });
    expect(single.points).toHaveLength(1);
    expect(single.line.startsWith('M')).toBe(true);
  });
});
