'use server';

import { toPragueDisplay } from '@/lib/datetime';
import { dispatchTransactionalEmail } from '@/lib/email/dispatcher';
import { renderReservationCancelledEmail } from '@/lib/email/templates/reservation-cancelled';
import { serverLog } from '@/lib/log-server';
import type { ReservationMutationResult } from '@/lib/reservations/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Reservation_Canceller — server action měnící status `approved → cancelled`,
 * ukládající volitelný důvod a iniciující best-effort Reservation_Cancelled_Email (R8).
 *
 * Tok:
 *  1. Ověření přihlášení (uživatelský JWT, RLS `tenant_isolation`).
 *  2. Validace důvodu ≤ 500 znaků (R8.2) — jinak hláška bez zápisu.
 *  3. ATOMICKÝ status guard: podmíněný UPDATE `WHERE id = ? AND status = 'approved'`
 *     se zápisem `status = 'cancelled'` a `status_reason`. Bez ovlivněného řádku
 *     vrátíme českou hlášku bez změny stavu (R8.4).
 *  4. Po commitu best-effort e-mail s původním termínem a důvodem, byl-li zadán
 *     (R8.5, R8.6). Selhání e-mailu NEZPŮSOBÍ revert.
 *  5. Log akce bez PII klienta (R20).
 */

const PLATFORM_BASE_URL = 'https://www.horea.cz';
const MAX_REASON_LENGTH = 500;

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  reasonTooLong: 'Důvod smí mít nejvýše 500 znaků',
  invalidState: 'Zrušit lze pouze schválenou rezervaci',
} as const;

type EmbedService = { name: string; duration_minutes: number; price_czk: number | string };
type EmbedBusiness = { name: string; slug: string };

type CancelledRow = {
  id: string;
  business_id: string;
  client_email: string | null;
  client_name: string;
  starts_at: string;
  status_reason: string | null;
  services: EmbedService | EmbedService[] | null;
  businesses: EmbedBusiness | EmbedBusiness[] | null;
};

function pickOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

async function safeLog(message: string, context: Record<string, unknown>): Promise<void> {
  try {
    await serverLog.info(message, context);
  } catch {
    // Logování je best-effort a nesmí shodit hlavní operaci.
  }
}

export async function cancelReservation(
  reservationId: string,
  reason?: string | null,
): Promise<ReservationMutationResult> {
  const trimmedReason = reason?.trim() ? reason.trim() : null;

  // (2) Validace délky důvodu (R8.2).
  if (trimmedReason !== null && trimmedReason.length > MAX_REASON_LENGTH) {
    return { ok: false, message: MESSAGES.reasonTooLong };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  // (3) Atomický status guard `approved → cancelled` + uložení důvodu.
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', status_reason: trimmedReason })
    .eq('id', reservationId)
    .eq('status', 'approved')
    .select(
      'id, business_id, client_email, client_name, starts_at, status_reason, services(name, duration_minutes, price_czk), businesses(name, slug)',
    );

  if (error) {
    await safeLog('reservation_cancel_failed', { reservationId });
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  const row = (data?.[0] ?? null) as CancelledRow | null;

  if (!row) {
    return { ok: false, message: MESSAGES.invalidState };
  }

  await safeLog('reservation_cancelled', {
    businessId: row.business_id,
    reservationId: row.id,
    action_type: 'cancel',
  });

  // (4) Post-commit best-effort e-mail klientovi (R8.5, R8.6).
  const service = pickOne(row.services);
  const business = pickOne(row.businesses);

  if (row.client_email && service && business) {
    const [reservationDate, reservationTime] = toPragueDisplay(row.starts_at).split(' ');
    const email = renderReservationCancelledEmail({
      clientName: row.client_name,
      businessName: business.name,
      serviceName: service.name,
      serviceDurationMinutes: service.duration_minutes,
      servicePriceCzk: Number(service.price_czk),
      reservationDate,
      reservationTime,
      statusReason: row.status_reason,
      businessUrl: `${PLATFORM_BASE_URL}/${business.slug}`,
    });

    await dispatchTransactionalEmail({
      reservationId: row.id,
      emailType: 'reservation_cancelled',
      to: row.client_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  return { ok: true };
}
