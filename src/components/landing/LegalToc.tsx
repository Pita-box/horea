'use client';

import { useEffect, useState } from 'react';

export type TocItem = { id: string; label: string };

/**
 * Postranní obsah (table of contents) pro dlouhé právní stránky. Čísluje položky
 * dle pořadí a přes IntersectionObserver zvýrazňuje aktuálně viditelnou sekci
 * (scroll-spy). Sticky na desktopu, nad obsahem na mobilu.
 */
export function LegalToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-120px 0px -70% 0px', threshold: 0 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="Obsah" className="flex flex-col gap-3">
      <p className="font-[var(--font-plus-jakarta-sans)] text-base font-bold text-[var(--color-rich-violet)]">
        Obsah
      </p>
      <ol className="flex flex-col gap-1">
        {items.map((item, index) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'true' : undefined}
                className={[
                  'block border-l-2 py-1 pl-3 font-[var(--font-plus-jakarta-sans)] text-sm transition-colors',
                  active
                    ? 'border-[var(--color-action-violet)] font-bold text-[var(--color-action-violet)]'
                    : 'border-transparent font-medium text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)] hover:text-[var(--color-rich-violet)]',
                ].join(' ')}
              >
                {index + 1}. {item.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
