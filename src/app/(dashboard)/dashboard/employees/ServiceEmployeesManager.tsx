'use client';

import { useMemo, useState, useTransition } from 'react';

import { IconCheck, IconChevronDown, IconSearch } from '@tabler/icons-react';

import { Notice } from '@/components/ui/notice';
import { useToast } from '@/components/ui/toast';
import { setServiceEmployeesAction, type ServiceAssignment } from '../settings/employee-actions';

type EmployeeOption = { id: string; name: string };

type ServiceEmployeesManagerProps = {
  services: ServiceAssignment[];
  employees: EmployeeOption[];
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

export function ServiceEmployeesManager({ services, employees }: ServiceEmployeesManagerProps) {
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(services.map((s) => [s.id, s.employeeIds])),
  );

  const nameById = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees],
  );

  // Filtrovaný seznam zaměstnanců dle vyhledávacího dotazu (jen pro rozbalenou službu).
  const filteredEmployees = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) {
      return employees;
    }
    return employees.filter((e) => normalize(e.name).includes(q));
  }, [employees, query]);

  /** Optimistický zápis množiny zaměstnanců pro službu s revertem při chybě. */
  function persist(serviceId: string, nextIds: string[]) {
    const previous = selected[serviceId] ?? [];
    setError(null);
    setSelected((prev) => ({ ...prev, [serviceId]: nextIds }));
    setPendingServiceId(serviceId);
    startTransition(() => {
      void setServiceEmployeesAction(serviceId, nextIds).then((result) => {
        setPendingServiceId(null);
        if (result.ok) {
          showToast('Uloženo.');
        } else {
          setSelected((prev) => ({ ...prev, [serviceId]: previous }));
          setError(result.message);
        }
      });
    });
  }

  function toggle(serviceId: string, employeeId: string) {
    const current = selected[serviceId] ?? [];
    const next = current.includes(employeeId)
      ? current.filter((id) => id !== employeeId)
      : [...current, employeeId];
    persist(serviceId, next);
  }

  function toggleExpand(serviceId: string) {
    setQuery('');
    setExpandedId((prev) => (prev === serviceId ? null : serviceId));
  }

  if (services.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-24)]">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--color-rich-violet)]">
          Zaměstnanci u služeb
        </h2>
        <p className="text-sm text-[color-mix(in_srgb,var(--color-slate-text)_70%,white)]">
          Vyberte, kteří zaměstnanci vykonávají danou službu. Bez výběru jsou dostupní všichni.
        </p>
      </div>

      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}

      <ul className="flex flex-col gap-3">
        {services.map((service) => {
          const chosen = selected[service.id] ?? [];
          const isExpanded = expandedId === service.id;
          const isServicePending = isPending && pendingServiceId === service.id;
          const chosenNames = chosen
            .map((id) => nameById.get(id))
            .filter((name): name is string => Boolean(name));

          return (
            <li
              key={service.id}
              className="rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)]"
            >
              <button
                type="button"
                onClick={() => toggleExpand(service.id)}
                aria-expanded={isExpanded}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--color-slate-text)]">
                    {service.name}
                  </span>
                  <span className="block truncate text-xs text-[color-mix(in_srgb,var(--color-slate-text)_60%,white)]">
                    {chosen.length === 0
                      ? 'Všichni zaměstnanci'
                      : `${chosen.length} z ${employees.length} — ${previewNames(chosenNames)}`}
                  </span>
                </span>
                <IconChevronDown
                  size={18}
                  className={[
                    'shrink-0 text-[var(--color-rich-violet)] transition-transform',
                    isExpanded ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>

              {isExpanded ? (
                <div className="flex flex-col gap-3 border-t border-[var(--color-border-vychozi)] p-4">
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
                        className="w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] py-2 pl-9 pr-3 text-sm text-[var(--color-slate-text)] outline-none focus:border-[var(--color-action-violet)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => persist(service.id, employees.map((e) => e.id))}
                      disabled={isServicePending}
                      className="rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] px-3 py-2 text-sm text-[var(--color-slate-text)] transition-colors hover:border-[var(--color-action-violet)] disabled:opacity-50"
                    >
                      Vybrat vše
                    </button>
                    <button
                      type="button"
                      onClick={() => persist(service.id, [])}
                      disabled={isServicePending || chosen.length === 0}
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
                      {filteredEmployees.map((emp) => {
                        const active = chosen.includes(emp.id);
                        return (
                          <li key={emp.id}>
                            <button
                              type="button"
                              onClick={() => toggle(service.id, emp.id)}
                              disabled={isServicePending}
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
                              <span className="text-[var(--color-slate-text)]">{emp.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
