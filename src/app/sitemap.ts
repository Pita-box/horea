import type { MetadataRoute } from 'next';

import { createPublicClient } from '@/lib/supabase/public';

/**
 * Dynamická sitemap publikovaných podniků (`/sitemap.xml`, R13).
 *
 * Revalidace po hodině (R13 / design „ISR strategie"): publikované podniky
 * přibývají i ubývají zřídka a vyhledávače sitemap čtou v řádu hodin až dnů —
 * agresivnější TTL by jen plýtvalo invokacemi.
 */
export const revalidate = 3600;

/** Kanonická produkční doména (shodná s `app/robots.ts` a SEO metadaty). */
const SITE_URL = 'https://www.horea.cz';

type BusinessRow = {
  slug: string;
  updated_at: string;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // RLS garance (ověřeno v migracích 0008 → 0013): migrace 0013 přepsala anon
  // SELECT policy `public_read_published` z pouhého `is_published = true` na
  // `using (public.is_business_published(id))`. Funkce `is_business_published`
  // vrací true jen pro Published_Business (is_published = true A subscription
  // se status IN ('active','grace_period')). Anon klíč proto v tabulce
  // `businesses` VIDÍ POUZE Published_Business řádky — bez nutnosti vlastního
  // filtru či joinu na subscriptions (na subscriptions anon žádný grant nemá).
  // Tím sitemap automaticky obsahuje právě publikované podniky (R13.2) a žádné
  // nepublikované ani systémové cesty (R13.3 — generujeme jen z `businesses`).
  try {
    const supabase = createPublicClient();

    const { data, error } = await supabase
      .from('businesses')
      .select('slug, updated_at')
      .order('updated_at', { ascending: false })
      .returns<BusinessRow[]>();

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      url: `${SITE_URL}/${row.slug}`,
      // `Date` Next.js serializuje do `<lastmod>` v ISO 8601 (R13.4).
      lastModified: new Date(row.updated_at),
    }));
  } catch {
    // Degradace na prázdnou sitemap při výpadku/chybě konfigurace — sitemap
    // nesmí shodit build ani request.
    return [];
  }
}
