'use server';

import { serverLog } from '@/lib/log-server';
import type { AttendanceStatus } from '@/lib/reservations/labels';
import type { ReservationMutationResult } from '@/lib/reservations/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Attendance_Marker — server action nastavující docházku (`attended` / `no_show`
 * / zpět `null`) NEZÁVISLE na Reservation_Status (R11).
 *
 * Tok:
 *  1. Ověření přihlášení (uživatelský JWT, RLS `tenant_isolation`).
 *  2. SERVEROVÁ ČASOVÁ BRÁNA: povolit jen když `now() > starts_at` (R11.3, R11.4).
 *     Brána běží na serveru, ne pouze skrytím tlačítka v UI.
 *  3. UPDATE pole `attendance` (umožní i přepnutí zpět na `null`, R11.5).
 *     NEMĚNÍ `status` a NEODESÍLÁ žádný e-mail (R11.6).
 *  4. Log akce bez PII klienta (R20).
 */

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  beforeStart: 'Docházku lze označit až po začátku termínu',
  generic: 'Operaci se nepodařilo dokončit. Zkuste to prosím znovu.',
} as const;

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

export async function markAttendance(
  reservationId: string,
  attendance: AttendanceStatus,
): Promise<ReservationMutationResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  // (2) Načtení `starts_at` pro serverovou časovou bránu (RLS izoluje na podnik).
  const { data: existing, error: loadError } = await supabase
    .from('reservations')
    .select('id, business_id, starts_at')
    .eq('id', reservationId)
    .maybeSingle<{ id: string; business_id: string; starts_at: string }>();

  if (loadError) {
    await safeLog('attendance_load_failed', { reservationId });
    return { ok: false, message: MESSAGES.generic };
  }

  if (!existing) {
    return { ok: false, message: MESSAGES.generic };
  }

  // Časová brána: docházku lze označit až po začátku termínu (R11.3, R11.4).
  if (Date.now() <= new Date(existing.starts_at).getTime()) {
    return { ok: false, message: MESSAGES.beforeStart };
  }

  // (3) UPDATE pouze pole `attendance` — `status` zůstává beze změny (R11.6).
  const { error: updateError } = await supabase
    .from('reservations')
    .update({ attendance })
    .eq('id', reservationId);

  if (updateError) {
    await safeLog('attendance_mark_failed', { reservationId, businessId: existing.business_id });
    return { ok: false, message: MESSAGES.generic };
  }

  await safeLog('attendance_marked', {
    businessId: existing.business_id,
    reservationId: existing.id,
    action_type: 'attendance',
    attendance,
  });

  return { ok: true };
}
