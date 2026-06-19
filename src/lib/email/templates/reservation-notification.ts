import { wrapEmail } from './base';

/** Stav rezervace (`pending` čeká na schválení, `approved` potvrzeno). */
type ReservationStatus = 'pending' | 'approved';

/** Jedna služba v uspořádané množině rezervace (R16.2). */
type ServiceLine = {
  /** Název služby (uživatelský vstup — v HTML se escapuje). */
  name: string;
  /** Trvání služby v minutách. */
  durationMinutes: number;
};

type ReservationNotificationEmailInput = {
  /** Název podniku (uživatelský vstup — v HTML se escapuje). */
  businessName: string;
  /** Uspořádaná množina služeb v pořadí `position` (R4.3, R16.2). */
  services: ServiceLine[];
  /** Kombinovaná délka rezervace v minutách (`Combined_Duration`, R2.1). */
  combinedDurationMinutes: number;
  /** Kombinovaná cena rezervace v Kč (`Combined_Price`, R3.1). */
  combinedPriceCzk: number;
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

/** Spojí názvy služeb do jednoho pole oddělovačem ` + ` v uloženém pořadí. */
function joinNames(services: readonly ServiceLine[]): string {
  return services.map((service) => service.name).join(' + ');
}

/** Krátký český popis stavu rezervace pro majitele. */
function statusLabel(status: ReservationStatus): string {
  return status === 'approved' ? 'potvrzeno' : 'čeká na schválení';
}

/**
 * Sestaví Reservation_Notification_Email pro majitele podniku (R11, R16.2, R16.3).
 *
 * Vypíše všechny služby rezervace v uloženém pořadí (název + délka),
 * `Combined_Duration` a `Combined_Price` (cena 0 Kč se neuvádí) a jeden časový
 * blok. Časy se očekávají už převedené do pásma Europe/Prague (převod řeší
 * volající `EmailNotifier`), cena se formátuje v Kč. Veškerá uživatelská pole
 * (včetně kontaktu a poznámky klienta) se v HTML variantě escapují.
 */
export function renderReservationNotificationEmail(
  input: ReservationNotificationEmailInput,
): RenderedEmail {
  const joinedNames = joinNames(input.services);
  const subject = `Nová rezervace — ${joinedNames}, ${input.reservationDate} ${input.reservationTime}`;
  const totalDuration = `${input.combinedDurationMinutes} min`;
  const totalPrice = formatPriceCzk(input.combinedPriceCzk);
  const showPrice = input.combinedPriceCzk > 0;
  const label = statusLabel(input.status);
  const safeDashboardUrl = escapeHtml(input.dashboardUrl);

  // --- HTML varianta (uživatelská pole escapujeme) ---
  const servicesHtml = input.services
    .map((service) => `<li>${escapeHtml(service.name)} (${service.durationMinutes} min)</li>`)
    .join('\n');

  const totalsHtml = `<p style="margin:0 0 16px;">Celková délka: <strong>${totalDuration}</strong>${
    showPrice ? `, celková cena: <strong>${totalPrice}</strong>` : ''
  }</p>`;

  const noteHtml = input.clientNote
    ? `<p style="margin:0 0 16px;">Poznámka klienta: ${escapeHtml(input.clientNote)}</p>`
    : '';

  const employeeHtml = input.employeeName
    ? `<p style="margin:0 0 16px;">Preferovaný zaměstnanec: <strong>${escapeHtml(input.employeeName)}</strong></p>`
    : '';

  const body = `<p style="margin:0 0 16px;">Dobrý den,</p>
<p style="margin:0 0 8px;">nová rezervace na <strong>${escapeHtml(input.reservationDate)}</strong> v <strong>${escapeHtml(input.reservationTime)}</strong> na tyto služby:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
${servicesHtml}
</ul>
${totalsHtml}
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
    `nová rezervace na ${input.reservationDate} v ${input.reservationTime} na tyto služby:`,
  ];

  for (const service of input.services) {
    textLines.push(`- ${service.name} (${service.durationMinutes} min)`);
  }

  textLines.push('');
  textLines.push(
    showPrice
      ? `Celková délka: ${totalDuration}, celková cena: ${totalPrice}.`
      : `Celková délka: ${totalDuration}.`,
  );
  textLines.push('');
  textLines.push(`Stav rezervace: ${label}`);

  if (input.employeeName) {
    textLines.push('', `Preferovaný zaměstnanec: ${input.employeeName}`);
  }

  textLines.push(
    '',
    'Kontaktní údaje klienta:',
    `- Jméno: ${input.clientName}`,
    `- Telefon: ${input.clientPhone}`,
    `- E-mail: ${input.clientEmail}`,
  );

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
