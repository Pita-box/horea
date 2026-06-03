type WrapEmailInput = {
  subject: string;
  body: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function wrapEmail({ subject, body }: WrapEmailInput): string {
  const safeSubject = escapeHtml(subject);

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;background:#f4f6fb;color:#1b1530;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:20px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#1b1530;">${safeSubject}</h1>
                <div style="font-size:16px;line-height:1.6;color:#1b1530;">${body}</div>
                <hr style="border:0;border-top:1px solid #dfe4ef;margin:32px 0 20px;" />
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#667085;">Horea</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#667085;">Podpora: <a href="mailto:podpora@horea.cz" style="color:#5b2eff;">podpora@horea.cz</a></p>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#667085;"><a href="https://www.horea.cz/gdpr" style="color:#5b2eff;">GDPR a zpracování osobních údajů</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
