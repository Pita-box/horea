import type { MetadataRoute } from 'next';

/**
 * Kanonická produkční doména platformy. Stejnou hodnotu používá i `app/sitemap.ts`
 * (úkol 4.3) a SEO metadata — robots.txt musí pro vyhledávače odkazovat na
 * absolutní produkční URL, proto zde záměrně nepoužíváme `NEXT_PUBLIC_SITE_URL`
 * (ta má v auth tocích localhost fallback, který by do robots.txt nepatřil).
 */
const PRODUCTION_BASE_URL = 'https://www.horea.cz';

/**
 * Next.js robots konvence (`app/robots.ts`).
 *
 * Povolí indexaci celého webu a odkáže na dynamickou sitemapu publikovaných
 * podniků (`/sitemap.xml`). Jednotlivé nepublikované / 404 stránky se z indexace
 * vylučují přes `<meta name="robots" content="noindex">` na úrovni stránky
 * (viz Requirement 2.3, 3.3), ne zde.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${PRODUCTION_BASE_URL}/sitemap.xml`,
  };
}
