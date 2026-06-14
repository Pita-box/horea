import { NextResponse, type NextRequest } from 'next/server';

import { sendEmail } from '@/lib/email/client';
import { describeResendError } from '@/lib/email/dispatcher';
import { getResendErrorMessage } from '@/lib/email/resend-error';
import { renderContactMessageEmail } from '@/lib/email/templates/contact-message';
import { serverLog } from '@/lib/log-server';

/**
 * Route handler POST `/api/contact`.
 *
 * Přijme data z veřejného kontaktního formuláře, server-side je zvaliduje a
 * odešle e-mail na schránku podpory přes Resend (`sendEmail`). `replyTo` se
 * nastaví na e-mail odesílatele, aby šlo přímo odpovědět. PII se NIKDY neloguje —
 * při chybě jde do logu jen Resend error code.
 *
 * Vrací `{ ok: true }` nebo `{ error, message }` s českou hláškou.
 */

const CONTACT_INBOX_EMAIL = process.env.CONTACT_INBOX_EMAIL || 'info@horea.cz';

const LIMITS = { name: 120, email: 200, subject: 200, message: 5000 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactRequestBody = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
};

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: ContactRequestBody;
  try {
    body = (await request.json()) as ContactRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Neplatný požadavek.' },
      { status: 400 },
    );
  }

  const name = asTrimmedString(body.name);
  const email = asTrimmedString(body.email);
  const subject = asTrimmedString(body.subject);
  const message = asTrimmedString(body.message);

  if (!name || !email || !subject || !message) {
    return NextResponse.json(
      { error: 'invalid_input', message: 'Vyplňte prosím všechna pole formuláře.' },
      { status: 400 },
    );
  }

  if (
    name.length > LIMITS.name ||
    email.length > LIMITS.email ||
    subject.length > LIMITS.subject ||
    message.length > LIMITS.message ||
    !EMAIL_RE.test(email)
  ) {
    return NextResponse.json(
      { error: 'invalid_input', message: 'Zkontrolujte prosím zadané údaje (e-mail a délku polí).' },
      { status: 400 },
    );
  }

  const rendered = renderContactMessageEmail({ name, email, subject, message });

  try {
    const response = await sendEmail({
      to: CONTACT_INBOX_EMAIL,
      replyTo: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (response.error) {
      await serverLog.warn('contact_email_failed', {
        resendError: describeResendError(response.error),
      });
      const friendly = getResendErrorMessage(response.error);
      return NextResponse.json(
        {
          error: 'send_failed',
          message: friendly ?? 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu později.',
        },
        { status: 502 },
      );
    }
  } catch (error) {
    await serverLog.error('contact_email_exception', {
      resendError: describeResendError(error),
    });
    return NextResponse.json(
      { error: 'server_error', message: 'Něco se pokazilo. Zkuste to prosím znovu později.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
