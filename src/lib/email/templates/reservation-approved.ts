import { wrapEmail } from './base';

type ReservationApprovedEmailInput = {
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
 * Sestaví Reservation_Approved_Email pro klienta po schválení rezervace (R18.1).
 *
 * Časy se očekávají už převedené do pásma Europe/Prague (převod řeší volající
 * server action), cena se formátuje v Kč. Veškerá uživatelská pole se v HTML
 * variantě escapují. Patička obsahuje odkaz na veřejný profil podniku a generický
 * disclaimer (R18.5).
 */
export function renderReservationApprovedEmail(input: ReservationApprovedEmailInput): RenderedEmail {
  const subject = `Vaše rezervace byla potvrzena — ${input.businessName}`;
  const price = formatPriceCzk(input.servicePriceCzk);
  const safeBusinessUrl = escapeHtml(input.businessUrl);

  // --- HTML varianta (uživatelská pole escapujeme) ---
  const body = `<p style="margin:0 0 16px;">Dobrý den, ${escapeHtml(input.clientName)},</p>
<p style="margin:0 0 16px;"><strong>Vaše rezervace byla potvrzena.</strong></p>
<p style="margin:0 0 24px;">V podniku <strong>${escapeHtml(input.businessName)}</strong> máte potvrzenou službu <strong>${escapeHtml(input.serviceName)}</strong> (${input.serviceDurationMinutes} min, ${price}) na <strong>${escapeHtml(input.reservationDate)}</strong> v <strong>${escapeHtml(input.reservationTime)}</strong> (čas Europe/Prague).</p>
<p style="margin:0 0 8px;">Profil podniku: <a href="${safeBusinessUrl}" style="color:#5b2eff;">${safeBusinessUrl}</a></p>
<p style="margin:0;color:#667085;">E-mail byl odeslán automaticky platformou Horea.cz.</p>`;

  // --- Textová varianta ---
  const text = [
    `Dobrý den, ${input.clientName},`,
    '',
    'Vaše rezervace byla potvrzena.',
    '',
    `V podniku ${input.businessName} máte potvrzenou službu ${input.serviceName} (${input.serviceDurationMinutes} min, ${price}) na ${input.reservationDate} v ${input.reservationTime} (čas Europe/Prague).`,
    '',
    `Profil podniku: ${input.businessUrl}`,
    '',
    'E-mail byl odeslán automaticky platformou Horea.cz.',
  ].join('\n');

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text,
  };
}
