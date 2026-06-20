'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/** Doba (ms), po které zhasne přechodné vizuální zvýraznění cílové sekce (R4.4). */
const HIGHLIGHT_DURATION_MS = 1500;

/** CSS třída přechodného zvýraznění cílové sekce (definováno v globals.css). */
const HIGHLIGHT_CLASS = 'search-target-highlight';

/**
 * Po vykreslení / změně cesty: pokud je v URL `#hash`, najde element s tímto id,
 * odscrolluje ho do viewportu (R4.2), nastaví fokus pro čtečky a přidá přechodné
 * vizuální zvýraznění (R4.4).
 *
 * - Respektuje `prefers-reduced-motion` → behavior 'auto' místo 'smooth' (R4.2).
 * - Pokud kotva neexistuje, neudělá nic a nevyhodí chybu (R4.5).
 * - Reaguje na změnu `usePathname()` i na `hashchange`, takže funguje i pro
 *   in-page výběr bez reloadu (R4.3).
 *
 * Komponenta nic nevykresluje (vrací `null`); montuje se v owner dashboard shellu.
 */
export function ScrollToHashOnLoad(): null {
  const pathname = usePathname();

  useEffect(() => {
    // Efekt běží jen na klientovi; přesto guard pro jistotu (SSR bezpečnost).
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let highlightTimeout: ReturnType<typeof setTimeout> | undefined;

    /** Najde cílovou sekci dle aktuálního hashe a odscrolluje + zvýrazní ji. */
    const scrollToHash = () => {
      const hash = window.location.hash;
      if (!hash || hash.length <= 1) {
        return;
      }

      const id = decodeURIComponent(hash.slice(1));
      const el = document.getElementById(id);
      if (!el) {
        // Kotva neexistuje → tiše skončit, žádná chyba (R4.5).
        return;
      }

      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;

      el.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });

      // Fokus pro čtečky. Pokud element není nativně fokusovatelný, dočasně
      // nastavíme tabindex=-1 a po blur ho zase odebereme (R4.4).
      const hadTabIndex = el.hasAttribute('tabindex');
      if (!hadTabIndex) {
        el.setAttribute('tabindex', '-1');
        el.addEventListener(
          'blur',
          () => {
            el.removeAttribute('tabindex');
          },
          { once: true },
        );
      }
      el.focus({ preventScroll: true });

      // Přechodné vizuální zvýraznění (R4.4) — zhasne po HIGHLIGHT_DURATION_MS.
      el.classList.add(HIGHLIGHT_CLASS);
      highlightTimeout = setTimeout(() => {
        el.classList.remove(HIGHLIGHT_CLASS);
      }, HIGHLIGHT_DURATION_MS);
    };

    // Spustit po vykreslení cílové stránky. rAF dá prohlížeči šanci dokončit
    // layout, aby scrollIntoView trefil správnou pozici.
    const rafId = window.requestAnimationFrame(scrollToHash);

    // In-page navigace bez reloadu (klik na #kotva nemusí změnit pathname) → R4.3.
    window.addEventListener('hashchange', scrollToHash);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('hashchange', scrollToHash);
      if (highlightTimeout !== undefined) {
        clearTimeout(highlightTimeout);
      }
    };
  }, [pathname]);

  return null;
}
