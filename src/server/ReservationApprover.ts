'use server';

import { toPragueDisplay } from '@/lib/datetime';
import { dispatchTransactionalEmail } from '@/lib/email/dispatcher';
import { renderReservationApprovedEmail } from '@/lib/email/templates/reservation-approved';
import { serverLog } from '@/lib/log-server';
import type { ReservationMutationResult } from '@/lib/reservations/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Reservation_Approver — server action měnící status rezervace `pending → approved`
 * a iniciující best-effort Reservation_Approved_Email (R6).
 *
 * Tok:
 *  1. Ověření přihlášení (čtení/zápis pod uživatelským JWT majitele; RLS
 *     `tenant_isolation` z migrace 0007 izoluje data na podnik majitele).
 *  2. ATOMICKÝ status guard: podmíněný UPDATE `WHERE id = ? AND status = 'pending'`.
 *     Pokud neovlivní žádný řádek (status mezitím nebyl `pending`, případně
 *     rezervace nepatří podniku), vrátíme českou hlášku bez změny stavu (R6.2).
 *  3. Po commitu best-effort e-mail klientovi přes Email_Dispatcher (R6.3, R6.4).
 *     Selhání e-mailu NEZPŮSOBÍ revert změny statusu.
 *  4. Log akce bez PII klienta (R20).
 */

const PLATFORM_BASE_URL = 'https://www.horea.cz';

const MESSAGES = {
  notAuthenticated: 'Přihlaste se prosím znovu.',
  invalidState: 'Rezervaci nelze schválit, není ve stavu Čeká na schválení',
} as const;

type EmbedService = { name: string; duration_minutes: number; price_czk: number | string };
type EmbedBusiness = { name: string; slug: string };

/**
 * Řádek vrácený podmíněným UPDATE se zanořenou službou a podnikem. Supabase
 * typuje to-one embed jako pole; za běhu vrací objekt — proto union + `pickOne`.
 */
type ApprovedRow = {
  id: string;
  business_id: string;
  client_email: string | null;
  client_name: string;
  starts_at: string;
  services: EmbedService | EmbedService[] | null;
  businesses: EmbedBusiness | EmbedBusiness[] | null;
};

/** Supabase vrací to-one embed jako objekt; typové generiká někdy hlásí pole. */
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

export async function approveReservation(
  reservationId: string,
): Promise<ReservationMutationResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  // (2) Atomický status guard: UPDATE proběhne jen, je-li rezervace `pending`.
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'approved' })
    .eq('id', reservationId)
    .eq('status', 'pending')
    .select(
      'id, business_id, client_email, client_name, starts_at, services(name, duration_minutes, price_czk), businesses(name, slug)',
    );

  if (error) {
    await safeLog('reservation_approve_failed', { reservationId });
    return { ok: false, message: MESSAGES.notAuthenticated };
  }

  const row = (data?.[0] ?? null) as ApprovedRow | null;

  if (!row) {
    // Žádný ovlivněný řádek → status nebyl `pending` (nebo cizí podnik / neexistuje).
    return { ok: false, message: MESSAGES.invalidState };
  }

  await safeLog('reservation_approved', {
    businessId: row.business_id,
    reservationId: row.id,
    action_type: 'approve',
  });

  // (3) Post-commit best-effort e-mail klientovi (R6.3, R6.4).
  const service = pickOne(row.services);
  const business = pickOne(row.businesses);

  if (row.client_email && service && business) {
    const [reservationDate, reservationTime] = toPragueDisplay(row.starts_at).split(' ');
    const email = renderReservationApprovedEmail({
      clientName: row.client_name,
      businessName: business.name,
      serviceName: service.name,
      serviceDurationMinutes: service.duration_minutes,
      servicePriceCzk: Number(service.price_czk),
      reservationDate,
      reservationTime,
      businessUrl: `${PLATFORM_BASE_URL}/${business.slug}`,
    });

    await dispatchTransactionalEmail({
      reservationId: row.id,
      emailType: 'reservation_approved',
      to: row.client_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  return { ok: true };
}
