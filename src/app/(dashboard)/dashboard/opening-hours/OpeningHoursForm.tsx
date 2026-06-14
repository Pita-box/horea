'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { WEEK_DAYS } from '@/lib/onboarding/data';
import type { OpeningHoursWeek } from '@/lib/opening-hours/schema';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

import { saveOpeningHours } from './actions';

const DEFAULT_OPEN_TIME = '09:00';
const DEFAULT_CLOSE_TIME = '17:00';

type DayState = {
  dayOfWeek: number;
  closed: boolean;
  opensAt: string;
  closesAt: string;
};

type OpeningHoursFormProps = {
  initialWeek: OpeningHoursWeek;
};

function toDayStates(week: OpeningHoursWeek): DayState[] {
  const byDay = new Map(week.map((day) => [day.dayOfWeek, day]));

  return WEEK_DAYS.map(({ dayOfWeek }) => {
    const day = byDay.get(dayOfWeek);

    if (!day || day.closed) {
      return { dayOfWeek, closed: true, opensAt: DEFAULT_OPEN_TIME, closesAt: DEFAULT_CLOSE_TIME };
    }

    return { dayOfWeek, closed: false, opensAt: day.opensAt, closesAt: day.closesAt };
  });
}

export function OpeningHoursForm({ initialWeek }: OpeningHoursFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [days, setDays] = useState<DayState[]>(() => toDayStates(initialWeek));
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateDay(dayOfWeek: number, patch: Partial<DayState>) {
    setDays((current) =>
      current.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setFieldErrors({});

    const week: OpeningHoursWeek = days.map((day) =>
      day.closed
        ? { dayOfWeek: day.dayOfWeek, closed: true }
        : {
            dayOfWeek: day.dayOfWeek,
            closed: false,
            opensAt: day.opensAt,
            closesAt: day.closesAt,
          },
    );

    startTransition(() => {
      void saveOpeningHours(week).then((result) => {
        if (result.ok) {
          showToast('Otevírací doba uložena.');
          router.refresh();
          return;
        }

        setMessage(result.message);
        setFieldErrors(result.fieldErrors ?? {});
      });
    });
  }

  return (
    <form className="space-y-[var(--spacing-24)]" onSubmit={handleSubmit} noValidate>
      {message ? (
        <Notice role="alert" variant="error">
          {message}
        </Notice>
      ) : null}

      <div className="space-y-[var(--spacing-12)]">
        {WEEK_DAYS.map(({ dayOfWeek, label }) => {
          const day = days.find((item) => item.dayOfWeek === dayOfWeek);
          const closed = day?.closed ?? true;
          const error = fieldErrors[dayOfWeek];

          return (
            <div
              key={dayOfWeek}
              className="grid gap-[var(--spacing-12)] rounded-[var(--radius-buttons)] border border-[var(--color-border-vychozi)] p-[var(--spacing-16)] sm:grid-cols-[1fr_160px_160px] sm:items-end"
            >
              <label className="flex items-center gap-[var(--spacing-12)] text-sm font-semibold text-[var(--color-rich-violet)]">
                <Switch
                  checked={!closed}
                  onChange={(event) => updateDay(dayOfWeek, { closed: !event.target.checked })}
                  disabled={isPending}
                />
                <span>
                  {label}
                  <span className="block text-xs font-medium text-[var(--color-slate-text)]">
                    {closed ? 'Zavřeno' : 'Otevřeno'}
                  </span>
                </span>
              </label>

              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold text-[var(--color-slate-text)]"
                  htmlFor={`opens-at-${dayOfWeek}`}
                >
                  Otevřeno od
                </label>
                <Input
                  id={`opens-at-${dayOfWeek}`}
                  type="time"
                  value={day?.opensAt ?? DEFAULT_OPEN_TIME}
                  onChange={(event) => updateDay(dayOfWeek, { opensAt: event.target.value })}
                  aria-invalid={Boolean(error)}
                  disabled={isPending || closed}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="block text-xs font-semibold text-[var(--color-slate-text)]"
                  htmlFor={`closes-at-${dayOfWeek}`}
                >
                  Otevřeno do
                </label>
                <Input
                  id={`closes-at-${dayOfWeek}`}
                  type="time"
                  value={day?.closesAt ?? DEFAULT_CLOSE_TIME}
                  onChange={(event) => updateDay(dayOfWeek, { closesAt: event.target.value })}
                  aria-invalid={Boolean(error)}
                  disabled={isPending || closed}
                />
              </div>

              {error ? (
                <p className="text-sm font-medium text-[var(--color-neon-pink)] sm:col-span-3">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button className="w-full sm:w-auto" type="submit" disabled={isPending}>
        {isPending ? 'Ukládám...' : 'Uložit otevírací dobu'}
      </Button>
    </form>
  );
}
