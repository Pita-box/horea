'use client';

import { searchClientsAction } from '@/app/(dashboard)/search-actions';
import { searchStaticIndex } from '@/lib/search/static-index';
import {
  SEARCH_GROUP_LABELS,
  SEARCH_MIN_QUERY_LENGTH,
  type SearchGroup,
  type SearchResult,
} from '@/lib/search/types';
import { IconSearch } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

const GROUP_ORDER: SearchGroup[] = ['settings', 'clients', 'faq'];

export function DashboardSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clientResults, setClientResults] = useState<SearchResult[]>([]);
  const [clientsLocked, setClientsLocked] = useState(false);
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

  const grouped = useMemo(() => {
    const all = [...staticResults, ...clientResults];
    const map = new Map<SearchGroup, SearchResult[]>();
    for (const result of all) {
      const list = map.get(result.group) ?? [];
      list.push(result);
      map.set(result.group, list);
    }
    return map;
  }, [staticResults, clientResults]);

  const totalResults = staticResults.length + clientResults.length;
  const showPanel = open && hasQuery;

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
          placeholder="Hledat…"
          value={query}
          tabIndex={expanded ? 0 : -1}
          onChange={(event) => setQuery(event.target.value)}
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
          {GROUP_ORDER.map((group) => {
            const items = grouped.get(group) ?? [];
            if (group === 'clients' && clientsLocked) {
              return (
                <div key={group} className="px-3 py-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                    {SEARCH_GROUP_LABELS[group]}
                  </p>
                  <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
                    Vyhledávání klientů je dostupné ve vyšším tarifu.
                  </p>
                </div>
              );
            }
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={group} className="px-1 py-1">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]">
                  {SEARCH_GROUP_LABELS[group]}
                </p>
                <ul>
                  {items.map((result) => (
                    <li key={result.id}>
                      <Link
                        href={result.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-[var(--radius-buttons)] px-3 py-2 transition-colors hover:bg-[var(--color-soft-gray-fill)]"
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
                  ))}
                </ul>
              </div>
            );
          })}

          {totalResults === 0 && !clientsLocked ? (
            <p className="px-3 py-3 text-sm text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
              Nic nenalezeno.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
