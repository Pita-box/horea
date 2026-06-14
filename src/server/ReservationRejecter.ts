'use server';

import { toPragueDisplay } from '@/lib/datetime';
import { dispatchTransactionalEmail } from '@/lib/email/dispatcher';
import { renderReservationRejectedEmail } from '@/lib/email/templates/reservation-rejected';
import { serverLog } from '@/lib/log-server';
import type { ReservationMutationResult } from '@/lib/reservations/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Reservation_Rejecter — server action měnící status `pending → rejected`,
 * ukládající volitelný důvod a iniciující best-effort Reservation_Rejected_Email (R7).
 *
 * Tok:
 *  1. Ověření přihlášení (uživatelský JWT, RLS `tenant_isolation`).
 *  2. Validace důvodu ≤ 500 znaků (R7.2) — jinak hláška bez zápisu.
 *  3. ATOMICKÝ status guard: podmíněný UPDATE `WHERE id = ? AND status = 'pending'`
 *     se zápisem `status = 'rejected'` a `status_reason`. Bez ovlivněného řádku
 *     vrátíme českou hlášku bez změny stavu (R7.4).
 *  4. Po commitu best-effort e-mail s důvodem, byl-li zadán (R7.5, R7.6).
 *  5. Log akce bez PII klienta (R20).
 */

const PLATFORM_BASE_URL = 'https://www.horea.cz';
const MAX_REASON_LENGTH = 500;

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  reasonTooLong: 'Důvod smí mít nejvýše 500 znaků',
  invalidState: 'Rezervaci nelze odmítnout, není ve stavu Čeká na schválení',
} as const;

type EmbedService = { name: string; duration_minutes: number; price_czk: number | string };
type EmbedBusiness = { name: string; slug: string };

type RejectedRow = {
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

export async function rejectReservation(
  reservationId: string,
  reason?: string | null,
): Promise<ReservationMutationResult> {
  const trimmedReason = reason?.trim() ? reason.trim() : null;

  // (2) Validace délky důvodu (R7.2).
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

  // (3) Atomický status guard `pending → rejected` + uložení důvodu.
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'rejected', status_reason: trimmedReason })
    .eq('id', reservationId)
    .eq('status', 'pending')
    .select(
      'id, business_id, client_email, client_name, starts_at, status_reason, services(name, duration_minutes, price_czk), businesses(name, slug)',
    );

  if (error) {
    await safeLog('reservation_reject_failed', { reservationId });
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  const row = (data?.[0] ?? null) as RejectedRow | null;

  if (!row) {
    return { ok: false, message: MESSAGES.invalidState };
  }

  await safeLog('reservation_rejected', {
    businessId: row.business_id,
    reservationId: row.id,
    action_type: 'reject',
  });

  // (4) Post-commit best-effort e-mail klientovi (R7.5, R7.6).
  const service = pickOne(row.services);
  const business = pickOne(row.businesses);

  if (row.client_email && service && business) {
    const [reservationDate, reservationTime] = toPragueDisplay(row.starts_at).split(' ');
    const email = renderReservationRejectedEmail({
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
      emailType: 'reservation_rejected',
      to: row.client_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  return { ok: true };
}
