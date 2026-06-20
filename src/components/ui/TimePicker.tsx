'use client';

import { IconClock } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';

type TimePickerProps = {
  id?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Text při prázdné hodnotě. */
  placeholder?: string;
  'aria-label'?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function splitValue(value: string): { hh: string; mm: string } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return { hh: '09', mm: '00' };
  }
  return { hh: match[1], mm: match[2] };
}

export function TimePicker({
  id,
  name,
  value,
  onChange,
  disabled = false,
  placeholder = 'Vyberte čas',
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { hh, mm } = splitValue(value);

  useEffect(() => {
    if (!open) {
      return;
    }

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
  }, [open]);

  const optionBaseClass =
    'w-full rounded-[8px] px-3 py-1.5 text-center text-sm tabular-nums transition-colors';

  function renderColumn(items: string[], selected: string, onSelect: (next: string) => void) {
    return (
      <ul className="max-h-[180px] w-full space-y-1 overflow-y-auto px-1">
        {items.map((item) => {
          const isSelected = item === selected;
          return (
            <li key={item}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-pressed={isSelected}
                className={[
                  optionBaseClass,
                  isSelected
                    ? 'bg-[var(--color-action-violet)] font-semibold text-[var(--color-canvas-white)]'
                    : 'text-[var(--color-slate-text)] hover:bg-[color-mix(in_srgb,var(--color-action-violet)_10%,white)]',
                ].join(' ')}
              >
                {item}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base tabular-nums text-[var(--color-slate-text)] outline-none transition-colors hover:border-[var(--color-action-violet)] focus-visible:border-[var(--color-action-violet)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-action-violet)_18%,transparent)] disabled:opacity-50"
      >
        <span className={value ? '' : 'text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]'}>
          {value || placeholder}
        </span>
        <IconClock
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
          aria-label={ariaLabel ?? 'Výběr času'}
          className="absolute left-0 z-30 mt-2 w-[180px] rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] bg-[var(--color-canvas-white)] p-2 shadow-lg"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-center text-xs font-semibold text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                Hodina
              </p>
              {renderColumn(HOURS, hh, (next) => onChange(`${next}:${mm}`))}
            </div>
            <div>
              <p className="mb-1 text-center text-xs font-semibold text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                Minuta
              </p>
              {renderColumn(MINUTES, mm, (next) => onChange(`${hh}:${next}`))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
