import { wrapEmail } from './base';

type VerifyEmailInput = {
  verifyUrl: string;
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

export function renderVerifyEmail({ verifyUrl }: VerifyEmailInput): RenderedEmail {
  const subject = 'Ověřte svůj email — Horea';
  const safeVerifyUrl = escapeHtml(verifyUrl);

  const body = `<p style="margin:0 0 16px;">Dokončete registraci kliknutím na ověřovací odkaz.</p>
<p style="margin:0 0 24px;">Po ověření emailu budete pokračovat nastavením profilu podniku.</p>
<p style="margin:0 0 24px;"><a href="${safeVerifyUrl}" style="display:inline-block;border-radius:12px;background:#592eff;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700;">Ověřit email</a></p>
<p style="margin:0 0 8px;">Pokud tlačítko nefunguje, otevřete tento odkaz:</p>
<p style="margin:0;word-break:break-all;"><a href="${safeVerifyUrl}" style="color:#592eff;">${safeVerifyUrl}</a></p>`;

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text: `Ověřte svůj email v Horea otevřením tohoto odkazu:\n\n${verifyUrl}`,
  };
}
