// Čistá allowlist logika pro cílenou revalidaci cache (bez I/O, deterministické).
// Tento modul je přímo pokrytý property-based testem (úkol 3.2).
// Záměrně neobsahuje žádné `server-only`, `revalidatePath`/`revalidateTag` ani jiné I/O.

/** Cíl revalidace cache — buď konkrétní cesta, nebo cache tag (R10.5, R10.6). */
export type RevalidateTarget =
  | { kind: 'path'; value: string }
  | { kind: 'tag'; value: string };

/** Předem definovaný allowlist povolených cest k revalidaci (R10.5). */
export const ALLOWED_PATHS: readonly string[] = [
  '/[slug]', // veřejný profil podniku
  '/dashboard',
  '/admin',
];

/** Předem definovaný allowlist povolených cache tagů (R10.5). Prázdné = žádný tag povolen. */
export const ALLOWED_TAGS: readonly string[] = [];

/**
 * Vrací `true` právě tehdy, když cíl patří do příslušného allowlistu
 * (cesta v `ALLOWED_PATHS`, tag v `ALLOWED_TAGS`); jinak `false` (R10.5, R10.6).
 */
export function isAllowedTarget(target: RevalidateTarget): boolean {
  if (target.kind === 'path') {
    return ALLOWED_PATHS.includes(target.value);
  }
  return ALLOWED_TAGS.includes(target.value);
}
