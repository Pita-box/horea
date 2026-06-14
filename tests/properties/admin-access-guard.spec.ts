import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  ADMIN_FORBIDDEN_MESSAGE,
  decideAdminGuard,
  isAdminPath,
  type AdminGuardState,
} from '@/lib/admin/access-guard';

/**
 * Feature: admin-dashboard, Property 1: Řízení přístupu — ne-admin nikdy nedostane
 * data dashboardu.
 *
 * `decideAdminGuard(state)` je čistá rozhodovací logika Access_Guard nad
 * vyhodnoceným stavem požadavku (autentizace × admin role). Pro libovolný profil
 * uživatele a libovolnou cestu pod `/admin` (klasifikovanou `isAdminPath`) platí:
 *
 *  - výsledek `allow` (obsah dashboardu) nastane **právě tehdy**, je-li uživatel
 *    autentizovaný admin (`isAuthenticated && isAdmin`),
 *  - neautentizovaný → `redirect-login` (přesměrování na login, žádný obsah),
 *  - autentizovaný ne-admin → `forbidden` s českou hláškou (HTTP 403, žádný obsah),
 *  - tři výsledky se **vzájemně vylučují** a pokrývají všechny případy.
 *
 * Generátor cíleně varíruje obě dimenze stavu (autentizace × role) a paletu cest
 * — admin cesty (`/admin`, `/admin/...`) i pseudo-admin cesty (`/adminx`,
 * `/administrace`), aby ověřil i přesnou klasifikaci segmentu.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */

const NUM_RUNS = 200;

/** Profil uživatele: obě dimenze stavu nezávisle (4 kombinace). */
const stateArb: fc.Arbitrary<AdminGuardState> = fc.record({
  isAuthenticated: fc.boolean(),
  isAdmin: fc.boolean(),
});

/** Segmenty, ze kterých se skládá cesta pod `/admin/...`. */
const ADMIN_SUBSEGMENTS = ['businesses', 'coupons', 'audit', 'payments', '123', 'a-b_c'] as const;

/** Generátor cest, které SPADAJÍ pod admin dashboard (`/admin` nebo `/admin/*`). */
const adminPathArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('/admin'),
  fc
    .array(fc.constantFrom(...ADMIN_SUBSEGMENTS), { minLength: 1, maxLength: 3 })
    .map((segments) => `/admin/${segments.join('/')}`),
);

/** Generátor cest, které NESPADAJÍ pod admin dashboard (pozor na `/adminx`). */
const nonAdminPathArb: fc.Arbitrary<string> = fc.constantFrom(
  '/',
  '/dashboard',
  '/login',
  '/adminx',
  '/administrace',
  '/admin-tools',
  '/public/admin',
);

describe('Property 1: řízení přístupu — ne-admin nikdy nedostane data dashboardu', () => {
  it('allow ⟺ autentizovaný admin; jinak redirect-login / forbidden bez obsahu', () => {
    fc.assert(
      fc.property(stateArb, adminPathArb, (state, pathname) => {
        // Předpoklad scénáře: cesta opravdu spadá pod admin dashboard.
        expect(isAdminPath(pathname)).toBe(true);

        const decision = decideAdminGuard(state);
        const expectAllow = state.isAuthenticated && state.isAdmin;

        // Hlavní invariant (iff): obsah dashboardu jen pro autentizovaného admina (R1.1).
        expect(decision.kind === 'allow').toBe(expectAllow);

        if (expectAllow) {
          expect(decision.kind).toBe('allow');
        } else if (!state.isAuthenticated) {
          // Neautentizovaný → redirect na login, žádný obsah (R1.2).
          expect(decision.kind).toBe('redirect-login');
        } else {
          // Autentizovaný ne-admin → 403 s českou hláškou, žádný obsah (R1.3).
          expect(decision.kind).toBe('forbidden');
          if (decision.kind === 'forbidden') {
            expect(decision.message).toBe(ADMIN_FORBIDDEN_MESSAGE);
          }
        }

        // Tři výsledky se vzájemně vylučují a pokrývají všechny případy.
        const kinds: ReadonlyArray<typeof decision.kind> = [
          'allow',
          'redirect-login',
          'forbidden',
        ];
        expect(kinds).toContain(decision.kind);
        // V žádné jiné než `allow` větvi se neodešle obsah dashboardu.
        if (decision.kind !== 'allow') {
          expect(expectAllow).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('isAdminPath klasifikuje segment přesně (admin vs. pseudo-admin cesty)', () => {
    fc.assert(
      fc.property(adminPathArb, nonAdminPathArb, (adminPath, nonAdminPath) => {
        expect(isAdminPath(adminPath)).toBe(true);
        expect(isAdminPath(nonAdminPath)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
