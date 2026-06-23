import type { SubscriptionPlan } from '@/lib/checkout/pricing';
import type { BusinessFeatureKey } from '@/lib/plans/features';
import { planHasFeature, type PlanFeatureMatrix } from '@/lib/plans/feature-matrix';

/**
 * Mapování dashboard rout na entitlement (`plan_features`). Pokud má podnik
 * placený tarif, který danou funkci NEMÁ povolenou, middleware ho z routy
 * přesměruje na ceník (`/dashboard/plans?locked=<feature>`) — stejný vzor jako
 * status-gate pro free účty.
 *
 * Týká se jen routovatelných funkcí. Behaviorální/systémové funkce
 * (online_reservations, auto_approve, parallel_slots, email_notifications,
 * invoices) se vynucují ve své vlastní logice, ne přes routu.
 */
const ROUTE_FEATURES: ReadonlyArray<{ base: string; feature: BusinessFeatureKey }> = [
  { base: '/dashboard/reservations', feature: 'reservation_management' },
  { base: '/dashboard/clients', feature: 'clients' },
  { base: '/dashboard/services', feature: 'services' },
  { base: '/dashboard/opening-hours', feature: 'opening_hours' },
  { base: '/dashboard/analytics', feature: 'analytics' },
];

function isPathOrSubpath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Entitlement vyžadovaný danou routou, nebo `null` pokud routa není gateovaná. */
export function routeFeatureFor(pathname: string): BusinessFeatureKey | null {
  for (const { base, feature } of ROUTE_FEATURES) {
    if (isPathOrSubpath(pathname, base)) {
      return feature;
    }
  }
  return null;
}

export type RouteFeatureGateDecision =
  | { kind: 'continue' }
  | { kind: 'redirect'; pathname: '/dashboard/plans'; search: string };

/**
 * Rozhodne, zda na dané routě podnik s daným tarifem narazí na uzamčenou funkci.
 *
 * - `plan === null` (free / bez tarifu): entitlementy `plan_features` se neaplikují
 *   (free se řídí stavovým gatem); → `continue`.
 * - routa není gateovaná → `continue`.
 * - tarif funkci má → `continue`; nemá → redirect na ceník s `locked=<feature>`.
 */
export function decideRouteFeatureGate(
  pathname: string,
  plan: SubscriptionPlan | null,
  matrix: PlanFeatureMatrix,
): RouteFeatureGateDecision {
  if (plan === null) {
    return { kind: 'continue' };
  }

  const feature = routeFeatureFor(pathname);
  if (feature === null) {
    return { kind: 'continue' };
  }

  if (planHasFeature(matrix, plan, feature)) {
    return { kind: 'continue' };
  }

  return { kind: 'redirect', pathname: '/dashboard/plans', search: `locked=${feature}` };
}
