import { normalizeSearch } from './static-index';
import type { SearchResult } from './types';

/**
 * Index_Obsahu — deklarativní registr sekcí stránek dashboardu majitele.
 *
 * Jediný zdroj pravdy pro skupinu `sections`. Prohledává se lokálně v prohlížeči
 * (bez sítě, R13.1). Každá sekce má stabilní `anchor`, který v tasku 5.x dostane
 * odpovídající `id` na cílové stránce (R5.2/R5.3). `anchor` je v rámci jedné cesty
 * jednoznačný (R5.1, Property 7).
 */

/** Jedna sekce stránky dashboardu — Záznam_Sekce (R1.1, R5). */
export type SectionRecord = {
  /** Stabilní anchor id, jednoznačné v rámci jedné cesty (R5.1). */
  anchor: string;
  /** Text nadpisu sekce (povinný). */
  title: string;
  /** Text popisu sekce (volitelný, R1.3). */
  description?: string;
};

/** Registr klíčovaný cestou cílové stránky dashboardu majitele (R1.1). */
export type ContentIndex = Record<string, SectionRecord[]>;

/**
 * Lidský název stránky — fallback pro `subtitle`, když sekce nemá popis.
 * Odvozeno z titulků topbaru v `DashboardChrome`.
 */
const PAGE_LABELS: Record<string, string> = {
  '/dashboard/settings': 'Nastavení',
  '/dashboard/services': 'Služby',
  '/dashboard/reservations': 'Rezervace',
  '/dashboard/clients': 'Klienti',
  '/dashboard/opening-hours': 'Otevírací doba',
  '/dashboard/subscription': 'Předplatné',
  '/dashboard/plans': 'Tarify a funkce',
  '/dashboard/analytics': 'Analytika',
  '/dashboard/employees': 'Zaměstnanci',
  '/dashboard/faq': 'Nápověda',
  '/dashboard/account': 'Nastavení účtu',
};

/**
 * Registr sekcí. Nadpisy a popisy odpovídají skutečnému renderu stránek
 * (a jejich sekčních komponent), aby se kotvy daly v tasku 5.x snadno přiřadit
 * na existující nadpisy/karty.
 */
export const CONTENT_INDEX: ContentIndex = {
  '/dashboard/settings': [
    {
      anchor: 'o-nas-a-kontakt',
      title: 'O nás a kontakt',
      description: 'Údaje o podniku zobrazené na veřejném profilu.',
    },
    {
      anchor: 'vzhled-profilu',
      title: 'Vzhled profilu',
      description: 'Logo (avatar) a cover obrázek veřejného profilu.',
    },
    {
      anchor: 'socialni-site',
      title: 'Sociální sítě',
      description: 'Odkazy na sociální sítě zobrazené na profilu.',
    },
    {
      anchor: 'automaticke-schvalovani-rezervaci',
      title: 'Automatické schvalování rezervací',
      description: 'Schvalování nových rezervací bez ručního potvrzení.',
    },
  ],
  '/dashboard/services': [
    {
      anchor: 'seznam-sluzeb',
      title: 'Služby',
      description: 'Ceník a délka nabízených služeb.',
    },
  ],
  '/dashboard/reservations': [
    {
      anchor: 'prehled-rezervaci',
      title: 'Rezervace',
      description: 'Přehled a správa rezervací — obsazenost a kalendář.',
    },
  ],
  '/dashboard/clients': [
    {
      anchor: 'seznam-klientu',
      title: 'Klienti',
      description: 'Seznam klientů a jejich rezervací.',
    },
  ],
  '/dashboard/opening-hours': [
    {
      anchor: 'oteviraci-doba',
      title: 'Otevírací doba',
      description: 'Nastavení otevíracích hodin pro každý den v týdnu.',
    },
  ],
  '/dashboard/subscription': [
    {
      anchor: 'stav-predplatneho',
      title: 'Stav předplatného',
      description: 'Aktuální tarif a období předplatného.',
    },
    {
      anchor: 'automaticka-obnova',
      title: 'Automatická obnova',
      description: 'Nastavení automatického prodlužování předplatného.',
    },
    {
      anchor: 'zmena-tarifu',
      title: 'Změna tarifu',
      description: 'Upgrade nebo downgrade tarifu.',
    },
  ],
  '/dashboard/plans': [
    {
      anchor: 'tarify',
      title: 'Tarify a funkce',
      description: 'Porovnání balíčků Start, Pokročilý a Max.',
    },
  ],
  '/dashboard/analytics': [
    {
      anchor: 'vyvoj-trzeb',
      title: 'Vývoj tržeb v čase',
      description: 'Denní vývoj tržeb z uskutečněných rezervací.',
    },
    {
      anchor: 'spicky-vytizeni',
      title: 'Špičky vytížení',
      description: 'Kdy se nejvíce rezervuje.',
    },
    {
      anchor: 'stav-rezervaci',
      title: 'Stav rezervací',
      description: 'Rozložení rezervací podle výsledku.',
    },
    {
      anchor: 'nejvydelecnejsi-sluzby',
      title: 'Nejvýdělečnější služby',
      description: 'Služby seřazené podle celkových tržeb.',
    },
    {
      anchor: 'vykonnost-zamestnancu',
      title: 'Výkonnost zaměstnanců',
      description: 'Tržby a počet rezervací jednotlivých zaměstnanců.',
    },
    {
      anchor: 'top-klienti',
      title: 'TOP klienti',
      description: 'Klienti s nejvyšší celkovou útratou.',
    },
    {
      anchor: 'novi-vs-vracejici-klienti',
      title: 'Noví vs. vracející se klienti',
      description: 'Poměr nových a vracejících se klientů.',
    },
  ],
  '/dashboard/employees': [
    {
      anchor: 'zamestnanci',
      title: 'Zaměstnanci',
      description: 'Správa týmu podniku.',
    },
    {
      anchor: 'zamestnanci-u-sluzeb',
      title: 'Zaměstnanci u služeb',
      description: 'Přiřazení zaměstnanců ke konkrétním službám.',
    },
    {
      anchor: 'top-zamestnanci',
      title: 'TOP zaměstnanci',
      description: 'Podíl na odvedené práci tento měsíc.',
    },
  ],
  '/dashboard/faq': [
    {
      anchor: 'caste-dotazy',
      title: 'Nápověda',
      description: 'Často kladené otázky k dashboardu.',
    },
  ],
  '/dashboard/account': [
    {
      anchor: 'prihlasovaci-udaje',
      title: 'Přihlašovací údaje',
      description: 'Změna e-mailu nebo hesla účtu.',
    },
  ],
};

/**
 * Prohledá Index_Obsahu lokálně (R13.1). Porovnává normalizovaný dotaz proti
 * normalizovanému nadpisu a — pokud existuje — popisu sekce (R1.2, R1.3, R2.1).
 * Sekce bez popisu se matchuje pouze přes nadpis (R1.3).
 *
 * Vrací výsledky skupiny `sections` s `href` ve tvaru `${path}#${anchor}` (R4.1)
 * a unikátním `id`. Limit (max 6, R13.2) aplikuje až agregace — zde se nevrací
 * omezený počet. Prázdný/krátký dotaz vrací prázdné pole (minimální délku
 * vynucuje volající přes `shouldSearch`).
 */
export function searchContentIndex(query: string): SearchResult[] {
  const q = normalizeSearch(query);
  if (!q) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const [path, sections] of Object.entries(CONTENT_INDEX)) {
    for (const section of sections) {
      const haystack = normalizeSearch(`${section.title} ${section.description ?? ''}`);
      if (!haystack.includes(q)) {
        continue;
      }

      const href = `${path}#${section.anchor}`;
      results.push({
        id: `section:${href}`,
        group: 'sections',
        title: section.title,
        subtitle: section.description ?? PAGE_LABELS[path],
        href,
      });
    }
  }

  return results;
}
