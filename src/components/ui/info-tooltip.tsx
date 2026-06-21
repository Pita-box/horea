import { IconInfoCircle } from '@tabler/icons-react';

/**
 * Informační ikona s tooltipem (CSS-only: hover i fokus). Umisťuje se vpravo
 * nahoře u karty a vysvětluje obsah/metriku lidskou řečí. Sdílená napříč
 * uživatelským i admin dashboardem.
 *
 * Přístupnost: ikona je fokusovatelná z klávesnice (`tabIndex={0}`), tooltip se
 * zobrazí na hover i focus (`group-hover` / `group-focus-within`).
 */
export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex shrink-0">
      <IconInfoCircle
        size={16}
        stroke={2}
        tabIndex={0}
        role="img"
        aria-label="Vysvětlení"
        className="cursor-help text-[color-mix(in_srgb,var(--color-slate-text)_45%,white)] outline-none transition-colors hover:text-[var(--color-action-violet)] focus-visible:text-[var(--color-action-violet)]"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-6 z-30 hidden w-56 rounded-[var(--radius-lg)] bg-[var(--color-rich-violet)] px-3 py-2 text-xs font-medium leading-snug text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
