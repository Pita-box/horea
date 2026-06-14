'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Notice } from '@/components/ui/notice';
import { assignReservationEmployee } from '@/server/ReservationEmployeeAssigner';

export type AssignEmployeeOption = { id: string; name: string };

type AssignEmployeeProps = {
  reservationId: string;
  employees: AssignEmployeeOption[];
  currentEmployeeId: string | null;
};

export function AssignEmployee({ reservationId, employees, currentEmployeeId }: AssignEmployeeProps) {
  const router = useRouter();
  const [value, setValue] = useState(currentEmployeeId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    startTransition(() => {
      void assignReservationEmployee(reservationId, next || null).then((result) => {
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.message);
        }
      });
    });
  }

  return (
    <div className="space-y-2 border-t border-[var(--color-border-vychozi)] pt-4">
      <h3 className="text-sm font-semibold text-[var(--color-rich-violet)]">Zaměstnanec</h3>
      <select
        aria-label="Přiřadit zaměstnance"
        value={value}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full rounded-[var(--radius-buttons)] border border-[var(--color-input-border)] bg-[var(--color-canvas-white)] px-[var(--input-padding-x)] py-[var(--input-padding-y)] text-base leading-[1.1] text-[var(--color-slate-text)] outline-none focus:border-[var(--color-action-violet)] disabled:opacity-50"
      >
        <option value="">Nepřiřazeno</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </select>
      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
