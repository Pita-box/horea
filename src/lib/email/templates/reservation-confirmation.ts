import { wrapEmail } from './base';

/** Stav rezervace, který určuje text dalších kroků v e-mailu (R10.2). */
type ReservationStatus = 'pending' | 'approved';

/** Jedna služba v uspořádané množině rezervace (R16.1). */
type ServiceLine = {
  /** Název služby (uživatelský vstup — v HTML se escapuje). */
  name: string;
  /** Trvání služby v minutách. */
  durationMinutes: number;
};

type ReservationConfirmationEmailInput = {
  /** Jméno klienta pro oslovení (uživatelský vstup — v HTML se escapuje). */
  clientName: string;
  /** Název podniku (uživatelský vstup — escapuje se). */
  businessName: string;
  /** Uspořádaná množina služeb v pořadí `position` (R4.3, R16.1). */
  services: ServiceLine[];
  /** Kombinovaná délka rezervace v minutách (`Combined_Duration`, R2.1). */
  combinedDurationMinutes: number;
  /** Kombinovaná cena rezervace v Kč (`Combined_Price`, R3.1). */
  combinedPriceCzk: number;
  /** Datum slotu už naformátované v pásmu Europe/Prague (např. „15.07.2024"). */
  reservationDate: string;
  /** Počáteční čas slotu už naformátovaný v Europe/Prague (např. „09:30"). */
  reservationTime: string;
  /** Stav rezervace (`pending` čeká na schválení, `approved` potvrzeno). */
  status: ReservationStatus;
  /** Telefon podniku, pokud je na profilu vyplněn (uživatelský vstup — escapuje se). */
  businessPhone?: string | null;
  /** E-mail podniku, pokud je na profilu vyplněn (uživatelský vstup — escapuje se). */
  businessEmail?: string | null;
  /** Absolutní URL veřejného profilu podniku. */
  businessUrl: string;
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

/** Český popis dalších kroků podle stavu rezervace (R10.2). */
function statusMessage(status: ReservationStatus): string {
  return status === 'approved'
    ? 'Rezervace je potvrzena. Těšíme se na Vás.'
    : 'Rezervace čeká na schválení podnikem. O výsledku Vás budeme informovat e-mailem.';
}

/**
 * Sestaví Reservation_Confirmation_Email pro klienta (R10, R16.1, R16.3).
 *
 * Vypíše všechny služby rezervace v uloženém pořadí (název + délka),
 * `Combined_Duration` a `Combined_Price` (cena 0 Kč se neuvádí, R3.3) a jeden
 * časový blok. Časy se očekávají už převedené do pásma Europe/Prague (převod
 * řeší volající `EmailNotifier`), cena se formátuje v Kč. Veškerá uživatelská
 * pole se v HTML variantě escapují.
 */
export function renderReservationConfirmationEmail(
  input: ReservationConfirmationEmailInput,
): RenderedEmail {
  const subject = `Vaše rezervace — ${input.businessName}`;
  const totalDuration = `${input.combinedDurationMinutes} min`;
  const totalPrice = formatPriceCzk(input.combinedPriceCzk);
  const showPrice = input.combinedPriceCzk > 0;
  const status = statusMessage(input.status);

  // --- HTML varianta (uživatelská pole escapujeme) ---
  const servicesHtml = input.services
    .map((service) => `<li>${escapeHtml(service.name)} (${service.durationMinutes} min)</li>`)
    .join('\n');

  const totalsHtml = `<p style="margin:0 0 16px;">Celková délka: <strong>${totalDuration}</strong>${
    showPrice ? `, celková cena: <strong>${totalPrice}</strong>` : ''
  }</p>`;

  const contactLinesHtml: string[] = [];
  if (input.businessPhone) {
    contactLinesHtml.push(`Telefon: ${escapeHtml(input.businessPhone)}`);
  }
  if (input.businessEmail) {
    contactLinesHtml.push(`E-mail: ${escapeHtml(input.businessEmail)}`);
  }

  const safeBusinessUrl = escapeHtml(input.businessUrl);

  const footerHtml = `${
    contactLinesHtml.length > 0
      ? `<p style="margin:0 0 8px;">Kontakt na podnik — ${contactLinesHtml.join(', ')}.</p>`
      : ''
  }<p style="margin:0 0 8px;">Profil podniku: <a href="${safeBusinessUrl}" style="color:#5b2eff;">${safeBusinessUrl}</a></p>
<p style="margin:0;color:#667085;">E-mail byl odeslán automaticky platformou Horea.cz na vyžádání podniku.</p>`;

  const body = `<p style="margin:0 0 16px;">Dobrý den, ${escapeHtml(input.clientName)},</p>
<p style="margin:0 0 8px;">rezervovali jste si v podniku <strong>${escapeHtml(input.businessName)}</strong> na <strong>${escapeHtml(input.reservationDate)}</strong> v <strong>${escapeHtml(input.reservationTime)}</strong> (čas Europe/Prague) tyto služby:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
${servicesHtml}
</ul>
${totalsHtml}
<p style="margin:0 0 24px;">${status}</p>
${footerHtml}`;

  // --- Textová varianta ---
  const textLines = [
    `Dobrý den, ${input.clientName},`,
    '',
    `rezervovali jste si v podniku ${input.businessName} na ${input.reservationDate} v ${input.reservationTime} (čas Europe/Prague) tyto služby:`,
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
  textLines.push(status);
  textLines.push('');

  const contactLinesText: string[] = [];
  if (input.businessPhone) {
    contactLinesText.push(`Telefon: ${input.businessPhone}`);
  }
  if (input.businessEmail) {
    contactLinesText.push(`E-mail: ${input.businessEmail}`);
  }

  if (contactLinesText.length > 0) {
    textLines.push(`Kontakt na podnik — ${contactLinesText.join(', ')}.`);
  }
  textLines.push(`Profil podniku: ${input.businessUrl}`);
  textLines.push('');
  textLines.push('E-mail byl odeslán automaticky platformou Horea.cz na vyžádání podniku.');

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text: textLines.join('\n'),
  };
}
