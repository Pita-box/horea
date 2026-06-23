import { describe, expect, it } from 'vitest';

import { defaultPlanFeatureMatrix, type PlanFeatureMatrix } from '@/lib/plans/feature-matrix';
import { decideRouteFeatureGate, routeFeatureFor } from '@/lib/plans/route-feature-gate';

function matrixWith(disabled: { plan: 'start' | 'pokrocily' | 'max'; key: string }[]): PlanFeatureMatrix {
  const matrix = defaultPlanFeatureMatrix();
  for (const { plan, key } of disabled) {
    (matrix[plan] as Record<string, boolean>)[key] = false;
  }
  return matrix;
}

describe('routeFeatureFor', () => {
  it('mapuje gateované routy na feature klíče', () => {
    expect(routeFeatureFor('/dashboard/reservations')).toBe('reservation_management');
    expect(routeFeatureFor('/dashboard/reservations/123')).toBe('reservation_management');
    expect(routeFeatureFor('/dashboard/clients')).toBe('clients');
    expect(routeFeatureFor('/dashboard/services')).toBe('services');
    expect(routeFeatureFor('/dashboard/opening-hours')).toBe('opening_hours');
    expect(routeFeatureFor('/dashboard/analytics')).toBe('analytics');
  });

  it('negateované routy → null', () => {
    expect(routeFeatureFor('/dashboard')).toBeNull();
    expect(routeFeatureFor('/dashboard/account')).toBeNull();
    expect(routeFeatureFor('/dashboard/plans')).toBeNull();
    expect(routeFeatureFor('/dashboard/reservationsX')).toBeNull();
  });
});

describe('decideRouteFeatureGate', () => {
  const full = defaultPlanFeatureMatrix();

  it('plan null (free) → continue (entitlementy se neaplikují)', () => {
    expect(decideRouteFeatureGate('/dashboard/services', null, full)).toEqual({ kind: 'continue' });
  });

  it('negateovaná routa → continue', () => {
    expect(decideRouteFeatureGate('/dashboard/account', 'start', full)).toEqual({
      kind: 'continue',
    });
  });

  it('tarif má funkci povolenou → continue', () => {
    expect(decideRouteFeatureGate('/dashboard/services', 'start', full)).toEqual({
      kind: 'continue',
    });
  });

  it('tarif má funkci vypnutou → redirect na ceník s locked', () => {
    const matrix = matrixWith([{ plan: 'start', key: 'services' }]);
    expect(decideRouteFeatureGate('/dashboard/services', 'start', matrix)).toEqual({
      kind: 'redirect',
      pathname: '/dashboard/plans',
      search: 'locked=services',
    });
  });

  it('vypnutí se týká jen daného tarifu', () => {
    const matrix = matrixWith([{ plan: 'start', key: 'clients' }]);
    expect(decideRouteFeatureGate('/dashboard/clients', 'start', matrix)).toEqual({
      kind: 'redirect',
      pathname: '/dashboard/plans',
      search: 'locked=clients',
    });
    expect(decideRouteFeatureGate('/dashboard/clients', 'max', matrix)).toEqual({
      kind: 'continue',
    });
  });

  it('gateuje i podcesty (detail rezervace)', () => {
    const matrix = matrixWith([{ plan: 'start', key: 'reservation_management' }]);
    expect(decideRouteFeatureGate('/dashboard/reservations/abc', 'start', matrix)).toEqual({
      kind: 'redirect',
      pathname: '/dashboard/plans',
      search: 'locked=reservation_management',
    });
  });
});
