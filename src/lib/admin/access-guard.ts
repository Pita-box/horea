/**
 * Access_Guard — čistá rozhodovací logika řízení přístupu k cestám pod `/admin`
 * (feature `admin-dashboard`, Requirement 1, Property 1).
 *
 * Tento modul je záměrně **bez závislostí** na Next.js, Supabase či HTTP — je to
 * čistá funkce nad vyhodnoceným stavem požadavku (autentizace + role). Middleware
 * (`src/middleware.ts`) slouží jako tenký adaptér: zjistí session a `users.is_admin`,
 * zavolá {@link decideAdminGuard} a výsledek přeloží na HTTP odpověď (povolení,
 * redirect na login, nebo 403). Díky tomu je rozhodnutí plně testovatelné izolovaně.
 *
 * Tři výsledky se vzájemně vylučují a pokrývají všechny případy (R1.1–R1.3):
 *  - admin (autentizovaný + `is_admin`)        → `allow`
 *  - neautentizovaný                            → `redirect-login`
 *  - autentizovaný ne-admin                     → `forbidden` (HTTP 403)
 *
 * V žádné jiné než `allow` větvi se nesmí odeslat obsah Admin_Dashboard.
 */

/** Česká hláška zobrazená autentizovanému uživateli bez admin role (R1.3). */
export const ADMIN_FORBIDDEN_MESSAGE = 'Nemáte oprávnění k přístupu do administrace.';

/** Vyhodnocený stav požadavku potřebný pro rozhodnutí Access_Guard. */
export type AdminGuardState = {
  /** Má požadavek platnou přihlášenou session? */
  isAuthenticated: boolean;
  /** Má přihlášený uživatel `users.is_admin = true`? */
  isAdmin: boolean;
};

/** Rozhodnutí Access_Guard pro cestu pod `/admin`. */
export type AdminGuardDecision =
  | { kind: 'allow' }
  | { kind: 'redirect-login' }
  | { kind: 'forbidden'; message: string };

/**
 * Vrací `true`, pokud cesta spadá pod admin dashboard (`/admin` nebo `/admin/*`).
 * Záměrně nepovažuje za admin cestu prefixy typu `/administrace` (vyžaduje přesnou
 * shodu segmentu).
 */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Rozhodne o přístupu k cestě pod `/admin` na základě autentizace a role.
 *
 * @param state Vyhodnocený stav požadavku (autentizace + admin role).
 * @returns Vzájemně se vylučující rozhodnutí: `allow` jen pro autentizovaného admina;
 *          `redirect-login` pro neautentizovaného; `forbidden` (403) pro ne-admina.
 */
export function decideAdminGuard(state: AdminGuardState): AdminGuardDecision {
  if (!state.isAuthenticated) {
    return { kind: 'redirect-login' };
  }

  if (!state.isAdmin) {
    return { kind: 'forbidden', message: ADMIN_FORBIDDEN_MESSAGE };
  }

  return { kind: 'allow' };
}
