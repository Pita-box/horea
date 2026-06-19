import { wrapEmail } from './base';

/** Jedna služba v uspořádané množině rezervace po úpravě (R16.1). */
type ServiceLine = {
  /** Název služby (uživatelský vstup — v HTML se escapuje). */
  name: string;
  /** Trvání služby v minutách. */
  durationMinutes: number;
};

type ReservationModifiedEmailInput = {
  /** Jméno klienta pro oslovení (uživatelský vstup — v HTML se escapuje). */
  clientName: string;
  /** Název podniku (uživatelský vstup — escapuje se). */
  businessName: string;
  /** Uspořádaná množina služeb PO úpravě v pořadí `position` (R4.3, R16.1). */
  services: ServiceLine[];
  /** Kombinovaná délka rezervace po úpravě v minutách (`Combined_Duration`, R2.1). */
  combinedDurationMinutes: number;
  /** Kombinovaná cena rezervace po úpravě v Kč (`Combined_Price`, R3.1). */
  combinedPriceCzk: number;
  /** Datum rezervace PO úpravě už naformátované v Europe/Prague (např. „15.07.2024"). */
  reservationDate: string;
  /** Počáteční čas rezervace PO úpravě už naformátovaný v Europe/Prague (např. „09:30"). */
  reservationTime: string;
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

/**
 * Sestaví Reservation_Modified_Email pro klienta po úpravě rezervace (R16.1, R16.3).
 *
 * Shrnutí uvádí hodnoty PO úpravě: všechny služby v uloženém pořadí (název +
 * délka), `Combined_Duration`, `Combined_Price` (cena 0 Kč se neuvádí) a jeden
 * časový blok převedený do Europe/Prague; cena se formátuje v Kč. Veškerá
 * uživatelská pole se v HTML variantě escapují. Patička obsahuje odkaz na
 * veřejný profil podniku a generický disclaimer.
 */
export function renderReservationModifiedEmail(input: ReservationModifiedEmailInput): RenderedEmail {
  const subject = `Vaše rezervace byla upravena — ${input.businessName}`;
  const totalDuration = `${input.combinedDurationMinutes} min`;
  const totalPrice = formatPriceCzk(input.combinedPriceCzk);
  const showPrice = input.combinedPriceCzk > 0;
  const safeBusinessUrl = escapeHtml(input.businessUrl);

  // --- HTML varianta (uživatelská pole escapujeme) ---
  const servicesHtml = input.services
    .map((service) => `<li>${escapeHtml(service.name)} (${service.durationMinutes} min)</li>`)
    .join('\n');

  const totalsHtml = `<p style="margin:0 0 24px;">Celková délka: <strong>${totalDuration}</strong>${
    showPrice ? `, celková cena: <strong>${totalPrice}</strong>` : ''
  }</p>`;

  const body = `<p style="margin:0 0 16px;">Dobrý den, ${escapeHtml(input.clientName)},</p>
<p style="margin:0 0 16px;"><strong>Vaše rezervace byla upravena.</strong></p>
<p style="margin:0 0 8px;">V podniku <strong>${escapeHtml(input.businessName)}</strong> nyní platí na <strong>${escapeHtml(input.reservationDate)}</strong> v <strong>${escapeHtml(input.reservationTime)}</strong> (čas Europe/Prague) tyto služby:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
${servicesHtml}
</ul>
${totalsHtml}
<p style="margin:0 0 8px;">Profil podniku: <a href="${safeBusinessUrl}" style="color:#5b2eff;">${safeBusinessUrl}</a></p>
<p style="margin:0;color:#667085;">E-mail byl odeslán automaticky platformou Horea.cz.</p>`;

  // --- Textová varianta ---
  const textLines = [
    `Dobrý den, ${input.clientName},`,
    '',
    'Vaše rezervace byla upravena.',
    '',
    `V podniku ${input.businessName} nyní platí na ${input.reservationDate} v ${input.reservationTime} (čas Europe/Prague) tyto služby:`,
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
  textLines.push(`Profil podniku: ${input.businessUrl}`);
  textLines.push('');
  textLines.push('E-mail byl odeslán automaticky platformou Horea.cz.');

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text: textLines.join('\n'),
  };
}
