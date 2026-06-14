import type { PublicProfileOpeningHours } from './PublicProfileRenderer';

/**
 * Server component vkládající structured data `LocalBusiness` (schema.org) jako
 * inline `<script type="application/ld+json">` (R12.3, R12.4).
 *
 * Renderuje se POUZE pro publikovaný profil — volá ji routa `/[slug]` (úkol 3.2)
 * jen v publikovaném stavu. Nepublikovaný profil ani 404 JSON-LD nemají.
 */

/** Kanonická produkční doména platformy (shodná s `app/robots.ts` a `app/sitemap.ts`). */
const SITE_URL = 'https://www.horea.cz';

/**
 * Mapování indexu dne v týdnu (0 = Pondělí … 6 = Neděle, pořadí tabulky
 * `opening_hours`) na názvy dnů dle schema.org.
 */
const SCHEMA_DAY_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type JsonLdLocalBusinessProps = {
  slug: string;
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  contactEmail?: string | null;
  openingHours: PublicProfileOpeningHours[];
};

/** Postgres `time` vrací „HH:MM:SS"; schema.org `opens`/`closes` chce „HH:mm". */
function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

export function JsonLdLocalBusiness({
  slug,
  name,
  logoUrl,
  address,
  phone,
  contactEmail,
  openingHours,
}: JsonLdLocalBusinessProps) {
  // openingHoursSpecification jen z dní, které mají řádek (otevřené dny).
  // Zavřené dny (chybějící řádek) se do specifikace nevkládají. Řadíme dle dne
  // pro deterministický výstup.
  const openingHoursSpecification = openingHours
    .filter((row) => row.dayOfWeek >= 0 && row.dayOfWeek <= 6)
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((row) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAY_OF_WEEK[row.dayOfWeek],
      opens: toHourMinute(row.opensAt),
      closes: toHourMinute(row.closesAt),
    }));

  // Volitelná pole vkládáme jen když jsou vyplněná (R12.3).
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name,
    url: `${SITE_URL}/${slug}`,
  };

  if (logoUrl) {
    data.image = logoUrl;
  }
  if (address) {
    data.address = address;
  }
  if (phone) {
    data.telephone = phone;
  }
  if (contactEmail) {
    data.email = contactEmail;
  }
  if (openingHoursSpecification.length > 0) {
    data.openingHoursSpecification = openingHoursSpecification;
  }

  // Bezpečná serializace: nahradíme „<" za „\u003c", aby do <script> nešlo
  // propašovat `</script>` ani jiný HTML markup (XSS přes JSON-LD).
  const json = JSON.stringify(data).replaceAll('<', '\\u003c');

  return (
    <script
      type="application/ld+json"
      // JSON-LD musí být ve <script> jako raw JSON; dangerouslySetInnerHTML je
      // zde standardní a bezpečný vzor, protože `<` je už zneškodněno výše.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
