import { wrapEmail } from './base';

/** Stav rezervace (`pending` čeká na schválení, `approved` potvrzeno). */
type ReservationStatus = 'pending' | 'approved';

type ReservationNotificationEmailInput = {
  /** Název podniku (uživatelský vstup — v HTML se escapuje). */
  businessName: string;
  /** Název služby (uživatelský vstup — escapuje se). */
  serviceName: string;
  /** Trvání služby v minutách. */
  serviceDurationMinutes: number;
  /** Cena služby v Kč. */
  servicePriceCzk: number;
  /** Datum slotu už naformátované v pásmu Europe/Prague (např. „15.07.2024"). */
  reservationDate: string;
  /** Počáteční čas slotu už naformátovaný v Europe/Prague (např. „09:30"). */
  reservationTime: string;
  /** Stav rezervace podle `auto_approve_reservations`. */
  status: ReservationStatus;
  /** Jméno klienta (uživatelský vstup — escapuje se). */
  clientName: string;
  /** Telefon klienta (uživatelský vstup — escapuje se). */
  clientPhone: string;
  /** E-mail klienta (uživatelský vstup — escapuje se). */
  clientEmail: string;
  /** Poznámka klienta, pokud je vyplněna (uživatelský vstup — escapuje se). */
  clientNote?: string | null;
  /** Preferovaný zaměstnanec, pokud klient vybral (jinak se neuvádí). */
  employeeName?: string | null;
  /** Cesta na seznam rezervací v dashboardu. */
  dashboardUrl: string;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/** Escapuje hodnoty vkládané do HTML, aby uživatelská pole nemohla injektovat značky. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Naformátuje cenu v Kč v českém formátu (oddělovač tisíců, bez desetinných míst). */
function formatPriceCzk(value: number): string {
  return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(value)} Kč`;
}

/** Krátký český popis stavu rezervace pro majitele. */
function statusLabel(status: ReservationStatus): string {
  return status === 'approved' ? 'potvrzeno' : 'čeká na schválení';
}

/**
 * Sestaví Reservation_Notification_Email pro majitele podniku (R11).
 *
 * Časy se očekávají už převedené do pásma Europe/Prague (převod řeší volající
 * `EmailNotifier`), cena se formátuje v Kč. Veškerá uživatelská pole (včetně
 * kontaktu a poznámky klienta) se v HTML variantě escapují.
 */
export function renderReservationNotificationEmail(
  input: ReservationNotificationEmailInput,
): RenderedEmail {
  const subject = `Nová rezervace — ${input.serviceName}, ${input.reservationDate} ${input.reservationTime}`;
  const price = formatPriceCzk(input.servicePriceCzk);
  const label = statusLabel(input.status);
  const safeDashboardUrl = escapeHtml(input.dashboardUrl);

  // --- HTML varianta (uživatelská pole escapujeme) ---
  const noteHtml = input.clientNote
    ? `<p style="margin:0 0 16px;">Poznámka klienta: ${escapeHtml(input.clientNote)}</p>`
    : '';

  const employeeHtml = input.employeeName
    ? `<p style="margin:0 0 16px;">Preferovaný zaměstnanec: <strong>${escapeHtml(input.employeeName)}</strong></p>`
    : '';

  const body = `<p style="margin:0 0 16px;">Dobrý den,</p>
<p style="margin:0 0 16px;">nová rezervace na službu <strong>${escapeHtml(input.serviceName)}</strong> (${input.serviceDurationMinutes} min, ${price}) na <strong>${escapeHtml(input.reservationDate)}</strong> v <strong>${escapeHtml(input.reservationTime)}</strong>.</p>
<p style="margin:0 0 16px;">Stav rezervace: <strong>${label}</strong></p>
${employeeHtml}<p style="margin:0 0 8px;">Kontaktní údaje klienta:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li>Jméno: ${escapeHtml(input.clientName)}</li>
<li>Telefon: ${escapeHtml(input.clientPhone)}</li>
<li>E-mail: ${escapeHtml(input.clientEmail)}</li>
</ul>
${noteHtml}<p style="margin:0 0 24px;"><a href="${safeDashboardUrl}" style="color:#5b2eff;">Otevřít rezervace v dashboardu</a></p>
<p style="margin:0;color:#667085;">E-mail byl odeslán automaticky platformou Horea.cz.</p>`;

  // --- Textová varianta ---
  const textLines = [
    'Dobrý den,',
    '',
    `nová rezervace na službu ${input.serviceName} (${input.serviceDurationMinutes} min, ${price}) na ${input.reservationDate} v ${input.reservationTime}.`,
    '',
    `Stav rezervace: ${label}`,
    '',
    'Kontaktní údaje klienta:',
    `- Jméno: ${input.clientName}`,
    `- Telefon: ${input.clientPhone}`,
    `- E-mail: ${input.clientEmail}`,
  ];

  if (input.employeeName) {
    textLines.splice(6, 0, `Preferovaný zaměstnanec: ${input.employeeName}`, '');
  }

  if (input.clientNote) {
    textLines.push('', `Poznámka klienta: ${input.clientNote}`);
  }

  textLines.push('', `Rezervace v dashboardu: ${input.dashboardUrl}`);
  textLines.push('', 'E-mail byl odeslán automaticky platformou Horea.cz.');

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text: textLines.join('\n'),
  };
}
