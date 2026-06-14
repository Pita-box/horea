import { wrapEmail } from './base';

type PasswordResetEmailInput = {
  resetUrl: string;
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

export function renderPasswordResetEmail({ resetUrl }: PasswordResetEmailInput): RenderedEmail {
  const subject = 'Obnovení hesla — Horea';
  const safeResetUrl = escapeHtml(resetUrl);

  const body = `<p style="margin:0 0 16px;">Požádali jste o obnovení hesla k účtu Horea.</p>
<p style="margin:0 0 24px;">Nové heslo nastavíte kliknutím na odkaz níže.</p>
<p style="margin:0 0 24px;"><a href="${safeResetUrl}" style="display:inline-block;border-radius:12px;background:#592eff;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700;">Nastavit nové heslo</a></p>
<p style="margin:0 0 8px;">Pokud tlačítko nefunguje, otevřete tento odkaz:</p>
<p style="margin:0;word-break:break-all;"><a href="${safeResetUrl}" style="color:#592eff;">${safeResetUrl}</a></p>`;

  return {
    subject,
    html: wrapEmail({ subject, body }),
    text: `Obnovte heslo v Horea otevřením tohoto odkazu:\n\n${resetUrl}`,
  };
}
