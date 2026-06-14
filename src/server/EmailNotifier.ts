import 'server-only';

import { renderReservationConfirmationEmail } from '@/lib/email/templates/reservation-confirmation';
import { renderReservationNotificationEmail } from '@/lib/email/templates/reservation-notification';
import { dispatchTransactionalEmail } from '@/lib/email/dispatcher';
import { toPragueDisplay } from '@/lib/datetime';

/** Stav rezervace předávaný do e-mailových šablon. */
type ReservationStatus = 'pending' | 'approved';

type ReservationConfirmationParams = {
  /** ID rezervace — pouze pro logování, NIKDY se nevkládá do e-mailu (R18.4). */
  reservationId: string;
  /** Příjemce — e-mail klienta z rezervačního formuláře (R10.1). */
  recipientEmail: string;
  clientName: string;
  businessName: string;
  serviceName: string;
  serviceDurationMinutes: number;
  servicePriceCzk: number;
  /** Počátek slotu v UTC; do Europe/Prague se převede zde, na hraně DB↔UI (R17.2). */
  startsAt: Date | string;
  status: ReservationStatus;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessUrl: string;
};

type ReservationNotificationParams = {
  /** ID rezervace — pouze pro logování, NIKDY se nevkládá do e-mailu (R18.4). */
  reservationId: string;
  /** Příjemce — kontaktní e-mail majitele podniku (R11.1). */
  recipientEmail: string;
  businessName: string;
  serviceName: string;
  serviceDurationMinutes: number;
  servicePriceCzk: number;
  /** Počátek slotu v UTC; do Europe/Prague se převede zde, na hraně DB↔UI (R17.2). */
  startsAt: Date | string;
  status: ReservationStatus;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientNote?: string | null;
  employeeName?: string | null;
  dashboardUrl: string;
};

/**
 * Převede UTC okamžik na zobrazení v Europe/Prague rozdělené na datum a čas.
 * `toPragueDisplay` vrací pevný tvar „DD.MM.YYYY HH:mm", takže rozdělení podle
 * mezery je bezpečné.
 */
function pragueDateAndTime(startsAt: Date | string): {
  reservationDate: string;
  reservationTime: string;
} {
  const [reservationDate, reservationTime] = toPragueDisplay(startsAt).split(' ');

  return { reservationDate, reservationTime };
}

/**
 * Odešle Reservation_Confirmation_Email klientovi (R10).
 *
 * Best-effort kontrakt (R10.3): funkce NIKDY nevyhazuje výjimku do volajícího.
 * Při selhání zaloguje pouze `reservationId` a kód chyby Resendu (bez příjemce
 * a dalších citlivých údajů — R18.4) a vrátí `{ ok: false }`.
 */
export async function sendReservationConfirmation(
  params: ReservationConfirmationParams,
): Promise<{ ok: boolean }> {
  const { reservationDate, reservationTime } = pragueDateAndTime(params.startsAt);

  const email = renderReservationConfirmationEmail({
    clientName: params.clientName,
    businessName: params.businessName,
    serviceName: params.serviceName,
    serviceDurationMinutes: params.serviceDurationMinutes,
    servicePriceCzk: params.servicePriceCzk,
    reservationDate,
    reservationTime,
    status: params.status,
    businessPhone: params.businessPhone,
    businessEmail: params.businessEmail,
    businessUrl: params.businessUrl,
  });

  return dispatchTransactionalEmail({
    reservationId: params.reservationId,
    emailType: 'reservation_confirmation',
    to: params.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

/**
 * Odešle Reservation_Notification_Email majiteli podniku (R11).
 *
 * Best-effort kontrakt (R11.3): funkce NIKDY nevyhazuje výjimku do volajícího.
 * Při selhání zaloguje pouze `reservationId` a kód chyby Resendu (bez příjemce
 * a kontaktních údajů klienta — R18.4) a vrátí `{ ok: false }`.
 */
export async function sendReservationNotification(
  params: ReservationNotificationParams,
): Promise<{ ok: boolean }> {
  const { reservationDate, reservationTime } = pragueDateAndTime(params.startsAt);

  const email = renderReservationNotificationEmail({
    businessName: params.businessName,
    serviceName: params.serviceName,
    serviceDurationMinutes: params.serviceDurationMinutes,
    servicePriceCzk: params.servicePriceCzk,
    reservationDate,
    reservationTime,
    status: params.status,
    clientName: params.clientName,
    clientPhone: params.clientPhone,
    clientEmail: params.clientEmail,
    clientNote: params.clientNote,
    employeeName: params.employeeName,
    dashboardUrl: params.dashboardUrl,
  });

  return dispatchTransactionalEmail({
    reservationId: params.reservationId,
    emailType: 'reservation_notification',
    to: params.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
