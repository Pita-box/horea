import { wrapEmail } from './base';

type ReservationRejectedEmailInput = {
  /** Jméno klienta pro oslovení (uživatelský vstup — v HTML se escapuje). */
  clientName: string;
  /** Název podniku (uživatelský vstup — escapuje se). */
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
  /** Volitelný důvod odmítnutí; pokud je vyplněn, zobrazí se v odlišeném bloku (uživatelský vstup — escapuje se). */
  statusReason?: string | null;
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
 * Sestaví Reservation_Rejected_Email pro klienta po odmítnutí rezervace (R18.2).
 *
 * Časy se očekávají už převedené do pásma Europe/Prague, cena se formátuje v Kč.
 * Pokud byl zadán důvod (`statusReason`), zobrazí se ve vizuálně odlišeném bloku
 * odděleném od vlastního těla; jinak se blok vynechá. Veškerá uživatelská pole se
 * v HTML variantě escapují. Patička obsahuje odkaz na veřejný profil podniku a
 * generický disclaimer (R18.5).
 */
export function renderReservationRejectedEmail(input: ReservationRejectedEmailInput): RenderedEmail {
  const subject = `Vaše rezervace byla odmítnuta — ${input.businessName}`;
  const price = formatPriceCzk(input.servicePriceCzk);
  const safeBusinessUrl = escapeHtml(input.businessUrl);
  const reason = input.statusReason?.trim();

  // --- HTML varianta (uživatelská pole escapujeme) ---
  // Důvod odmítnutí zobrazíme jako vizuálně odlišený citátový blok (R18.2).
  const reasonHtml = reason
    ? `<p style="margin:0 0 8px;">Důvod odmítnutí:</p>
<blockquote style="margin:0 0 24px;padding:12px 16px;border-left:4px solid #5b2eff;background:#f4f6fb;color:#353241;">${escapeHtml(reason)}</blockquote>`
    : '';

  const body = `<p style="margin:0 0 16px;">Dobrý den, ${escapeHtml(input.clientName)},</p>
<p style="margin:0 0 16px;"><strong>Vaše rezervace byla bohužel odmítnuta.</strong></p>
<p style="margin:0 0 24px;">Jedná se o rezervaci v podniku <strong>${escapeHtml(input.businessName)}</strong> na službu <strong>${escapeHtml(input.serviceName)}</strong> (${input.serviceDurationMinutes} min, ${price}) na <strong>${escapeHtml(input.reservationDate)}</strong> v <strong>${escapeHtml(input.reservationTime)}</strong> (čas Europe/Prague).</p>
${reasonHtml}<p style="margin:0 0 8px;">Profil podniku: <a href="${safeBusinessUrl}" style="color:#5b2eff;">${safeBusinessUrl}</a></p>
<p style="margin:0;color:#667085;">E-mail byl odeslán automaticky platformou Horea.cz.</p>`;

  // --- Textová varianta ---
  const textLines = [
    `Dobrý den, ${input.clientName},`,
    '',
    'Vaše rezervace byla bohužel odmítnuta.',
    '',
    `Jedná se o rezervaci v podniku ${input.businessName} na službu ${input.serviceName} (${input.serviceDurationMinutes} min, ${price}) na ${input.reservationDate} v ${input.reservationTime} (čas Europe/Prague).`,
    '',
  ];

  if (reason) {
    textLines.push(`Důvod odmítnutí:`, `„${reason}"`, '');
  }

  textLines.push(`Profil podniku: ${input.businessUrl}`);
  textLines.push('');
  textLines.push('E-mail byl odeslán automaticky platformou Horea.cz.');

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text: textLines.join('\n'),
  };
}
