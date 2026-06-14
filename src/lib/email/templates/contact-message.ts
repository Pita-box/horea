import { wrapEmail } from '@/lib/email/templates/base';

export type ContactMessageEmailInput = {
  /** Jméno odesílatele z formuláře. */
  name: string;
  /** E-mail odesílatele (slouží i jako reply-to). */
  email: string;
  /** Předmět zprávy. */
  subject: string;
  /** Tělo zprávy. */
  message: string;
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

/**
 * E-mail pro interní podporu z veřejného kontaktního formuláře. Všechna
 * uživatelská pole jsou v HTML escapovaná; reply-to se nastavuje na e-mail
 * odesílatele v route handleru (ne zde).
 */
export function renderContactMessageEmail(input: ContactMessageEmailInput): RenderedEmail {
  const subject = `Kontaktní formulář: ${input.subject}`;
  const messageHtml = escapeHtml(input.message).replaceAll('\n', '<br />');

  const body = `<p style="margin:0 0 8px;">Nová zpráva z kontaktního formuláře na horea.cz.</p>
<p style="margin:0 0 4px;"><strong>Jméno:</strong> ${escapeHtml(input.name)}</p>
<p style="margin:0 0 4px;"><strong>E-mail:</strong> ${escapeHtml(input.email)}</p>
<p style="margin:0 0 16px;"><strong>Předmět:</strong> ${escapeHtml(input.subject)}</p>
<hr style="border:0;border-top:1px solid #dfe4ef;margin:0 0 16px;" />
<p style="margin:0;">${messageHtml}</p>`;

  const text = `Nová zpráva z kontaktního formuláře na horea.cz.\n\nJméno: ${input.name}\nE-mail: ${input.email}\nPředmět: ${input.subject}\n\n${input.message}`;

  return { subject, html: wrapEmail({ subject, body }), text };
}
