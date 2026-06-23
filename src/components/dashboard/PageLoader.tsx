'use client';

import { IconLoader2 } from '@tabler/icons-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimální doba zobrazení, aby byl loader vidět i u rychlé (lokální) navigace. */
const MIN_VISIBLE_MS = 500;
/** Pojistka proti uváznutí při zrušené navigaci. */
const SAFETY_TIMEOUT_MS = 10_000;

/**
 * Plovoucí indikátor načítání stránky vpravo dole. Zobrazí se při zahájení
 * navigace (klik na interní odkaz směřující na jinou URL) a skryje se po jejím
 * dokončení (změna cesty nebo query parametrů), nejdříve však po `MIN_VISIBLE_MS`,
 * aby byl viditelný i u bleskové lokální navigace. Prvek je vždy v DOM; viditelnost
 * řídí opacita → fade-in/fade-out přes `transition-opacity`.
 */
export function PageLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    shownAtRef.current = null;
    setVisible(false);
  }, [clearTimers]);

  // Zahájení navigace → zobraz při kliknutí na interní odkaz na jinou URL.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      // Pozn.: listener běží v capture fázi (viz addEventListener níže) — tj. DŘÍV,
      // než next/link klik zpracuje a zavolá preventDefault() kvůli SPA navigaci.
      // Proto zde NEkontrolujeme event.defaultPrevented (v bubbling fázi už by byl
      // true a loader by se nikdy nezobrazil).
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href');
      if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      clearTimers();
      shownAtRef.current = Date.now();
      setVisible(true);
      safetyTimerRef.current = window.setTimeout(hide, SAFETY_TIMEOUT_MS);
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [clearTimers, hide]);

  // Dokončení navigace (změna cesty/query) → skryj, nejdříve po MIN_VISIBLE_MS.
  useEffect(() => {
    if (shownAtRef.current === null) {
      return;
    }
    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(hide, remaining);
  }, [pathname, searchParams, hide]);

  // Úklid timerů při odmountování.
  useEffect(() => clearTimers, [clearTimers]);

  return (
    <div
      role="status"
      aria-hidden={!visible}
      className={`fixed bottom-6 right-8 z-50 flex items-center gap-2 rounded-[var(--radius-buttons)] bg-[var(--color-dark)] px-6 py-4 text-sm text-white shadow-lg transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <IconLoader2 size={18} className="animate-spin" aria-hidden="true" />
      <span>Načítání …</span>
    </div>
  );
}
