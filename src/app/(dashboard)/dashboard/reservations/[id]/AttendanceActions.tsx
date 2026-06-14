'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import type { AttendanceStatus } from '@/lib/reservations/labels';
import { markAttendance } from '@/server/AttendanceMarker';

type AttendanceActionsProps = {
  reservationId: string;
  attendance: AttendanceStatus;
};

/**
 * Docházková tlačítka (R11.5). Časová brána `now() > starts_at` se vyhodnocuje
 * serverově i v `Attendance_Marker`; tato komponenta se renderuje až poté, co
 * server bránu prošel (`attendanceAvailable`). Umožňuje přepínat `attended` /
 * `no_show` i zpět na `null`.
 */
export function AttendanceActions({ reservationId, attendance }: AttendanceActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function mark(value: AttendanceStatus) {
    setError(null);
    startTransition(() => {
      void markAttendance(reservationId, value).then((result) => {
        if (result.ok) {
          router.refresh();
          return;
        }
        setError(result.message);
      });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant={attendance === 'attended' ? 'primary' : 'ghost'}
          onClick={() => mark('attended')}
          disabled={isPending}
          aria-pressed={attendance === 'attended'}
        >
          Dorazil
        </Button>
        <Button
          type="button"
          variant={attendance === 'no_show' ? 'primary' : 'ghost'}
          onClick={() => mark('no_show')}
          disabled={isPending}
          aria-pressed={attendance === 'no_show'}
        >
          Nedorazil
        </Button>
        {attendance !== null ? (
          <Button type="button" variant="ghost" onClick={() => mark(null)} disabled={isPending}>
            Zrušit docházku
          </Button>
        ) : null}
      </div>

      {error ? (
        <Notice role="alert" variant="error">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}
