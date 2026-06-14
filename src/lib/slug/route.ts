import { RESERVED_SLUGS } from './reserved';

/**
 * Lehký helper pro veřejnou routu `/[slug]`.
 *
 * Na rozdíl od {@link normalizeSlug} z `./normalize` (které provádí PLNOU
 * kanonikalizaci vstupu z onboardingu — strhává diakritiku, převádí whitespace
 * na pomlčky, validuje délku a znakovou sadu a vrací diskriminovaný union),
 * tento modul slouží jen k POROVNÁNÍ slugu z URL s hodnotou už uloženou v DB.
 *
 * Slugy jsou v `businesses.slug` uložené už v normalizovaném tvaru
 * (lowercase ASCII bez diakritiky — viz `auth-onboarding`), takže pro routovací
 * rozhodnutí stačí pouhé `trim()` + `toLowerCase()`. ŽÁDNÉ strhávání diakritiky
 * se zde nedělá — DB slug je už ASCII, takže by bylo zbytečné a mohlo by
 * naopak rozbít porovnání.
 */

/**
 * Převede slug z URL na tvar vhodný k porovnání s už-normalizovaným DB slugem.
 *
 * Pouze ořízne whitespace a převede na malá písmena. Důsledek: `/Kavarna`,
 * `/KAVARNA` i `/kavarna` se mapují na stejný business (R3.2).
 */
export function normalizeRouteSlug(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Vrátí `true`, pokud slug (po {@link normalizeRouteSlug}) patří mezi
 * systémem rezervované řetězce. Rezervovaný slug musí vést na 404, aby kolize
 * se systémovými routami nebyly maskovány profilem podniku (R3.2).
 */
export function isReservedSlug(slug: string): boolean {
  const normalized = normalizeRouteSlug(slug);
  return RESERVED_SLUGS.includes(normalized as (typeof RESERVED_SLUGS)[number]);
}
