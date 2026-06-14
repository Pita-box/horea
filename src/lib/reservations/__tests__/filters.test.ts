import { describe, expect, it } from 'vitest';

import {
  buildReservationQuery,
  buildReservationSearchParams,
  parseReservationFilters,
  RESERVATIONS_PAGE_SIZE,
  type ReservationFilters,
} from '../filters';

// Pokrývá parsování a serializaci filtrů seznamu rezervací (R3.1–R3.6).
describe('parseReservationFilters', () => {
  it('vrací prázdné filtry a stránku 1 pro prázdný vstup (R2.1)', () => {
    expect(parseReservationFilters({})).toEqual({
      statuses: [],
      serviceIds: [],
      from: null,
      to: null,
      page: 1,
    });
  });

  it('parsuje stavy z čárkou odděleného řetězce a zachová kanonické pořadí (R3.1)', () => {
    const filters = parseReservationFilters({ status: 'cancelled,pending' });
    expect(filters.statuses).toEqual(['pending', 'cancelled']);
  });

  it('parsuje stavy z opakovaného parametru (pole) a ignoruje neznámé hodnoty', () => {
    const filters = parseReservationFilters({ status: ['approved', 'bogus', 'rejected'] });
    expect(filters.statuses).toEqual(['approved', 'rejected']);
  });

  it('odstraní duplicitní služby (R3.4)', () => {
    const filters = parseReservationFilters({ service: 's1,s1,s2' });
    expect(filters.serviceIds).toEqual(['s1', 's2']);
  });

  it('akceptuje jen validní formát data YYYY-MM-DD (R3.2)', () => {
    expect(parseReservationFilters({ from: '2024-07-15', to: 'nope' })).toMatchObject({
      from: '2024-07-15',
      to: null,
    });
  });

  it('normalizuje neplatnou nebo zápornou stránku na 1', () => {
    expect(parseReservationFilters({ page: '0' }).page).toBe(1);
    expect(parseReservationFilters({ page: '-3' }).page).toBe(1);
    expect(parseReservationFilters({ page: 'x' }).page).toBe(1);
    expect(parseReservationFilters({ page: '4' }).page).toBe(4);
  });
});

describe('buildReservationSearchParams', () => {
  const base: ReservationFilters = {
    statuses: [],
    serviceIds: [],
    from: null,
    to: null,
    page: 1,
  };

  it('vynechá prázdné filtry a stránku 1', () => {
    expect(buildReservationSearchParams(base).toString()).toBe('');
    expect(buildReservationQuery(base)).toBe('');
  });

  it('serializuje aktivní filtry a stránku > 1', () => {
    const params = buildReservationSearchParams({
      statuses: ['pending', 'approved'],
      serviceIds: ['s1', 's2'],
      from: '2024-07-01',
      to: '2024-07-31',
      page: 3,
    });

    expect(params.get('status')).toBe('pending,approved');
    expect(params.get('service')).toBe('s1,s2');
    expect(params.get('from')).toBe('2024-07-01');
    expect(params.get('to')).toBe('2024-07-31');
    expect(params.get('page')).toBe('3');
  });

  it('round-trip: parse(build(filters)) zachová filtry', () => {
    const filters: ReservationFilters = {
      statuses: ['pending', 'rejected'],
      serviceIds: ['svc-a'],
      from: '2024-01-01',
      to: '2024-12-31',
      page: 2,
    };

    const query = Object.fromEntries(buildReservationSearchParams(filters));
    expect(parseReservationFilters(query)).toEqual(filters);
  });

  it('velikost stránky je 100 (R2.7)', () => {
    expect(RESERVATIONS_PAGE_SIZE).toBe(100);
  });
});
