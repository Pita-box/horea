import 'server-only';

import { sendBestEffort } from '@/lib/email/outbox';

/**
 * Email_Dispatcher — sdílený best-effort odeslací vzor notifikací rezervací
 * (R18.6, R18.7 specu reservation-management).
 *
 * Tenký adaptér nad {@link sendBestEffort} (outbox): pošle e-mail jako kategorii
 * `reservation_notification` (SMTP2GO je-li nakonfigurováno, jinak Resend) a při
 * přechodné chybě ho zařadí do outboxu k pozdějšímu retry. NIKDY nevyhazuje
 * výjimku a NIKDY neloguje PII (jen `reservationId`, `emailType`, error code).
 */

// Zpětně kompatibilní re-export — používá ho contact route, invoice/admin notifikace ad.
export { describeResendError } from '@/lib/email/errors';

export type DispatchTransactionalEmailParams = {
  /** ID rezervace — pouze pro logování, NIKDY se nevkládá do e-mailu (R18.4). */
  reservationId: string;
  /** Kategorie e-mailu pro logování (např. `reservation_confirmation`). */
  emailType: string;
  /** Příjemce — předává se poskytovateli, ale NIKDY se neloguje (R18.4). */
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Odešle jednu notifikaci rezervace best-effort (s retry frontou na pozadí).
 *
 * Kontrakt: funkce NIKDY nevyhodí výjimku do volajícího a vrátí `{ ok }` podle
 * inline odeslání.
 */
export async function dispatchTransactionalEmail(
  params: DispatchTransactionalEmailParams,
): Promise<{ ok: boolean }> {
  return sendBestEffort({
    category: 'reservation_notification',
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    refId: params.reservationId,
    logLabel: params.emailType,
  });
}
