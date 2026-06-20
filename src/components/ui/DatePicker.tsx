'use client';

import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';

import { todayPragueDate } from '@/lib/reservations/calendar';
import { addMonths, buildMonthGrid } from '@/lib/reservations/occupancy';

type DatePickerProps = {
  id?: string;
  /** Pro odeslání ve formuláři — vykreslí skryté pole se shodnou hodnotou. */
  name?: string;
  /** Řízená hodnota `YYYY-MM-DD` (s `onChange`). */
  value?: string;
  /** Neřízená výchozí hodnota `YYYY-MM-DD`. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Nejdřívější volitelné datum `YYYY-MM-DD` (dřívější dny nedostupné). */
  min?: string;
  /** Nejpozdější volitelné datum `YYYY-MM-DD`. */
  max?: string;
  disabled?: boolean;
  /** Text při prázdné hodnotě. */
  placeholder?: string;
  /** Povolit vymazání hodnoty (tlačítko v rozbalovacím panelu). */
  allowClear?: boolean;
  'aria-label'?: string;
};

/** `YYYY-MM` část kotvy pro porovnání měsíců. */
function monthKey(anchor: string): string {
  return anchor.slice(0, 7);
}

/** `YYYY-MM-DD` → `DD.MM.YYYY` pro zobrazení. */
function formatDisplay(value: string): string {
  const [y, m, d] = value.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Rozbalovací výběr data (trigger + měsíční kalendář v panelu) — náhrada za
 * nativní `<input type="date">`. Funguje řízeně (`value`+`onChange`) i neřízeně
 * (`defaultValue`); pro formuláře vykreslí skryté pole `name`. Sdílí mřížku s
 * pohledem „Obsazenost" (`buildMonthGrid`). Zavírá se kliknutím mimo a Escape.
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  disabled = false,
  placeholder = 'Vyberte datum',
  allowClear = false,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? '');
  const current = isControlled ? (value ?? '') : internal;

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(
    () => `${(current || min || todayPragueDate()).slice(0, 7)}-01`,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const today = todayPragueDate();

  useEffect(() => {
    if (!open) {
      return;
    }
    // Při otevření nastav kotvu na měsíc vybraného data (nebo dnešní).
    setAnchor(`${(current || min || today).slice(0, 7)}-01`);
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(next: string) {
    if (!isControlled) {
      setInternal(next);
    }
    onChange?.(next);
  }

  function selectDay(dateISO: string) {
    commit(dateISO);
    setOpen(false);
  }

  const grid = buildMonthGrid(anchor);
  const prevDisabled = Boolean(min) && monthKey(grid.anchor) <= monthKey(min as string);
  const nextDisabled = Boolean(max) && monthKey(grid.anchor) >= monthKey(max as string);

  return (
    <div ref={containerRef} className="relative">
      {name ? <input type="hidden" name={name} value={current} /> : null}

      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base tabular-nums text-[var(--color-slate-text)] outline-none transition-colors hover:border-[var(--color-action-violet)] focus-visible:border-[var(--color-action-violet)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)] disabled:opacity-50"
      >
        <span className={current ? '' : 'text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]'}>
          {current ? formatDisplay(current) : placeholder}
        </span>
        <IconCalendar
          size={18}
          stroke={2}
          aria-hidden="true"
          className="shrink-0 text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]"
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={ariaLabel ?? 'Výběr data'}
          className="absolute left-0 z-30 mt-2 w-[280px] rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-[var(--font-polysans)] text-sm font-semibold capitalize text-[var(--color-rich-violet)]">
              {grid.title}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAnchor((c) => addMonths(c, -1))}
                disabled={prevDisabled}
                aria-label="Předchozí měsíc"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors enabled:hover:bg-[var(--color-soft-gray-fill)] disabled:opacity-40"
              >
                <IconChevronLeft size={16} stroke={2} />
              </button>
              <button
                type="button"
                onClick={() => setAnchor((c) => addMonths(c, 1))}
                disabled={nextDisabled}
                aria-label="Další měsíc"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-rich-violet)] transition-colors enabled:hover:bg-[var(--color-soft-gray-fill)] disabled:opacity-40"
              >
                <IconChevronRight size={16} stroke={2} />
              </button>
            </div>
          </div>

          <div
            className="grid grid-cols-7 text-center text-[11px] font-medium text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]"
            aria-hidden="true"
          >
            {grid.weekdayLabels.map((label) => (
              <span key={label} className="py-1">
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {grid.weeks.flat().map((cell) => {
              if (!cell.inMonth) {
                return <span key={cell.dateISO} aria-hidden="true" className="h-9" />;
              }
              const outOfRange =
                (Boolean(min) && cell.dateISO < (min as string)) ||
                (Boolean(max) && cell.dateISO > (max as string));
              const isSelected = cell.dateISO === current;
              const isToday = cell.dateISO === today;
              return (
                <div key={cell.dateISO} className="flex h-9 items-center justify-center">
                  <button
                    type="button"
                    data-date={cell.dateISO}
                    disabled={outOfRange}
                    onClick={() => selectDay(cell.dateISO)}
                    aria-pressed={isSelected}
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium transition-colors',
                      isSelected
                        ? 'bg-[var(--color-action-violet)] text-white'
                        : outOfRange
                          ? 'cursor-not-allowed text-[color-mix(in_srgb,var(--color-slate-text)_28%,white)]'
                          : isToday
                            ? 'text-[var(--color-action-violet)] ring-1 ring-[var(--color-action-violet)]'
                            : 'text-[var(--color-slate-text)] hover:bg-[var(--color-soft-gray-fill)]',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {cell.day}
                  </button>
                </div>
              );
            })}
          </div>

          {allowClear && current ? (
            <div className="mt-2 flex justify-end border-t border-[var(--color-border-vychozi)] pt-2">
              <button
                type="button"
                onClick={() => {
                  commit('');
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-action-violet)] hover:underline"
              >
                <IconX size={14} stroke={2} /> Vymazat
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
