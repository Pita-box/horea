import type { SearchGroup, SearchResult } from './types';
import { SEARCH_MIN_QUERY_LENGTH } from './types';
import { normalizeSearch } from './static-index';

/** Stav skupiny klienti odvozený z odpovědi serveru (R7). */
export type ClientsState =
  | { kind: 'results'; results: SearchResult[] }
  | { kind: 'locked' }
  | { kind: 'unauthorized' }
  | { kind: 'error' }
  | { kind: 'idle' };

export type AggregateInput = {
  settings: SearchResult[];
  sections: SearchResult[];
  clients: ClientsState;
  faq: SearchResult[];
};

/** Jedna skupina k vykreslení; `locked` nese info o uzamčení místo výsledků (R3.2, R7.2). */
export type RenderGroup = {
  group: SearchGroup;
  results: SearchResult[];
  locked: boolean;
};

/** Maximální počet výsledků skupiny `sekce` (R13.2). */
export const SECTION_RESULT_LIMIT = 6;

/**
 * Sloučí zdroje do seřazených skupin v pořadí nastavení → sekce → klienti → faq (R3.1),
 * ořízne `sekce` na SECTION_RESULT_LIMIT (R13.2) a vynechá skupiny bez výsledků i bez
 * informace o uzamčení (R3.2). Skupina `klienti` ve stavu `locked` zůstává viditelná
 * (locked: true, prázdné výsledky); výsledky ukáže jen ve stavu `results` s neprázdným polem.
 * Stavy `error` / `unauthorized` / `idle` skupinu `klienti` skryjí.
 */
export function aggregateResults(input: AggregateInput): RenderGroup[] {
  const groups: RenderGroup[] = [];

  // 1) Nastavení — skryté, pokud prázdné (R3.2).
  if (input.settings.length > 0) {
    groups.push({ group: 'settings', results: input.settings, locked: false });
  }

  // 2) Sekce — ořezané na SECTION_RESULT_LIMIT (R13.2), skryté, pokud prázdné (R3.2).
  if (input.sections.length > 0) {
    groups.push({
      group: 'sections',
      results: input.sections.slice(0, SECTION_RESULT_LIMIT),
      locked: false,
    });
  }

  // 3) Klienti — viditelní při výsledcích nebo ve stavu `locked` (R3.2, R7.2).
  if (input.clients.kind === 'results' && input.clients.results.length > 0) {
    groups.push({ group: 'clients', results: input.clients.results, locked: false });
  } else if (input.clients.kind === 'locked') {
    groups.push({ group: 'clients', results: [], locked: true });
  }

  // 4) Nápověda (FAQ) — skrytá, pokud prázdná (R3.2).
  if (input.faq.length > 0) {
    groups.push({ group: 'faq', results: input.faq, locked: false });
  }

  return groups;
}

/**
 * Plochý seznam výběrově dostupných výsledků (pořadí dle skupin) pro klávesovou navigaci (R11.1).
 * Uzamčená skupina nepřispívá žádným výběrovým výsledkem.
 */
export function flattenResults(groups: RenderGroup[]): SearchResult[] {
  return groups.flatMap((group) => group.results);
}

/**
 * Bezpečná normalizace — obalí normalizeSearch do try/catch (R2.4). Pokud podkladová
 * normalizace vyhodí, vrátí nezměněný vstup; jinak vrátí normalizovaný tvar. Je-li
 * normalizeSearch idempotentní, je idempotentní i tento výsledek.
 */
export function safeNormalize(value: string): string {
  try {
    return normalizeSearch(value);
  } catch {
    return value;
  }
}

/**
 * Vyhledávání se spouští právě od minimální délky dotazu (R8.1, R8.2): true tehdy a jen
 * tehdy, když má dotaz po ořezání bílých znaků délku alespoň SEARCH_MIN_QUERY_LENGTH.
 */
export function shouldSearch(query: string): boolean {
  return query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
}

/**
 * Aktivace klávesou je ekvivalentní kliknutí (R11.3, R11.4, R11.5): vrátí list[index]
 * při platném indexu (0 <= index < délka), jinak null (např. index -1 = nic zvýrazněno).
 */
export function resolveActivation(list: SearchResult[], index: number): SearchResult | null {
  if (index >= 0 && index < list.length) {
    return list[index];
  }
  return null;
}
