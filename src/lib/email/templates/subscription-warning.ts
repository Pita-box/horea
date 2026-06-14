import { wrapEmail } from './base';

/**
 * Subscription_Warning_Email — varovné e-maily Warning_Cronu 7 dní před přechodem
 * stavu předplatného (R6.10, R6.11):
 *
 *  - `grace_to_expired` (den 23 od kotvy, R6.10): 7 dní před přechodem
 *    `grace_period` → `expired`. Po přechodu bude profil skryt a dashboard
 *    uzamčen.
 *  - `expired_to_deleted` (den 83 od kotvy, R6.11): 7 dní před přechodem
 *    `expired` → `deleted_data`. Po přechodu budou data podniku trvale smazána.
 */

/** Druh varování dle nadcházejícího přechodu. */
export type SubscriptionWarningKind = 'grace_to_expired' | 'expired_to_deleted';

type SubscriptionWarningEmailInput = {
  /** Název podniku pro oslovení (uživatelský vstup — v HTML se escapuje). */
  businessName: string;
  /** Druh varování (který přechod hrozí). */
  kind: SubscriptionWarningKind;
  /** Odkaz na obnovu/platbu předplatného (volitelný CTA). */
  renewUrl?: string | null;
};

type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Český text varování podle druhu přechodu. */
function warningCopy(kind: SubscriptionWarningKind): {
  subject: string;
  lead: string;
  consequence: string;
} {
  if (kind === 'grace_to_expired') {
    return {
      subject: 'Za 7 dní bude váš profil skryt — doplaťte předplatné',
      lead: 'platba vašeho předplatného Horea stále nedorazila.',
      consequence:
        'Pokud platba nedorazí do 7 dní, váš profil bude skryt z veřejného webu a přístup do administrace bude uzamčen. Data podniku zůstanou zachována.',
    };
  }

  return {
    subject: 'Za 7 dní budou vaše data smazána — doplaťte předplatné',
    lead: 'vaše předplatné Horea je dlouhodobě neuhrazené.',
    consequence:
      'Pokud platba nedorazí do 7 dní, dojde k trvalému smazání všech dat podniku (profil, služby, otevírací doby, rezervace, klienti). Tuto akci nelze vrátit zpět.',
  };
}

/**
 * Sestaví varovný e-mail před přechodem stavu předplatného (R6.10, R6.11).
 *
 * @param input Název podniku, druh varování a volitelný odkaz na obnovu.
 */
export function renderSubscriptionWarningEmail(
  input: SubscriptionWarningEmailInput,
): RenderedEmail {
  const copy = warningCopy(input.kind);

  const ctaHtml = input.renewUrl
    ? `<p style="margin:0 0 24px;"><a href="${escapeHtml(input.renewUrl)}" style="display:inline-block;border-radius:12px;background:#592eff;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700;">Obnovit předplatné</a></p>`
    : '';

  const body = `<p style="margin:0 0 16px;">Dobrý den,</p>
<p style="margin:0 0 16px;">${copy.lead}</p>
<p style="margin:0 0 16px;">Podnik: <strong>${escapeHtml(input.businessName)}</strong></p>
<p style="margin:0 0 24px;">${copy.consequence}</p>
${ctaHtml}<p style="margin:0;color:#667085;">Pokud jste mezitím zaplatili, této zprávy si nevšímejte.</p>`;

  const textLines = [
    'Dobrý den,',
    '',
    copy.lead,
    '',
    `Podnik: ${input.businessName}`,
    '',
    copy.consequence,
    '',
  ];
  if (input.renewUrl) {
    textLines.push(`Obnovit předplatné: ${input.renewUrl}`, '');
  }
  textLines.push('Pokud jste mezitím zaplatili, této zprávy si nevšímejte.');

  return { subject: copy.subject, html: wrapEmail({ subject: copy.subject, body }), text: textLines.join('\n') };
}
