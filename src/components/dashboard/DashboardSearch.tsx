'use client';

import { searchClientsAction } from '@/app/(dashboard)/search-actions';
import { searchContentIndex } from '@/lib/search/content-index';
import {
  aggregateResults,
  flattenResults,
  resolveActivation,
  type ClientsState,
} from '@/lib/search/search-aggregate';
import { searchStaticIndex } from '@/lib/search/static-index';
import { SEARCH_GROUP_LABELS, SEARCH_MIN_QUERY_LENGTH, type SearchResult } from '@/lib/search/types';
import { IconSearch } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export function DashboardSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clientResults, setClientResults] = useState<SearchResult[]>([]);
  const [clientsLocked, setClientsLocked] = useState(false);
  // Index aktivního (klávesově zvýrazněného) výsledku v plochém seznamu; -1 = nic (R11).
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  function openSearch() {
    setExpanded(true);
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;

  const staticResults = useMemo(
    () => (hasQuery ? searchStaticIndex(trimmed) : []),
    [trimmed, hasQuery],
  );

  // Lokální zdroj sekcí (Index_Obsahu) — prohledává se v prohlížeči bez sítě (R1, R13.1).
  const sections = useMemo(() => (hasQuery ? searchContentIndex(trimmed) : []), [trimmed, hasQuery]);

  // Debounced dotaz na klienty (server action, tenant-scoped + plan-gated).
  useEffect(() => {
    if (!hasQuery) {
      setClientResults([]);
      setClientsLocked(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void searchClientsAction(trimmed).then((response) => {
        if (cancelled) {
          return;
        }
        if (response.ok) {
          setClientResults(response.results);
          setClientsLocked(false);
        } else {
          setClientResults([]);
          setClientsLocked(response.reason === 'locked');
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [trimmed, hasQuery]);

  // Zavření kliknutím mimo / Escapem.
  useEffect(() => {
    if (!open) {
      return;
    }
    function collapse() {
      setOpen(false);
      if (query.trim() === '') {
        setExpanded(false);
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        collapse();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        collapse();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, query]);

  // Stav skupiny klienti odvozený z odpovědi serveru (R7) pro agregaci.
  const clientsState = useMemo<ClientsState>(() => {
    if (clientsLocked) {
      return { kind: 'locked' };
    }
    if (clientResults.length > 0) {
      return { kind: 'results', results: clientResults };
    }
    return { kind: 'idle' };
  }, [clientResults, clientsLocked]);

  // Seskupení a pořadí řeší čistá agregace (R3.1, R3.2, R13.2).
  const groups = useMemo(
    () =>
      aggregateResults({
        settings: staticResults.filter((result) => result.group === 'settings'),
        sections,
        clients: clientsState,
        faq: staticResults.filter((result) => result.group === 'faq'),
      }),
    [staticResults, sections, clientsState],
  );

  // Plochý seznam výběrově dostupných výsledků pro klávesovou navigaci (R11.1).
  const flatResults = useMemo(() => flattenResults(groups), [groups]);

  // Při změně dotazu nebo výsledků se zvýraznění resetuje (R11.5).
  useEffect(() => {
    setActiveIndex(-1);
  }, [groups]);

  const showPanel = open && hasQuery;
  const optionId = (index: number) => `${panelId}-opt-${index}`;

  function closePanel() {
    setOpen(false);
  }

  // Klávesová navigace v plochém seznamu výsledků (R11).
  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = flatResults.length;
    if (event.key === 'ArrowDown') {
      if (count === 0) {
        return;
      }
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % count);
    } else if (event.key === 'ArrowUp') {
      if (count === 0) {
        return;
      }
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? count - 1 : prev - 1));
    } else if (event.key === 'Enter') {
      const target = resolveActivation(flatResults, activeIndex);
      if (target) {
        event.preventDefault();
        router.push(target.href);
        closePanel();
      }
    }
  }

  // Pořadové počítadlo plochého indexu napříč skupinami (settings → sekce → klienti → faq).
  let runningIndex = 0;

  return (
    <div ref={containerRef} className="relative flex items-center justify-end">
      <div
        className={[
          'flex items-center overflow-hidden rounded-full transition-[width] duration-300 ease-out',
          expanded
            ? 'w-[min(55vw,300px)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)]'
            : 'w-10 border border-transparent bg-transparent',
        ].join(' ')}
      >
        <button
          type="button"
          aria-label="Otevřít vyhledávání"
          aria-expanded={expanded}
          onClick={openSearch}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--color-slate-text)] transition-colors hover:text-[var(--color-action-violet)]"
        >
          <IconSearch size={20} stroke={2} aria-hidden="true" />
        </button>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Hledat v dashboardu"
          aria-expanded={showPanel}
          aria-controls={panelId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder="Hledat…"
          value={query}
          tabIndex={expanded ? 0 : -1}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
          onFocus={() => {
            setExpanded(true);
            setOpen(true);
          }}
          className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-sm text-[var(--color-slate-text)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]"
        />
      </div>

      {showPanel ? (
        <div
          id={panelId}
          role="listbox"
          className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[min(85vw,360px)] overflow-y-auto rounded-[var(--radius-cards)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-2 shadow-lg"
        >
          {groups.map((renderGroup) => {
            if (renderGroup.locked) {
              return (
                <div key={renderGroup.group} className="px-3 py-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                    {SEARCH_GROUP_LABELS[renderGroup.group]}
                  </p>
                  <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                    Vyhledávání klientů je dostupné ve vyšším tarifu.
                  </p>
                </div>
              );
            }
            return (
              <div key={renderGroup.group} className="px-1 py-1">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                  {SEARCH_GROUP_LABELS[renderGroup.group]}
                </p>
                <ul>
                  {renderGroup.results.map((result) => {
                    const flatIndex = runningIndex;
                    runningIndex += 1;
                    const isActive = flatIndex === activeIndex;
                    return (
                      <li key={result.id} id={optionId(flatIndex)} role="option" aria-selected={isActive}>
                        <Link
                          href={result.href}
                          onClick={closePanel}
                          className={[
                            'block rounded-[var(--radius-buttons)] px-3 py-2 transition-colors hover:bg-[var(--color-soft-gray-fill)]',
                            isActive ? 'bg-[var(--color-soft-gray-fill)]' : '',
                          ].join(' ')}
                        >
                          <span className="block text-sm font-medium text-[var(--color-slate-text)]">
                            {result.title}
                          </span>
                          {result.subtitle ? (
                            <span className="block text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                              {result.subtitle}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {groups.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
              Nic nenalezeno.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
