'use server';

import { validateEmail } from '@/lib/auth/email';
import { AUTH_MESSAGES } from '@/lib/auth/messages';
import { sendEmail } from '@/lib/email/client';
import { renderPasswordResetEmail } from '@/lib/email/templates/password-reset';
import { serverLog } from '@/lib/log-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';

import type { ForgotPasswordState } from './state';

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function successState(): ForgotPasswordState {
  return {
    message: AUTH_MESSAGES.forgotPasswordSent,
    fieldErrors: {},
  };
}

async function getResetRedirectTo(): Promise<string> {
  const headerStore = await headers();
  const origin =
    headerStore.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return new URL('/reset-password', origin).toString();
}

function getResetUrl(redirectTo: string, tokenHash: string): string {
  const url = new URL(redirectTo);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', 'recovery');

  return url.toString();
}

export async function forgotPasswordAction(formData: FormData): Promise<ForgotPasswordState> {
  const email = getString(formData, 'email').trim().toLowerCase();

  if (!validateEmail(email)) {
    return {
      message: AUTH_MESSAGES.invalidEmail,
      fieldErrors: {
        email: AUTH_MESSAGES.invalidEmail,
      },
    };
  }

  // Supabase má vypnuté odesílání e-mailů — odkaz pro obnovení posíláme sami přes Resend.
  // Vždy vracíme stejnou obecnou hlášku, abychom neprozradili, zda účet existuje.
  try {
    const adminClient = createAdminClient();
    const redirectTo = await getResetRedirectTo();

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo,
      },
    });

    if (linkError || !linkData.properties?.hashed_token) {
      await serverLog.warn('forgot_password_link_generate_failed', { error: linkError });
      return successState();
    }

    const emailContent = renderPasswordResetEmail({
      resetUrl: getResetUrl(redirectTo, linkData.properties.hashed_token),
    });

    const response = await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (response.error) {
      await serverLog.warn('forgot_password_email_failed', { error: response.error });
    }
  } catch (error) {
    await serverLog.warn('forgot_password_request_failed', { error });
  }

  return successState();
}
