/**
 * Sdílené typy pro dashboard vyhledávání. Architektura je „zdrojová" — výsledky se
 * skládají z více zdrojů (statický index nastavení/FAQ + dynamičtí klienti z DB).
 * Do budoucna lze přidat další skupiny (rezervace, faktury, …) bez změny UI.
 */
export type SearchGroup = 'settings' | 'clients' | 'faq';

export type SearchResult = {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle?: string;
  href: string;
};

/** Odpověď dynamického (DB) zdroje klientů — může být uzamčená dle tarifu. */
export type ClientSearchResponse =
  | { ok: true; results: SearchResult[] }
  | { ok: false; reason: 'locked' | 'unauthorized' | 'error' };

export const SEARCH_GROUP_LABELS: Record<SearchGroup, string> = {
  settings: 'Nastavení',
  clients: 'Klienti',
  faq: 'Nápověda',
};

/** Minimální délka dotazu, od které se spouští vyhledávání. */
export const SEARCH_MIN_QUERY_LENGTH = 2;
