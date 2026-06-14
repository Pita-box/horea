import 'server-only';

import { sendEmail } from '@/lib/email/client';
import { getResendErrorMessage } from '@/lib/email/resend-error';
import { renderVerifyEmail } from '@/lib/email/templates/verify-email';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';

export type SendVerificationEmailResult = {
  ok: boolean;
  errorMessage?: string;
};

async function getEmailRedirectTo(): Promise<string> {
  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return new URL('/verify-email', origin).toString();
}

function getVerifyEmailUrl(redirectTo: string, tokenHash: string): string {
  const url = new URL(redirectTo);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'magiclink');

  return url.toString();
}

/**
 * Odešle potvrzovací e-mail s ověřovacím odkazem přes Supabase Admin
 * `generateLink` + Resend. Funkce nikdy nevyhazuje výjimku — chyby loguje
 * a vrací `{ ok: false }`, případně s `errorMessage` pro zobrazení uživateli.
 */
export async function sendVerificationEmail(email: string): Promise<SendVerificationEmailResult> {
  try {
    const adminClient = createAdminClient();
    const redirectTo = await getEmailRedirectTo();

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo,
      },
    });

    if (linkError || !linkData.properties?.hashed_token) {
      await serverLog.warn('verification_email_link_generate_failed', { error: linkError });
      return { ok: false };
    }

    const emailContent = renderVerifyEmail({
      verifyUrl: getVerifyEmailUrl(redirectTo, linkData.properties.hashed_token),
    });

    const response = await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (response.error) {
      await serverLog.warn('verification_email_send_failed', { error: response.error });
      return { ok: false, errorMessage: getResendErrorMessage(response.error) ?? undefined };
    }
  } catch (error) {
    await serverLog.warn('verification_email_send_failed', { error });
    return { ok: false, errorMessage: getResendErrorMessage(error) ?? undefined };
  }

  return { ok: true };
}
