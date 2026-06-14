import type { SearchResult } from './types';

/** Normalizace pro porovnání bez diakritiky a velikosti písmen. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

type StaticEntry = {
  id: string;
  group: 'settings' | 'faq';
  title: string;
  subtitle?: string;
  href: string;
  /** Klíčová slova pro fulltext (vč. synonym). */
  keywords: string[];
};

/**
 * Statický index — položky nastavení a FAQ. Rozšiřitelné přidáním záznamu.
 * (Dynamičtí klienti se hledají zvlášť přes server action.)
 */
const STATIC_ENTRIES: StaticEntry[] = [
  {
    id: 'settings-profile',
    group: 'settings',
    title: 'Nastavení profilu',
    subtitle: 'Název, popis, kontakt a adresa podniku',
    href: '/dashboard/settings',
    keywords: ['nastaveni', 'profil', 'podnik', 'nazev', 'popis', 'adresa', 'kontakt', 'logo'],
  },
  {
    id: 'settings-hours',
    group: 'settings',
    title: 'Otevírací doba',
    subtitle: 'Úprava otevíracích hodin',
    href: '/dashboard/opening-hours',
    keywords: ['otviraci doba', 'hodiny', 'cas', 'open', 'zavreno', 'otevreno'],
  },
  {
    id: 'settings-services',
    group: 'settings',
    title: 'Služby',
    subtitle: 'Ceník a délka služeb',
    href: '/dashboard/services',
    keywords: ['sluzby', 'cenik', 'cena', 'delka', 'service'],
  },
  {
    id: 'settings-subscription',
    group: 'settings',
    title: 'Předplatné',
    subtitle: 'Tarif, platby a faktury',
    href: '/dashboard/subscription',
    keywords: ['predplatne', 'tarif', 'platba', 'faktura', 'subscription', 'balicek'],
  },
  {
    id: 'settings-plans',
    group: 'settings',
    title: 'Tarify a funkce',
    subtitle: 'Porovnání balíčků Start / Pokročilý / Max',
    href: '/dashboard/plans',
    keywords: ['tarify', 'balicky', 'plany', 'funkce', 'porovnani', 'upgrade', 'start', 'pokrocily', 'max'],
  },
  {
    id: 'settings-reservations',
    group: 'settings',
    title: 'Rezervace',
    subtitle: 'Správa rezervací',
    href: '/dashboard/reservations',
    keywords: ['rezervace', 'kalendar', 'terminy', 'booking'],
  },
  {
    id: 'faq-reservation-approval',
    group: 'faq',
    title: 'Jak schvalovat rezervace?',
    subtitle: 'Nápověda · rezervace',
    href: '/dashboard/faq',
    keywords: ['schvalovani', 'rezervace', 'potvrdit', 'approve', 'napoveda', 'faq'],
  },
  {
    id: 'faq-publish-profile',
    group: 'faq',
    title: 'Jak zveřejnit veřejný profil?',
    subtitle: 'Nápověda · profil',
    href: '/dashboard/faq',
    keywords: ['zverejnit', 'publikovat', 'profil', 'verejny', 'napoveda', 'faq'],
  },
  {
    id: 'faq-payments',
    group: 'faq',
    title: 'Jak fungují platby a předplatné?',
    subtitle: 'Nápověda · platby',
    href: '/dashboard/faq',
    keywords: ['platby', 'predplatne', 'faktura', 'gopay', 'napoveda', 'faq'],
  },
  {
    id: 'faq-all',
    group: 'faq',
    title: 'Zobrazit všechny časté dotazy',
    subtitle: 'Nápověda',
    href: '/dashboard/faq',
    keywords: ['napoveda', 'faq', 'help', 'pomoc', 'caste dotazy', 'otazky'],
  },
];

/** Prohledá statický index (nastavení + FAQ). Vrací max `limit` výsledků. */
export function searchStaticIndex(query: string, limit = 6): SearchResult[] {
  const q = normalizeSearch(query);
  if (!q) {
    return [];
  }

  return STATIC_ENTRIES.filter((entry) => {
    const haystack = normalizeSearch(
      `${entry.title} ${entry.subtitle ?? ''} ${entry.keywords.join(' ')}`,
    );
    return haystack.includes(q);
  })
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      group: entry.group,
      title: entry.title,
      subtitle: entry.subtitle,
      href: entry.href,
    }));
}
