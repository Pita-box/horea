'use client';

import { useMemo, useState, useTransition } from 'react';

import { IconCheck, IconSearch } from '@tabler/icons-react';

import { Notice } from '@/components/ui/notice';
import { setReservationEmployees } from '@/server/ReservationEmployeeAssigner';

export type AssignEmployeeOption = { id: string; name: string };

type AssignEmployeeProps = {
  reservationId: string;
  employees: AssignEmployeeOption[];
  /** Aktuálně přiřazení zaměstnanci (množina). */
  currentEmployeeIds: string[];
};

/** Diakritiku-tolerantní porovnání pro vyhledávání jmen. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Stručný náhled vybraných jmen do souhrnu (max 2 + „+N"). */
function previewNames(names: string[]): string {
  if (names.length <= 2) {
    return names.join(', ');
  }
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/**
 * Přiřazení více zaměstnanců k rezervaci — stejný vzor jako „Zaměstnanci u služeb":
 * vyhledávací pole „Hledat zaměstnance" + zaškrtávací seznam pro rychlý a přesný
 * výběr (více lidí na jednu rezervaci nebo rezervace s více službami). Každá změna
 * uloží CELOU novou množinu; při chybě se výběr vrátí na poslední potvrzený stav.
 */
export function AssignEmployee({
  reservationId,
  employees,
  currentEmployeeIds,
}: AssignEmployeeProps) {
  const [selected, setSelected] = useState<string[]>(currentEmployeeIds);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  const filteredEmployees = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) {
      return employees;
    }
    return employees.filter((e) => normalize(e.name).includes(q));
  }, [employees, query]);

  const selectedNames = selected
    .map((id) => nameById.get(id))
    .filter((name): name is string => Boolean(name));

  /** Optimistický zápis celé množiny s revertem při chybě. */
  function persist(nextIds: string[]) {
    const previous = selected;
    setSelected(nextIds);
    setError(null);
    startTransition(() => {
      void setReservationEmployees(reservationId, nextIds).then((result) => {
        if (!result.ok) {
          setSelected(previous);
          setError(result.message);
        }
      });
    });
  }

  function toggle(employeeId: string) {
    const next = selected.includes(employeeId)
      ? selected.filter((id) => id !== employeeId)
      : [...selected, employeeId];
    persist(next);
  }

  return (
    <div className="space-y-3 border-t border-[var(--color-border-vychozi)] pt-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--color-rich-violet)]">Zaměstnanci</h3>
        <p className="text-xs text-[color-mix(in_srgb,var(--color-slate-text)_65%,white)]">
          {selected.length === 0
            ? 'Nikdo nepřiřazen'
            : `${selected.length} z ${employees.length} — ${previewNames(selectedNames)}`}
        </p>
      </div>

      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--color-slate-text)_55%,white)]"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hledat zaměstnance"
            aria-label="Hledat zaměstnance"
            className="w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] py-2 pl-9 pr-3 text-sm text-[var(--color-slate-text)] outline-none focus:border-[var(--color-action-violet)]"
          />
        </div>
        <button
          type="button"
          onClick={() => persist(employees.map((e) => e.id))}
          disabled={isPending || selected.length === employees.length}
          className="rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] px-3 py-2 text-sm text-[var(--color-slate-text)] transition-colors hover:border-[var(--color-action-violet)] disabled:opacity-50"
        >
          Vybrat vše
        </button>
        <button
          type="button"
          onClick={() => persist([])}
          disabled={isPending || selected.length === 0}
          className="rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] px-3 py-2 text-sm text-[var(--color-slate-text)] transition-colors hover:border-[var(--color-action-violet)] disabled:opacity-50"
        >
          Zrušit výběr
        </button>
      </div>

      {filteredEmployees.length === 0 ? (
        <p className="px-1 py-2 text-sm text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
          Nikdo neodpovídá hledání.
        </p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
          {filteredEmployees.map((employee) => {
            const active = selected.includes(employee.id);
            return (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => toggle(employee.id)}
                  disabled={isPending}
                  aria-pressed={active}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-buttons)] px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--color-cloud-mist)] disabled:opacity-50"
                >
                  <span
                    className={[
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border',
                      active
                        ? 'border-[var(--color-action-violet)] bg-[var(--color-action-violet)] text-white'
                        : 'border-[var(--color-input-border)] text-transparent',
                    ].join(' ')}
                  >
                    <IconCheck size={14} stroke={3} />
                  </span>
                  <span className="text-[var(--color-slate-text)]">{employee.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
